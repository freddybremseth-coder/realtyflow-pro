import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getDemoSitesSupabase } from "@/lib/demosites-api-supabase";
import { hashPortalPassword } from "@/lib/demosites-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Admin management of chatgenius.pro seller accounts — used from the
 * RealtyFlow DemoSites CRM ("Selgertilganger"). Sellers themselves never
 * touch these endpoints.
 *
 *   GET    → list users (no hashes)
 *   POST   → create { email, name, password }
 *   PATCH  → { id, is_active? , name?, password? } (password = reset)
 */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getDemoSitesSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("demosites_portal_users")
    .select("id, email, name, role, is_active, last_login_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    const missingTable = /demosites_portal_users/.test(error.message) && /(does not exist|schema cache)/i.test(error.message);
    if (missingTable) {
      return NextResponse.json({ users: [], warning: "Kjør migrasjonen 20260714150000_demosites_portal_users.sql i Supabase." });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ users: data || [] });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getDemoSitesSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");

  if (!email || !email.includes("@") || !name) {
    return NextResponse.json({ error: "Gyldig e-post og navn er påkrevd." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Passordet må ha minst 8 tegn." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("demosites_portal_users")
    .insert({ email, name, password_hash: hashPortalPassword(password), created_by: "realtyflow-crm" })
    .select("id, email, name, is_active, created_at")
    .single();

  if (error) {
    if (/duplicate key/i.test(error.message)) {
      return NextResponse.json({ error: "Det finnes allerede en bruker med denne e-posten." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ user: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getDemoSitesSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Navn kan ikke være tomt." }, { status: 400 });
    patch.name = name;
  }
  if (body.password !== undefined) {
    const password = String(body.password || "");
    if (password.length < 8) return NextResponse.json({ error: "Passordet må ha minst 8 tegn." }, { status: 400 });
    patch.password_hash = hashPortalPassword(password);
  }

  const { data, error } = await supabase
    .from("demosites_portal_users")
    .update(patch)
    .eq("id", id)
    .select("id, email, name, is_active, last_login_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}
