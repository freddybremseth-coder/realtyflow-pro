import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SALES_STAGES = new Set(["new", "contacted", "quote_sent", "waiting_customer", "not_relevant"]);
const FOLLOW_UP_STAGES = new Set(["quote_sent", "waiting_customer"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isCareLead(row: Record<string, unknown>) {
  const metadata = metadataRecord(row.metadata);
  const segment = String(metadata.segment || "").toLowerCase();
  const requestType = String(metadata.request_type || "").toLowerCase();
  const nextAction = String(row.next_action || "").toLowerCase();
  return row.brand_id === "zeneco"
    && row.source_type === "website_lead"
    && (segment === "care" || requestType.startsWith("care-") || nextAction.includes("zen eco homes care"));
}

function nextActionFor(stage: string, followUpOn: string, note: string) {
  if (stage === "new") return "Ta første kontakt om Zen Eco Homes Care.";
  if (stage === "contacted") return "Behov er avklart. Forbered eller send riktig Care-tilbud.";
  if (stage === "quote_sent") return `Care-tilbud sendt. Følg opp ${followUpOn}.`;
  if (stage === "waiting_customer") return `Venter på kundens svar. Følg opp ${followUpOn}.`;
  return note ? `Care-henvendelsen avsluttet: ${note}` : "Care-henvendelsen er ikke aktuell.";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const id = clean(params.id, 80);
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Ugyldig Care-lead." }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const stage = clean(body.stage, 40).toLowerCase();
  const followUpOn = clean(body.followUpOn, 10);
  const note = clean(body.note, 500);

  if (!SALES_STAGES.has(stage)) {
    return NextResponse.json({ error: "Velg en gyldig Care-salgsstatus." }, { status: 400 });
  }
  if (followUpOn && !validDate(followUpOn)) {
    return NextResponse.json({ error: "Ugyldig oppfølgingsdato." }, { status: 400 });
  }
  if (FOLLOW_UP_STAGES.has(stage) && !followUpOn) {
    return NextResponse.json({ error: "Sett oppfølgingsdato når tilbud er sendt eller vi venter på kunden." }, { status: 400 });
  }
  if (stage === "not_relevant" && !note) {
    return NextResponse.json({ error: "Skriv kort hvorfor henvendelsen ikke er aktuell." }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("work_items")
    .select("id,status,next_action,metadata,brand_id,source_type")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 400 });
  }
  if (!existing || !isCareLead(existing as Record<string, unknown>)) {
    return NextResponse.json({ error: "Care-leadet ble ikke funnet." }, { status: 404 });
  }

  const existingMetadata = metadataRecord(existing.metadata);
  if (String(existingMetadata.care_contract_id || "").trim()) {
    return NextResponse.json({ error: "Care-avtalen er allerede aktivert. Bruk kundekortet for videre drift." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const metadata = {
    ...existingMetadata,
    care_sales_stage: stage,
    care_follow_up_on: followUpOn || null,
    care_sales_note: note || null,
    care_stage_updated_at: now,
    care_last_followup_at: stage === "new"
      ? existingMetadata.care_last_followup_at || null
      : now,
    care_quote_sent_at: stage === "quote_sent"
      ? existingMetadata.care_quote_sent_at || now
      : existingMetadata.care_quote_sent_at || null,
  };
  const status = stage === "not_relevant" ? "CANCELLED" : stage === "new" ? "TO_DO" : "IN_PROGRESS";

  const { data, error } = await supabase
    .from("work_items")
    .update({
      status,
      next_action: nextActionFor(stage, followUpOn, note),
      metadata,
      updated_at: now,
    })
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .eq("source_type", "website_lead")
    .select("id,status,next_action,metadata,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, lead: data });
}
