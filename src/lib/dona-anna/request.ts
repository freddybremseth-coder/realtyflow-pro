import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/access-control";
import { getRequestAccessContext, type RequestAccessContext } from "@/lib/api-admin";
import { getDonaAnnaSupabase } from "@/lib/dona-anna/supabase";

export type DonaAnnaRequest = {
  context: RequestAccessContext;
  supabase: NonNullable<ReturnType<typeof getDonaAnnaSupabase>>;
};

export async function requireDonaAnnaRequest(
  request: NextRequest,
  mode: "read" | "write",
): Promise<{ value: DonaAnnaRequest; response: null } | { value: null; response: NextResponse }> {
  const context = await getRequestAccessContext(request);
  if (!context) {
    return { value: null, response: NextResponse.json({ error: "Admin session required" }, { status: 401 }) };
  }
  const permission = mode === "write" ? "finance.write" : "finance.read";
  if (context.role !== "OWNER" && !hasPermission(context.role, permission)) {
    return {
      value: null,
      response: NextResponse.json({ error: "Access permission required", requiredPermission: permission }, { status: 403 }),
    };
  }
  const supabase = getDonaAnnaSupabase();
  if (!supabase) {
    return {
      value: null,
      response: NextResponse.json({ error: "Supabase er ikke konfigurert for Doña Anna." }, { status: 503 }),
    };
  }
  return { value: { context, supabase }, response: null };
}

export function donaAnnaDatabaseError(error: unknown, fallback = "Handlingen i Doña Anna mislyktes.") {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : fallback;
  return NextResponse.json({ error: message || fallback }, { status: 500 });
}
