import { NextRequest, NextResponse } from "next/server";
import {
  GET as getSafeRecommendations,
  POST as executeSafeRecommendation,
} from "@/app/api/neural-beat/recommendations-safe/route";
import {
  buildRemasterActionFingerprint,
  findRemasterActionByFingerprint,
  recordPlannedRemasterAction,
  type RemasterActionContext,
  type RemasterActionHistoryRow,
  type RemasterActionType,
  type RemasterPriority,
  type RemasterRecommendationAction,
} from "@/services/growth/remaster-action-history";
import { getRemasterAutopilotSettings } from "@/services/growth/remaster-autopilot-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAFE_ACTION_TYPES = new Set<RemasterActionType>(["create_content", "strategy", "schedule"]);

interface AutopilotRecommendation {
  id?: string;
  title?: string;
  description?: string;
  impact?: string;
  priority?: RemasterPriority;
  effort?: "easy" | "medium" | "hard";
  action?: RemasterRecommendationAction;
  fingerprint?: string;
  execution?: {
    historyId?: string;
    status?: RemasterActionHistoryRow["status"];
  } | null;
}

function authorizeMigration(request: NextRequest) {
  const expected = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!expected) return { ok: false, status: 503, error: "Re-Master migration secret is not configured" };
  if ((request.headers.get("x-remaster-migration-secret") || "") !== expected) {
    return { ok: false, status: 401, error: "Unauthorized migration client" };
  }
  return { ok: true };
}

function priorityRank(priority?: RemasterPriority) {
  switch (priority) {
    case "critical": return 40;
    case "high": return 30;
    case "medium": return 20;
    case "low": return 10;
    default: return 0;
  }
}

function effortRank(effort?: AutopilotRecommendation["effort"]) {
  switch (effort) {
    case "easy": return 3;
    case "medium": return 2;
    case "hard": return 1;
    default: return 0;
  }
}

function sortRecommendations(a: AutopilotRecommendation, b: AutopilotRecommendation) {
  return priorityRank(b.priority) - priorityRank(a.priority)
    || effortRank(b.effort) - effortRank(a.effort)
    || String(a.title || "").localeCompare(String(b.title || ""));
}

function recommendationContext(recommendation: AutopilotRecommendation, request: NextRequest): RemasterActionContext {
  return {
    recommendationId: recommendation.id,
    title: recommendation.title,
    description: recommendation.description,
    impact: recommendation.impact,
    priority: recommendation.priority,
    approvedBy: request.headers.get("x-remaster-admin") || "remaster-autopilot",
  };
}

function summarizeRecommendation(recommendation: AutopilotRecommendation, fingerprint: string, existing?: RemasterActionHistoryRow | null) {
  return {
    id: recommendation.id || null,
    title: recommendation.title || null,
    priority: recommendation.priority || "medium",
    effort: recommendation.effort || null,
    actionType: recommendation.action?.type || null,
    fingerprint,
    existingStatus: existing?.status || recommendation.execution?.status || null,
  };
}

async function loadRecommendations(request: NextRequest) {
  const response = await getSafeRecommendations(request);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false as const, status: response.status, data };
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations as AutopilotRecommendation[] : [];
  return { ok: true as const, data, recommendations };
}

async function executeMetadataRecommendation(request: NextRequest, recommendation: AutopilotRecommendation) {
  const source = recommendation.action;
  if (!source?.videoId) throw new Error("Metadata recommendation mangler videoId");

  // Permanent safety boundary for automatic execution: description and tags only.
  // Titles and thumbnails stay outside autonomous writes.
  const action: RemasterRecommendationAction = {
    ...source,
    newTitle: null,
    newDescription: typeof source.newDescription === "string" ? source.newDescription : null,
    newTags: Array.isArray(source.newTags) ? source.newTags : [],
  };
  if (!action.newDescription && !action.newTags?.length) {
    throw new Error("Metadata recommendation contains no safe description/tag update");
  }

  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.set("x-remaster-admin", request.headers.get("x-remaster-admin") || "remaster-growth-autopilot");
  const executionRequest = new NextRequest(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, recommendation }),
  });
  const response = await executeSafeRecommendation(executionRequest);
  const data = await response.json().catch(() => ({}));
  return { response, data, action };
}

