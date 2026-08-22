/**
 * Workflow: lead-intake — RealtyFlow sin FØRSTE ende-til-ende agent-flyt og
 * referansearkitektur for alle senere flows.
 *
 *   raw inquiry → buyer profile → property candidates → customer draft
 *                → approval item → revenue_events / action trace
 *
 * Prinsipper (alle håndhevet her):
 *  1. Alle handlinger går gjennom Tool Registry + Policy Engine — aldri direkte.
 *  2. Idempotent på correlationId (retry gir ikke duplikater).
 *  3. Correlation/run-ID gjennom hele kjeden.
 *  4. Action Trace (input/output-sammendrag, tool, beslutning, risiko,
 *     confidence, latency, modell, token) — ALDRI rå chain-of-thought.
 *  5. Skiller recommended/approved/executed/failed/rejected i revenue_events.
 *  6. Ingen automatisk kundekommunikasjon: draft kan lages auto, men sending
 *     stopper ved approval.
 *  7. find_properties håndhever hard filters i kode før AI-ranking.
 */

import type { RevenueEventType } from "@/lib/revenue/events";
import { decideAutonomy } from "@/lib/agentic/policy-engine";
import type { AgentRun, AgentTraceStep, RunOutcome, TraceKind } from "@/lib/agentic/schemas";
import type { ToolContext, ToolRegistry } from "@/lib/agentic/tool-registry";
import type { FindPropertiesResult, RankedProperty } from "@/services/tools/property/find-properties";

export interface RawInquiry {
  /** Ekstern id fra kilden — brukes til dedupe. */
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
  registry: ToolRegistry; // må ha find_properties, create_draft, request_approval
  extractProfile: (inquiry: RawInquiry, ctx: ToolContext) => Promise<ExtractionResult>;
  publishEvent: (event: WorkflowEvent, ctx: ToolContext) => Promise<void>;
  /** Idempotens-oppslag: har denne dedupeKey allerede en run? */
  findExistingRun?: (dedupeKey: string) => Promise<AgentRun | null>;
  now?: () => Date;
  genId?: () => string;
  /** Confidence-terskel (0..1) for at draft skal lages automatisk. Default 0.6. */
  minConfidenceForAutoDraft?: number;
  /** Antatt provisjon (EUR) for opportunity — enkel heuristikk hvis utelatt. */
  estimateOpportunityEur?: (profile: ExtractedProfile, top: RankedProperty[]) => number;
}

const norm01 = (v: number) => (v > 1 ? v / 100 : v);

function dedupeKeyFor(inquiry: RawInquiry): string {
  if (inquiry.externalId) return `lead:${inquiry.source}:${inquiry.externalId}`;
  const basis = `${inquiry.source}|${inquiry.contactEmail ?? inquiry.contactPhone ?? ""}|${inquiry.message}`;
  let h = 0;
  for (let i = 0; i < basis.length; i += 1) h = (h * 31 + basis.charCodeAt(i)) | 0;
  return `lead:${inquiry.source}:${(h >>> 0).toString(36)}`;
}

function composeDraftBody(profile: ExtractedProfile, top: RankedProperty[], inquiry: RawInquiry): { subject: string; body: string } {
  const name = profile.name || inquiry.contactName || "der";
  const lines = top.map(
    (p, i) => `${i + 1}. ${p.title || p.area} — ${p.priceEur != null ? `€${Math.round(p.priceEur).toLocaleString("en-US")}` : "pris på forespørsel"}${p.area ? ` (${p.area})` : ""}`,
  );
  const subject = `${top.length} boliger som matcher ønskene dine`;
  const body = `Hei ${name},\n\nBasert på det du beskrev fant jeg disse som passer godt:\n\n${lines.join("\n")}\n\nSi fra om du vil se noen av dem, så avtaler vi visning.\n\nVennlig hilsen`;
  return { subject, body };
}

const defaultEstimate = (profile: ExtractedProfile) => Math.round((profile.budgetMaxEur ?? 0) * 0.03);

