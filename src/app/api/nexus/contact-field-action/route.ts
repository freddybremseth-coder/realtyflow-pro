import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { generateCorrelationId, newRunId } from "@/lib/agentic/ids";
import type { AgentRun, AgentTraceStep } from "@/lib/agentic/schemas";
import {
  buildNexusActionProposals,
  normalizeCustomerPhone,
  type NexusGovernedActionType,
} from "@/lib/nexus-ai-governed-actions";
import {
  CustomerTimelineUpdateInputSchema,
  appendCustomerInteraction,
  buildCustomerTimelineInteraction,
} from "@/lib/customer-updates";
import { buildRevenueEventDedupeKey, insertRevenueEvent } from "@/lib/revenue/events";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { makeSupabaseAgentRunStore } from "@/services/agentic/adapters";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CONTACT_ID = /^[0-9a-f-]{36}$/i;
const PROPOSAL_ID = /^nexus_action_[a-f0-9]{24}$/;
const EMAIL = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

type ContactFieldActionType = Extract<NexusGovernedActionType, "update_customer_email" | "update_customer_phone">;
type ContactField = "email" | "phone";

function safeText(value: unknown, max = 8000) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeEmail(value: unknown) {
  const email = safeText(value, 320).toLowerCase();
  return EMAIL.test(email) ? email : null;
}

function expectedField(type: ContactFieldActionType): ContactField {
  return type === "update_customer_email" ? "email" : "phone";
}

function normalizedValue(field: ContactField, value: unknown) {
  return field === "email" ? normalizeEmail(value) : normalizeCustomerPhone(value);
}

function fieldLabel(field: ContactField) {
  return field === "email" ? "e-postadresse" : "telefonnummer";
}

function completed(run: AgentRun | null | undefined) {
  return Boolean(run?.status === "completed" && run?.outcome === "executed");
}

