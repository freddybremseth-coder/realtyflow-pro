/**
 * Phase 7 — marketing run state machine. Separate identiteter (ikke én ID til
 * alt), og resumable checkpoints: stopper prosessen etter "generate" men før
 * "approval", starter den IKKE hele kampanjen på nytt. Alle steg idempotente.
 */

import { generateCorrelationId, newRunId, operationIdempotencyKey } from "@/lib/agentic";
import { RUN_STAGES, type AutonomyLevel, type RunStage } from "./schemas";

export function newMarketingRunId(now = Date.now()): string {
  return `mrun_${newRunId(now).replace(/^run_/, "")}`;
}

/** Stabil idempotens-nøkkel per publisering — hindrer dobbel-posting ved retry. */
export function publicationIdempotencyKey(marketingRunId: string, publicationId: string): string {
  return operationIdempotencyKey(marketingRunId, `publish:${publicationId}`);
}

export interface RunCheckpoint {
  stage: RunStage;
  done: boolean;
  at?: string;
  summary?: string;
}

export interface MarketingRunState {
  marketingRunId: string;
  correlationId: string;
  brandId: string;
  level: AutonomyLevel;
  stage: RunStage;
  checkpoints: RunCheckpoint[];
  createdAt: string;
}

export function createMarketingRun(opts: { brandId: string; level?: AutonomyLevel; marketingRunId?: string; correlationId?: string; now?: string | Date }): MarketingRunState {
  const now = new Date(opts.now ?? new Date()).toISOString();
  return {
    marketingRunId: opts.marketingRunId ?? newMarketingRunId(),
    correlationId: opts.correlationId ?? generateCorrelationId(),
    brandId: opts.brandId,
    level: opts.level ?? "copilot",
    stage: "plan",
    checkpoints: RUN_STAGES.filter((s) => s !== "done").map((stage) => ({ stage, done: false })),
    createdAt: now,
  };
}

export function stageIndex(stage: RunStage): number {
  return RUN_STAGES.indexOf(stage);
}

export function nextStage(stage: RunStage): RunStage {
  const i = RUN_STAGES.indexOf(stage);
  return i < 0 || i >= RUN_STAGES.length - 1 ? "done" : RUN_STAGES[i + 1];
}

export function isStageDone(state: MarketingRunState, stage: RunStage): boolean {
  return !!state.checkpoints.find((c) => c.stage === stage)?.done;
}

/** Marker et steg som ferdig (idempotent) og flytt stage til neste. */
export function markStageDone(state: MarketingRunState, stage: RunStage, summary?: string, now: string | Date = new Date()): MarketingRunState {
  if (isStageDone(state, stage)) return state; // idempotent — ingen dobbel-utførelse
  const checkpoints = state.checkpoints.map((c) => (c.stage === stage ? { ...c, done: true, at: new Date(now).toISOString(), summary } : c));
  return { ...state, checkpoints, stage: nextStage(stage) };
}

/** Første ikke-ferdige steg — der en avbrutt run skal gjenopptas. */
export function resumeStage(state: MarketingRunState): RunStage {
  return state.checkpoints.find((c) => !c.done)?.stage ?? "done";
}
