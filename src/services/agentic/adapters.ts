/**
 * Agentic Core 1.1 — produksjonsadaptere (Hardening 1.1, punkt 7).
 *
 * Kobler DI-portene til ekte Supabase/revenue_events for lead-intake-flyten.
 * Byggetrygge: bruker en generisk SupabaseLike-klient (ingen tunge typeimporter).
 * Automatisk kundekommunikasjon aktiveres IKKE her — create_draft lagrer utkast,
 * sending gates fortsatt via approval.
 *
 * ⚠️ Live-verifisering gjenstår: kjør migrasjon 20260823100000 og bekreft mot
 * faktiske tabeller (scanned_properties, agent_runs, agentic_approvals,
 * revenue_events) i preview før produksjon. Buyer-profile bør komponeres med
 * Lead Intelligence sin create-funksjon på rute-nivå (se makeBuyerProfileStore).
 */

import { insertRevenueEvent, type RevenueEventInput, type RevenueEventsSupabaseLike } from "@/lib/revenue/events";
import type { AgentRun, AgentTraceStep, RunOutcome, RunStatus } from "@/lib/agentic/schemas";
import type { AgentRunStore } from "@/lib/agentic/run-store";
import type { ApprovalGatewayStore, ApprovalItem, GatewayOutcomeEvent } from "@/lib/agentic/approval-gateway";
import type { DraftRef, ExecutorStore } from "@/lib/agentic/executor";
import type { FindPropertiesInput, PropertyCandidate } from "@/services/tools/property/find-properties";
import type { CreateDraftInput } from "@/services/tools/communications/create-draft";
import type { RequestApprovalInput } from "@/services/tools/crm/request-approval";
import type { SaveBuyerProfileInput } from "@/services/tools/crm/save-buyer-profile";
import type { WorkflowEvent } from "@/services/workflows/lead-intake";

export interface SupabaseLike {
  from(table: string): any;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Read-only inventory-spørring mot scanned_properties. Grovfiltre pushes til DB. */
export function makeInventoryQuery(supabase: SupabaseLike) {
  return async (input: FindPropertiesInput): Promise<PropertyCandidate[]> => {
    let q = supabase.from("scanned_properties").select("id, title, price_numeric, location, property_type, bedrooms");
    if (input.budgetMaxEur != null) q = q.lte("price_numeric", input.budgetMaxEur);
    if (input.budgetMinEur != null) q = q.gte("price_numeric", input.budgetMinEur);
    if (input.bedroomsMin != null) q = q.gte("bedrooms", input.bedroomsMin);
    const { data, error } = await q.limit(500);
    if (error) throw new Error(`inventory query failed: ${error.message}`);
    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      title: r.title ?? null,
      priceEur: num(r.price_numeric),
      area: r.location ?? null,
      propertyType: r.property_type ?? null,
      bedrooms: num(r.bedrooms),
      raw: r,
    }));
  };
}

