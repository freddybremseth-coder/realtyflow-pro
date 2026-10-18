export type AiVisibilityLedgerRow = {
 provider: "chatgpt" | "perplexity" | "google_ai" | "copilot";
 evidence_state: "CITED" | "MENTIONED_NOT_CITED" | "NOT_OBSERVED";
 verification_state: "UNVERIFIED" | "INDEPENDENTLY_VERIFIED";
 observed_at: string;
};
export type AiVisibilityProviderSummary = {
 provider: AiVisibilityLedgerRow["provider"];
 recorded: number;
 independentlyVerified: number;
 verifiedCitations: number;
 manualUnverified: number;
 lastObservedAt: string | null;
};
const providers: AiVisibilityLedgerRow["provider"][]=["chatgpt","google_ai","perplexity","copilot"];
/** Counts observations, not total AI query coverage or estimated search visibility. */
export function summarizeAiVisibilityLedger(rows: AiVisibilityLedgerRow[]):AiVisibilityProviderSummary[]{
 return providers.map(provider=>{
  const matched=rows.filter(row=>row.provider===provider);
  const verified=matched.filter(row=>row.verification_state==="INDEPENDENTLY_VERIFIED");
  return {provider,recorded:matched.length,independentlyVerified:verified.length,
   verifiedCitations:verified.filter(row=>row.evidence_state==="CITED").length,
   manualUnverified:matched.filter(row=>row.verification_state==="UNVERIFIED").length,
   lastObservedAt:matched.map(row=>row.observed_at).sort().at(-1)||null};
 });
}
