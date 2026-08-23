/**
 * Agentic Core 1.0 — delte typer.
 *
 * Forankret i eksisterende fundament:
 *  - Autonomi-modusene speiler `AutomationMode` fra automation/registry.
 *  - `actorType` gjenbruker `RevenueActorType` fra revenue/events (nervesystemet).
 *
 * Kjerneidé (fra 2027-arkitekturen): en agent-handling vurderes ikke på
 * confidence alene, men på et produkt av flere faktorer, og noen handlinger
 * (kontrakt, bud, pris, betaling) krever ALLTID menneske uansett score.
 */

import type { RevenueActorType } from "@/lib/revenue/events";

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const REVERSIBILITY = ["reversible", "partial", "irreversible"] as const;
export type Reversibility = (typeof REVERSIBILITY)[number];

/** Autonomi-utfall — samme vokabular som automation/registry + human-required. */
export const AUTONOMY_MODES = ["live", "draft-first", "manual-review", "human-required"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

/** Hva agenten forsøker å gjøre — driver risiko og autonomi. */
export const ACTION_CLASSES = [
  "classify",
  "enrich",
  "score",
  "research",
  "match",
  "draft",
  "schedule",
  "tag",
  "notify",
  "send_personal",
  "send_bulk",
  "publish_social",
  "publish_listing",
  "price_change",
  "offer_response",
  "contract",
  "financial_transfer",
] as const;
export type ActionClass = (typeof ACTION_CLASSES)[number];

export type ActionChannel = "internal" | "email" | "sms" | "whatsapp" | "social" | "portal" | "web";
export type ActionPermission = "allowed" | "requires-approval" | "forbidden";

/** Alt en policy trenger for å vurdere én handling. */
export interface ActionContext {
  actionClass: ActionClass;
  agentId: string;
  actorType?: RevenueActorType;
  reversibility?: Reversibility;
  /** Antall mennesker handlingen påvirker (mottakere av utsending e.l.). */
  recipients?: number;
  financialImpactEur?: number;
  involvesPersonalData?: boolean;
  channel?: ActionChannel;
  legalSensitive?: boolean;
  /** Signaler til autonomi-formelen. confidence godtar 0..1 eller 0..100. */
  agentConfidence?: number;
  historicalAccuracy?: number;
  dataQuality?: number;
  permission?: ActionPermission;
}

/** De seks faktorene i autonomi-produktet (hver 0..1). */
export interface AutonomyFactors {
  confidence: number;
  historicalAccuracy: number;
  dataQuality: number;
  reversibility: number;
  permission: number;
  risk: number;
}

export interface AutonomyDecision {
  mode: AutonomyMode;
  /** Produkt av alle faktorer, 0..1. */
  autonomyScore: number;
  risk: RiskLevel;
  factors: AutonomyFactors;
  /** Satt når en hard policy-regel overstyrer scoren (f.eks. bud → menneske). */
  hardGate: string | null;
  reason: string;
}

/* ---- Agent Run / Trace ---- */
/* Kjeden: Event → Agent → Tool → Result → Confidence → Impact → Approval → Execution */

export const RUN_STATUSES = ["pending", "running", "waiting_approval", "completed", "failed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/**
 * Utfall som revenue_events må kunne skille (prinsipp 5): foreslo AI bare noe,
 * eller ble handlingen faktisk gjennomført?
 */
export const RUN_OUTCOMES = ["recommended", "approved", "executed", "failed", "rejected"] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

export type TraceKind =
  | "event"
  | "reason"
  | "tool_call"
  | "tool_result"
  | "decision"
  | "approval"
  | "execution"
  | "error";

/**
 * Action Trace (IKKE chain-of-thought, prinsipp 4). Lagrer input/output-
 * sammendrag, verktøy, beslutning, risiko, confidence, latency, modell og
 * token/kostnad — aldri privat resonnering.
 */
export interface AgentTraceStep {
  id: string;
  ts: string;
  kind: TraceKind;
  label: string;
  tool?: string;
  inputSummary?: string;
  outputSummary?: string;
  decisionMode?: AutonomyMode;
  risk?: RiskLevel;
  outcome?: RunOutcome;
  confidence?: number;
  latencyMs?: number;
  model?: string;
  tokens?: number;
  costUsd?: number;
  revenueImpactEur?: number;
  /** Strukturerte, ikke-sensitive detaljer (aldri rå CoT). */
  data?: Record<string, unknown>;
}

export interface AgentRun {
  id: string; // runId — egen persistent identitet
  agentId: string;
  goal: string;
  status: RunStatus;
  /** Eksplisitt, durabelt utfall (punkt 5) — skal ikke forsvinne i adapterlaget. */
  outcome?: RunOutcome;
  correlationId?: string;
  /** Stabil dedupe/idempotency-nøkkel for hele intaket (punkt 3). */
  idempotencyKey?: string;
  startedAt: string;
  finishedAt?: string;
  steps: AgentTraceStep[];
  decision?: AutonomyDecision;
}

/** Unifisert approval-subjekt (punkt 6): kan referere eksisterende RealtyFlow-
 * approvals i stedet for å lage en parallell verden. */
export const APPROVAL_SUBJECT_TYPES = [
  "buyer_profile",
  "shortlist",
  "presentation",
  "message_draft",
  "generic_agent_action",
] as const;
export type ApprovalSubjectType = (typeof APPROVAL_SUBJECT_TYPES)[number];