/** Durable Agent Run-lager mot public.agent_runs. */
export function makeSupabaseAgentRunStore(supabase: SupabaseLike): AgentRunStore {
  const table = () => supabase.from("agent_runs");
  const rowToRun = (r: any): AgentRun => ({
    id: r.id, agentId: r.agent_id, goal: r.goal, status: r.status, outcome: r.outcome ?? undefined,
    correlationId: r.correlation_id ?? undefined, idempotencyKey: r.idempotency_key ?? undefined,
    startedAt: r.started_at, finishedAt: r.finished_at ?? undefined,
    steps: Array.isArray(r.steps) ? (r.steps as AgentTraceStep[]) : [], decision: r.decision ?? undefined,
  });
  return {
    async load(runId) {
      const { data } = await table().select("*").eq("id", runId).maybeSingle();
      return data ? rowToRun(data) : null;
    },
    async findByIdempotencyKey(key) {
      const { data } = await table().select("*").eq("idempotency_key", key).maybeSingle();
      return data ? rowToRun(data) : null;
    },
    async save(run) {
      await table().upsert({
        id: run.id, agent_id: run.agentId, goal: run.goal, status: run.status, outcome: run.outcome ?? null,
        correlation_id: run.correlationId ?? null, idempotency_key: run.idempotencyKey ?? null,
        steps: run.steps, decision: run.decision ?? null, started_at: run.startedAt,
        finished_at: run.finishedAt ?? null, updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    },
    async appendStep(runId, step) {
      const current = await this.load(runId);
      const steps = [...(current?.steps ?? []), step];
      await table().update({ steps, updated_at: new Date().toISOString() }).eq("id", runId);
    },
    async setStatus(runId, status: RunStatus, finishedAt) {
      await table().update({ status, finished_at: finishedAt ?? null, updated_at: new Date().toISOString() }).eq("id", runId);
    },
    async setOutcome(runId, outcome: RunOutcome) {
      await table().update({ outcome, updated_at: new Date().toISOString() }).eq("id", runId);
    },
  };
}

/** create_draft-lager. Utkast lagres; sending skjer aldri her. */
export function makeDraftStore(supabase: SupabaseLike, table = "agentic_drafts") {
  return {
    findExisting: async (idempotencyKey: string) => {
      const { data } = await supabase.from(table).select("id").eq("idempotency_key", idempotencyKey).maybeSingle();
      return data ? { id: String(data.id) } : null;
    },
    saveDraft: async (input: CreateDraftInput) => {
      const { data, error } = await supabase.from(table).insert({
        idempotency_key: input.idempotencyKey, correlation_id: input.correlationId,
        contact_ref: input.contactRef ?? null, channel: input.channel,
        subject: input.subject ?? null, body: input.body, property_ids: input.propertyIds,
        status: "draft", created_at: new Date().toISOString(),
      }).select("id").single();
      if (error) throw new Error(`saveDraft failed: ${error.message}`);
      return { id: String(data.id) };
    },
  };
}

/** Unifisert approval-lager mot agentic_approvals (peker til eksisterende objekter). */
export function makeApprovalStore(supabase: SupabaseLike) {
  return {
    findExisting: async (idempotencyKey: string) => {
      const { data } = await supabase.from("agentic_approvals").select("id").eq("idempotency_key", idempotencyKey).maybeSingle();
      return data ? { id: String(data.id) } : null;
    },
    saveApproval: async (input: RequestApprovalInput) => {
      const { data, error } = await supabase.from("agentic_approvals").insert({
        idempotency_key: input.idempotencyKey, run_id: input.runId, correlation_id: input.correlationId,
        title: input.title, gated_action_class: input.gatedActionClass,
        subject_type: input.subjectType, subject_ref: input.subjectRef ?? null,
        customer_ref: input.customerRef ?? null, draft_id: input.draftId ?? null, reason: input.reason ?? null,
        risk: input.risk ?? null, decision_mode: input.decisionMode ?? null,
        confidence: input.confidence ?? null, estimated_opportunity_eur: input.estimatedOpportunityEur ?? null,
        status: "pending", created_at: new Date().toISOString(),
      }).select("id").single();
      if (error) throw new Error(`saveApproval failed: ${error.message}`);
      return { id: String(data.id) };
    },
  };
}

/**
 * Buyer-profile-lager. For ekte Lead Intelligence-persistens (system-of-record),
 * injiser LI sin create-funksjon på rute-nivå der typene er bygg-verifisert:
 *   makeBuyerProfileStore(supabase, { createViaLeadIntelligence })
 * Uten den brukes en direkte insert som midlertidig seam (merk: går utenom LI-
 * validering — bytt til LI-funksjonen før produksjon).
 */
export function makeBuyerProfileStore(
  supabase: SupabaseLike,
  opts?: { createViaLeadIntelligence?: (input: SaveBuyerProfileInput) => Promise<{ id: string; version: number; status: string }> },
) {
  return {
    findExisting: async (idempotencyKey: string) => {
      const { data } = await supabase.from("agentic_buyer_profiles").select("id, version, status").eq("idempotency_key", idempotencyKey).maybeSingle();
      return data ? { id: String(data.id), version: Number(data.version) || 1, status: String(data.status) } : null;
    },
    saveProfile: async (input: SaveBuyerProfileInput) => {
      // Prod: injiser LI-native create for system-of-record. Ellers: agentic-tabell.
      if (opts?.createViaLeadIntelligence) return opts.createViaLeadIntelligence(input);
      const { data, error } = await supabase.from("agentic_buyer_profiles").insert({
        idempotency_key: input.idempotencyKey, brand_id: input.brandId ?? null, display_name: input.name ?? null,
        budget_max_eur: input.budgetMaxEur ?? null, budget_min_eur: input.budgetMinEur ?? null,
        areas: input.areas, property_type: input.propertyType ?? null, bedrooms_min: input.bedroomsMin ?? null,
        must_haves: input.mustHaves, exclusions: input.exclusions, confidence: input.confidence ?? null,
        provenance: input.provenance, status: input.status, version: 1, created_at: new Date().toISOString(),
      }).select("id").single();
      if (error) throw new Error(`saveProfile failed: ${error.message}`);
      return { id: String(data.id), version: 1, status: input.status };
    },
  };
}

/** Approval Gateway-lager mot agentic_approvals (den ene godkjenningskøen). */
export function makeApprovalGatewayStore(supabase: SupabaseLike): ApprovalGatewayStore {
  const rowToItem = (r: any): ApprovalItem => ({
    id: String(r.id), runId: r.run_id ?? null, correlationId: r.correlation_id ?? null,
    title: r.title, gatedActionClass: r.gated_action_class, subjectType: r.subject_type,
    subjectRef: r.subject_ref ?? null, customerRef: r.customer_ref ?? null, draftId: r.draft_id ?? null,
    reason: r.reason ?? null, risk: r.risk ?? null, decisionMode: r.decision_mode ?? null,
    confidence: num(r.confidence), estimatedOpportunityEur: num(r.estimated_opportunity_eur),
    status: r.status, createdAt: r.created_at ?? null,
  });
  return {
    listPending: async () => {
      const { data } = await supabase.from("agentic_approvals").select("*").eq("status", "pending").order("created_at", { ascending: true });
      return (data ?? []).map(rowToItem);
    },
    get: async (id) => {
      const { data } = await supabase.from("agentic_approvals").select("*").eq("id", id).maybeSingle();
      return data ? rowToItem(data) : null;
    },
    markResolved: async (id, status, resolvedBy, at) => {
      await supabase.from("agentic_approvals").update({ status, resolved_by: resolvedBy, resolved_at: at, updated_at: new Date().toISOString() }).eq("id", id);
    },
  };
}

/** Executor-lager: leser godkjent approval + utkast, markerer executed. */
export function makeExecutorStore(supabase: SupabaseLike): ExecutorStore {
  const rowToItem = (r: any): ApprovalItem => ({
    id: String(r.id), runId: r.run_id ?? null, correlationId: r.correlation_id ?? null,
    title: r.title, gatedActionClass: r.gated_action_class, subjectType: r.subject_type,
    subjectRef: r.subject_ref ?? null, customerRef: r.customer_ref ?? null, draftId: r.draft_id ?? null,
    reason: r.reason ?? null, risk: r.risk ?? null, decisionMode: r.decision_mode ?? null,
    confidence: num(r.confidence), estimatedOpportunityEur: num(r.estimated_opportunity_eur),
    status: r.status, createdAt: r.created_at ?? null,
  });
  return {
    get: async (id) => {
      const { data } = await supabase.from("agentic_approvals").select("*").eq("id", id).maybeSingle();
      return data ? rowToItem(data) : null;
    },
    getDraft: async (draftId): Promise<DraftRef | null> => {
      const { data } = await supabase.from("agentic_drafts").select("*").eq("id", draftId).maybeSingle();
      if (!data) return null;
      return { id: String(data.id), contactRef: data.contact_ref ?? null, channel: data.channel ?? null, subject: data.subject ?? null, body: data.body, brandId: null };
    },
    markExecuted: async (id, at, detail, executedBy) => {
      await supabase.from("agentic_approvals").update({ status: "executed", executed_at: at, executed_by: executedBy, execution_detail: detail, updated_at: new Date().toISOString() }).eq("id", id);
    },
  };
}

/** Gateway-utfall → revenue_events (actor human, bevarer subjekt + outcome). */
export function makeGatewayPublishEvent(supabase: RevenueEventsSupabaseLike) {
  return async (e: GatewayOutcomeEvent): Promise<void> => {
    await insertRevenueEvent(supabase, {
      eventType: e.outcome === "rejected" ? "note" : "automation_executed",
      title: e.title, actorType: "human", revenueImpactEur: e.revenueImpactEur ?? null,
      metadata: { run_id: e.runId, agentic_outcome: e.outcome, subject_type: e.subjectType, subject_ref: e.subjectRef },
    } as RevenueEventInput);
  };
}

/** publishEvent → revenue_events (bevarer agentic_outcome i metadata, punkt 5). */
export function makePublishEvent(supabase: RevenueEventsSupabaseLike) {
  return async (event: WorkflowEvent): Promise<void> => {
    await insertRevenueEvent(supabase, {
      eventType: event.eventType,
      title: event.title,
      actorType: "ai",
      confidenceScore: event.confidence != null ? Math.round(event.confidence * 100) : null,
      revenueImpactEur: event.revenueImpactEur ?? null,
      metadata: { ...(event.metadata ?? {}), agentic_outcome: event.outcome },
    } as RevenueEventInput);
  };
}