export async function runLeadIntake(inquiry: RawInquiry, deps: LeadIntakeDeps): Promise<AgentRun> {
  const now = deps.now ?? (() => new Date());
  const genId = deps.genId ?? (() => Math.random().toString(36).slice(2, 10));
  const minConf = deps.minConfidenceForAutoDraft ?? 0.6;
  const estimate = deps.estimateOpportunityEur ?? defaultEstimate;

  const dedupeKey = dedupeKeyFor(inquiry);
  // Deterministisk run/correlation-id fra dedupeKey → tool-idempotens holder ved retry.
  const runId = dedupeKey;
  const ctx: ToolContext = { correlationId: runId, role: "lead-intake" };

  // Prinsipp 2/5: har vi allerede prosessert denne? Returner uten nye events.
  if (deps.findExistingRun) {
    const existing = await deps.findExistingRun(dedupeKey);
    if (existing) return existing;
  }

  const steps: AgentTraceStep[] = [];
  const step = (
    kind: TraceKind,
    label: string,
    extra: Partial<AgentTraceStep> = {},
  ): AgentTraceStep => {
    const s: AgentTraceStep = { id: genId(), ts: now().toISOString(), kind, label, ...extra };
    steps.push(s);
    return s;
  };

  const run: AgentRun = {
    id: runId,
    agentId: "lead-intake",
    goal: `Behandle henvendelse fra ${inquiry.source}`,
    status: "running",
    correlationId: runId,
    startedAt: now().toISOString(),
    steps,
  };

  const fail = async (label: string, err: unknown): Promise<AgentRun> => {
    step("error", label, { outcome: "failed", outputSummary: err instanceof Error ? err.message : String(err) });
    run.status = "failed";
    run.finishedAt = now().toISOString();
    await deps.publishEvent(
      { eventType: "automation_recommended", outcome: "failed", title: label, metadata: { run_id: runId, error: String(err) } },
      ctx,
    );
    return run;
  };

  step("event", "LEAD_RECEIVED", { inputSummary: `${inquiry.source}: ${inquiry.message.slice(0, 120)}`, data: { source: inquiry.source } });
  await deps.publishEvent(
    { eventType: "lead_created", outcome: "recommended", title: "Ny henvendelse mottatt", metadata: { run_id: runId, source: inquiry.source } },
    ctx,
  );

  // 1) Profil-ekstraksjon (AI, injisert)
  let extraction: ExtractionResult;
  const t0 = Date.now();
  try {
    extraction = await deps.extractProfile(inquiry, ctx);
  } catch (err) {
    return fail("PROFILE_EXTRACTION_FAILED", err);
  }
  const confidence = norm01(extraction.confidence);
  step("tool_result", "PROFILE_EXTRACTION", {
    confidence,
    model: extraction.model,
    tokens: extraction.tokens,
    costUsd: extraction.costUsd,
    latencyMs: Date.now() - t0,
    outcome: "executed",
    outputSummary: `budsjett=${extraction.profile.budgetMaxEur ?? "?"} områder=${extraction.profile.areas.join("/") || "?"}`,
  });

  const profile = extraction.profile;

  // Prinsipp 8 (feilscenario): mangler budsjett → be om info, ingen auto-draft.
  if (profile.budgetMaxEur == null) {
    await runApproval(deps, ctx, runId, {
      title: "Mangler budsjett — trenger avklaring",
      gatedActionClass: "notify",
      reason: "Kunne ikke utlede budsjett fra henvendelsen.",
      risk: "low",
      decisionMode: "manual-review",
      confidence,
    }, steps, step);
    run.status = "waiting_approval";
    run.finishedAt = now().toISOString();
    await deps.publishEvent(
      { eventType: "automation_recommended", outcome: "recommended", title: "Avklaring: mangler budsjett", confidence, metadata: { run_id: runId, reason: "missing_budget" } },
      ctx,
    );
    return run;
  }

  // 2) find_properties (tool → hard filters → ranking)
  const findRes = await deps.registry.run<unknown, FindPropertiesResult>("find_properties", {
    budgetMaxEur: profile.budgetMaxEur,
    budgetMinEur: profile.budgetMinEur,
    areas: profile.areas,
    propertyType: profile.propertyType,
    bedroomsMin: profile.bedroomsMin,
    exclusions: profile.exclusions,
    limit: 5,
  }, ctx);
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

  // Feilscenario: ingen boligmatch → menneskelig oppfølging, ingen draft.
  if (top.length === 0) {
    await runApproval(deps, ctx, runId, {
      title: "Ingen boligmatch — manuell vurdering",
      gatedActionClass: "notify",
      reason: "Ingen kandidater passerte hard filters.",
      risk: "low",
      decisionMode: "manual-review",
      confidence,
    }, steps, step);
    run.status = "waiting_approval";
    run.finishedAt = now().toISOString();
    await deps.publishEvent(
      { eventType: "automation_recommended", outcome: "recommended", title: "Ingen boligmatch", confidence, metadata: { run_id: runId, reason: "no_match" } },
      ctx,
    );
    return run;
  }

  // Feilscenario: lav confidence → ikke auto-draft, send til manuell vurdering.
  if (confidence < minConf) {
    await runApproval(deps, ctx, runId, {
      title: "Lav confidence på profil — manuell vurdering",
      gatedActionClass: "send_personal",
      reason: `Ekstraksjons-confidence ${(confidence * 100).toFixed(0)}% under terskel.`,
      risk: "medium",
      decisionMode: "manual-review",
      confidence,
      estimatedOpportunityEur: estimate(profile, top),
    }, steps, step);
    run.status = "waiting_approval";
    run.finishedAt = now().toISOString();
    await deps.publishEvent(
      { eventType: "automation_recommended", outcome: "recommended", title: "Lav confidence — manuell vurdering", confidence, metadata: { run_id: runId, reason: "low_confidence" } },
      ctx,
    );
    return run;
  }

  // 3) create_draft (tool). Sender ALDRI (prinsipp 6).
  const { subject, body } = composeDraftBody(profile, top, inquiry);
  const draftRes = await deps.registry.run<unknown, { id: string; created: boolean }>("create_draft", {
    correlationId: runId,
    contactRef: inquiry.contactEmail ?? inquiry.contactPhone,
    channel: "email",
    subject,
    body,
    propertyIds: top.map((p) => p.id),
  }, ctx);
  if (!draftRes.ok || !draftRes.data) return fail("CREATE_DRAFT_FAILED", draftRes.error ?? "no data");
  step("tool_result", "TOOL create_draft", {
    tool: "create_draft",
    decisionMode: draftRes.decision?.mode,
    risk: draftRes.decision?.risk,
    outcome: "executed",
    outputSummary: `draft ${draftRes.data.id}${draftRes.data.created ? "" : " (eksisterende)"}`,
  });
  await deps.publishEvent(
    { eventType: "draft_created", outcome: "executed", title: "Utkast opprettet", confidence, metadata: { run_id: runId, draft_id: draftRes.data.id, property_ids: top.map((p) => p.id) } },
    ctx,
  );

  // 4) Policy-beslutning for SELVE sendingen (send_personal) — gates alltid.
  const opportunity = estimate(profile, top);
  const sendDecision = decideAutonomy({
    actionClass: "send_personal",
    agentId: "lead-intake",
    channel: "email",
    involvesPersonalData: true,
    recipients: 1,
    reversibility: "partial",
    financialImpactEur: opportunity,
    agentConfidence: confidence,
    historicalAccuracy: 0.9,
    dataQuality: 0.85,
    permission: "requires-approval",
  });
  step("decision", "POLICY send_personal", { decisionMode: sendDecision.mode, risk: sendDecision.risk, confidence, revenueImpactEur: opportunity });

  // 5) request_approval (tool) — bærer beslutningen for sendingen.
  const apprRes = await runApproval(deps, ctx, runId, {
    title: `Send oppfølging til ${profile.name || inquiry.contactName || "kunde"} (${top.length} boliger)`,
    gatedActionClass: "send_personal",
    draftId: draftRes.data.id,
    customerRef: inquiry.contactEmail ?? inquiry.contactPhone,
    reason: `${top.length} boliger matcher profilen sterkt.`,
    risk: sendDecision.risk,
    decisionMode: sendDecision.mode,
    confidence,
    estimatedOpportunityEur: opportunity,
  }, steps, step);
  if (!apprRes) return fail("REQUEST_APPROVAL_FAILED", "approval not created");

  // Sendingen er FORESLÅTT, venter på menneske (prinsipp 5/6).
  await deps.publishEvent(
    {
      eventType: "automation_recommended",
      outcome: "recommended",
      title: "Oppfølging klar for godkjenning",
      confidence,
      revenueImpactEur: opportunity,
      metadata: { run_id: runId, draft_id: draftRes.data.id, autonomy_mode: sendDecision.mode, risk: sendDecision.risk },
    },
    ctx,
  );

  run.status = "waiting_approval";
  run.finishedAt = now().toISOString();
  return run;
}

