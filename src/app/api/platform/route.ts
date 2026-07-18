import { NextRequest, NextResponse } from "next/server";
import { platformDatabaseError, requirePlatformOwner } from "@/lib/platform/request";
import { loadPlatformSnapshot } from "@/services/platform/platform-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const auth = await requirePlatformOwner(request);
  if (!auth.value) return auth.response;
  try {
    const snapshot = await loadPlatformSnapshot(auth.value.supabase);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return platformDatabaseError(error, "Platformdataene kunne ikke lastes.");
  }
}
