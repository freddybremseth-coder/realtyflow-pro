const ELIGIBLE_STATUSES = new Set(["ready", "drafted"]);

export type RemasterPromotionSource = {
  id: string;
  source_id: string;
  source_url: string | null;
  title: string;
  priority: number | string;
  recommended_channels: string[] | null;
  payload: Record<string, unknown> | null;
  status: string;
  last_planned_at: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim().toLowerCase()).filter(Boolean) : [];
}

function safeDate(value: unknown) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function youtubeUrl(row: RemasterPromotionSource) {
  const payloadUrl = clean(row.payload?.youtube_url);
  return payloadUrl || clean(row.source_url);
}

export function remasterPromotionTitleFamily(value: unknown) {
  let normalized = clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
  normalized = normalized.replace(/^a\s*(?=[¡¿])/i, "");
  return normalized
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickRemasterPromotionSource(
  rows: RemasterPromotionSource[],
  channel: "instagram" | "facebook",
  nowMs = Date.now(),
  cooldownDays = 14,
) {
  const cutoff = nowMs - Math.max(1, cooldownDays) * 86_400_000;
  const familyLastPlanned = new Map<string, number>();
  for (const row of rows) {
    const family = remasterPromotionTitleFamily(row.title);
    const planned = safeDate(row.last_planned_at);
    if (!family || planned == null) continue;
    familyLastPlanned.set(family, Math.max(familyLastPlanned.get(family) ?? Number.NEGATIVE_INFINITY, planned));
  }

  const eligible = rows.filter((row) => {
    if (!ELIGIBLE_STATUSES.has(clean(row.status).toLowerCase())) return false;
    if (!youtubeUrl(row)) return false;
    if (!stringArray(row.recommended_channels).includes(channel)) return false;
    const lastPlanned = safeDate(row.last_planned_at);
    if (lastPlanned != null && lastPlanned >= cutoff) return false;
    const family = remasterPromotionTitleFamily(row.title);
    const familyPlanned = family ? familyLastPlanned.get(family) : undefined;
    if (familyPlanned != null && familyPlanned >= cutoff) return false;
    return true;
  });

  return eligible.sort((a, b) => {
    const aPlanned = safeDate(a.last_planned_at);
    const bPlanned = safeDate(b.last_planned_at);
    if (aPlanned == null && bPlanned != null) return -1;
    if (aPlanned != null && bPlanned == null) return 1;
    if (aPlanned != null && bPlanned != null && aPlanned !== bPlanned) return aPlanned - bPlanned;
    const priorityDiff = Number(b.priority || 0) - Number(a.priority || 0);
    return priorityDiff || a.title.localeCompare(b.title);
  })[0] ?? null;
}

export function remasterPromotionMediaUrl(source: RemasterPromotionSource) {
  return clean(source.payload?.thumbnail_url) || clean(source.payload?.image_url) || undefined;
}

export function remasterPromotionMasterIdea(source: RemasterPromotionSource, guidance = "") {
  const payload = source.payload ?? {};
  const verifiedUrl = youtubeUrl(source);
  const facts = [
    payload.artist ? `artist: ${String(payload.artist)}` : null,
    payload.genre ? `genre: ${String(payload.genre)}` : null,
    payload.mood ? `mood: ${String(payload.mood)}` : null,
    payload.style ? `style: ${String(payload.style)}` : null,
    payload.energy ? `energy: ${String(payload.energy)}` : null,
  ].filter(Boolean).join(", ");

  return `Promote the verified Re-Master Freddy track "${source.title}". Use only this selected song as the creative subject. Verified YouTube destination: ${verifiedUrl}. ${facts ? `Verified song facts: ${facts}. ` : ""}Use the verified artwork supplied with the source when available. Goal: qualified YouTube listens/views, Re-Master Freddy followers and repeat listeners. Do not invent streaming numbers, chart positions, reviews, awards, listener counts or platform availability. Do not replace the selected song with another catalog item.${guidance}`;
}

export async function loadRemasterPromotionSource(
  supabase: any,
  channel: "instagram" | "facebook",
  options: { nowMs?: number; cooldownDays?: number } = {},
) {
  const { data, error } = await supabase
    .from("marketing_source_queue")
    .select("id,source_id,source_url,title,priority,recommended_channels,payload,status,last_planned_at")
    .eq("brand_id", "remasterfreddy")
    .eq("source_type", "song")
    .in("status", ["ready", "drafted"])
    .order("priority", { ascending: false })
    .limit(500);
  if (error) throw new Error(`REMASTER_PROMOTION_SOURCE_READ_FAILED: ${error.message}`);
  return pickRemasterPromotionSource(
    (data ?? []) as RemasterPromotionSource[],
    channel,
    options.nowMs ?? Date.now(),
    options.cooldownDays ?? 14,
  );
}

export async function markRemasterPromotionSourcePlanned(supabase: any, sourceId: string, plannedAt = new Date().toISOString()) {
  const { error } = await supabase
    .from("marketing_source_queue")
    .update({ last_planned_at: plannedAt, updated_at: plannedAt })
    .eq("id", sourceId)
    .eq("brand_id", "remasterfreddy")
    .eq("source_type", "song");
  if (error) throw new Error(`REMASTER_PROMOTION_SOURCE_MARK_FAILED: ${error.message}`);
}
