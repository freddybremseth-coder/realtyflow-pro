import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildClosingPackDeal,
  CLOSING_DOCUMENTS,
  CLOSING_DOCUMENT_STATUSES,
  CLOSING_RESPONSIBLE_ROLES,
  sortClosingPackDeals,
  summarizeClosingPacks,
  type ClosingDocumentStatus,
  type ClosingResponsibleRole,
} from "@/lib/revenue/closing-pack";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEAL_STATUSES = [
  "NEGOTIATION", "RESERVATION", "OFFER", "UNDER_CONTRACT",
  "WON", "VUNNET", "SOLGT", "SOLD", "CLOSED_WON", "CLOSED", "COMPLETED", "CUSTOMER", "KUNDE", "VIP",
];
const DOCUMENT_IDS = new Set(CLOSING_DOCUMENTS.map((document) => document.id));
const STATUS_IDS = new Set<ClosingDocumentStatus>(CLOSING_DOCUMENT_STATUSES);
const ROLE_IDS = new Set<ClosingResponsibleRole>(CLOSING_RESPONSIBLE_ROLES);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function clean(value: unknown, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function validDate(value: unknown) {
  const date = clean(value, 10);
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const time = new Date(`${date}T12:00:00Z`).getTime();
  return Number.isFinite(time) ? date : undefined;
}

function validHttpsUrl(value: unknown) {
  const text = clean(value, 2000);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { deals: [], summary: null });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", deals: [] }, { status: 500 });

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .in("pipeline_status", DEAL_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message, deals: [] }, { status: 500 });

  const deals = sortClosingPackDeals(
    (data || []).map((contact) => buildClosingPackDeal(contact)).filter(Boolean) as NonNullable<ReturnType<typeof buildClosingPackDeal>>[],
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: summarizeClosingPacks(deals),
    deals,
    definitions: CLOSING_DOCUMENTS,
    safety: {
      legalApprovalPerformed: false,
      automaticSending: false,
      automaticPipelineChanges: false,
      externalLinksOnly: true,
    },
  });
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 40).toUpperCase();
  const contactId = clean(body.contactId, 100);
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  if (!["UPDATE_DOCUMENT", "REVIEW_PACK"].includes(action)) {
    return NextResponse.json({ error: "Invalid closing pack action" }, { status: 400 });
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .single();
  if (contactError || !contact) return NextResponse.json({ error: contactError?.message || "Contact not found" }, { status: 404 });

  const deal = buildClosingPackDeal(contact);
  if (!deal) return NextResponse.json({ error: "Contact is not in negotiation or won stage" }, { status: 409 });

  const now = new Date().toISOString();
  const actor = clean(body.actor || "admin", 200);
  const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
  let event: Record<string, unknown>;

  if (action === "REVIEW_PACK") {
    const note = clean(body.note, 1000);
    event = {
      id: crypto.randomUUID(),
      type: "closing_pack",
      action: "closing_pack_reviewed",
      content: `Closing-pakken ble gjennomgått internt (${deal.completeCount}/${deal.requiredCount} obligatoriske punkter komplette).`,
      date: now,
      internal: true,
      metadata: {
        action: "closing_pack_reviewed",
        source: "closing-pack-workspace",
        completion_percent: deal.completionPercent,
        critical_blockers: deal.criticalBlockers,
        note: note || null,
        reviewed_by: actor,
        legal_approval_performed: false,
        customer_contact_sent: false,
      },
    };
  } else {
    const documentId = clean(body.documentId, 100);
    const status = clean(body.status, 30).toUpperCase() as ClosingDocumentStatus;
    if (!DOCUMENT_IDS.has(documentId)) return NextResponse.json({ error: "Invalid documentId" }, { status: 400 });
    if (!STATUS_IDS.has(status)) return NextResponse.json({ error: "Invalid document status" }, { status: 400 });

    const current = deal.documents.find((document) => document.id === documentId);
    if (!current) return NextResponse.json({ error: "Document definition not found" }, { status: 404 });

    const requestedRole = body.responsibleRole === undefined
      ? current.responsibleRole
      : clean(body.responsibleRole, 30).toUpperCase() as ClosingResponsibleRole;
    if (!ROLE_IDS.has(requestedRole)) return NextResponse.json({ error: "Invalid responsible role" }, { status: 400 });

    const dueDate = body.dueDate === undefined ? current.dueDate : validDate(body.dueDate);
    if (dueDate === undefined) return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
    const documentUrl = body.documentUrl === undefined ? current.documentUrl : validHttpsUrl(body.documentUrl);
    if (documentUrl === undefined) return NextResponse.json({ error: "Document URL must use HTTPS" }, { status: 400 });
    const note = body.note === undefined ? current.note : clean(body.note, 1000) || null;

    event = {
      id: crypto.randomUUID(),
      type: "closing_pack",
      action: "closing_document_updated",
      content: `${current.label}: ${status.toLowerCase().replaceAll("_", " ")}.`,
      date: now,
      internal: true,
      metadata: {
        action: "closing_document_updated",
        source: "closing-pack-workspace",
        document_id: documentId,
        status,
        responsible_role: requestedRole,
        due_date: dueDate,
        document_url: documentUrl,
        note,
        updated_by: actor,
        legal_approval_performed: false,
        customer_contact_sent: false,
      },
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("contacts")
    .update({ interactions: [event, ...interactions], updated_at: now })
    .eq("id", contactId)
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    deal: buildClosingPackDeal(updated),
    legalApprovalPerformed: false,
    customerContactSent: false,
  });
}
