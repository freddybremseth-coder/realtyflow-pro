import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext, type RequestAccessContext } from "@/lib/api-admin";
import { getPlatformSupabase } from "@/lib/platform/supabase";

export type PlatformRequest = {
  context: RequestAccessContext;
  supabase: NonNullable<ReturnType<typeof getPlatformSupabase>>;
};

export async function requirePlatformOwner(
  request: NextRequest,
): Promise<{ value: PlatformRequest; response: null } | { value: null; response: NextResponse }> {
  const context = await getRequestAccessContext(request);
  if (!context) {
    return {
      value: null,
      response: NextResponse.json({ error: "Admin session required" }, { status: 401 }),
    };
  }
  if (context.role !== "OWNER") {
    return {
      value: null,
      response: NextResponse.json(
        { error: "Access permission required", requiredPermission: "OWNER_ONLY" },
        { status: 403 },
      ),
    };
  }
  const supabase = getPlatformSupabase();
  if (!supabase) {
    return {
      value: null,
      response: NextResponse.json(
        { error: "Supabase er ikke konfigurert for Platform Core." },
        { status: 503 },
      ),
    };
  }
  return { value: { context, supabase }, response: null };
}

export function platformDatabaseError(error: unknown, fallback = "Plattformhandlingen mislyktes.") {
  const message = error && typeof error === "object" && "message" in error
    ? String(error.message)
    : fallback;
  return NextResponse.json({ error: message || fallback }, { status: 500 });
}
