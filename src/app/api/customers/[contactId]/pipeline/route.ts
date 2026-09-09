import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAccessContext } from "@/lib/api-admin";
import { hasPermission } from "@/lib/access-control";
import { getContactsSupabase } from "@/app/api/contacts/supabase-client";
import {
  CUSTOMER_PIPELINE_STATUSES,
  appendCustomerInteraction,
  normalizeCustomerPipelineStatus,
} from "@/lib/customer-updates";
import { recordPipelineTransition } from "@/lib/revenue/pipeline-transition";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ContactIdSchema = z.string().uuid();
const RequestSchema = z.object({
  pipelineStatus: z.preprocess(normalizeCustomerPipelineStatus, z.enum(CUSTOMER_PIPELINE_STATUSES)),
  note: z.preprocess((value) => {
    const text = String(value ?? "").trim();
    return text || null;
  }, z.string().max(1500).nullable()),
}).strict();

const OPEN_WORK_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];
const SALES_WORK_SOURCES = ["crm", "portal", "ai_agent", "lead_intelligence"];
const TERMINAL_SUPPRESSION_REASONS = new Set([
  "manual_pipeline_lost",
  "customer_no_longer_buying",
  "purchase_reported_by_customer",
  "terminal_outcome_pending_review",
]);

function movementPatch(contact: Record<string, any>, nextStatus: string, note: string | null) {
  const status = normalizeCustomerPipelineStatus(nextStatus);
  if (status === "WON") {
    return {
      pipeline_status: "WON",
      lost_reason: null,
      waiting_on: null,
      waiting_reason: null,
      waiting_until: null,
      next_followup: null,
      nurture_status: "stopped",
    };
  }

  if (status === "LOST") {
    return {
      pipeline_status: "LOST",
      lost_reason: note || contact.lost_reason || "Manuelt markert tapt",
      waiting_on: null,
      waiting_reason: null,
      waiting_until: null,
      next_followup: null,
      nurture_status: "stopped",
      email_suppressed: true,
      suppression_reason: contact.do_not_contact
        ? (contact.suppression_reason || "customer_unsubscribe_reply")
        : (contact.suppression_reason || "manual_pipeline_lost"),
    };
  }

  const patch: Record<string, unknown> = {
    pipeline_status: status,
    lost_reason: null,
  };

  if (status !== "ON_HOLD") {
    patch.waiting_on = null;
    patch.waiting_reason = null;
    patch.waiting_until = null;
  }

  const wasTerminal = ["WON", "LOST"].includes(normalizeCustomerPipelineStatus(contact.pipeline_status));
  const terminalSuppression = TERMINAL_SUPPRESSION_REASONS.has(String(contact.suppression_reason || ""));
  if (wasTerminal && !contact.do_not_contact && terminalSuppression) {
    patch.email_suppressed = false;
    patch.suppression_reason = null;
    patch.nurture_status = "paused";
  }

  if (contact.do_not_contact || String(contact.suppression_reason || "") === "customer_unsubscribe_reply") {
    patch.email_suppressed = true;
    patch.nurture_status = "stopped";
  }

  return patch;
}

async function closeOpenSalesWorkItems(supabase: any, contactId: string, status: "WON" | "LOST", now: string) {
  const result = await supabase
    .from("work_items")
    .update({
      status: "CANCELLED",
      next_action: status === "WON"
        ? "Automatisk lukket: kunden er vunnet"
        : "Automatisk lukket: kunden er tapt/avsluttet",
      updated_at: now,
    })
    .in("status", OPEN_WORK_STATUSES)
    .in("source_type", SALES_WORK_SOURCES)
    .contains("metadata", { contact_id: contactId });
  return result.error ? `Kunne ikke rydde gamle salgsoppgaver: ${result.error.message}` : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { contactId: string } },
) {
  const context = await getRequestAccessContext(request);
  if (!context) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  if (context.role !== "OWNER" && !hasPermission(context.role, "customers.write")) {
    return NextResponse.json({ ok: false, error: "Access permission required", requiredPermission: "customers.write" }, { status: 403 });
  }

  const parsedContactId = ContactIdSchema.safeParse(params.contactId);
  if (!parsedContactId.success) return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Ugyldig pipeline-endring" }, { status: 400 });
  }

  const supabase = getContactsSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "Contacts database is not configured" }, { status: 500 });

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", parsedContactId.data)
    .single();
  if (contactError || !contact) {
    return NextResponse.json({ ok: false, error: contactError?.message || "Customer not found" }, { status: 404 });
  }

  const previousStatus = normalizeCustomerPipelineStatus(contact.pipeline_status);
  const nextStatus = normalizeCustomerPipelineStatus(parsed.data.pipelineStatus);
  if (previousStatus === nextStatus) {
    return NextResponse.json({ ok: true, contact, pipelineTransition: null, message: "Kunden står allerede i dette pipeline-steget." });
  }

  const now = new Date().toISOString();
  const note = parsed.data.note;
  const interaction = {
    id: crypto.randomUUID(),
    type: "pipeline_moved",
    date: now,
    direction: "internal",
    content: [
      `Pipeline flyttet manuelt: ${previousStatus} → ${nextStatus}`,
      note ? `Notat: ${note}` : null,
    ].filter(Boolean).join("\n"),
    metadata: {
      source: "customer-360",
      update_type: "pipeline_movement",
      previous_status: previousStatus,
      next_status: nextStatus,
      note,
      actor_email: context.email.toLowerCase(),
      no_customer_contact: true,
    },
  };

  const patch = {
    ...movementPatch(contact, nextStatus, note),
    interactions: appendCustomerInteraction(contact.interactions, interaction),
    updated_at: now,
  };

  const { data: updated, error: updateError } = await supabase
    .from("contacts")
    .update(patch)
    .eq("id", parsedContactId.data)
    .select()
    .single();
  if (updateError || !updated) {
    return NextResponse.json({ ok: false, error: updateError?.message || "Kunne ikke flytte kunden i pipeline" }, { status: 500 });
  }

  const brandId = String(updated.brand_id || updated.brand || contact.brand_id || contact.brand || "").trim();
  await recordPipelineTransition(supabase, {
    contactId: parsedContactId.data,
    brandId,
    previousStatus,
    nextStatus,
    occurredAt: now,
    actorType: "human",
    actorId: context.email,
    createdBy: "api/customers/[contactId]/pipeline",
  }).catch(() => undefined);

  let warning: string | null = null;
  if (nextStatus === "WON" || nextStatus === "LOST") {
    warning = await closeOpenSalesWorkItems(supabase, parsedContactId.data, nextStatus, now);
  }

  return NextResponse.json({
    ok: true,
    contact: updated,
    pipelineTransition: { previousStatus, nextStatus },
    warning,
    noCustomerContact: true,
  });
}
