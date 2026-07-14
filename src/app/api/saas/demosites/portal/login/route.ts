import { NextRequest } from "next/server";
import { getDemoSitesSupabase } from "@/lib/demosites-api-supabase";
import {
  createPortalToken,
  portalJson,
  portalPreflight,
  verifyPortalPassword,
} from "@/lib/demosites-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/saas/demosites/portal/login  (CORS: chatgenius.pro)
 * Body: { email, password } → { token, name, email, expiresAt }
 *
 * Seller login for the chatgenius.pro portal. Accounts are managed from the
 * RealtyFlow DemoSites CRM.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return portalJson(request, { error: "E-post og passord er påkrevd." }, 400);
  }

  const supabase = getDemoSitesSupabase();
  if (!supabase) return portalJson(request, { error: "Tjenesten er ikke tilgjengelig." }, 503);

  const { data: user } = await supabase
    .from("demosites_portal_users")
    .select("id, email, name, password_hash, is_active")
    .eq("email", email)
    .maybeSingle();

  if (!user || !user.is_active || !verifyPortalPassword(password, user.password_hash)) {
    return portalJson(request, { error: "Feil e-post eller passord." }, 401);
  }

  await supabase
    .from("demosites_portal_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", user.id);

  const { token, expiresAt } = createPortalToken({ email: user.email, name: user.name });
  return portalJson(request, { token, expiresAt, name: user.name, email: user.email });
}

export async function OPTIONS(request: NextRequest) {
  return portalPreflight(request);
}
