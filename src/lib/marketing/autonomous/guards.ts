/**
 * Phase 7 — kill switch, pause-scopes, runaway-guards og circuit breaker.
 * Hele sløyfen skal kunne stoppes uten deploy. Ren logikk — orkestratoren
 * leser env (MARKETING_AUTOPILOT_ENABLED) og teller inn i GuardState.
 */

export interface GuardConfig {
  maxPublicationsPerDay: number;
  maxPublicationsPerChannelPerDay: number;
  maxRegenerationsPerContent: number;
  maxAiSpendPerDayEur: number;
  maxExperimentsPerBrand: number;
  maxFailedPublications: number;
}

export const DEFAULT_GUARD_CONFIG: GuardConfig = {
  maxPublicationsPerDay: 20,
  maxPublicationsPerChannelPerDay: 5,
  maxRegenerationsPerContent: 3,
  maxAiSpendPerDayEur: 25,
  maxExperimentsPerBrand: 5,
  maxFailedPublications: 3,
};

export interface GuardState {
  /** Global kill switch (env MARKETING_AUTOPILOT_ENABLED). */
  autopilotEnabled: boolean;
  pausedBrands?: string[];
  pausedChannels?: string[];
  pausedCampaigns?: string[];
  pausedAgents?: string[];
  publisherPaused?: boolean;
  publicationsToday?: number;
  publicationsPerChannelToday?: Record<string, number>;
  regenerationsByContent?: Record<string, number>;
  aiSpendTodayEur?: number;
  experimentsByBrand?: Record<string, number>;
  failedPublications?: number;
}

export type GuardRequest =
  | { kind: "publish"; channel: string; brandId?: string; campaignId?: string }
  | { kind: "regenerate"; contentId: string }
  | { kind: "spend"; amountEur: number }
  | { kind: "start_experiment"; brandId: string };

export interface GuardVerdict {
  allowed: boolean;
  reason: string;
  /** Sett når circuit breaker bør utløses (pause publisher + incident). */
  tripBreaker?: boolean;
}

const num = (v: number | undefined) => v ?? 0;

export function evaluateGuards(config: GuardConfig, state: GuardState, req: GuardRequest): GuardVerdict {
  if (!state.autopilotEnabled) return { allowed: false, reason: "Kill switch: MARKETING_AUTOPILOT_ENABLED er av." };

  if (req.kind === "publish") {
    if (state.publisherPaused) return { allowed: false, reason: "Publisher er satt på pause." };
    if (req.brandId && state.pausedBrands?.includes(req.brandId)) return { allowed: false, reason: `Merke ${req.brandId} er på pause.` };
    if (state.pausedChannels?.includes(req.channel)) return { allowed: false, reason: `Kanal ${req.channel} er på pause.` };
    if (req.campaignId && state.pausedCampaigns?.includes(req.campaignId)) return { allowed: false, reason: `Kampanje ${req.campaignId} er på pause.` };
    if (num(state.failedPublications) >= config.maxFailedPublications) {
      return { allowed: false, reason: `Circuit breaker: ${state.failedPublications} feilede publiseringer — publisher pauses.`, tripBreaker: true };
    }
    if (num(state.publicationsToday) >= config.maxPublicationsPerDay) return { allowed: false, reason: `Døgngrense nådd (${config.maxPublicationsPerDay}).` };
    if (num(state.publicationsPerChannelToday?.[req.channel]) >= config.maxPublicationsPerChannelPerDay) {
      return { allowed: false, reason: `Kanal-døgngrense nådd for ${req.channel} (${config.maxPublicationsPerChannelPerDay}).` };
    }
    return { allowed: true, reason: "OK." };
  }

  if (req.kind === "regenerate") {
    if (num(state.regenerationsByContent?.[req.contentId]) >= config.maxRegenerationsPerContent) {
      return { allowed: false, reason: `Maks regenereringer nådd for ${req.contentId} (${config.maxRegenerationsPerContent}).` };
    }
    return { allowed: true, reason: "OK." };
  }

  if (req.kind === "spend") {
    if (num(state.aiSpendTodayEur) + req.amountEur > config.maxAiSpendPerDayEur) {
      return { allowed: false, reason: `AI-forbruk over døgngrense (${config.maxAiSpendPerDayEur} €).` };
    }
    return { allowed: true, reason: "OK." };
  }

  if (req.kind === "start_experiment") {
    if (num(state.experimentsByBrand?.[req.brandId]) >= config.maxExperimentsPerBrand) {
      return { allowed: false, reason: `Maks samtidige eksperimenter for ${req.brandId} (${config.maxExperimentsPerBrand}).` };
    }
    return { allowed: true, reason: "OK." };
  }

  return { allowed: false, reason: "Ukjent guard-forespørsel." };
}
