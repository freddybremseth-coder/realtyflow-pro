import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

export type RemasterActionType = "update_metadata" | "create_content" | "strategy" | "schedule";
export type RemasterPriority = "critical" | "high" | "medium" | "low";

export interface RemasterRecommendationAction {
  type: RemasterActionType;
  videoId?: string | null;
  currentTitle?: string | null;
  newTitle?: string | null;
  newDescription?: string | null;
  newTags?: string[] | null;
  details?: string | null;
}

export interface RemasterActionContext {
  recommendationId?: string;
  title?: string;
  description?: string;
  impact?: string;
  priority?: RemasterPriority;
  approvedBy?: string;
}

export interface RemasterActionHistoryRow {
  id: string;
  brand: string;
  action_type: string;
  platform: string;
  content: string;
  hypothesis: string;
  expected_outcome: string;
  priority: number;
  status: "planned" | "ready" | "published" | "completed" | "failed";
  learnings: string | null;
  executed_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

const BRAND_ID = "remasterfreddy";
const PLATFORM = "youtube";
const HISTORY_COLUMNS = "id,brand,action_type,platform,content,hypothesis,expected_outcome,priority,status,learnings,executed_at,reviewed_at,created_at,updated_at";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service configuration is missing for Re-Master action history");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizedAction(action: RemasterRecommendationAction) {
  return {
    type: action.type,
    videoId: action.videoId || null,
    currentTitle: action.currentTitle?.trim() || null,
    newTitle: action.newTitle?.trim() || null,
    newDescription: action.newDescription?.trim() || null,
    newTags: Array.isArray(action.newTags)
      ? [...new Set(action.newTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort()
      : [],
    details: action.details?.trim() || null,
  };
}

export function buildRemasterActionFingerprint(action: RemasterRecommendationAction) {
  const digest = createHash("sha256")
    .update(JSON.stringify(normalizedAction(action)))
    .digest("hex");
  return `remaster:${digest}`;
}

function priorityValue(priority?: RemasterPriority) {
  switch (priority) {
    case "critical": return 10;
    case "high": return 8;
    case "low": return 2;
    default: return 5;
  }
}

function actionContent(action: RemasterRecommendationAction, context: RemasterActionContext) {
  return (
    action.details?.trim() ||
    action.newTitle?.trim() ||
    action.newDescription?.trim() ||
    context.description?.trim() ||
    context.title?.trim() ||
    `${action.type} for Re-Master Freddy`
  );
}

function learningsPayload(
  action: RemasterRecommendationAction,
  context: RemasterActionContext,
  result?: Record<string, unknown>,
) {
  return JSON.stringify({
    recommendation_id: context.recommendationId || null,
    title: context.title || null,
    approved_by: context.approvedBy || "freddy.bremseth@gmail.com",
    action: normalizedAction(action),
    result: result || null,
  });
}

export async function findRemasterActionByFingerprint(fingerprint: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("growth_actions")
    .select(HISTORY_COLUMNS)
    .eq("brand", BRAND_ID)
    .eq("hypothesis", fingerprint)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Could not check Re-Master action history: ${error.message}`);
  return (data || null) as RemasterActionHistoryRow | null;
}

export async function recordPlannedRemasterAction(
  action: RemasterRecommendationAction,
  context: RemasterActionContext = {},
) {
  const fingerprint = buildRemasterActionFingerprint(action);
  const existing = await findRemasterActionByFingerprint(fingerprint);
  if (existing && ["planned", "ready", "published", "completed"].includes(existing.status)) {
    return { duplicate: true, fingerprint, action: existing };
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("growth_actions")
    .insert({
      brand: BRAND_ID,
      action_type: action.type,
      platform: PLATFORM,
      content: actionContent(action, context),
      hypothesis: fingerprint,
      expected_outcome: context.impact?.trim() || "",
      priority: priorityValue(context.priority),
      status: "planned",
      reviewed_at: new Date().toISOString(),
      learnings: learningsPayload(action, context),
    })
    .select(HISTORY_COLUMNS)
    .single();

  if (error) throw new Error(`Could not record planned Re-Master action: ${error.message}`);
  return { duplicate: false, fingerprint, action: data as RemasterActionHistoryRow };
}

export async function recordCompletedRemasterAction(
  action: RemasterRecommendationAction,
  context: RemasterActionContext = {},
  result: Record<string, unknown> = {},
) {
  const fingerprint = buildRemasterActionFingerprint(action);
  const existing = await findRemasterActionByFingerprint(fingerprint);
  if (existing?.status === "completed") {
    return { duplicate: true, fingerprint, action: existing };
  }

  const supabase = getSupabase();
  const values = {
    brand: BRAND_ID,
    action_type: action.type,
    platform: PLATFORM,
    content: actionContent(action, context),
    hypothesis: fingerprint,
    expected_outcome: context.impact?.trim() || "",
    priority: priorityValue(context.priority),
    status: "completed" as const,
    reviewed_at: existing?.reviewed_at || new Date().toISOString(),
    executed_at: new Date().toISOString(),
    learnings: learningsPayload(action, context, result),
    updated_at: new Date().toISOString(),
  };

  let data: unknown;
  let error: { message: string } | null;

  if (existing) {
    const response = await supabase
      .from("growth_actions")
      .update(values)
      .eq("id", existing.id)
      .select(HISTORY_COLUMNS)
      .single();
    data = response.data;
    error = response.error;
  } else {
    const response = await supabase
      .from("growth_actions")
      .insert(values)
      .select(HISTORY_COLUMNS)
      .single();
    data = response.data;
    error = response.error;
  }

  if (error) throw new Error(`Could not record completed Re-Master action: ${error.message}`);
  return { duplicate: false, fingerprint, action: data as RemasterActionHistoryRow };
}

export async function listRemasterActionHistory(limit = 50) {
  const supabase = getSupabase();
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const { data, error } = await supabase
    .from("growth_actions")
    .select(HISTORY_COLUMNS)
    .eq("brand", BRAND_ID)
    .eq("platform", PLATFORM)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(`Could not load Re-Master action history: ${error.message}`);
  return (data || []) as RemasterActionHistoryRow[];
}
