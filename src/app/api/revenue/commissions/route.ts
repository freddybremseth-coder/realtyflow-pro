import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildCommissionCase,
  buildCommissionCollection,
} from "@/lib/revenue/commissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WON_STATUSES = ["WON", "VUNNET", "SOLGT", "SOLD", "CLOSED_WON", "CLOSED", "COMPLETED", "CUSTOMER", "KUNDE", "VIP"];
const BRAND_ALLOWLIST = new Set(["zeneco", "soleada", "pinosoecolife"]);
const ACTIONS = new Set([
  "set_terms",
  "mark_invoice_prepared",
  "mark_invoice_sent",
  "log_payment_followup",
  "mark_paid",
  "schedule_followup",
]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeText(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

function nextFollowupIso(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

function dueDateIso(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function missingColumnFromError(message = "") {
  const match = message.match(/'([^']+)' column|column "([^"]+)"|Could not find the '([^']+)' column/i);
  return match?.[1] || match?.[2] || match?.[3] || "";
}

async function updateWithFallbacks(supabase: ReturnType<typeof getSupabase>, contactId: string, rawUpdates: Record<string, unknown>) {
  if (!supabase) return { data: null, error: { message: "Supabase not configured" }, removedColumns: [] as string[] };
  let updates = { ...rawUpdates };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.from("contacts").update(updates).eq("id", contactId).select("*").single();
    if (!error) return { data, error: null, removedColumns };
    const missingColumn = missingColumnFromError(error.message || "");
    if (missingColumn && Object.prototype.hasOwnProperty.call(updates, missingColumn)) {
      delete updates[missingColumn];
      removedColumns.push(missingColumn);
      continue;
    }
    return { data: null, error, removedColumns };
  }

  return { data: null, error: { message: "Kunne ikke oppdatere provisjonsdata etter schema-fallbacks" }, removedColumns };
}

function internalInteraction(action: string, content: string, metadata: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: "commission",
    action,
    content,
    date: now,
    internal: true,
    metadata: {
      action,
      source: "commission-collection-workspace",
      customer_contact_sent: false,
      ...metadata,
    },
  };
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { collection: null });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", collection: null }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const requestedBrand = safeText(searchParams.get("brand"), 40).toLowerCase();
  const brand = BRAND_ALLOWLIST.has(requestedBrand) ? requestedBrand : "";

  let query = supabase
    .from("contacts")
    .select("*")
    .in("pipeline_status", WON_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (brand) query = query.or(`brand_id.eq.${brand},brand.eq.${brand}`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message, collection: null }, { status: 500 });

  return NextResponse.json({ collection: buildCommissionCollection(data || []) });
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const contactId = safeText(body.contactId, 120);
  const action = safeText(body.action, 80);
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Invalid commission action" }, { status: 400 });

  const { data: contact, error: contactError } = await supabase.from("contacts").select("*").eq("id", contactId).single();
  if (contactError || !contact) return NextResponse.json({ error: contactError?.message || "Contact not found" }, { status: 404 });

  const commissionCase = buildCommissionCase(contact);
  if (!commissionCase) return NextResponse.json({ error: "Contact is not a won customer" }, { status: 409 });

  const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let interaction: ReturnType<typeof internalInteraction> | null = null;

  if (action === "set_terms") {
    const commissionAmount = numberValue(body.commissionAmount);
    const commissionPercent = numberValue(body.commissionPercent);
    const hasAmount = commissionAmount > 0 && commissionAmount <= 100_000_000;
    const hasPercent = commissionPercent > 0 && commissionPercent <= 100;
    if (!hasAmount && !hasPercent) {
      return NextResponse.json({ error: "Registrer et gyldig provisjonsbeløp eller en sats mellom 0 og 100" }, { status: 400 });
    }
    if (hasAmount) updates.commission_amount = commissionAmount;
    if (hasPercent) updates.commission_percent = commissionPercent;
    interaction = internalInteraction(
      "commission_terms_updated",
      hasAmount && hasPercent
        ? `Provisjonsgrunnlag registrert internt: beløp og sats.`
        : hasAmount
          ? `Provisjonsbeløp registrert internt.`
          : `Provisjonssats registrert internt.`,
      { commission_amount: hasAmount ? commissionAmount : null, commission_percent: hasPercent ? commissionPercent : null },
    );
  }

  if (action === "mark_invoice_prepared") {
    if (!commissionCase.commissionConfirmed) return NextResponse.json({ error: "Provisjonsgrunnlaget må bekreftes før faktura klargjøres" }, { status: 409 });
    if (commissionCase.status === "PAID") return NextResponse.json({ error: "Provisjonen er allerede registrert betalt" }, { status: 409 });
    const invoiceNumber = safeText(body.invoiceNumber, 80) || null;
    interaction = internalInteraction(
      "commission_invoice_prepared",
      "Fakturagrunnlaget er markert som klargjort internt.",
      { invoice_number: invoiceNumber, commission_amount: commissionCase.commissionAmount },
    );
  }

  if (action === "mark_invoice_sent") {
    if (!commissionCase.commissionConfirmed) return NextResponse.json({ error: "Provisjonsgrunnlaget må bekreftes før faktura registreres sendt" }, { status: 409 });
    if (commissionCase.status === "PAID") return NextResponse.json({ error: "Provisjonen er allerede registrert betalt" }, { status: 409 });
    const dueDays = Number(body.dueDays ?? 14);
    if (!Number.isInteger(dueDays) || dueDays < 1 || dueDays > 90) {
      return NextResponse.json({ error: "dueDays must be an integer between 1 and 90" }, { status: 400 });
    }
    const invoiceNumber = safeText(body.invoiceNumber, 80) || commissionCase.invoiceNumber || null;
    const dueDate = dueDateIso(dueDays);
    interaction = internalInteraction(
      "commission_invoice_sent",
      "Fakturaen er markert som sendt. Ingen melding ble sendt fra RealtyFlow.",
      { invoice_number: invoiceNumber, due_date: dueDate, due_days: dueDays, commission_amount: commissionCase.commissionAmount },
    );
    updates.next_followup = nextFollowupIso(Math.min(dueDays + 1, 90));
  }

  if (action === "log_payment_followup") {
    if (!["INVOICED", "OVERDUE"].includes(commissionCase.status)) {
      return NextResponse.json({ error: "Betalingsoppfølging kan bare logges for en sendt og ubetalt faktura" }, { status: 409 });
    }
    interaction = internalInteraction(
      "commission_payment_followup",
      "Manuell betalingsoppfølging er logget internt. Ingen melding ble sendt fra RealtyFlow.",
      { invoice_number: commissionCase.invoiceNumber, commission_amount: commissionCase.commissionAmount },
    );
    updates.next_followup = nextFollowupIso(7);
  }

  if (action === "mark_paid") {
    if (!commissionCase.commissionConfirmed) return NextResponse.json({ error: "Provisjonsgrunnlaget må være bekreftet før betaling registreres" }, { status: 409 });
    if (commissionCase.status === "PAID") return NextResponse.json({ error: "Provisjonen er allerede registrert betalt" }, { status: 409 });
    const requestedPaidAt = body.paidAt ? new Date(String(body.paidAt)) : new Date();
    if (Number.isNaN(requestedPaidAt.getTime()) || requestedPaidAt.getTime() > Date.now() + 86_400_000) {
      return NextResponse.json({ error: "paidAt must be a valid date that is not in the future" }, { status: 400 });
    }
    updates.commission_paid_date = requestedPaidAt.toISOString();
    interaction = internalInteraction(
      "commission_payment_received",
      "Provisjonsbetalingen er markert som mottatt internt.",
      { paid_at: requestedPaidAt.toISOString(), invoice_number: commissionCase.invoiceNumber, commission_amount: commissionCase.commissionAmount },
    );
  }

  if (action === "schedule_followup") {
    const days = Number(body.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return NextResponse.json({ error: "days must be an integer between 1 and 365" }, { status: 400 });
    }
    updates.next_followup = nextFollowupIso(days);
  }

  if (interaction) updates.interactions = [interaction, ...interactions];

  const { data: updated, error: updateError, removedColumns } = await updateWithFallbacks(supabase, contactId, updates);
  if (updateError) return NextResponse.json({ error: updateError.message, removedColumns }, { status: 500 });

  return NextResponse.json({
    ok: true,
    contact: updated,
    action,
    customerContactSent: false,
    removedColumns,
    warning: removedColumns.length ? `Databasen manglet feltene: ${removedColumns.join(", ")}` : null,
  });
}
