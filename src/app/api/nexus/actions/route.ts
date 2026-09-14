import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { generateCorrelationId, newRunId, operationIdempotencyKey } from "@/lib/agentic/ids";
import { ToolRegistry, type ToolContext } from "@/lib/agentic/tool-registry";
import type { AgentRun, AgentTraceStep } from "@/lib/agentic/schemas";
import { buildNexusActionProposals, isAllowedNexusActionType } from "@/lib/nexus-ai-governed-actions";
import { askNexusAI, isNexusAIConfigured } from "@/services/ai/nexus-ai-client";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { buildCreateDraftTool } from "@/services/tools/communications/create-draft";
import { buildRequestApprovalTool } from "@/services/tools/crm/request-approval";
import { makeApprovalStore, makeDraftStore, makePublishEvent, makeSupabaseAgentRunStore } from "@/services/agentic/adapters";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONTACT_ID = /^[0-9a-f-]{36}$/i;
const PROPOSAL_ID = /^nexus_action_[a-f0-9]{24}$/;

function safeText(value: unknown, max = 8000) {
  return String(value ?? "").trim().slice(0, max);
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

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const access = await getRequestAccessContext(request);
  if (!access) return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  if (!isNexusAIConfigured()) return NextResponse.json({ error: "Nexus AI er ikke konfigurert." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const type = body?.type;
  const proposalId = safeText(body?.proposalId, 80);
  const contactId = safeText(body?.contactId, 80);
  const requestText = safeText(body?.requestText, 8000);

  if (!isAllowedNexusActionType(type) || type !== "prepare_customer_email") {
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
  if (!contact.email) return NextResponse.json({ error: "Kunden har ingen e-postadresse i CRM." }, { status: 409 });
  if (contact.email_suppressed || contact.do_not_contact) {
    return NextResponse.json({ error: "Kunden er sperret for e-post/kontakt. Nexus oppretter ikke utsending." }, { status: 409 });
  }

  // Recompute the proposal from server-side CRM data. The client cannot turn a
  // navigation/chat payload into arbitrary database actions by changing JSON.
  const verifiedProposal = buildNexusActionProposals({
    message: requestText,
    currentContact: contact,
    contacts: [contact],
  })[0];
  if (!verifiedProposal || verifiedProposal.id !== proposalId || verifiedProposal.contactId !== contactId) {
    return NextResponse.json({ error: "Handlingsforslaget stemmer ikke lenger med kunde eller instruksjon." }, { status: 409 });
  }

  const runStore = makeSupabaseAgentRunStore(supabase);
  const runKey = `nexus_ai_action:${proposalId}`;
  let run = await runStore.findByIdempotencyKey(runKey);

  if (run) {
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
      inputSummary: `Forbered kunde-e-post til ${contact.name || contact.email}`,
      data: { action_type: type, contact_id: contact.id, proposal_id: proposalId },
    };
    run = {
      id: runId,
      agentId: "nexus-ai",
      goal: `Forbered godkjenningspliktig kundeoppfølging til ${contact.name || contact.email}`,
      status: "running",
      outcome: "recommended",
      correlationId,
      idempotencyKey: runKey,
      startedAt: now,
      steps: [firstStep],
    } satisfies AgentRun;
    await runStore.save(run);
  }

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

    const publishEvent = makePublishEvent(supabase);
    await publishEvent({
      eventType: "draft_created",
      outcome: "executed",
      title: `Nexus AI opprettet e-postutkast til ${contact.name || contact.email}`,
      confidence: 0.9,
      metadata: {
        run_id: runId,
        correlation_id: correlationId,
        agentic_outcome: "executed",
        draft_id: draftId,
        approval_id: approvalResult.data.id,
        action_source: "nexus_ai_chat",
      },
    }, toolContext);

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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nexus-handlingen feilet." }, { status: 500 });
  }
}
