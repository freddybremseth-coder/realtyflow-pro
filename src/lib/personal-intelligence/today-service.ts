import type { SupabaseClient } from "@supabase/supabase-js";
import { loadNexusBusinessMentorSummary } from "@/lib/personal-intelligence/nexus-business-adapter";
import { loadPublishingMentorSummary } from "@/lib/personal-intelligence/publishing-mentor-adapter";

export type TodayDomain = "personal" | "business" | "publishing" | "learning";

export interface TodayItem {
  id: string;
  type: "action" | "followup" | "learning_review" | "goal" | "business_opportunity" | "publishing_attention";
  title: string;
  reason: string;
  priority: number;
  dueAt?: string | null;
  source?: string;
  domain?: TodayDomain;
  metadata?: Record<string, unknown>;
}

export interface TodaySnapshot {
  oneThing: TodayItem | null;
  secondary: TodayItem[];
  learning: TodayItem | null;
  generatedAt: string;
  selectionPolicy?: string;
  warnings?: string[];
}

function score(item: TodayItem, now: number): number {
  let value = 100 - item.priority * 10;
  if (item.dueAt) {
    const due = new Date(item.dueAt).getTime();
    if (Number.isFinite(due)) {
      const hours = (due - now) / 3_600_000;
      if (hours <= 0) value += 60;
      else if (hours <= 24) value += 40;
      else if (hours <= 72) value += 20;
    }
  }
  if (item.type === "followup") value += 15;
  if (item.type === "action") value += 10;
  if (item.type === "business_opportunity") value += 8;
  if (item.type === "publishing_attention") value += 6;
  return value;
}

function domainForItem(item: TodayItem): TodayDomain {
  if (item.domain) return item.domain;
  if (item.type === "business_opportunity") return "business";
  if (item.type === "publishing_attention") return "publishing";
  if (item.type === "learning_review") return "learning";
  return "personal";
}

export function selectBalancedSecondary(candidates: TodayItem[], primary: TodayItem | null): TodayItem[] {
  if (!primary) return candidates.slice(0, 2);
  const remaining = candidates.filter((item) => item.id !== primary.id);
  if (!remaining.length) return [];

  // Preserve the highest-ranked remaining item so domain diversity never hides urgency.
  const selected: TodayItem[] = [remaining[0]];
  if (remaining.length === 1) return selected;

  const represented = new Set<TodayDomain>([domainForItem(primary), domainForItem(remaining[0])]);
  const diverse = remaining.slice(1).find((item) => !represented.has(domainForItem(item)));
  selected.push(diverse || remaining[1]);
  return selected;
}

function priorityFromNexus(priority: string): number {
  if (priority === "CRITICAL") return 1;
  if (priority === "HIGH") return 2;
  if (priority === "MEDIUM") return 3;
  return 4;
}

function priorityFromPublishing(state: string): number {
  if (state === "attention") return 1;
  if (state === "ready") return 2;
  if (state === "working") return 3;
  return 4;
}