export async function POST(request: NextRequest) {
  const authorization = authorizeMigration(request);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });

  const settings = await getRemasterAutopilotSettings();
  if (settings.mode === "off") {
    return NextResponse.json({
      mode: settings.mode,
      analyzedCount: 0,
      savedCount: 0,
      executedCount: 0,
      skippedCount: 0,
      metadataRequiresApproval: [],
      results: [],
      errors: [],
      message: "Autopilot er av. Ingen analysejobb ble kjørt.",
    });
  }

  const loaded = await loadRecommendations(request);
  if (!loaded.ok) return NextResponse.json(loaded.data, { status: loaded.status });

  const recommendations = loaded.recommendations;
  const metadataRequiresApproval: ReturnType<typeof summarizeRecommendation>[] = [];
  const safeCandidates: AutopilotRecommendation[] = [];
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];
  let skippedCount = 0;
  let savedCount = 0;
  let executedCount = 0;
  let budgetUsed = 0;

  for (const recommendation of recommendations.sort(sortRecommendations)) {
    const action = recommendation.action;
    if (!action?.type) {
      skippedCount++;
      results.push({ status: "skipped", reason: "missing_action", recommendationId: recommendation.id || null });
      continue;
    }

    const fingerprint = recommendation.fingerprint || buildRemasterActionFingerprint(action);
    if (action.type === "update_metadata") {
      if (settings.mode !== "execute_guarded" || !settings.allowMetadataUpdates) {
        metadataRequiresApproval.push(summarizeRecommendation(recommendation, fingerprint));
        continue;
      }
      if (budgetUsed >= settings.maxActionsPerRun) {
        skippedCount++;
        results.push({ ...summarizeRecommendation(recommendation, fingerprint), status: "skipped", reason: "max_actions_reached" });
        continue;
      }
      try {
        const executed = await executeMetadataRecommendation(request, recommendation);
        if (!executed.response.ok) {
          if (executed.response.status === 409 && executed.data?.duplicate) {
            skippedCount++;
            results.push({ ...summarizeRecommendation(recommendation, fingerprint), status: "skipped", reason: "duplicate" });
            continue;
          }
          throw new Error(executed.data?.error || `Metadata execution failed (${executed.response.status})`);
        }
        executedCount++;
        budgetUsed++;
        results.push({
          ...summarizeRecommendation(recommendation, fingerprint),
          status: "executed",
          videoId: action.videoId,
          updates: { description: Boolean(executed.action.newDescription), tags: executed.action.newTags?.length || 0, title: false },
          historyId: executed.data?.history?.id || null,
        });
      } catch (error) {
        skippedCount++;
        const failure = {
          ...summarizeRecommendation(recommendation, fingerprint),
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown metadata execution error",
        };
        errors.push(failure);
        results.push(failure);
      }
      continue;
    }

    if (!SAFE_ACTION_TYPES.has(action.type)) {
      skippedCount++;
      results.push({ ...summarizeRecommendation(recommendation, fingerprint), status: "skipped", reason: "action_type_not_allowed" });
      continue;
    }
    safeCandidates.push({ ...recommendation, fingerprint });
  }

  for (const recommendation of safeCandidates.sort(sortRecommendations)) {
    const action = recommendation.action;
    if (!action?.type) continue;
    const fingerprint = recommendation.fingerprint || buildRemasterActionFingerprint(action);
    try {
      const existing = recommendation.execution?.historyId
        ? ({ id: recommendation.execution.historyId, status: recommendation.execution.status || "planned" } as RemasterActionHistoryRow)
        : await findRemasterActionByFingerprint(fingerprint);
      if (existing) {
        skippedCount++;
        results.push({ ...summarizeRecommendation(recommendation, fingerprint, existing), status: "skipped", reason: "duplicate" });
        continue;
      }

      if (settings.mode === "preview") {
        const withinBudget = budgetUsed < settings.maxActionsPerRun;
        results.push({ ...summarizeRecommendation(recommendation, fingerprint), status: withinBudget ? "would_save" : "skipped", reason: withinBudget ? "preview_only" : "max_actions_reached" });
        if (withinBudget) budgetUsed++;
        else skippedCount++;
        continue;
      }

      if (budgetUsed >= settings.maxActionsPerRun) {
        skippedCount++;
        results.push({ ...summarizeRecommendation(recommendation, fingerprint), status: "skipped", reason: "max_actions_reached" });
        continue;
      }

      const planned = await recordPlannedRemasterAction(action, recommendationContext(recommendation, request));
      if (planned.duplicate) {
        skippedCount++;
        results.push({ ...summarizeRecommendation(recommendation, fingerprint, planned.action), status: "skipped", reason: "duplicate" });
        continue;
      }
      savedCount++;
      budgetUsed++;
      results.push({ ...summarizeRecommendation(recommendation, fingerprint, planned.action), status: "saved", historyId: planned.action.id });
    } catch (error) {
      skippedCount++;
      const failure = {
        ...summarizeRecommendation(recommendation, fingerprint),
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown autopilot planning error",
      };
      errors.push(failure);
      results.push(failure);
    }
  }

  const summary = {
    mode: settings.mode,
    analyzedCount: recommendations.length,
    eligibleCount: recommendations.filter((item) => Boolean(item.action?.type)).length,
    savedCount: settings.mode === "preview" ? 0 : savedCount,
    executedCount,
    wouldSaveCount: settings.mode === "preview" ? budgetUsed : 0,
    skippedCount,
    metadataRequiresApproval,
    metadataRequiresApprovalCount: metadataRequiresApproval.length,
    results,
    errors,
    message: settings.mode === "preview"
      ? "Autopilot-preview fullført. Ingen tiltak ble lagret eller utført."
      : settings.mode === "execute_guarded"
        ? `Guarded autopilot fullført: ${executedCount} metadata-tiltak utført og ${savedCount} sikre planer lagret.`
        : "Autopilot-kjøring fullført. Ikke-destruktive planer kan ha blitt lagret.",
  };

  console.log("[Re-Master Autopilot Run]", {
    mode: summary.mode,
    analyzedCount: summary.analyzedCount,
    savedCount: summary.savedCount,
    executedCount: summary.executedCount,
    skippedCount: summary.skippedCount,
    errors: summary.errors.length,
  });
  return NextResponse.json(summary);
}
