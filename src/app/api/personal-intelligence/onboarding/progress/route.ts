import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase } from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Stage = "orient" | "interview";

function stageForSource(source: { source_name?: string | null; metadata?: unknown }): Stage | null {
  const metadata = source.metadata && typeof source.metadata === "object" ? source.metadata as Record<string, unknown> : {};
  if (metadata.onboarding_stage === "orient" || source.source_name === "orientation_confirmation") return "orient";
  if (metadata.onboarding_stage === "interview" || source.source_name === "interview_confirmation") return "interview";
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);

    const [{ data: sources, error: sourcesError }, { data: domains, error: domainsError }, { data: topics, error: topicsError }] = await Promise.all([
      supabase.schema("personal_core").from("sources")
        .select("id,source_name,source_system,metadata,captured_at")
        .eq("owner_user_id", ownerUserId)
        .eq("source_system", "personal_intelligence")
        .order("captured_at", { ascending: true }),
      supabase.schema("knowledge").from("domains")
        .select("id")
        .eq("owner_user_id", ownerUserId),
      supabase.schema("knowledge").from("topics")
        .select("id")
        .eq("owner_user_id", ownerUserId),
    ]);
    if (sourcesError) throw sourcesError;
    if (domainsError) throw domainsError;
    if (topicsError) throw topicsError;

    const onboardingSources = (sources || []).map((source) => ({ ...source, stage: stageForSource(source) })).filter((source) => source.stage);
    const sourceIds = onboardingSources.map((source) => String(source.id));

    let claims: Array<Record<string, unknown>> = [];
    let goals: Array<Record<string, unknown>> = [];
    if (sourceIds.length) {
      const [claimsResult, goalsResult] = await Promise.all([
        supabase.schema("personal_core").from("claims")
          .select("id,predicate,value_text,claim_type,status,privacy_level,source_excerpt,source_id,created_at")
          .eq("owner_user_id", ownerUserId)
          .in("source_id", sourceIds)
          .order("created_at", { ascending: true }),
        supabase.schema("personal_core").from("goals")
          .select("id,title,description,status,privacy_level,source_id,created_at")
          .eq("owner_user_id", ownerUserId)
          .in("source_id", sourceIds)
          .order("created_at", { ascending: true }),
      ]);
      if (claimsResult.error) throw claimsResult.error;
      if (goalsResult.error) throw goalsResult.error;
      claims = (claimsResult.data || []) as Array<Record<string, unknown>>;
      goals = (goalsResult.data || []) as Array<Record<string, unknown>>;
    }

    const sourceById = new Map(onboardingSources.map((source) => [String(source.id), source]));
    const stages = {
      orient: { completed: false, savedItems: [] as Array<Record<string, unknown>>, sourceExcerpts: [] as string[] },
      interview: { completed: false, savedItems: [] as Array<Record<string, unknown>>, sourceExcerpts: [] as string[] },
    };

    for (const claim of claims) {
      const source = sourceById.get(String(claim.source_id));
      if (!source?.stage) continue;
      const metadata = source.metadata && typeof source.metadata === "object" ? source.metadata as Record<string, unknown> : {};
      stages[source.stage].completed = true;
      stages[source.stage].savedItems.push({
        kind: "claim",
        id: claim.id,
        label: claim.value_text || claim.predicate,
        predicate: claim.predicate,
        status: claim.status,
        privacyLevel: claim.privacy_level,
        questionId: typeof metadata.source_question_id === "string" ? metadata.source_question_id : null,
        sourceExcerpt: claim.source_excerpt || null,
        createdAt: claim.created_at,
      });
      if (typeof claim.source_excerpt === "string" && claim.source_excerpt.trim()) stages[source.stage].sourceExcerpts.push(claim.source_excerpt.trim());
    }

    for (const goal of goals) {
      const source = sourceById.get(String(goal.source_id));
      if (!source?.stage) continue;
      const metadata = source.metadata && typeof source.metadata === "object" ? source.metadata as Record<string, unknown> : {};
      stages[source.stage].completed = true;
      stages[source.stage].savedItems.push({
        kind: "goal",
        id: goal.id,
        label: goal.title,
        status: goal.status,
        privacyLevel: goal.privacy_level,
        questionId: typeof metadata.source_question_id === "string" ? metadata.source_question_id : null,
        sourceExcerpt: typeof metadata.source_excerpt === "string" ? metadata.source_excerpt : null,
        createdAt: goal.created_at,
      });
      if (typeof metadata.source_excerpt === "string" && metadata.source_excerpt.trim()) stages[source.stage].sourceExcerpts.push(metadata.source_excerpt.trim());
    }

    stages.orient.sourceExcerpts = Array.from(new Set(stages.orient.sourceExcerpts));
    stages.interview.sourceExcerpts = Array.from(new Set(stages.interview.sourceExcerpts));

    return NextResponse.json({
      ok: true,
      stages,
      map: {
        domains: (domains || []).length,
        topics: (topics || []).length,
        completed: (topics || []).length > 0,
      },
    });
  } catch (error) {
    console.error("[Personal Intelligence Onboarding Progress]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Onboarding progress failed" }, { status: 500 });
  }
}
