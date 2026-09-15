import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { generateCorrelationId, newRunId, operationIdempotencyKey } from "@/lib/agentic/ids";
import { ToolRegistry, type ToolContext } from "@/lib/agentic/tool-registry";
import type { AgentRun, AgentTraceStep } from "@/lib/agentic/schemas";
import { buildNexusActionProposals, isAllowedNexusActionType, type NexusGovernedActionType } from "@/lib/nexus-ai-governed-actions";
import {
  CustomerTimelineUpdateInputSchema,
  appendCustomerInteraction,
  buildCustomerTimelineInteraction,
} from "@/lib/customer-updates";
import { buildRevenueEventDedupeKey, insertRevenueEvent, type RevenueEventType } from "@/lib/revenue/events";
import { askNexusAI, isNexusAIConfigured } from "@/services/ai/nexus-ai-client";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { buildCreateDraftTool } from "@/services/tools/communications/create-draft";
import { buildRequestApprovalTool } from "@/services/tools/crm/request-approval";
import { makeApprovalStore, makeDraftStore, makeSupabaseAgentRunStore } from "@/services/agentic/adapters";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONTACT_ID = /^[0-9a-f-]{36}$/i;
const PROPOSAL_ID = /^nexus_action_[a-f0-9]{24}$/;

function safeText(value: unknown, max = 8000) {
  return String(value ?? "").trim().slice(0, max);
}

function missingColumnFromError(message = "") {
  const match = message.match(/'([^']+)' column|column "([^"]+)"|Could not find the '([^']+)' column/i);
  return match?.[1] || match?.[2] || match?.[3] || "";
}

function formatFollowupDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

function contactName(contact: any) {
  return String(contact.name || contact.email || "kunden");
}

function actionLabel(type: NexusGovernedActionType, contact: any) {
  const name = contactName(contact);
  if (type === "schedule_customer_followup") return `Planlegg CRM-oppfølging med ${name}`;
  if (type === "add_customer_note") return `Legg inn internt CRM-notat på ${name}`;
  if (type === "create_customer_task") return `Opprett intern kundeoppgave for ${name}`;
  return `Forbered kunde-e-post til ${name}`;
}

async function persistFollowup(params: {
  supabase: any;
  contactId: string;
  interactions: unknown[];
  scheduledFor: string;
  updatedAt: string;
}) {
  const attempts = ["next_followup", "next_follow_up", "follow_up_date"] as const;
  let lastError: any = null;

  for (const field of attempts) {
    const payload: Record<string, unknown> = {
      interactions: params.interactions,
      updated_at: params.updatedAt,
      [field]: params.scheduledFor,
    };
    const { data, error } = await params.supabase
      .from("contacts")
      .update(payload)
      .eq("id", params.contactId)
      .select("*")
      .single();
    if (!error) return { data, field, error: null };
    lastError = error;
    const missing = missingColumnFromError(error.message || "");
    if (missing !== field) break;
  }

  return { data: null, field: null, error: lastError || { message: "Kunne ikke lagre oppfølging." } };
}

async function persistInteractions(params: {
  supabase: any;
  contactId: string;
  interactions: unknown[];
  updatedAt: string;
}) {
  return params.supabase
    .from("contacts")
    .update({ interactions: params.interactions, updated_at: params.updatedAt })
    .eq("id", params.contactId)
    .select("id")
    .single();
}

async function recordGovernedActionEvent(params: {
  supabase: any;
  eventType: RevenueEventType;
  title: string;
  contact: any;
  proposalId: string;
  runId: string;
  correlationId: string;
  actorEmail: string;
  metadata?: Record<string, unknown>;
}) {
  const result = await insertRevenueEvent(params.supabase, {
    eventType: params.eventType,
    title: params.title,
    contactId: String(params.contact.id),
    brandId: params.contact.brand_id || params.contact.brand || null,
    sourceSystem: "nexus_ai_chat",
    sourceType: "governed_action",
    sourceId: params.proposalId,
    actorType: "human",
    actorId: params.actorEmail,
    dedupeKey: buildRevenueEventDedupeKey(["nexus-ai-action", params.proposalId, params.eventType]),
    metadata: {
      run_id: params.runId,
      correlation_id: params.correlationId,
      action_source: "nexus_ai_chat",
      no_customer_contact: true,
      ...(params.metadata || {}),
    },
    createdBy: params.actorEmail,
  });
  if (!result.ok && !result.duplicate) {
    throw new Error(`Nexus audit-event kunne ikke lagres: ${result.error || "ukjent feil"}`);
  }
}

