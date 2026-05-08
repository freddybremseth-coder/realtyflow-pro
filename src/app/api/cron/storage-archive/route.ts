import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { archivePublishedStorageToDrive } from "@/services/storage/google-drive-archive";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const safeMode = await evaluateCronSafeMode('/api/cron/storage-archive');
  if (safeMode.skip) {
    return NextResponse.json({
      success: true,
      skipped: true,
      mode: safeMode.mode,
      reason: safeMode.reason,
    });
  }

  try {
    const supabase = createServerClient();
    const result = await archivePublishedStorageToDrive(supabase, { limit: 10 });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Storage archive failed" },
      { status: 500 },
    );
  }
}
