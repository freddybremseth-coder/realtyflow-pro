import type { NexusBusinessOpportunity } from "@/lib/nexus-business-opportunity";
import {
  normalizeOpportunitySourcePayloads,
  type NexusOpportunitySyncSource,
  type OpportunitySourcePayloads,
} from "@/lib/nexus-opportunity-sync";

export const NEXUS_OPPORTUNITY_SOURCE_PATHS: Record<NexusOpportunitySyncSource, string> = {
  real_estate: "/api/revenue/today",
  publishing: "/api/book-growth/overview",
  ai_demosites: "/api/saas/demosites",
};

export interface NexusOpportunitySyncWriteResult {
  ok: boolean;
  error?: string | null;
}

export interface NexusOpportunitySyncRunnerDeps {
  fetchSource: (source: NexusOpportunitySyncSource, path: string) => Promise<unknown>;
  upsertOpportunity: (
    opportunity: NexusBusinessOpportunity,
    source: NexusOpportunitySyncSource,
  ) => Promise<NexusOpportunitySyncWriteResult>;
}

export function scheduledNexusOpportunitySources(now = new Date()): NexusOpportunitySyncSource[] {
  const sources: NexusOpportunitySyncSource[] = ["real_estate", "ai_demosites"];
  if (now.getUTCMinutes() === 0 && now.getUTCHours() % 6 === 0) sources.push("publishing");
  return sources;
}

export async function runNexusOpportunitySync(
  deps: NexusOpportunitySyncRunnerDeps,
  sources: NexusOpportunitySyncSource[],
) {
  const selected = [...new Set(sources)];
  const reads = await Promise.allSettled(
    selected.map(async (source) => ({
      source,
      payload: await deps.fetchSource(source, NEXUS_OPPORTUNITY_SOURCE_PATHS[source]),
    })),
  );

  const payloads: OpportunitySourcePayloads = {};
  const sourceErrors: Partial<Record<NexusOpportunitySyncSource, string>> = {};

  for (const read of reads) {
    if (read.status === "rejected") continue;
    const { source, payload } = read.value;
    if (source === "real_estate") payloads.revenue = payload as OpportunitySourcePayloads["revenue"];
    if (source === "publishing") payloads.books = payload as OpportunitySourcePayloads["books"];
    if (source === "ai_demosites") payloads.demosites = payload as OpportunitySourcePayloads["demosites"];
  }

  reads.forEach((read, index) => {
    if (read.status !== "rejected") return;
    const source = selected[index];
    sourceErrors[source] = read.reason instanceof Error ? read.reason.message : String(read.reason);
  });

  const batches = normalizeOpportunitySourcePayloads(payloads).filter((batch) => selected.includes(batch.source));
  const resultBySource: Record<string, { fetched: number; normalized: number; upserted: number; errors: string[] }> = {};

  for (const batch of batches) {
    const summary = {
      fetched: batch.fetched,
      normalized: batch.opportunities.length,
      upserted: 0,
      errors: [] as string[],
    };
    if (sourceErrors[batch.source]) summary.errors.push(sourceErrors[batch.source] as string);

    const writes = await Promise.allSettled(
      batch.opportunities.map((opportunity) => deps.upsertOpportunity(opportunity, batch.source)),
    );
    writes.forEach((write) => {
      if (write.status === "fulfilled" && write.value.ok) summary.upserted += 1;
      else if (write.status === "fulfilled") summary.errors.push(write.value.error || "Opportunity upsert failed");
      else summary.errors.push(write.reason instanceof Error ? write.reason.message : String(write.reason));
    });
    resultBySource[batch.source] = summary;
  }

  const totals = Object.values(resultBySource).reduce(
    (acc, source) => ({
      fetched: acc.fetched + source.fetched,
      normalized: acc.normalized + source.normalized,
      upserted: acc.upserted + source.upserted,
      errors: acc.errors + source.errors.length,
    }),
    { fetched: 0, normalized: 0, upserted: 0, errors: 0 },
  );

  return {
    ok: totals.errors === 0,
    generatedAt: new Date().toISOString(),
    sourcesRequested: selected,
    totals,
    sources: resultBySource,
    safety: {
      archiveMissing: false,
      deleteMissing: false,
      outboundActions: false,
      note: "Sync only upserts observed opportunities. Missing source rows are never auto-closed or archived.",
    },
  };
}
