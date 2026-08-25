import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { CRON_SECRET_REQUIRED_MESSAGE, CRON_UNAUTHORIZED_MESSAGE } from "@/lib/api-cron";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function safeEqualHex(a: string, b: string) {
  if (!/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Accepts Vercel's CRON_SECRET OR the Nexus scheduler token stored only in
 * Supabase Vault. The database stores only the token SHA-256 digest.
 */
export async function requireNexusSchedulerApi(request: NextRequest, body: Record<string, unknown> = {}) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const cronHeader = request.headers.get("x-cron-secret")?.trim();
  const querySecret = request.nextUrl.searchParams.get("key")?.trim();
  const nexusHeader = request.headers.get("x-nexus-scheduler")?.trim();
  const supplied = bearer || nexusHeader || cronHeader || querySecret || "";

  const expectedCron = process.env.CRON_SECRET;
  if (expectedCron && (bearer === expectedCron || cronHeader === expectedCron || querySecret === expectedCron)) return null;

  const supabase = getSupabase();
  if (supabase && supplied) {
    const { data } = await supabase
      .from("nexus_scheduler_config")
      .select("token_sha256,enabled")
      .eq("singleton", true)
      .maybeSingle();
    if (data?.enabled && data.token_sha256) {
      const suppliedHash = createHash("sha256").update(supplied).digest("hex");
      if (safeEqualHex(suppliedHash, String(data.token_sha256))) return null;
    }
  }

  if (!expectedCron && !supabase) {
    return NextResponse.json({ ...body, error: CRON_SECRET_REQUIRED_MESSAGE }, { status: 500 });
  }
  return NextResponse.json({ ...body, error: CRON_UNAUTHORIZED_MESSAGE }, { status: 401 });
}
