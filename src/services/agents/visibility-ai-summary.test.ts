import assert from "node:assert/strict";
import {it} from "node:test";
import {summarizeAiVisibilityLedger} from "./visibility-ai-summary";
it("counts unverified manual rows without inflating verified citations",()=>{
 const result=summarizeAiVisibilityLedger([
  {provider:"chatgpt",evidence_state:"CITED",verification_state:"UNVERIFIED",observed_at:"2026-10-18T10:00:00Z"},
  {provider:"chatgpt",evidence_state:"CITED",verification_state:"INDEPENDENTLY_VERIFIED",observed_at:"2026-10-18T12:00:00Z"},
 ]);
 assert.equal(result.find(x=>x.provider==="chatgpt")?.recorded,2);
 assert.equal(result.find(x=>x.provider==="chatgpt")?.verifiedCitations,1);
 assert.equal(result.find(x=>x.provider==="chatgpt")?.manualUnverified,1);
 assert.equal(result.find(x=>x.provider==="copilot")?.recorded,0);
});