export type RemasterAutopilotMode = "off" | "preview" | "plan_non_destructive" | "execute_guarded";

export interface RemasterAutopilotSettings {
  mode: RemasterAutopilotMode;
  allowMetadataUpdates: boolean;
  allowNonDestructivePlans: boolean;
  maxActionsPerRun: number;
  updatedAt?: string;
  updatedBy?: string;
}

const BRAND_ID = "remasterfreddy";
const SETTINGS_KEY = "remaster_autopilot";

const DEFAULT_SETTINGS: RemasterAutopilotSettings = {
  mode: "off",
  allowMetadataUpdates: false,
  allowNonDestructivePlans: false,
  maxActionsPerRun: 3,
};

function restConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service configuration is missing for Re-Master autopilot settings");
  }
  return { baseUrl: `${url}/rest/v1/brand_settings`, key };
}

function restHeaders(key: string, prefer?: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function normalizeMode(value: unknown): RemasterAutopilotMode {
  if (value === "preview" || value === "plan_non_destructive" || value === "execute_guarded") return value;
  return "off";
}

function normalizeSettings(value: unknown): RemasterAutopilotSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const mode = normalizeMode(raw.mode);
  const max = Number(raw.maxActionsPerRun || DEFAULT_SETTINGS.maxActionsPerRun);
  return {
    mode,
    allowMetadataUpdates: mode === "execute_guarded" && raw.allowMetadataUpdates !== false,
    allowNonDestructivePlans: (mode === "plan_non_destructive" || mode === "execute_guarded") && raw.allowNonDestructivePlans !== false,
    maxActionsPerRun: Number.isFinite(max) ? Math.max(1, Math.min(Math.round(max), 10)) : DEFAULT_SETTINGS.maxActionsPerRun,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : undefined,
  };
}

async function loadRawSettings(): Promise<Record<string, unknown>> {
  const { baseUrl, key } = restConfig();
  const params = new URLSearchParams({
    select: "settings",
    brand_id: `eq.${BRAND_ID}`,
    limit: "1",
  });
  const response = await fetch(`${baseUrl}?${params.toString()}`, {
    headers: restHeaders(key),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? String((body as { message?: unknown }).message) : "Could not load autopilot settings";
    throw new Error(message);
  }
  const row = Array.isArray(body) ? body[0] : null;
  return row?.settings && typeof row.settings === "object" ? row.settings as Record<string, unknown> : {};
}

export async function getRemasterAutopilotSettings() {
  const settings = await loadRawSettings();
  return normalizeSettings(settings[SETTINGS_KEY]);
}

export async function saveRemasterAutopilotSettings(
  next: Partial<RemasterAutopilotSettings>,
  updatedBy = "freddy.bremseth@gmail.com",
) {
  const currentRaw: Record<string, unknown> = await loadRawSettings().catch(() => ({} as Record<string, unknown>));
  const current = normalizeSettings(currentRaw[SETTINGS_KEY]);
  const mode = normalizeMode(next.mode || current.mode);
  const normalized: RemasterAutopilotSettings = normalizeSettings({
    ...current,
    ...next,
    mode,
    allowMetadataUpdates: mode === "execute_guarded",
    allowNonDestructivePlans: mode === "plan_non_destructive" || mode === "execute_guarded",
    updatedAt: new Date().toISOString(),
    updatedBy,
  });

  const payload = {
    brand_id: BRAND_ID,
    settings: {
      ...currentRaw,
      [SETTINGS_KEY]: normalized,
    },
    updated_at: new Date().toISOString(),
  };

  const { baseUrl, key } = restConfig();
  const upsertUrl = `${baseUrl}?on_conflict=brand_id`;
  const response = await fetch(upsertUrl, {
    method: "POST",
    headers: restHeaders(key, "resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? String((body as { message?: unknown }).message) : "Could not save autopilot settings";
    throw new Error(message);
  }
  return normalized;
}

export function defaultRemasterAutopilotSettings() {
  return { ...DEFAULT_SETTINGS };
}
