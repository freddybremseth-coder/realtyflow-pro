import assert from "node:assert/strict";
import { it } from "node:test";
import { planZenecoAiSample } from "./visibility-ai-sampling-plan";
it("generates stable identities without claiming a provider response",()=>{
 const a=planZenecoAiSample("chatgpt","nb-buy-albir","2026-10-18");
 const b=planZenecoAiSample("chatgpt","nb-buy-albir","2026-10-18");
 const c=planZenecoAiSample("perplexity","nb-buy-albir","2026-10-18");
 assert.equal(a.id,b.id);assert.notEqual(a.id,c.id);
 assert.equal(a.state,"PLANNED_NOT_EXECUTED");
 assert.equal(a.providerResponseReceived,false);
 assert.equal(a.independentlyVerified,false);
});
it("refuses unknown prompts and invalid dates",()=>{
 assert.throws(()=>planZenecoAiSample("chatgpt","unknown","2026-10-18"));
 assert.throws(()=>planZenecoAiSample("chatgpt","nb-buy-albir","not-a-date"));
});