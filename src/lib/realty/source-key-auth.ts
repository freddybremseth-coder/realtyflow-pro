import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export type SourceKeyCheck =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string; failClosed: boolean };

/**
 * Verifies the `x-realtyflow-source-key` header against an env-configured key.
 * Fails closed in production when no key is configured, instead of silently
 * accepting every request - a misconfigured env var must not turn into an
 * open public endpoint.
 */
export function checkSourceKey(request: NextRequest, expectedKey: string | undefined, routeLabel: string): SourceKeyCheck {
  if (!expectedKey) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[${routeLabel}] No source key configured in production - failing closed`);
      return { ok: false, status: 503, error: "Service misconfigured", failClosed: true };
    }
    return { ok: true };
  }

  const providedKey = request.headers.get("x-realtyflow-source-key") || "";
  if (providedKey !== expectedKey) {
    return { ok: false, status: 401, error: "Unauthorized", failClosed: false };
  }

  return { ok: true };
}

/**
 * Raises a visible alarm when a public lead-capture route fails closed, so
 * downtime in lead capture is caught immediately instead of silently
 * dropping leads until someone notices in server logs.
 */
export async function raiseLeadCaptureAlarm(routeLabel: string) {
  console.error(`[ALARM] ${routeLabel} is fail-closed: source key missing in production. Lead capture is down.`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    const supabase = createClient(url, key);
    const now = new Date().toISOString();
    await supabase.from("work_items").insert({
      title: `ALARM: Leadfangst nede (${routeLabel})`,
      description: "Manglende source-key i produksjon gjorde at endepunktet avviste alle forespørsler (fail-closed, 503).",
      status: "TO_DO",
      priority: "HIGH",
      due_date: now.slice(0, 10),
      brand_id: "system",
      source_type: "system_alarm",
      assigned_agent: "sales",
      next_action: "Sett source-key-miljøvariabelen i produksjon umiddelbart.",
      ai_score: 100,
      metadata: { route: routeLabel, reason: "missing_source_key_fail_closed" },
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    console.error(`[ALARM] Failed to record work item for ${routeLabel}`, err);
  }
}
