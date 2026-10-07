import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  CORPORATE_DECISION_NOTE_TEMPLATE_KEY,
  DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE,
  normalizeCorporateDecisionNoteTemplate,
} from "@/lib/corporate-decision-note";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { template: DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured", template: DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("brand_settings")
    .select("settings,updated_at")
    .eq("brand_id", CORPORATE_DECISION_NOTE_TEMPLATE_KEY)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message, template: DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE }, { status: 500 });

  const template = normalizeCorporateDecisionNoteTemplate({
    ...(data?.settings && typeof data.settings === "object" ? data.settings : {}),
    updated_at: data?.updated_at || null,
  });

  return NextResponse.json({
    template,
    storage: { table: "brand_settings", key: CORPORATE_DECISION_NOTE_TEMPLATE_KEY },
    note: "This controls presentation copy for new Corporate decision-note reports. Calculator formulas remain code-controlled.",
  });
}

export async function PATCH(request: NextRequest) {
  const denied = await requireAdminApi(request, { template: DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString();
  const template = normalizeCorporateDecisionNoteTemplate({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    updated_at: now,
  });

  const { error } = await supabase
    .from("brand_settings")
    .upsert({
      brand_id: CORPORATE_DECISION_NOTE_TEMPLATE_KEY,
      settings: template,
      updated_at: now,
    }, { onConflict: "brand_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, template });
}
