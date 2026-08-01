import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";
import { getMediaAccessScope } from "./organization";
import { MediaApiGuardError } from "./api-guards";

export async function getMediaApiContext(request: NextRequest, fallbackBody: Record<string, unknown> = {}) {
  const unauthorized = await requireAdminApi(request, fallbackBody);
  if (unauthorized) return { error: unauthorized as NextResponse };

  const access = await getRequestAccessContext(request);
  if (!access) {
    return { error: NextResponse.json({ ...fallbackBody, error: "Admin session required" }, { status: 401 }) };
  }

  const supabase = createServerClient();
  const scope = await getMediaAccessScope(supabase, access);
  return { supabase, access, scope };
}

export function jsonError(error: unknown, status = 500) {
  const resolvedStatus = error instanceof MediaApiGuardError ? error.status : status;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error || "Ukjent feil") },
    { status: resolvedStatus },
  );
}