async function finishRun(runStore: ReturnType<typeof makeSupabaseAgentRunStore>, runId: string) {
  const finishedAt = new Date().toISOString();
  await runStore.setStatus(runId, "completed", finishedAt);
  await runStore.setOutcome(runId, "executed");
}

async function failRun(runStore: ReturnType<typeof makeSupabaseAgentRunStore>, runId: string, error: unknown) {
  await runStore.appendStep(runId, {
    id: `${runId}:error`,
    ts: new Date().toISOString(),
    kind: "error",
    label: "NEXUS_AI_ACTION_FAILED",
    outcome: "failed",
    outputSummary: error instanceof Error ? error.message : String(error),
  }).catch(() => undefined);
  await runStore.setStatus(runId, "failed", new Date().toISOString()).catch(() => undefined);
  await runStore.setOutcome(runId, "failed").catch(() => undefined);
}

function draftSubject(contact: any) {
  const interest = safeText(contact.property_interest || contact.preferred_location, 120);
  return interest ? `Oppfølging – ${interest}` : "Oppfølging om bolig i Spania";
}

async function generateCustomerDraft(contact: any, requestText: string) {
  const context = {
    name: contact.name || null,
    brand: contact.brand_id || contact.brand || null,
    pipeline_status: contact.pipeline_status || null,
    property_interest: contact.property_interest || null,
    preferred_location: contact.preferred_location || null,
    nurture_status: contact.nurture_status || null,
    last_contact: contact.last_contact || null,
    last_inbound_reply_at: contact.last_inbound_reply_at || null,
    next_followup: contact.next_followup || null,
    waiting_on: contact.waiting_on || null,
    waiting_reason: contact.waiting_reason || null,
    notes: safeText(contact.notes, 4000) || null,
    recent_interactions: Array.isArray(contact.interactions) ? contact.interactions.slice(-8) : contact.interactions || null,
  };

  const prompt = `BRUKERENS INSTRUKSJON:\n${requestText}\n\nKUNDEKONTEKST FRA CRM:\n${JSON.stringify(context, null, 2)}`;
  const systemPrompt = `Du skriver et profesjonelt e-postutkast på norsk for en eksisterende boligkunde i RealtyFlow. Skriv KUN selve e-postteksten, uten emnefelt, markdown, analyse eller forklaring.\n\nRegler:\n- Bruk bare fakta som finnes i CRM-konteksten eller brukerens instruksjon. Ikke finn på priser, tilgjengelighet, avtaler, visninger eller kundepreferanser.\n- Vær personlig, varm og konkret, men ikke påtrengende.\n- Dersom viktig informasjon mangler, still ett eller noen få naturlige spørsmål i e-posten i stedet for å gjette.\n- Ikke påstå at noe allerede er sendt, bestilt, reservert eller avtalt.\n- Ingen juridiske eller økonomiske løfter.\n- Avslutt naturlig uten å finne på navn/tittel som ikke er gitt.\n- Dette er kun et utkast som skal gjennom menneskelig Approval Center før eventuell sending.`;

  const ai = await askNexusAI(prompt, { systemPrompt, maxTokens: 1000 });
  const body = ai.text.trim().replace(/^```(?:text|markdown)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!body) throw new Error("Nexus AI returnerte et tomt e-postutkast.");
  return { subject: draftSubject(contact), body, provider: ai.provider, model: ai.model };
}

function completedRun(run: AgentRun | null | undefined) {
  return Boolean(run?.status === "completed" && run?.outcome === "executed");
}

function duplicatePayload(type: NexusGovernedActionType, contact: any, proposal: { scheduledFor?: string }, runId: string | null, workItemId?: string | null) {
  if (type === "schedule_customer_followup") {
    return {
      ok: true,
      duplicate: true,
      state: "completed",
      runId,
      scheduledFor: proposal.scheduledFor,
      message: `Oppfølgingen med ${contactName(contact)} er allerede planlagt til ${formatFollowupDate(proposal.scheduledFor!)}. Ingen melding er sendt.`,
      navigation: { label: "Åpne kundekort", href: `/customers/${encodeURIComponent(contact.id)}` },
    };
  }
  if (type === "add_customer_note") {
    return {
      ok: true,
      duplicate: true,
      state: "completed",
      runId,
      message: `Det interne CRM-notatet på ${contactName(contact)} er allerede lagret. Ingen melding er sendt.`,
      navigation: { label: "Åpne kundekort", href: `/customers/${encodeURIComponent(contact.id)}` },
    };
  }
  return {
    ok: true,
    duplicate: true,
    state: "completed",
    runId,
    workItemId: workItemId || null,
    scheduledFor: proposal.scheduledFor || null,
    message: `Den interne oppgaven for ${contactName(contact)} finnes allerede. Ingen melding er sendt.`,
    navigation: { label: "Åpne dagens arbeid", href: "/today" },
  };
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const access = await getRequestAccessContext(request);
  if (!access) return NextResponse.json({ error: "Admin session required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const type = body?.type;
  const proposalId = safeText(body?.proposalId, 80);
  const contactId = safeText(body?.contactId, 80);
  const requestText = safeText(body?.requestText, 8000);
  const requestedScheduledFor = safeText(body?.scheduledFor, 80);

  if (!isAllowedNexusActionType(type)) {
    return NextResponse.json({ error: "Denne Nexus-handlingen er ikke tillatt." }, { status: 400 });
  }
  if (!PROPOSAL_ID.test(proposalId) || !CONTACT_ID.test(contactId) || !requestText) {
    return NextResponse.json({ error: "Ugyldig eller ufullstendig handlingsforslag." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Nexus-databasen er ikke tilgjengelig." }, { status: 503 });

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,name,email,phone,brand_id,brand,pipeline_status,nurture_status,property_interest,preferred_location,last_contact,last_inbound_reply_at,next_followup,waiting_on,waiting_reason,notes,interactions,email_suppressed,do_not_contact")
    .eq("id", contactId)
    .maybeSingle();

  if (contactError) return NextResponse.json({ error: `Kunden kunne ikke leses: ${contactError.message}` }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Kunden finnes ikke." }, { status: 404 });

  const contactBlocked = Boolean(contact.email_suppressed || contact.do_not_contact);
  if (contactBlocked && type !== "add_customer_note") {
    return NextResponse.json({ error: "Kunden er sperret for aktiv kontakt. Nexus kan fortsatt lagre et internt CRM-notat, men oppretter ikke oppfølging, oppgave eller utsending." }, { status: 409 });
  }
  if (type === "prepare_customer_email" && !contact.email) {
    return NextResponse.json({ error: "Kunden har ingen e-postadresse i CRM." }, { status: 409 });
  }
  if (["schedule_customer_followup", "create_customer_task"].includes(type)
    && ["WON", "LOST"].includes(String(contact.pipeline_status || "").toUpperCase())) {
    return NextResponse.json({ error: "Kunden er avsluttet i pipeline. Nexus oppretter ikke ny aktiv salgsoppfølging automatisk." }, { status: 409 });
  }

  const verifiedProposal = buildNexusActionProposals({
    message: requestText,
    currentContact: contact,
    contacts: [contact],
  })[0];
  if (
    !verifiedProposal
    || verifiedProposal.id !== proposalId
    || verifiedProposal.contactId !== contactId
    || verifiedProposal.type !== type
  ) {
    return NextResponse.json({ error: "Handlingsforslaget stemmer ikke lenger med kunde eller instruksjon." }, { status: 409 });
  }
  if (["schedule_customer_followup", "create_customer_task"].includes(type)
    && (verifiedProposal.scheduledFor || "") !== requestedScheduledFor) {
    return NextResponse.json({ error: "Datoen stemmer ikke lenger med handlingsforslaget." }, { status: 409 });
  }

  const runStore = makeSupabaseAgentRunStore(supabase);
  const runKey = `nexus_ai_action:${proposalId}`;
  let run = await runStore.findByIdempotencyKey(runKey);

  const interactionAction = type === "schedule_customer_followup" || type === "add_customer_note";
  const existingInteraction = interactionAction && Array.isArray(contact.interactions)
    ? contact.interactions.find((item: any) => item?.metadata?.nexus_action_id === proposalId) || null
    : null;

  let existingTask: { id?: string | null; status?: string | null } | null = null;
  if (type === "create_customer_task") {
    const existingTaskResult = await supabase
      .from("work_items")
      .select("id,status")
      .eq("source_type", "crm")
      .eq("source_id", `nexus-ai-action:${proposalId}`)
      .limit(1)
      .maybeSingle();
    if (existingTaskResult.error) return NextResponse.json({ error: existingTaskResult.error.message }, { status: 500 });
    existingTask = existingTaskResult.data || null;
  }

  if (completedRun(run) && (interactionAction || type === "create_customer_task")) {
    return NextResponse.json(duplicatePayload(type, contact, verifiedProposal, run?.id || null, existingTask?.id || null));
  }

  if (type === "prepare_customer_email" && run) {
    const { data: existingApproval } = await supabase
      .from("agentic_approvals")
      .select("id,draft_id,status")
      .eq("run_id", run.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingApproval) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        state: existingApproval.status === "pending" ? "waiting_approval" : existingApproval.status,
        draftId: existingApproval.draft_id || null,
        approvalId: existingApproval.id,
        message: "Dette utkastet finnes allerede. Jeg åpner samme godkjenningsløp i stedet for å lage et duplikat.",
        navigation: { label: "Åpne Approval Center", href: "/approvals" },
      });
    }
  }

  const correlationId = run?.correlationId || generateCorrelationId();
  const runId = run?.id || newRunId();
  const now = new Date().toISOString();
  if (!run) {
    const firstStep: AgentTraceStep = {
      id: `${runId}:0`,
      ts: now,
      kind: "event",
      label: "NEXUS_AI_ACTION_CONFIRMED",
      inputSummary: actionLabel(type, contact),
      data: { action_type: type, contact_id: contact.id, proposal_id: proposalId },
    };
    run = {
      id: runId,
      agentId: "nexus-ai",
      goal: actionLabel(type, contact),
      status: "running",
      correlationId,
      idempotencyKey: runKey,
      startedAt: now,
      steps: [firstStep],
    } satisfies AgentRun;
    await runStore.save(run);
  }

  const recoverExistingArtifact = Boolean(existingInteraction || existingTask);
  if (recoverExistingArtifact && interactionAction || (recoverExistingArtifact && type === "create_customer_task")) {
    try {
      const eventType: RevenueEventType = type === "schedule_customer_followup"
        ? "followup_scheduled"
        : type === "add_customer_note"
          ? "note"
          : "work_item_created";
      const title = type === "schedule_customer_followup"
        ? `Nexus AI planla oppfølging med ${contactName(contact)}`
        : type === "add_customer_note"
          ? `Nexus AI lagret internt CRM-notat på ${contactName(contact)}`
          : `Nexus AI opprettet intern oppgave for ${contactName(contact)}`;
      await recordGovernedActionEvent({
        supabase,
        eventType,
        title,
        contact,
        proposalId,
        runId,
        correlationId,
        actorEmail: access.email,
        metadata: {
          receipt_recovered: true,
          ...(type === "schedule_customer_followup" ? { scheduled_for: verifiedProposal.scheduledFor || null } : {}),
          ...(type === "add_customer_note" ? { internal_note: true } : {}),
          ...(type === "create_customer_task" ? { work_item_id: existingTask?.id || null, due_at: verifiedProposal.scheduledFor || null } : {}),
        },
      });
      const recoveryStepId = `${runId}:receipt-recovery`;
      if (!run.steps?.some((step) => step.id === recoveryStepId)) {
        await runStore.appendStep(runId, {
          id: recoveryStepId,
          ts: new Date().toISOString(),
          kind: "tool_result",
          label: "NEXUS_AI_ACTION_RECEIPT_RECOVERED",
          tool: type === "create_customer_task" ? "work_items" : "crm_customer_update",
          outcome: "executed",
          outputSummary: "existing internal artifact verified; receipt repaired",
          data: {
            contact_id: contact.id,
            proposal_id: proposalId,
            work_item_id: existingTask?.id || null,
            no_customer_contact: true,
          },
        });
      }
      await finishRun(runStore, runId);
      return NextResponse.json(duplicatePayload(type, contact, verifiedProposal, runId, existingTask?.id || null));
    } catch (error) {
      await failRun(runStore, runId, error);
      return NextResponse.json({ error: error instanceof Error ? error.message : "Nexus-handlingen feilet." }, { status: 500 });
    }
  }

  if (type === "schedule_customer_followup") {
    try {
      const scheduledFor = verifiedProposal.scheduledFor!;
      const parsedUpdate = CustomerTimelineUpdateInputSchema.safeParse({
        action: "ADD_UPDATE",
        update: {
          updateType: "general_note",
          occurredAt: now,
          title: "Nexus AI: oppfølging planlagt",
          details: `Oppfølging planlagt via Nexus AI. Instruksjon: ${requestText}`,
          propertyReference: null,
          outcome: null,
          nextAction: `Følg opp ${contactName(contact)}`,
          nextFollowup: scheduledFor,
          direction: "internal",
        },
      });
      if (!parsedUpdate.success) throw new Error("Oppfølgingsdataene besto ikke CRM-valideringen.");

      const interaction = buildCustomerTimelineInteraction({ update: parsedUpdate.data.update, actorEmail: access.email });
      const nexusInteraction = {
        ...interaction,
        metadata: {
          ...(interaction.metadata || {}),
          source: "nexus-ai-chat",
          nexus_action_id: proposalId,
          nexus_run_id: runId,
          no_customer_contact: true,
        },
      };
      const interactions = appendCustomerInteraction(contact.interactions, nexusInteraction);
      const persisted = await persistFollowup({ supabase, contactId: contact.id, interactions, scheduledFor, updatedAt: now });
      if (persisted.error) throw new Error(`CRM-oppfølging kunne ikke lagres: ${persisted.error.message || persisted.error}`);

      await recordGovernedActionEvent({
        supabase,
        eventType: "followup_scheduled",
        title: `Nexus AI planla oppfølging med ${contactName(contact)}`,
        contact,
        proposalId,
        runId,
        correlationId,
        actorEmail: access.email,
        metadata: { scheduled_for: scheduledFor, persisted_field: persisted.field },
      });
      await runStore.appendStep(runId, {
        id: `${runId}:1`,
        ts: new Date().toISOString(),
        kind: "tool_result",
        label: "NEXUS_AI_FOLLOWUP_SCHEDULED",
        tool: "crm_customer_update",
        outcome: "executed",
        outputSummary: `next follow-up ${scheduledFor}`,
        data: { contact_id: contact.id, scheduled_for: scheduledFor, persisted_field: persisted.field },
      });
      await finishRun(runStore, runId);

      return NextResponse.json({
        ok: true,
        state: "completed",
        runId,
        scheduledFor,
        message: `Oppfølging med ${contactName(contact)} er planlagt til ${formatFollowupDate(scheduledFor)}. Dette er kun lagret i CRM; ingen melding er sendt.`,
        navigation: { label: "Åpne kundekort", href: `/customers/${encodeURIComponent(contact.id)}` },
      });
    } catch (error) {
      await failRun(runStore, runId, error);
      return NextResponse.json({ error: error instanceof Error ? error.message : "Nexus-handlingen feilet." }, { status: 500 });
    }
  }

  if (type === "add_customer_note") {
    try {
      const parsedUpdate = CustomerTimelineUpdateInputSchema.safeParse({
        action: "ADD_UPDATE",
        update: {
          updateType: "general_note",
          occurredAt: now,
          title: "Nexus AI: internt notat",
          details: requestText,
          propertyReference: null,
          outcome: null,
          nextAction: null,
          nextFollowup: null,
          direction: "internal",
        },
      });
      if (!parsedUpdate.success) throw new Error("CRM-notatet besto ikke kundeoppdateringsvalideringen.");

      const interaction = buildCustomerTimelineInteraction({ update: parsedUpdate.data.update, actorEmail: access.email });
      const nexusInteraction = {
        ...interaction,
        metadata: {
          ...(interaction.metadata || {}),
          source: "nexus-ai-chat",
          nexus_action_id: proposalId,
          nexus_run_id: runId,
          no_customer_contact: true,
          internal_note: true,
        },
      };
      const interactions = appendCustomerInteraction(contact.interactions, nexusInteraction);
      const persisted = await persistInteractions({ supabase, contactId: contact.id, interactions, updatedAt: now });
      if (persisted.error) throw new Error(`CRM-notatet kunne ikke lagres: ${persisted.error.message}`);

      await recordGovernedActionEvent({
        supabase,
        eventType: "note",
        title: `Nexus AI lagret internt CRM-notat på ${contactName(contact)}`,
        contact,
        proposalId,
        runId,
        correlationId,
        actorEmail: access.email,
        metadata: { internal_note: true },
      });
      await runStore.appendStep(runId, {
        id: `${runId}:1`,
        ts: new Date().toISOString(),
        kind: "tool_result",
        label: "NEXUS_AI_CUSTOMER_NOTE_ADDED",
        tool: "crm_customer_update",
        outcome: "executed",
        outputSummary: "internal CRM note persisted",
        data: { contact_id: contact.id, internal_note: true, no_customer_contact: true },
      });
      await finishRun(runStore, runId);

      return NextResponse.json({
        ok: true,
        state: "completed",
        runId,
        message: `Det interne CRM-notatet på ${contactName(contact)} er lagret. Ingen melding er sendt.`,
        navigation: { label: "Åpne kundekort", href: `/customers/${encodeURIComponent(contact.id)}` },
      });
    } catch (error) {
      await failRun(runStore, runId, error);
      return NextResponse.json({ error: error instanceof Error ? error.message : "Nexus-handlingen feilet." }, { status: 500 });
    }
  }

  if (type === "create_customer_task") {
    try {
      const priority = ["VIEWING", "NEGOTIATION", "RESERVED"].includes(String(contact.pipeline_status || "").toUpperCase()) ? "HIGH" : "MEDIUM";
      const aiScore = priority === "HIGH" ? 85 : 72;
      const inserted = await supabase
        .from("work_items")
        .insert({
          title: `Nexus AI: ${contactName(contact)} · intern oppgave`,
          description: `Eksplisitt opprettet fra Nexus AI-chat. Instruksjon: ${requestText}`,
          status: "TO_DO",
          priority,
          due_date: verifiedProposal.scheduledFor ? verifiedProposal.scheduledFor.slice(0, 10) : null,
          brand_id: contact.brand_id || contact.brand || null,
          source_type: "crm",
          source_id: `nexus-ai-action:${proposalId}`,
          assigned_agent: "sales",
          next_action: requestText,
          ai_score: aiScore,
          metadata: {
            contact_id: contact.id,
            nexus_action_id: proposalId,
            nexus_run_id: runId,
            action_source: "nexus_ai_chat",
            no_customer_contact: true,
          },
        })
        .select("id")
        .single();
      if (inserted.error || !inserted.data?.id) throw new Error(inserted.error?.message || "Kundeoppgaven kunne ikke opprettes.");
      const workItemId = String(inserted.data.id);

      await recordGovernedActionEvent({
        supabase,
        eventType: "work_item_created",
        title: `Nexus AI opprettet intern oppgave for ${contactName(contact)}`,
        contact,
        proposalId,
        runId,
        correlationId,
        actorEmail: access.email,
        metadata: { work_item_id: workItemId, due_at: verifiedProposal.scheduledFor || null },
      });
      await runStore.appendStep(runId, {
        id: `${runId}:1`,
        ts: new Date().toISOString(),
        kind: "tool_result",
        label: "NEXUS_AI_CUSTOMER_TASK_CREATED",
        tool: "work_items",
        outcome: "executed",
        outputSummary: `work item ${workItemId}`,
        data: { contact_id: contact.id, work_item_id: workItemId, scheduled_for: verifiedProposal.scheduledFor || null },
      });
      await finishRun(runStore, runId);

      return NextResponse.json({
        ok: true,
        state: "completed",
        runId,
        workItemId,
        scheduledFor: verifiedProposal.scheduledFor || null,
        message: `Den interne oppgaven for ${contactName(contact)} er opprettet${verifiedProposal.scheduledFor ? ` med forfall ${formatFollowupDate(verifiedProposal.scheduledFor)}` : ""}. Ingen melding er sendt.`,
        navigation: { label: "Åpne dagens arbeid", href: "/today" },
      });
    } catch (error) {
      await failRun(runStore, runId, error);
      return NextResponse.json({ error: error instanceof Error ? error.message : "Nexus-handlingen feilet." }, { status: 500 });
    }
  }

  if (!isNexusAIConfigured()) return NextResponse.json({ error: "Nexus AI er ikke konfigurert." }, { status: 503 });

  try {
    const generated = await generateCustomerDraft(contact, requestText);
    const registry = new ToolRegistry();
    registry.register(buildCreateDraftTool(makeDraftStore(supabase)));
    registry.register(buildRequestApprovalTool(makeApprovalStore(supabase)));

    const toolContext: ToolContext = { role: access.role, userId: access.email, correlationId };
    const draftKey = operationIdempotencyKey(runId, "create_draft", proposalId);
    const draftResult = await registry.run<unknown, { id: string; created: boolean }>("create_draft", {
      correlationId,
      idempotencyKey: draftKey,
      contactRef: contact.email,
      brandId: contact.brand_id || contact.brand || "soleada",
      channel: "email",
      subject: generated.subject,
      body: generated.body,
      propertyIds: [],
    }, { ...toolContext, idempotencyKey: draftKey });

    if (!draftResult.ok || !draftResult.data) {
      throw new Error(draftResult.error || `Draft ble stoppet av policy (${draftResult.decision?.mode || "ukjent"}).`);
    }

    const draftId = draftResult.data.id;
    const approvalKey = operationIdempotencyKey(runId, "request_approval", `send:${draftId}`);
    const approvalResult = await registry.run<unknown, { id: string; created: boolean }>("request_approval", {
      correlationId,
      idempotencyKey: approvalKey,
      runId,
      title: `Send Nexus AI-oppfølging til ${contact.name || contact.email}`,
      gatedActionClass: "send_personal",
      subjectType: "message_draft",
      subjectRef: draftId,
      customerRef: contact.email,
      draftId,
      reason: "E-postutkast ble eksplisitt bestilt i Nexus AI-chatten og må godkjennes før sending.",
      risk: "medium",
      decisionMode: "human-required",
      confidence: 0.9,
    }, { ...toolContext, idempotencyKey: approvalKey });

    if (!approvalResult.ok || !approvalResult.data) {
      throw new Error(approvalResult.error || `Approval ble stoppet av policy (${approvalResult.decision?.mode || "ukjent"}).`);
    }

    await runStore.appendStep(runId, {
      id: `${runId}:1`,
      ts: new Date().toISOString(),
      kind: "tool_result",
      label: "NEXUS_AI_DRAFT_CREATED",
      tool: "create_draft",
      outcome: "executed",
      outputSummary: `draft ${draftId}`,
      model: generated.model,
      data: { draft_id: draftId, ai_provider: generated.provider, brand_id: contact.brand_id || contact.brand || "soleada" },
    });
    await runStore.appendStep(runId, {
      id: `${runId}:2`,
      ts: new Date().toISOString(),
      kind: "approval",
      label: "APPROVAL_CREATED",
      tool: "request_approval",
      outcome: "recommended",
      decisionMode: "human-required",
      risk: "medium",
      outputSummary: `approval ${approvalResult.data.id}`,
      data: { approval_id: approvalResult.data.id, draft_id: draftId },
    });
    await runStore.setStatus(runId, "waiting_approval");
    await runStore.setOutcome(runId, "recommended");

    await recordGovernedActionEvent({
      supabase,
      eventType: "draft_created",
      title: `Nexus AI opprettet e-postutkast til ${contactName(contact)}`,
      contact,
      proposalId,
      runId,
      correlationId,
      actorEmail: access.email,
      metadata: {
        agentic_outcome: "executed",
        draft_id: draftId,
        approval_id: approvalResult.data.id,
        customer_message_sent: false,
      },
    });

    return NextResponse.json({
      ok: true,
      state: "waiting_approval",
      draftId,
      approvalId: approvalResult.data.id,
      runId,
      subject: generated.subject,
      preview: generated.body.slice(0, 500),
      message: "Utkastet er opprettet og ligger i Approval Center. Ingenting er sendt ennå.",
      navigation: { label: "Åpne Approval Center", href: "/approvals" },
    });
  } catch (error) {
    await failRun(runStore, runId, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nexus-handlingen feilet." }, { status: 500 });
  }
}
