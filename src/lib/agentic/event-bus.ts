/**
 * Agentic Core 1.0 — event-bus.
 *
 * Tynt lag oppå det eksisterende revenue_events-nervesystemet. Agenter og
 * verktøy publiserer hendelser hit (agent-run, tool-result, autonomi-beslutning)
 * med actor_type='ai'/'automation', confidence og revenue-impact — slik at hele
 * systemet deler ett hendelsesspor og observability.
 */

import {
  insertRevenueEvent,
  type RevenueActorType,
  type RevenueEventInput,
  type RevenueEventsSupabaseLike,
} from "@/lib/revenue/events";
import type { AutonomyDecision } from "./schemas";

export interface AgentEventInput extends Omit<RevenueEventInput, "actorType"> {
  actorType?: RevenueActorType;
  decision?: AutonomyDecision;
}

/** Publiser en agent-/automasjonshendelse til revenue_events. */
export async function publishAgentEvent(
  supabase: RevenueEventsSupabaseLike,
  input: AgentEventInput,
) {
  const { decision, metadata, ...rest } = input as AgentEventInput & { metadata?: Record<string, unknown> };
  return insertRevenueEvent(supabase, {
    ...rest,
    actorType: input.actorType ?? "ai",
    metadata: {
      ...(metadata ?? {}),
      ...(decision
        ? {
            autonomy_mode: decision.mode,
            autonomy_score: decision.autonomyScore,
            risk: decision.risk,
            hard_gate: decision.hardGate,
          }
        : {}),
    },
  } as RevenueEventInput);
}
