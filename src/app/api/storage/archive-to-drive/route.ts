import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { archivePublishedStorageToDrive } from "@/services/storage/google-drive-archive";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createServerClient();
    const result = await archivePublishedStorageToDrive(supabase, {
      limit: Number(body.limit || 10),
      deleteAfterArchive: body.deleteAfterArchive === true,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke arkivere til Google Drive" },
      { status: 500 },
    );
  }
}
