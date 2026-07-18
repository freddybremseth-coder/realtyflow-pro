import { NextRequest, NextResponse } from "next/server";
import { donaAnnaDatabaseError, requireDonaAnnaRequest } from "@/lib/dona-anna/request";
import { loadDonaAnnaSnapshot } from "@/services/dona-anna/commerce-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const auth = await requireDonaAnnaRequest(request, "read");
  if (!auth.value) return auth.response;
  try {
    const snapshot = await loadDonaAnnaSnapshot(auth.value.supabase);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return donaAnnaDatabaseError(error, "Doña Anna-dataene kunne ikke lastes.");
  }
}
