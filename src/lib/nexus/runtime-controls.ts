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

type CronRuntimeControl = Pick<RuntimeControl, "control_key" | "label" | "enabled">;

export type CronControlOptions = {
  /** High-risk outbound jobs must stop when their route control cannot be verified. */
  failClosed?: boolean;
};

export type CronControlDecision = {
  enabled: boolean;
  reason?: string;
};

/** Pure decision helper kept separate from the database lookup so the safety
 * precedence can be regression-tested without network access. */
export function resolveCronControlDecision(
  pathname: string,
  controls: CronRuntimeControl[] | null,
  options: CronControlOptions = {},
  unavailableReason?: string,
): CronControlDecision {
  if (!controls) {
    return options.failClosed
      ? { enabled: false, reason: unavailableReason || "Nexus runtime controls are unavailable" }
      : { enabled: true };
  }

  const global = controls.find((control) => control.control_key === "cron:global");
  if (global && !global.enabled) return { enabled: false, reason: "Nexus global cron control is disabled" };

  const routeKey = `cron:${pathname}`;
  const route = controls.find((control) => control.control_key === routeKey);
  if (route && !route.enabled) return { enabled: false, reason: `${route.label} is disabled in Nexus` };
  if (!route && options.failClosed) {
    return { enabled: false, reason: `Required Nexus runtime control ${routeKey} is missing` };
  }

  return { enabled: true };
}

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

export async function isCronEnabled(pathname: string, options: CronControlOptions = {}): Promise<CronControlDecision> {
  const supabase = getClient();
  if (!supabase) {
    return resolveCronControlDecision(pathname, null, options, "Nexus runtime controls are not configured");
  }

  const routeKey = `cron:${pathname}`;
  const { data, error } = await supabase
    .from("nexus_runtime_controls")
    .select("control_key,label,enabled")
    .in("control_key", ["cron:global", routeKey]);

  if (error) {
    return resolveCronControlDecision(
      pathname,
      null,
      options,
      `Nexus runtime control lookup failed: ${error.message}`,
    );
  }

  return resolveCronControlDecision(pathname, (data ?? []) as CronRuntimeControl[], options);
}
