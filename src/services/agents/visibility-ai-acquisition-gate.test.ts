import assert from "node:assert/strict";
import {it} from "node:test";
import {assessAiAcquisition} from "./visibility-ai-acquisition-gate";
it("never represents a generic Nexus answer as a search observation",()=>{
 assert.equal(assessAiAcquisition("nexus_text_generation",true).recordable,false);
 assert.equal(assessAiAcquisition("provider_search_api",false).recordable,false);
 assert.equal(assessAiAcquisition("provider_search_api",true).recordable,false);
});
it("keeps manually captured observations unverified",()=>{
 const result=assessAiAcquisition("manual_report",false);
 assert.equal(result.recordable,true);
 assert.equal(result.independentlyVerified,false);
});