/**
 * Workflow: lead-intake — RealtyFlow sin referansearkitektur for agent-flows.
 * Hardening 1.1: RBAC-authorization, ekte identiteter, operasjons-scoped
 * idempotens, durable run/trace, persistert outcome, unifisert approval.
 *
 *   raw inquiry → save_buyer_profile → find_properties → create_draft
 *               → policy → request_approval → revenue_events / durable trace
 */

import type { AccessRole } from "@/lib/access-control";
import type { RevenueEventType } from "@/lib/revenue/events";
import {
  generateCorrelationId,
  intakeFingerprint,
  newRunId,
  operationIdempotencyKey,
} from "@/lib/agentic/ids";
import { decideAutonomy } from "@/lib/agentic/policy-engine";
import type { AgentRun, AgentTraceStep, RunOutcome, TraceKind } from "@/lib/agentic/schemas";
import type { AgentRunStore } from "@/lib/agentic/run-store";
import type { ToolContext, ToolRegistry } from "@/lib/agentic/tool-registry";
import type { FindPropertiesResult, RankedProperty } from "@/services/tools/property/find-properties";

export interface RawInquiry {
  externalId?: string;
  source: string;
  brandId?: string;
  message: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  receivedAt?: string;
}

export interface ExtractedProfile {
  name?: string;
  budgetMaxEur?: number;
  budgetMinEur?: number;
  areas: string[];
  propertyType?: string;
  bedroomsMin?: number;
  mustHaves: string[];
  exclusions: string[];
  intentScore?: number;
}

export interface ExtractionResult {
  profile: ExtractedProfile;
  confidence: number;
  model?: string;
  tokens?: number;
  costUsd?: number;
}

export interface WorkflowEvent {
  eventType: RevenueEventType;
  outcome: RunOutcome;
  title: string;
  confidence?: number;
  revenueImpactEur?: number;
  metadata?: Record<string, unknown>;
}

export interface LeadIntakeDeps {
  registry: ToolRegistry;
  /** Durable Agent Run-lager (punkt 5) — også kilde for idempotens (punkt 2). */
  runStore: AgentRunStore;
  /** RBAC-rollen flyten kjører som (punkt 1). */
  role: AccessRole;
  extractProfile: (inquiry: RawInquiry, ctx: ToolContext) => Promise<ExtractionResult>;
  publishEvent: (event: WorkflowEvent, ctx: ToolContext) => Promise<void>;
  now?: () => Date;
  minConfidenceForAutoDraft?: number;
  estimateOpportunityEur?: (profile: ExtractedProfile, top: RankedProperty[]) => number;
}

const norm01 = (v: number) => (v > 1 ? v / 100 : v);
const defaultEstimate = (profile: ExtractedProfile) => Math.round((profile.budgetMaxEur ?? 0) * 0.03);

function composeDraftBody(profile: ExtractedProfile, top: RankedProperty[], inquiry: RawInquiry): { subject: string; body: string } {
  const name = profile.name || inquiry.contactName || "der";
  const lines = top.map(
    (p, i) => `${i + 1}. ${p.title || p.area} — ${p.priceEur != null ? `€${Math.round(p.priceEur).toLocaleString("en-US")}` : "pris på forespørsel"}${p.area ? ` (${p.area})` : ""}`,
  );
  return {
    subject: `${top.length} boliger som matcher ønskene dine`,
    body: `Hei ${name},\n\nBasert på det du beskrev fant jeg disse som passer godt:\n\n${lines.join("\n")}\n\nSi fra om du vil se noen av dem, så avtaler vi visning.\n\nVennlig hilsen`,
  };
}

