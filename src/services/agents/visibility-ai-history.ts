import type { AiVisibilityLedgerRow } from "./visibility-ai-summary";

export type AiVisibilityMonth = {
 month: string;
 recorded: number;
 verifiedCitations: number;
 unverified: number;
};
/** Historical observed sample counts only. Never a search share or reach estimate. */
export function aiVisibilityMonthlyHistory(rows: AiVisibilityLedgerRow[]): AiVisibilityMonth[] {
 const months = new Map<string,AiVisibilityMonth>();
 for(const row of rows){
  if(!Number.isFinite(Date.parse(row.observed_at))) continue;
  const month=new Date(row.observed_at).toISOString().slice(0,7);
  const value=months.get(month)??{month,recorded:0,verifiedCitations:0,unverified:0};
  value.recorded++;
  if(row.verification_state==="INDEPENDENTLY_VERIFIED"&&row.evidence_state==="CITED")value.verifiedCitations++;
  if(row.verification_state!=="INDEPENDENTLY_VERIFIED")value.unverified++;
  months.set(month,value);
 }
 return [...months.values()].sort((a,b)=>a.month.localeCompare(b.month));
}