export async function buildTodaySnapshot(
  supabase: SupabaseClient,
  ownerUserId: string,
  subjectEntityId: string,
): Promise<TodaySnapshot> {
  const [actionsRes, followupsRes, reviewsRes, goalsRes, nexusResult, publishingResult] = await Promise.all([
    supabase.schema("mentor").from("actions")
      .select("id,title,priority,scheduled_at,commitment_status")
      .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId)
      .in("commitment_status", ["committed", "scheduled", "in_progress"])
      .order("priority", { ascending: true }).limit(20),
    supabase.schema("mentor").from("followups")
      .select("id,followup_at,status,action_id,recommendation_id")
      .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId)
      .in("status", ["open", "due"]).order("followup_at", { ascending: true }).limit(20),
    supabase.schema("learning").from("review_schedule")
      .select("id,due_at,priority,status,topic_id")
      .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId)
      .in("status", ["scheduled", "due"]).order("due_at", { ascending: true }).limit(20),
    supabase.schema("personal_core").from("goals")
      .select("id,title,priority,status")
      .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId)
      .eq("status", "active").order("priority", { ascending: true }).limit(10),
    loadNexusBusinessMentorSummary(supabase).then(
      (summary) => ({ summary, error: null as Error | null }),
      (error: unknown) => ({ summary: null, error: error instanceof Error ? error : new Error(String(error)) }),
    ),
    loadPublishingMentorSummary(supabase).then(
      (summary) => ({ summary, error: null as Error | null }),
      (error: unknown) => ({ summary: null, error: error instanceof Error ? error : new Error(String(error)) }),
    ),
  ]);

  for (const result of [actionsRes, followupsRes, reviewsRes, goalsRes]) {
    if (result.error) throw new Error(`TODAY retrieval failed: ${result.error.message}`);
  }

  const candidates: TodayItem[] = [];
  for (const row of actionsRes.data || []) candidates.push({
    id: String(row.id), type: "action", domain: "personal", title: String(row.title),
    reason: "Committed action", priority: Number(row.priority) || 3, dueAt: row.scheduled_at as string | null,
  });
  for (const row of followupsRes.data || []) candidates.push({
    id: String(row.id), type: "followup", domain: "personal", title: "Follow up on an open commitment",
    reason: "Follow-up is due or approaching", priority: 2, dueAt: row.followup_at as string | null,
  });
  const learningItems: TodayItem[] = (reviewsRes.data || []).map((row) => ({
    id: String(row.id), type: "learning_review", domain: "learning", title: "Review a learned topic",
    reason: "Retention review is due", priority: Number(row.priority) || 3, dueAt: row.due_at as string | null,
  }));
  for (const row of goalsRes.data || []) candidates.push({
    id: String(row.id), type: "goal", domain: "personal", title: String(row.title),
    reason: "Active goal without a more specific commitment", priority: Number(row.priority) || 3,
  });

  if (nexusResult.summary) {
    const nowMs = Date.now();
    for (const mission of nexusResult.summary.topMissions.slice(0, 3)) {
      candidates.push({
        id: `nexus:${mission.id}`,
        type: "business_opportunity",
        domain: "business",
        title: mission.title,
        reason: mission.whyNow || mission.nextAction,
        priority: priorityFromNexus(mission.priority),
        dueAt: new Date(nowMs + mission.dueInHours * 3_600_000).toISOString(),
        source: nexusResult.summary.source,
        metadata: {
          nextAction: mission.nextAction,
          expectedValue: mission.expectedValue,
          currency: mission.currency,
          autonomy: mission.autonomy,
          brandId: mission.brandId,
          pipelineId: mission.pipelineId,
          persistAsPersonalMemory: false,
        },
      });
    }
  }

  if (publishingResult.summary) {
    for (const item of publishingResult.summary.topAttention.slice(0, 2)) {
      candidates.push({
        id: `publishing:${item.id}`,
        type: "publishing_attention",
        domain: "publishing",
        title: item.title,
        reason: item.nextAction,
        priority: priorityFromPublishing(item.state),
        dueAt: item.updatedAt,
        source: publishingResult.summary.source,
        metadata: {
          seriesName: item.seriesName,
          stage: item.stage,
          stageLabel: item.stageLabel,
          activity: item.activity,
          state: item.state,
          persistAsPersonalMemory: false,
        },
      });
    }
  }

  const now = Date.now();
  candidates.sort((a, b) => score(b, now) - score(a, now));
  learningItems.sort((a, b) => score(b, now) - score(a, now));

  const warnings: string[] = [];
  if (nexusResult.error) warnings.push(`Nexus business context unavailable: ${nexusResult.error.message}`);
  else warnings.push(...(nexusResult.summary?.warnings || []));
  if (publishingResult.error) warnings.push(`Book OS context unavailable: ${publishingResult.error.message}`);
  else warnings.push(...(publishingResult.summary?.warnings || []));

  const primaryCandidate = candidates[0] || null;
  const oneThing = primaryCandidate || learningItems[0] || null;
  return {
    oneThing,
    secondary: selectBalancedSecondary(candidates, primaryCandidate),
    learning: learningItems[0] || null,
    generatedAt: new Date().toISOString(),
    selectionPolicy: "primary_by_score; first_secondary_by_score; second_secondary_diversifies_domain_when_available",
    warnings,
  };
}
