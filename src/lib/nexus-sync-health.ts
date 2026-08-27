export type NexusSyncHealthState = "healthy" | "attention" | "stale" | "unknown";

export interface NexusSyncRunLike {
  status?: string | null;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface NexusSyncHealth {
  state: NexusSyncHealthState;
  trustedForPipelineDecisions: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  ageMinutes: number | null;
  storeCount: number;
  reason: string;
}

function time(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildNexusSyncHealth(
  latestRun: NexusSyncRunLike | null | undefined,
  storeCount: number,
  now = new Date(),
  staleAfterMinutes = 45,
): NexusSyncHealth {
  if (!latestRun) {
    return {
      state: "unknown",
      trustedForPipelineDecisions: false,
      lastRunAt: null,
      lastStatus: null,
      lastError: null,
      ageMinutes: null,
      storeCount,
      reason: "Ingen verifisert Opportunity Sync-run er registrert ennå. Tom Opportunity Store kan derfor ikke tolkes som manglende etterspørsel.",
    };
  }

  const lastRunAt = latestRun.finished_at || latestRun.started_at || null;
  const lastTime = time(lastRunAt);
  const ageMinutes = lastTime == null ? null : Math.max(0, Math.round((now.getTime() - lastTime) / 60_000));
  const status = String(latestRun.status || "unknown").toLowerCase();

  if (status === "error") {
    return {
      state: "attention",
      trustedForPipelineDecisions: false,
      lastRunAt,
      lastStatus: status,
      lastError: latestRun.error || null,
      ageMinutes,
      storeCount,
      reason: `Siste Opportunity Sync feilet${latestRun.error ? `: ${latestRun.error}` : "."} Pipeline-gap skal ikke brukes til Demand Generation før sync er frisk igjen.`,
    };
  }

  if (status !== "success") {
    return {
      state: "unknown",
      trustedForPipelineDecisions: false,
      lastRunAt,
      lastStatus: status,
      lastError: latestRun.error || null,
      ageMinutes,
      storeCount,
      reason: `Siste Opportunity Sync har status ${status}; pipeline-data behandles som uverifisert.`,
    };
  }

  if (ageMinutes == null || ageMinutes > staleAfterMinutes) {
    return {
      state: "stale",
      trustedForPipelineDecisions: false,
      lastRunAt,
      lastStatus: status,
      lastError: null,
      ageMinutes,
      storeCount,
      reason: `Siste vellykkede Opportunity Sync er ${ageMinutes == null ? "uten gyldig timestamp" : `${ageMinutes} minutter gammel`}. Data må oppdateres før pipeline-gap styrer nye lead-missions.`,
    };
  }

  return {
    state: "healthy",
    trustedForPipelineDecisions: true,
    lastRunAt,
    lastStatus: status,
    lastError: null,
    ageMinutes,
    storeCount,
    reason: storeCount > 0
      ? `Opportunity Sync er fersk og ${storeCount} persistente opportunities kan brukes som beslutningsgrunnlag.`
      : "Opportunity Sync er fersk og verifisert. En tom Opportunity Store kan behandles som et observert resultat, men numeriske lead-/revenue-gap krever fortsatt eksplisitte mål.",
  };
}
