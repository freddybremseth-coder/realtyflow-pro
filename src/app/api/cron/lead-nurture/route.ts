export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runNurtureCycle } from "@/services/growth/nurture-engine";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";

// Vercel cron: kjører daglig. Følger opp ferske leads automatisk.
// SIKKERHET: dry-run som standard. Sender BARE ekte e-post når
// NURTURE_LIVE=true er satt i env, eller ?live=1 sendes manuelt.
export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function handle(request: NextRequest) {
  // 1. Verifiser CRON_SECRET (samme mønster som øvrige crons)
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const safeMode = await evaluateCronSafeMode("/api/cron/lead-nurture");
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const liveEnv = String(process.env.NURTURE_LIVE || "").toLowerCase() === "true";
  const liveQuery = searchParams.get("live") === "1";
  const forceDry = searchParams.get("dry") === "1";
  const dryRun = forceDry || !(liveEnv || liveQuery);

  const brandId = searchParams.get("brand") || undefined;
  const limit = Number(searchParams.get("limit") || 50) || 50;

  try {
    const result = await runNurtureCycle(supabase, { dryRun, brandId, limit });

    // Logg kjøringen i automation_logs hvis tabellen finnes (best effort).
    await supabase
      .from("automation_logs")
      .insert({
        type: "lead_nurture",
        status: result.failed > 0 ? "partial" : "success",
        details: {
          dryRun: result.dryRun,
          scanned: result.scanned,
          eligible: result.eligible,
          sent: result.sent,
          failed: result.failed,
          dry_run_planned: result.dryRun ? result.planned.length : undefined,
        },
      })
      .then(() => {})
      .then(undefined, () => {});

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

// Vercel cron kaller GET. POST tillates for manuell testing.
export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}
