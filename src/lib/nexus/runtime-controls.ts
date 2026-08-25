import { createClient } from "@supabase/supabase-js";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function isTrue(value?: string | null) {
  if (!value) return false;
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type RuntimeControl = {
  control_key: string;
  label: string;
  category: string;
  enabled: boolean;
  risk_level: "low" | "medium" | "high" | "critical";
  description: string;
  config: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
};

export async function getRuntimeControl(controlKey: string): Promise<RuntimeControl | null> {
  const supabase = getClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("nexus_runtime_controls")
    .select("control_key,label,category,enabled,risk_level,description,config,updated_by,updated_at")
    .eq("control_key", controlKey)
    .maybeSingle();
  if (error) return null;
  return data as RuntimeControl | null;
}

export async function isRuntimeEnabled(controlKey: string, fallback?: boolean): Promise<boolean> {
  const control = await getRuntimeControl(controlKey);
  if (control) return Boolean(control.enabled);
  return fallback ?? true;
}

export async function isNurtureLiveEnabled(): Promise<boolean> {
  const control = await getRuntimeControl("feature:nurture_live");
  if (control) return Boolean(control.enabled);
  return isTrue(process.env.NURTURE_LIVE);
}

export async function isCronEnabled(pathname: string): Promise<{ enabled: boolean; reason?: string }> {
  const global = await getRuntimeControl("cron:global");
  if (global && !global.enabled) return { enabled: false, reason: "Nexus global cron control is disabled" };

  const route = await getRuntimeControl(`cron:${pathname}`);
  if (route && !route.enabled) return { enabled: false, reason: `${route.label} is disabled in Nexus` };

  return { enabled: true };
}