export async function runLeadIntake(inquiry: RawInquiry, deps: LeadIntakeDeps): Promise<AgentRun> {
  const now = deps.now ?? (() => new Date());
  const minConf = deps.minConfidenceForAutoDraft ?? 0.6;
  const estimate = deps.estimateOpportunityEur ?? defaultEstimate;

  // --- Tre distinkte identiteter (punkt 3) ---
  const idempotencyKey = intakeFingerprint({
    source: inquiry.source,
    externalId: inquiry.externalId,
    contact: inquiry.contactEmail ?? inquiry.contactPhone,
    message: inquiry.message,
  });

  // Idempotens på tvers av restart (punkt 2 + 5): finnes en run allerede?
  const existing = await deps.runStore.findByIdempotencyKey(idempotencyKey);
  if (existing) return existing;

  const correlationId = generateCorrelationId();
  const runId = newRunId();
  const baseCtx: ToolContext = { correlationId, role: deps.role };

  const run: AgentRun = {
    id: runId,
    agentId: "lead-intake",
    goal: `Behandle henvendelse fra ${inquiry.source}`,
    status: "running",
    correlationId,
    idempotencyKey,
    startedAt: now().toISOString(),
    steps: [],
  };
  await deps.runStore.save(run);

  let stepSeq = 0;
  const step = (kind: TraceKind, label: string, extra: Partial<AgentTraceStep> = {}): AgentTraceStep => {
    const s: AgentTraceStep = { id: `${runId}:${stepSeq++}`, ts: now().toISOString(), kind, label, ...extra };
    run.steps.push(s);
    void deps.runStore.appendStep(runId, s);
    return s;
  };

  const finish = async (status: AgentRun["status"], outcome: RunOutcome): Promise<AgentRun> => {
    run.status = status;
    run.outcome = outcome;
    run.finishedAt = now().toISOString();
    await deps.runStore.setStatus(runId, status, run.finishedAt);
    await deps.runStore.setOutcome(runId, outcome);
    return run;
  };

  const fail = async (label: string, err: unknown): Promise<AgentRun> => {
    step("error", label, { outcome: "failed", outputSummary: err instanceof Error ? err.message : String(err) });
    await deps.publishEvent(
      { eventType: "automation_recommended", outcome: "failed", title: label, metadata: { run_id: runId, correlation_id: correlationId, agentic_outcome: "failed", error: String(err) } },
      baseCtx,
    );
    return finish("failed", "failed");
  };

  const opCtx = (operation: string, discriminator?: string): ToolContext => ({
    ...baseCtx,
    idempotencyKey: operationIdempotencyKey(runId, operation, discriminator),
  });

  step("event", "LEAD_RECEIVED", { inputSummary: `${inquiry.source}: ${inquiry.message.slice(0, 120)}`, data: { source: inquiry.source } });
  await deps.publishEvent(
    { eventType: "lead_created", outcome: "recommended", title: "Ny henvendelse mottatt", metadata: { run_id: runId, correlation_id: correlationId, agentic_outcome: "recommended", source: inquiry.source } },
    baseCtx,
  );

  // 1) Profil-ekstraksjon (AI, injisert)
  let extraction: ExtractionResult;
  const t0 = Date.now();
  try {
    extraction = await deps.extractProfile(inquiry, baseCtx);
  } catch (err) {
    return fail("PROFILE_EXTRACTION_FAILED", err);
  }
  const confidence = norm01(extraction.confidence);
  const profile = extraction.profile;
  step("tool_result", "PROFILE_EXTRACTION", {
    confidence,
    model: extraction.model,
    tokens: extraction.tokens,
    costUsd: extraction.costUsd,
    latencyMs: Date.now() - t0,
    outcome: "executed",
    outputSummary: `budsjett=${profile.budgetMaxEur ?? "?"} områder=${profile.areas.join("/") || "?"}`,
  });

  // 2) save_buyer_profile via Lead Intelligence (system-of-record, punkt 2)
  const profileKey = operationIdempotencyKey(runId, "save_buyer_profile", "primary");
  const profileRes = await deps.registry.run<unknown, { id: string; version: number; status: string; created: boolean }>(
    "save_buyer_profile",
    {
      correlationId,
      idempotencyKey: profileKey,
      brandId: inquiry.brandId,
      contactRef: inquiry.contactEmail ?? inquiry.contactPhone,
      name: profile.name,
      budgetMaxEur: profile.budgetMaxEur,
      budgetMinEur: profile.budgetMinEur,
      areas: profile.areas,
      propertyType: profile.propertyType,
      bedroomsMin: profile.bedroomsMin,
      mustHaves: profile.mustHaves,
      exclusions: profile.exclusions,
      confidence,
      provenance: "ai_suggestion",
      status: confidence < minConf ? "needs_review" : "ai_draft",
    },
    opCtx("save_buyer_profile", "primary"),
  );
  if (!profileRes.ok || !profileRes.data) return fail("SAVE_BUYER_PROFILE_FAILED", profileRes.error ?? "no data");
  step("tool_result", "TOOL save_buyer_profile", {
    tool: "save_buyer_profile",
    outcome: "executed",
    outputSummary: `profil ${profileRes.data.id} v${profileRes.data.version} (${profileRes.data.status})`,
    data: { profile_id: profileRes.data.id, status: profileRes.data.status },
  });

  // Feilscenario: mangler budsjett → avklaring, ingen auto-draft.
  if (profile.budgetMaxEur == null) {
    await requestApproval(deps, opCtx("request_approval", "clarify-budget"), correlationId, runId, {
      title: "Mangler budsjett — trenger avklaring",
      gatedActionClass: "notify",
      subjectType: "buyer_profile",
      subjectRef: profileRes.data.id,
      reason: "Kunne ikke utlede budsjett fra henvendelsen.",
      risk: "low",
      decisionMode: "manual-review",
      confidence,
    }, step);
    await deps.publishEvent(
      { eventType: "automation_recommended", outcome: "recommended", title: "Avklaring: mangler budsjett", confidence, metadata: { run_id: runId, correlation_id: correlationId, agentic_outcome: "recommended", reason: "missing_budget" } },
      baseCtx,
    );
    return finish("waiting_approval", "recommended");
  }

  // 3) find_properties (read-only, hard filters → ranking)
  const findRes = await deps.registry.run<unknown, FindPropertiesResult>("find_properties", {
    budgetMaxEur: profile.budgetMaxEur,
    budgetMinEur: profile.budgetMinEur,
    areas: profile.areas,
    propertyType: profile.propertyType,
    bedroomsMin: profile.bedroomsMin,
    exclusions: profile.exclusions,
    limit: 5,
  }, baseCtx);
  if (!findRes.ok || !findRes.data) return fail("FIND_PROPERTIES_FAILED", findRes.error ?? "no data");
  const top = findRes.data.returned;
  step("tool_result", "TOOL find_properties", {
    tool: "find_properties",
    decisionMode: findRes.decision?.mode,
    risk: findRes.decision?.risk,
    outcome: "executed",
    outputSummary: findRes.data.funnel.map((f) => `${f.stage}:${f.count}`).join(" → "),
    data: { funnel: findRes.data.funnel },
  });

  if (top.length === 0) {
    await requestApproval(deps, opCtx("request_approval", "no-match"), correlationId, runId, {
      title: "Ingen boligmatch — manuell vurdering",
      gatedActionClass: "notify",
      subjectType: "buyer_profile",
      subjectRef: profileRes.data.id,
      reason: "Ingen kandidater passerte hard filters.",
      risk: "low",
      decisionMode: "manual-review",
      confidence,
    }, step);
    await deps.publishEvent(
      { eventType: "automation_recommended", outcome: "recommended", title: "Ingen boligmatch", confidence, metadata: { run_id: runId, correlation_id: correlationId, agentic_outcome: "recommended", reason: "no_match" } },
      baseCtx,
    );
    return finish("waiting_approval", "recommended");
  }

  if (confidence < minConf) {
    await requestApproval(deps, opCtx("request_approval", "low-confidence"), correlationId, runId, {
      title: "Lav confidence på profil — manuell vurdering",
      gatedActionClass: "send_personal",
      subjectType: "buyer_profile",
      subjectRef: profileRes.data.id,
      reason: `Ekstraksjons-confidence ${(confidence * 100).toFixed(0)}% under terskel.`,
      risk: "medium",
      decisionMode: "manual-review",
      confidence,
      estimatedOpportunityEur: estimate(profile, top),
    }, step);
    await deps.publishEvent(
      { eventType: "automation_recommended", outcome: "recommended", title: "Lav confidence — manuell vurdering", confidence, metadata: { run_id: runId, correlation_id: correlationId, agentic_outcome: "recommended", reason: "low_confidence" } },
      baseCtx,
    );
    return finish("waiting_approval", "recommended");
  }

  // 4) create_draft (sender ALDRI, punkt 6)
  const { subject, body } = composeDraftBody(profile, top, inquiry);
  const draftKey = operationIdempotencyKey(runId, "create_draft", "customer");
  const draftRes = await deps.registry.run<unknown, { id: string; created: boolean }>("create_draft", {
    correlationId,
    idempotencyKey: draftKey,
    contactRef: inquiry.contactEmail ?? inquiry.contactPhone,
    channel: "email",
    subject,
    body,
    propertyIds: top.map((p) => p.id),
  }, opCtx("create_draft", "customer"));
  if (!draftRes.ok || !draftRes.data) return fail("CREATE_DRAFT_FAILED", draftRes.error ?? "no data");
  step("tool_result", "TOOL create_draft", {
    tool: "create_draft",
    decisionMode: draftRes.decision?.mode,
    risk: draftRes.decision?.risk,
    outcome: "executed",
    outputSummary: `draft ${draftRes.data.id}${draftRes.data.created ? "" : " (eksisterende)"}`,
  });
  await deps.publishEvent(
    { eventType: "draft_created", outcome: "executed", title: "Utkast opprettet", confidence, metadata: { run_id: runId, correlation_id: correlationId, agentic_outcome: "executed", draft_id: draftRes.data.id } },
    baseCtx,
  );

  // 5) Policy-beslutning for SELVE sendingen (send_personal) — gates alltid.
  const opportunity = estimate(profile, top);
  const sendDecision = decideAutonomy({
    actionClass: "send_personal", agentId: "lead-intake", channel: "email",
    involvesPersonalData: true, recipients: 1, reversibility: "partial",
    financialImpactEur: opportunity, agentConfidence: confidence,
    historicalAccuracy: 0.9, dataQuality: 0.85, permission: "requires-approval",
  });
  step("decision", "POLICY send_personal", { decisionMode: sendDecision.mode, risk: sendDecision.risk, confidence, revenueImpactEur: opportunity });

  // 6) request_approval — unifisert til message_draft-subjektet (punkt 6)
  const apprId = await requestApproval(deps, opCtx("request_approval", `send:${draftRes.data.id}`), correlationId, runId, {
    title: `Send oppfølging til ${profile.name || inquiry.contactName || "kunde"} (${top.length} boliger)`,
    gatedActionClass: "send_personal",
    subjectType: "message_draft",
    subjectRef: draftRes.data.id,
    draftId: draftRes.data.id,
    customerRef: inquiry.contactEmail ?? inquiry.contactPhone,
    reason: `${top.length} boliger matcher profilen sterkt.`,
    risk: sendDecision.risk,
    decisionMode: sendDecision.mode,
    confidence,
    estimatedOpportunityEur: opportunity,
  }, step);
  if (!apprId) return fail("REQUEST_APPROVAL_FAILED", "approval not created");

  await deps.publishEvent(
    {
      eventType: "automation_recommended", outcome: "recommended", title: "Oppfølging klar for godkjenning",
      confidence, revenueImpactEur: opportunity,
      metadata: { run_id: runId, correlation_id: correlationId, agentic_outcome: "recommended", draft_id: draftRes.data.id, autonomy_mode: sendDecision.mode, risk: sendDecision.risk },
    },
    baseCtx,
  );

  return finish("waiting_approval", "recommended");
}

