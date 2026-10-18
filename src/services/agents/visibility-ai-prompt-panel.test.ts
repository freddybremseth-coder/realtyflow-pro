import assert from "node:assert/strict";
import {it} from "node:test";
import {ZENECO_AI_PROMPT_PANEL,findZenecoAiPrompt} from "./visibility-ai-prompt-panel";
it("uses distinct persistent multilingual prompt IDs and no branded leading questions",()=>{
 assert.equal(new Set(ZENECO_AI_PROMPT_PANEL.map(x=>x.id)).size,ZENECO_AI_PROMPT_PANEL.length);
 assert.ok(ZENECO_AI_PROMPT_PANEL.some(x=>x.locale==="nb-NO"));
 assert.ok(ZENECO_AI_PROMPT_PANEL.some(x=>x.locale==="en-GB"));
 assert.ok(ZENECO_AI_PROMPT_PANEL.some(x=>x.locale==="es-ES"));
 assert.ok(ZENECO_AI_PROMPT_PANEL.every(x=>!x.prompt.toLowerCase().includes("zen eco homes")));
 assert.equal(findZenecoAiPrompt("unknown"),null);
});