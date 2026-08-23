/**
 * Agentic Core — durable Agent Run-lager (Hardening 1.1, punkt 5).
 *
 * AgentRun + trace steps + outcome skal kunne persisteres og REKONSTRUERES
 * etter restart/deploy, slik at Approval Gateway senere kan svare på «hvorfor
 * ligger denne her?». Kun redigert/summary-trace lagres — aldri chain-of-thought.
 *
 * Porten er DI-vennlig: InMemory for test, Supabase-adapter for produksjon.
 */

import type { AgentRun, AgentTraceStep, RunOutcome, RunStatus } from "./schemas";

export interface AgentRunStore {
  load(runId: string): Promise<AgentRun | null>;
  /** Finn eksisterende run via stabil idempotency-nøkkel (dedupe på tvers av restart). */
  findByIdempotencyKey(key: string): Promise<AgentRun | null>;
  save(run: AgentRun): Promise<void>;
  appendStep(runId: string, step: AgentTraceStep): Promise<void>;
  setStatus(runId: string, status: RunStatus, finishedAt?: string): Promise<void>;
  setOutcome(runId: string, outcome: RunOutcome): Promise<void>;
}

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export class InMemoryAgentRunStore implements AgentRunStore {
  private runs = new Map<string, AgentRun>();
  private byKey = new Map<string, string>();

  async load(runId: string): Promise<AgentRun | null> {
    const r = this.runs.get(runId);
    return r ? clone(r) : null;
  }

  async findByIdempotencyKey(key: string): Promise<AgentRun | null> {
    const id = this.byKey.get(key);
    return id ? this.load(id) : null;
  }

  async save(run: AgentRun): Promise<void> {
    this.runs.set(run.id, clone(run));
    if (run.idempotencyKey) this.byKey.set(run.idempotencyKey, run.id);
  }

  async appendStep(runId: string, step: AgentTraceStep): Promise<void> {
    const r = this.runs.get(runId);
    if (r) r.steps.push(clone(step));
  }

  async setStatus(runId: string, status: RunStatus, finishedAt?: string): Promise<void> {
    const r = this.runs.get(runId);
    if (r) {
      r.status = status;
      if (finishedAt) r.finishedAt = finishedAt;
    }
  }

  async setOutcome(runId: string, outcome: RunOutcome): Promise<void> {
    const r = this.runs.get(runId);
    if (r) r.outcome = outcome;
  }
}
