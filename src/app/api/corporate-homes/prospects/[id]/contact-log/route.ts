import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { evaluateCorporateProspectReadiness } from "@/lib/corporate-prospect-readiness";
import {
  buildCorporateManualContactUpdate,
  type CorporateManualContactMethod,
} from "@/lib/corporate-manual-contact";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

const METHODS = new Set<CorporateManualContactMethod>(["generic_email", "contact_form"]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi(request, { prospect: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const method = String(body?.method || "").trim() as CorporateManualContactMethod;
  const templateKey = body?.template_key ? String(body.template_key).trim() : null;

  if (!METHODS.has(method)) {
    return NextResponse.json({ error: "Ugyldig kontaktmetode." }, { status: 400 });
  }

  const { data: prospect, error: prospectError } = await supabase
    .from("corporate_prospects")
    .select("*")
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (prospectError) return NextResponse.json({ error: prospectError.message }, { status: 500 });
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  const readiness = evaluateCorporateProspectReadiness(prospect);
  const status = String(prospect.status || "DISCOVERED").toUpperCase();
  const canLogContact = readiness.manualContactReady || ["CONTACT_READY", "CONTACTED"].includes(status);

  if (!canLogContact) {
    return NextResponse.json(
      { error: "Prospektet er ikke klart for manuell kontakt via en offisiell selskapskanal." },
      { status: 409 },
    );
  }

  let update;
  try {
    update = buildCorporateManualContactUpdate({
      status,
      evidence: prospect.evidence,
      method,
      templateKey,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke loggføre kontakten." },
      { status: 409 },
    );
  }

  const { data: updatedProspect, error: updateError } = await supabase
    .from("corporate_prospects")
    .update({
      status: update.status,
      next_followup: update.next_followup,
      next_action: update.next_action,
      evidence: update.evidence,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    prospect: updatedProspect,
    contactLog: update.entry,
    automation: {
      sent: false,
      personal_enrichment: false,
      auto_followup: false,
      note: "Kun manuell kontakt ble loggført. RealtyFlow sendte ingenting.",
    },
  });
}
