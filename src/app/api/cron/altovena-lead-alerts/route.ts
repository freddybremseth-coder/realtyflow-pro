import { assessAltovenaDatabaseIsolation } from "@/lib/altovena/preview-database-isolation";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";

// Server-only durable alert evaluation, never external delivery.
// The route remains inert even when a scheduler hits it unless the separate
// operator flag is explicitly enabled and the cron bearer secret is valid.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;
const PATH = "/api/cron/altovena-lead-alerts";
const noStore = { "Cache-Control": "private, no-store" };

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}
function validBearer(request: NextRequest, expected: string) {
  const supplied = request.headers.get("authorization") || "";
  const prefix = "Bearer ";
  if (!supplied.startsWith(prefix) || !expected) return false;
  const value = Buffer.from(supplied.slice(prefix.length), "utf8");
  const reference = Buffer.from(expected, "utf8");
  return value.length === reference.length && timingSafeEqual(value, reference);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16)
    return reply({ ok: false, error: "CRON_SECRET_NOT_CONFIGURED" }, 503);
  if (!validBearer(request, secret))
    return reply({ ok: false, error: "UNAUTHORIZED" }, 401);

  if (process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED !== "true")
    return reply({ ok: true, skipped: true, reason: "ALERT_SCANNER_DISABLED",
      deliveryEnabled: false });

  if (!assessAltovenaDatabaseIsolation().allowed)
    return reply({ok:false,error:"ALTOVENA_PREVIEW_DATABASE_NOT_ISOLATED"},503);
  const control = await evaluateCronSafeMode(PATH);
  if (control.skip) return reply({ ok: true, skipped: true,
    reason: "NEXUS_OR_CRON_SAFE_MODE", deliveryEnabled: false });

  const db = getPlatformSupabase();
  if (!db) return reply({ ok: false, error: "WORKSPACE_UNAVAILABLE" }, 503);
  // Only the service-role-only RPC can generate/resolve entries. Never accept
  // caller-supplied brand, time, recipients, task IDs or email destinations.
  const { data, error } = await db.rpc("altovena_reconcile_lead_alerts");
  if (error || data?.ok !== true || data?.brand !== "altovena" ||
      data?.deliveryEnabled !== false ||
      ![data?.queued, data?.resolved, data?.pending].every(
        value => Number.isSafeInteger(value) && value >= 0
      )) return reply({ ok: false, error: "ALERT_SCAN_UNAVAILABLE" }, 503);

  return reply({
    ok: true, brand: "altovena", queued: data.queued,
    resolved: data.resolved, pending: data.pending,
    deliveryEnabled: false, emailSent: false,
  });
}