/** Kjør request_approval via registry og logg til trace. Returnerer approval-id eller null. */
async function runApproval(
  deps: LeadIntakeDeps,
  ctx: ToolContext,
  runId: string,
  payload: {
    title: string;
    gatedActionClass: string;
    draftId?: string;
    customerRef?: string;
    reason?: string;
    risk?: "low" | "medium" | "high" | "critical";
    decisionMode?: "live" | "draft-first" | "manual-review" | "human-required";
    confidence?: number;
    estimatedOpportunityEur?: number;
  },
  steps: AgentTraceStep[],
  step: (kind: TraceKind, label: string, extra?: Partial<AgentTraceStep>) => AgentTraceStep,
): Promise<string | null> {
  const res = await deps.registry.run<unknown, { id: string; created: boolean }>("request_approval", {
    correlationId: runId,
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
    outputSummary: `${payload.title}${res.data.created ? "" : " (eksisterende)"}`,
  });
  return res.data.id;
}

/**
 * Registrer utfallet av en menneskelig godkjenning (prinsipp 5). Kalles fra
 * Approval Gateway når Freddy godkjenner/avviser. Publiserer executed/rejected.
 */
export async function recordApprovalOutcome(
  deps: Pick<LeadIntakeDeps, "publishEvent">,
  ctx: ToolContext,
  args: { runId: string; outcome: Extract<RunOutcome, "approved" | "executed" | "rejected">; title: string; revenueImpactEur?: number },
): Promise<void> {
  const eventType: RevenueEventType = args.outcome === "rejected" ? "note" : "automation_executed";
  await deps.publishEvent(
    { eventType, outcome: args.outcome, title: args.title, revenueImpactEur: args.revenueImpactEur, metadata: { run_id: args.runId } },
    ctx,
  );
}
