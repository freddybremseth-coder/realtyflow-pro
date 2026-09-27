import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformSupabase } from "@/lib/platform/supabase";

export const WORKSPACE_RUNTIME_SETTINGS_KEY = "workspace-auth:runtime";

export type WorkspaceRuntimeState = {
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  error: string | null;
};

function cleanSettings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    enabled: row.enabled === true,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
    updatedBy: typeof row.updatedBy === "string" ? row.updatedBy : null,
  };
}

export async function getWorkspaceRuntimeState(
  client?: SupabaseClient | null,
): Promise<WorkspaceRuntimeState> {
  const supabase = client === undefined ? getPlatformSupabase() : client;
  if (!supabase) {
    return { enabled: false, updatedAt: null, updatedBy: null, error: "WORKSPACE_RUNTIME_UNAVAILABLE" };
  }
  const { data, error } = await supabase
    .from("brand_settings")
    .select("settings,updated_at")
    .eq("brand_id", WORKSPACE_RUNTIME_SETTINGS_KEY)
    .maybeSingle();
  if (error) {
    return { enabled: false, updatedAt: null, updatedBy: null, error: error.message || "WORKSPACE_RUNTIME_UNAVAILABLE" };
  }
  const settings = cleanSettings(data?.settings);
  return {
    enabled: settings?.enabled === true,
    updatedAt: settings?.updatedAt || (typeof data?.updated_at === "string" ? data.updated_at : null),
    updatedBy: settings?.updatedBy || null,
    error: null,
  };
}

export async function setWorkspaceRuntimeEnabled(params: {
  client?: SupabaseClient | null;
  enabled: boolean;
  actor: string;
}) {
  const supabase = params.client === undefined ? getPlatformSupabase() : params.client;
  const actor = String(params.actor || "").trim().toLowerCase();
  if (!supabase || !actor.includes("@")) {
    return { ok: false as const, enabled: false, error: "WORKSPACE_RUNTIME_UNAVAILABLE" };
  }

  if (params.enabled) {
    const { data, error } = await supabase.rpc("workspace_staff_security_preflight");
    const safe = Boolean(data && typeof data === "object" && !Array.isArray(data) &&
      (data as Record<string, unknown>).safe_for_workspace_auth === true);
    if (error || !safe) {
      return { ok: false as const, enabled: false, error: "WORKSPACE_SECURITY_PREFLIGHT_FAILED" };
    }
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("brand_settings").upsert({
    brand_id: WORKSPACE_RUNTIME_SETTINGS_KEY,
    settings: { enabled: params.enabled, updatedAt: now, updatedBy: actor },
    updated_at: now,
  }, { onConflict: "brand_id" });
  if (error) {
    return { ok: false as const, enabled: false, error: error.message || "WORKSPACE_RUNTIME_UPDATE_FAILED" };
  }
  return { ok: true as const, enabled: params.enabled, error: null };
}
