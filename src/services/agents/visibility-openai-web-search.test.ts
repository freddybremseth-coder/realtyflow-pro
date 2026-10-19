import assert from "node:assert/strict";
import {it} from "node:test";
import {runOpenAiWebSearchSample} from "./visibility-openai-web-search";

const base={prompt:"What should I consider buying in Albir?",locale:"en-GB",
  apiKey:"only-a-test-value",model:"test-model"};
const sampleResponse={
 id:"resp_mock_1",status:"completed",model:"test-model",
 output:[
  {type:"web_search_call",action:{type:"search",sources:[
   {type:"url",url:"https://other.example.com/report"},
   {type:"url",url:"https://zenecohomes.com/guide/test"}]}},
  {type:"message",content:[{type:"output_text",text:"Zen Eco Homes has a useful buyer guide.",
   annotations:[{type:"url_citation",url:"https://zenecohomes.com/guide/test"},
                {type:"url_citation",url:"https://zenecohomes.com/guide/test"}]}]},
 ],
};
it("distinguishes cited response URLs from wider consulted source URLs",async()=>{
 let calls=0;
 const fetcher=(async (url:unknown,init?:RequestInit)=>{
  calls++;
  assert.equal(url,"https://api.openai.com/v1/responses");
  const payload=JSON.parse(String(init?.body));
  assert.equal(payload.store,false);
  assert.deepEqual(payload.tools,[{type:"web_search",search_context_size:"low"}]);
  assert.deepEqual(payload.include,["web_search_call.action.sources"]);
  assert.equal(payload.tool_choice,"required");
  return new Response(JSON.stringify(sampleResponse),{status:200});
 }) as typeof fetch;
 const result=await runOpenAiWebSearchSample({...base,fetcher});
 assert.equal(calls,1);
 assert.equal(result.kind,"OPENAI_API_WEB_SEARCH_SAMPLE");
 assert.equal(result.searchPerformed,true);
 assert.equal(result.representsConsumerChatGPTSearch,false);
 assert.equal(result.brandMentioned,true);
 assert.deepEqual(result.citedUrls,["https://zenecohomes.com/guide/test"]);
 assert.deepEqual(result.consultedUrls,["https://other.example.com/report","https://zenecohomes.com/guide/test"]);
});
it("rejects generic model completion without evidence of a web search",async()=>{
 const mock=(async()=>new Response(JSON.stringify({
  id:"resp_mock_2",status:"completed",output:[{type:"message",content:[
   {type:"output_text",text:"Zen Eco Homes is great",annotations:[]}]}],
 }),{status:200})) as typeof fetch;
 await assert.rejects(()=>runOpenAiWebSearchSample({...base,fetcher:mock}),/without a web search/);
});
it("does not promote consulted pages to citations",async()=>{
 const response={...sampleResponse,output:[
  sampleResponse.output[0],
  {type:"message",content:[{type:"output_text",text:"General advice only",annotations:[]}]},
 ]};
 const mock=(async()=>new Response(JSON.stringify(response),{status:200})) as typeof fetch;
 const result=await runOpenAiWebSearchSample({...base,fetcher:mock});
 assert.deepEqual(result.citedUrls,[]);
 assert.equal(result.brandMentioned,false);
 assert.ok(result.consultedUrls.length>0);
});
