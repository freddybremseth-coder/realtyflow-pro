import assert from "node:assert/strict";
import { it } from "node:test";
import { assessAiVisibilityObservation, type AiVisibilityObservation } from "./visibility-ai-observation";
const sample:AiVisibilityObservation={provider:"chatgpt",prompt:"Hvor kjøper man bolig i Albir?",locale:"nb-NO",observedAt:"2026-10-18T12:00:00Z",responseExcerpt:"Forslag til guider",citedUrls:[],brandMentioned:false,capturedBy:"manual"};
it("separates brand mention from verified source citation",()=>{
 assert.equal(assessAiVisibilityObservation({...sample,brandMentioned:true},"zenecohomes.com").state,"MENTIONED_NOT_CITED");
 const result=assessAiVisibilityObservation({...sample,citedUrls:["https://www.zenecohomes.com/guide/test"]},"zenecohomes.com");
 assert.equal(result.state,"CITED");
 assert.equal(result.isPopulationEstimate,false);
});
it("does not count unrelated domains or unverified evidence as citations",()=>{
 assert.equal(assessAiVisibilityObservation({...sample,citedUrls:["https://other.com/article"]},"zenecohomes.com").state,"NOT_OBSERVED");
 assert.equal(assessAiVisibilityObservation({...sample,prompt:""},"zenecohomes.com").state,"INVALID_EVIDENCE");
});

it("rejects unsafe, oversized and malformed citation inputs without trusting the caller",()=>{
 assert.equal(assessAiVisibilityObservation({...sample,citedUrls:["http://zenecohomes.com/test"]},"zenecohomes.com").state,"INVALID_EVIDENCE");
 assert.equal(assessAiVisibilityObservation({...sample,citedUrls:["https://zenecohomes.com.evil.test/test"]},"zenecohomes.com").state,"NOT_OBSERVED");
 assert.equal(assessAiVisibilityObservation({...sample,citedUrls:Array(21).fill("https://zenecohomes.com/")},"zenecohomes.com").state,"INVALID_EVIDENCE");
});
