import assert from "node:assert/strict";
import {it} from "node:test";
import {aiVisibilityMonthlyHistory} from "./visibility-ai-history";
it("records calendar-month evidence counts without promoting manual citations",()=>{
 const result=aiVisibilityMonthlyHistory([
  {provider:"chatgpt",evidence_state:"CITED",verification_state:"UNVERIFIED",observed_at:"2026-09-05T12:00:00Z"},
  {provider:"perplexity",evidence_state:"CITED",verification_state:"INDEPENDENTLY_VERIFIED",observed_at:"2026-10-05T12:00:00Z"},
 ]);
 assert.deepEqual(result,[
  {month:"2026-09",recorded:1,verifiedCitations:0,unverified:1},
  {month:"2026-10",recorded:1,verifiedCitations:1,unverified:0},
 ]);
});