async function failRun(runStore: ReturnType<typeof makeSupabaseAgentRunStore>, runId: string, error: unknown) {
  await runStore.appendStep(runId, {
    id: `${runId}:error`,
    ts: new Date().toISOString(),
    kind: "error",
    label: "NEXUS_AI_CONTACT_FIELD_UPDATE_FAILED",
    outcome: "failed",
    outputSummary: error instanceof Error ? error.message : String(error),
  }).catch(() => undefined);
  await runStore.setStatus(runId, "failed", new Date().toISOString()).catch(() => undefined);
  await runStore.setOutcome(runId, "failed").catch(() => undefined);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const access = await getRequestAccessContext(request);
  if (!access) return NextResponse.json({ error: "Admin session required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const type = body?.type as ContactFieldActionType;
  const proposalId = safeText(body?.proposalId, 80);
  const contactId = safeText(body?.contactId, 80);
  const requestText = safeText(body?.requestText, 8000);
  const requestedField = safeText(body?.field, 20) as ContactField;
  const requestedValue = safeText(body?.fieldValue, 320);

  if (!(["update_customer_email", "update_customer_phone"] as const).includes(type)) {
    return NextResponse.json({ error: "Denne kontaktinfo-handlingen er ikke tillatt." }, { status: 400 });
  }
  if (!PROPOSAL_ID.test(proposalId) || !CONTACT_ID.test(contactId) || !requestText) {
    return NextResponse.json({ error: "Ugyldig eller ufullstendig handlingsforslag." }, { status: 400 });
  }

  const field = expectedField(type);
  if (requestedField !== field) {
    return NextResponse.json({ error: "Feltet stemmer ikke med handlingsforslaget." }, { status: 409 });
  }
  const value = normalizedValue(field, requestedValue);
  if (!value) {
    return NextResponse.json({ error: `Ugyldig ${fieldLabel(field)}.` }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Nexus-databasen er ikke tilgjengelig." }, { status: 503 });

  const contactResult = await supabase
    .from("contacts")
    .select("id,name,email,phone,brand_id,brand,pipeline_status,email_suppressed,do_not_contact,interactions")
    .eq("id", contactId)
    .maybeSingle();
  if (contactResult.error) return NextResponse.json({ error: contactResult.error.message }, { status: 500 });
  const contact = contactResult.data;
  if (!contact) return NextResponse.json({ error: "Kunden finnes ikke." }, { status: 404 });

  const verifiedProposal = buildNexusActionProposals({
    message: requestText,
    currentContact: contact,
    contacts: [contact],
  })[0];
  if (
    !verifiedProposal
    || verifiedProposal.id !== proposalId
    || verifiedProposal.type !== type
    || verifiedProposal.contactId !== contactId
    || verifiedProposal.endpoint !== "/api/nexus/contact-field-action"
    || verifiedProposal.field !== field
    || normalizedValue(field, verifiedProposal.fieldValue) !== value
  ) {
    return NextResponse.json({ error: "Kontaktinfo-forslaget stemmer ikke lenger med kunden eller instruksjonen." }, { status: 409 });
  }

  const currentValue = normalizedValue(field, contact[field]);
  const runStore = makeSupabaseAgentRunStore(supabase);
  const runKey = `nexus_ai_action:${proposalId}`;
  let run = await runStore.findByIdempotencyKey(runKey);

  if (currentValue === value) {
    if (run && !completed(run)) {
      await runStore.setStatus(run.id, "completed", new Date().toISOString()).catch(() => undefined);
      await runStore.setOutcome(run.id, "executed").catch(() => undefined);
    }
    return NextResponse.json({
      ok: true,
      duplicate: true,
      state: "completed",
      runId: run?.id || null,
      field,
      message: `${fieldLabel(field)} er allerede registrert med denne verdien på ${contact.name || contact.email || "kunden"}.`,
      navigation: { label: "Åpne kundekort", href: `/customers?contactId=${encodeURIComponent(contact.id)}` },
    });
  }

  const allContacts = await supabase.from("contacts").select("id,email,phone").limit(5000);
  if (allContacts.error) return NextResponse.json({ error: allContacts.error.message }, { status: 500 });
  const conflict = (allContacts.data || []).find((candidate: any) => {
    if (String(candidate.id) === String(contact.id)) return false;
    return normalizedValue(field, candidate[field]) === value;
  });
  if (conflict) {
    return NextResponse.json({
      error: `Denne ${fieldLabel(field)} finnes allerede på en annen CRM-kontakt. Nexus endrer ikke kunden automatisk når identiteten kan være tvetydig.`,
      code: "CONTACT_FIELD_CONFLICT",
    }, { status: 409 });
  }

  const correlationId = run?.correlationId || generateCorrelationId();
  const runId = run?.id || newRunId();
  const now = new Date().toISOString();
  if (!run) {
    const firstStep: AgentTraceStep = {
      id: `${runId}:0`,
      ts: now,
      kind: "event",
      label: "NEXUS_AI_CONTACT_FIELD_UPDATE_CONFIRMED",
      inputSummary: `Oppdater ${fieldLabel(field)} på ${contact.name || contact.email || "kunden"}`,
      data: { action_type: type, contact_id: contact.id, proposal_id: proposalId, field },
    };
    run = {
      id: runId,
      agentId: "nexus-ai",
      goal: `Oppdater ${fieldLabel(field)} på CRM-kunde`,
      status: "running",
      correlationId,
      idempotencyKey: runKey,
      startedAt: now,
      steps: [firstStep],
    } satisfies AgentRun;
    await runStore.save(run);
  }

  try {
    const parsedUpdate = CustomerTimelineUpdateInputSchema.safeParse({
      action: "ADD_UPDATE",
      update: {
        updateType: "general_note",
        occurredAt: now,
        title: "Nexus AI: kontaktinfo oppdatert",
        details: `${fieldLabel(field)} ble oppdatert via en eksplisitt Nexus AI-handling.`,
        propertyReference: null,
        outcome: null,
        nextAction: null,
        nextFollowup: null,
        direction: "internal",
      },
    });
    if (!parsedUpdate.success) throw new Error("Kontaktinfo-oppdateringen besto ikke CRM-valideringen.");

    const interaction = buildCustomerTimelineInteraction({ update: parsedUpdate.data.update, actorEmail: access.email });
    const nexusInteraction = {
      ...interaction,
      metadata: {
        ...(interaction.metadata || {}),
        source: "nexus-ai-chat",
        nexus_action_id: proposalId,
        nexus_run_id: runId,
        no_customer_contact: true,
        contact_field_updated: field,
      },
    };
    const interactions = appendCustomerInteraction(contact.interactions, nexusInteraction);

    const updateResult = await supabase
      .from("contacts")
      .update({ [field]: value, interactions, updated_at: now })
      .eq("id", contact.id)
      .select("id,email,phone,brand_id,brand")
      .single();
    if (updateResult.error) throw new Error(updateResult.error.message);

    const eventResult = await insertRevenueEvent(supabase, {
      eventType: "contact_updated",
      title: `Nexus AI oppdaterte ${fieldLabel(field)} på CRM-kunde`,
      contactId: String(contact.id),
      brandId: contact.brand_id || contact.brand || null,
      sourceSystem: "nexus_ai_chat",
      sourceType: "governed_action",
      sourceId: proposalId,
      actorType: "human",
      actorId: access.email,
      dedupeKey: buildRevenueEventDedupeKey(["nexus-ai-contact-field", proposalId, field]),
      metadata: {
        run_id: runId,
        correlation_id: correlationId,
        field,
        previous_value_present: Boolean(currentValue),
        no_customer_contact: true,
        customer_message_sent: false,
      },
      createdBy: access.email,
    });
    if (!eventResult.ok && !eventResult.duplicate) throw new Error(eventResult.error || "Audit-event kunne ikke lagres.");

    await runStore.appendStep(runId, {
      id: `${runId}:1`,
      ts: new Date().toISOString(),
      kind: "tool_result",
      label: "NEXUS_AI_CONTACT_FIELD_UPDATED",
      tool: "crm_customer_update",
      outcome: "executed",
      outputSummary: `${field} updated`,
      data: { contact_id: contact.id, field, no_customer_contact: true },
    });
    await runStore.setStatus(runId, "completed", new Date().toISOString());
    await runStore.setOutcome(runId, "executed");

    return NextResponse.json({
      ok: true,
      state: "completed",
      runId,
      field,
      value,
      message: `${fieldLabel(field)} på ${contact.name || contact.email || "kunden"} er oppdatert til ${value}. Ingen melding er sendt, og pipeline er uendret.`,
      navigation: { label: "Åpne kundekort", href: `/customers?contactId=${encodeURIComponent(contact.id)}` },
    });
  } catch (error) {
    await failRun(runStore, runId, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kontaktinfo kunne ikke oppdateres." }, { status: 500 });
  }
}