async function requestApproval(
  deps: LeadIntakeDeps,
  ctx: ToolContext,
  correlationId: string,
  runId: string,
  payload: {
    title: string;
    gatedActionClass: string;
    subjectType: "buyer_profile" | "shortlist" | "presentation" | "message_draft" | "generic_agent_action";
    subjectRef?: string;
    draftId?: string;
    customerRef?: string;
    reason?: string;
    risk?: "low" | "medium" | "high" | "critical";
    decisionMode?: "live" | "draft-first" | "manual-review" | "human-required";
    confidence?: number;
    estimatedOpportunityEur?: number;
  },
  step: (kind: TraceKind, label: string, extra?: Partial<AgentTraceStep>) => AgentTraceStep,
): Promise<string | null> {
  const res = await deps.registry.run<unknown, { id: string; created: boolean }>("request_approval", {
    correlationId,
    idempotencyKey: ctx.idempotencyKey,
    runId,
    ...payload,
  }, ctx);
  if (!res.ok || !res.data) {
    step("error", "REQUEST_APPROVAL_FAILED", { outcome: "failed", outputSummary: res.error });
    return null;
  }
  step("approval", "APPROVAL_CREATED", {
    tool: "request_approval",
    risk: payload.risk,
    decisionMode: payload.decisionMode,
    confidence: payload.confidence,
    revenueImpactEur: payload.estimatedOpportunityEur,
    outcome: "recommended",
    outputSummary: `${payload.title} [${payload.subjectType}]${res.data.created ? "" : " (eksisterende)"}`,
    data: { subject_type: payload.subjectType, subject_ref: payload.subjectRef },
  });
  return res.data.id;
}

/** Registrer utfallet av en menneskelig godkjenning (punkt 5). */
export async function recordApprovalOutcome(
  deps: Pick<LeadIntakeDeps, "publishEvent">,
  ctx: ToolContext,
  args: { runId: string; outcome: Extract<RunOutcome, "approved" | "executed" | "rejected">; title: string; revenueImpactEur?: number },
): Promise<void> {
  const eventType: RevenueEventType = args.outcome === "rejected" ? "note" : "automation_executed";
  await deps.publishEvent(
    { eventType, outcome: args.outcome, title: args.title, revenueImpactEur: args.revenueImpactEur, metadata: { run_id: args.runId, agentic_outcome: args.outcome } },
    ctx,
  );
}
