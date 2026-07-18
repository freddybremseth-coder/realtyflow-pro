import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext, type RequestAccessContext } from "@/lib/api-admin";
import { hasPermission } from "@/lib/access-control";
import { getBillingSupabase, type BillingSupabaseClient } from "@/lib/billing/supabase";

export type BillingRequest = {
  context: RequestAccessContext;
  supabase: BillingSupabaseClient;
};

export async function requireBillingRequest(request: NextRequest, mode: "read" | "write"):
  Promise<{ value: BillingRequest; response: null } | { value: null; response: NextResponse }> {
  const context = await getRequestAccessContext(request);
  if (!context) {
    return { value: null, response: NextResponse.json({ error: "Admin session required" }, { status: 401 }) };
  }
  const permission = mode === "write" ? "finance.write" : "finance.read";
  if (context.role !== "OWNER" && !hasPermission(context.role, permission)) {
    return { value: null, response: NextResponse.json({ error: "Access permission required", requiredPermission: permission }, { status: 403 }) };
  }
  const supabase = getBillingSupabase();
  if (!supabase) {
    return { value: null, response: NextResponse.json({ error: "Supabase er ikke konfigurert for fakturamodulen." }, { status: 503 }) };
  }
  return { value: { context, supabase }, response: null };
}

export async function canAccessBillingOrganization(
  request: BillingRequest,
  organizationId: string,
  write = false,
) {
  if (request.context.role === "OWNER") return true;
  let query = request.supabase
    .from("billing_organization_users")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .ilike("user_email", request.context.email)
    .limit(1);
  if (write) query = query.in("role", ["owner", "administrator", "invoicing", "accountant"]);
  const { data, error } = await query.maybeSingle();
  return !error && Boolean(data);
}

export async function requireBillingOrganization(
  request: BillingRequest,
  organizationId: string,
  write = false,
) {
  if (await canAccessBillingOrganization(request, organizationId, write)) return null;
  return NextResponse.json({ error: "Du har ikke tilgang til dette fakturafirmaet." }, { status: 403 });
}

export function billingDatabaseError(error: unknown, fallback = "Fakturahandlingen mislyktes.") {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : fallback;
  return NextResponse.json({ error: message || fallback }, { status: 500 });
}
