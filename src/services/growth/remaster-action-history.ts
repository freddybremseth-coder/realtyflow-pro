import { createHash } from "crypto";

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

function restConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service configuration is missing for Re-Master action history");
  }
  return { baseUrl: `${url}/rest/v1/growth_actions`, key };
}

function restHeaders(key: string, prefer?: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function parseRows(response: Response, operation: string): Promise<RemasterActionHistoryRow[]> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body
      ? String((body as { message?: unknown }).message || operation)
      : operation;
    throw new Error(`${operation}: ${message}`);
  }
  return Array.isArray(body) ? body as RemasterActionHistoryRow[] : [];
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

function valuesForAction(
  action: RemasterRecommendationAction,
  context: RemasterActionContext,
  fingerprint: string,
) {
  return {
    brand: BRAND_ID,
    action_type: action.type,
    platform: PLATFORM,
    content: actionContent(action, context),
    hypothesis: fingerprint,
    expected_outcome: context.impact?.trim() || "",
    priority: priorityValue(context.priority),
    learnings: learningsPayload(action, context),
  };
}

export async function findRemasterActionByFingerprint(fingerprint: string) {
  const { baseUrl, key } = restConfig();
  const params = new URLSearchParams({
    select: HISTORY_COLUMNS,
    brand: `eq.${BRAND_ID}`,
    hypothesis: `eq.${fingerprint}`,
    order: "created_at.desc",
    limit: "1",
  });
  const response = await fetch(`${baseUrl}?${params.toString()}`, {
    headers: restHeaders(key),
    cache: "no-store",
  });
  const rows = await parseRows(response, "Could not check Re-Master action history");
  return rows[0] || null;
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

  const { baseUrl, key } = restConfig();
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: restHeaders(key, "return=representation"),
    body: JSON.stringify({
      ...valuesForAction(action, context, fingerprint),
      status: "planned",
      reviewed_at: new Date().toISOString(),
    }),
  });
  const rows = await parseRows(response, "Could not record planned Re-Master action");
  if (!rows[0]) throw new Error("Could not record planned Re-Master action: no row returned");
  return { duplicate: false, fingerprint, action: rows[0] };
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

  const now = new Date().toISOString();
  const payload = {
    ...valuesForAction(action, context, fingerprint),
    status: "completed",
    reviewed_at: existing?.reviewed_at || now,
    executed_at: now,
    learnings: learningsPayload(action, context, result),
    updated_at: now,
  };
  const { baseUrl, key } = restConfig();
  const requestUrl = existing
    ? `${baseUrl}?${new URLSearchParams({ id: `eq.${existing.id}` }).toString()}`
    : baseUrl;
  const response = await fetch(requestUrl, {
    method: existing ? "PATCH" : "POST",
    headers: restHeaders(key, "return=representation"),
    body: JSON.stringify(payload),
  });
  const rows = await parseRows(response, "Could not record completed Re-Master action");
  if (!rows[0]) throw new Error("Could not record completed Re-Master action: no row returned");
  return { duplicate: false, fingerprint, action: rows[0] };
}

export async function listRemasterActionHistory(limit = 50) {
  const { baseUrl, key } = restConfig();
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const params = new URLSearchParams({
    select: HISTORY_COLUMNS,
    brand: `eq.${BRAND_ID}`,
    platform: `eq.${PLATFORM}`,
    order: "created_at.desc",
    limit: String(safeLimit),
  });
  const response = await fetch(`${baseUrl}?${params.toString()}`, {
    headers: restHeaders(key),
    cache: "no-store",
  });
  return parseRows(response, "Could not load Re-Master action history");
}
