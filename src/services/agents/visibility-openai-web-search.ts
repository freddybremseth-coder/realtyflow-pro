/**
 * OpenAI Responses API web_search sample.
 * This measures a single API-based search response, NOT ChatGPT consumer search rankings.
 * No Nexus fallback and no implicit database writes.
 * https://developers.openai.com/api/docs/guides/tools-web-search
 */
export type OpenAiWebSearchSample = {
  kind: "OPENAI_API_WEB_SEARCH_SAMPLE";
  providerResponseId: string;
  model: string;
  prompt: string;
  locale: string;
  answer: string;
  citedUrls: string[];
  consultedUrls: string[];
  brandMentioned: boolean;
  observedAt: string;
  searchPerformed: true;
  representsConsumerChatGPTSearch: false;
};
type SampleInput = {
  prompt: string;
  locale: string;
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
};
function uniqueHttpsUrls(values:unknown[]):string[]{
  const found=new Set<string>();
  for(const raw of values){
    if(typeof raw!=="string")continue;
    try{
      const url=new URL(raw);
      if(url.protocol!=="https:"||url.username||url.password)continue;
      found.add(url.toString());
    }catch{ /* malformed source is not a citation */ }
  }
  return [...found].slice(0,50);
}
export async function runOpenAiWebSearchSample(input:SampleInput):Promise<OpenAiWebSearchSample>{
  if(!input.prompt.trim()||input.prompt.length>2000||!input.locale.trim()||input.locale.length>40||
     !input.apiKey.trim()||!input.model.trim())throw new Error("Invalid AI web search request");
  const fetcher=input.fetcher??fetch;
  const response=await fetcher("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"authorization":"Bearer "+input.apiKey,"content-type":"application/json"},
    signal:AbortSignal.timeout(60000),
    body:JSON.stringify({
      model:input.model,
      input:input.prompt,
      instructions:"Answer the user's question directly in the language provided by the prompt. Search the open web; do not preferentially mention any real estate agency or brand. Cite relevant evidence.",
      tools:[{type:"web_search",search_context_size:"low"}],
      tool_choice:"required",
      include:["web_search_call.action.sources"],
      store:false,
      max_output_tokens:1200,
    }),
  });
  if(!response.ok)throw new Error("AI web search request failed: HTTP "+response.status);
  const result=await response.json() as Record<string,any>;
  if(result.status!=="completed"||typeof result.id!=="string"||
     !Array.isArray(result.output))throw new Error("AI web search response incomplete or malformed");
  const searchCalls=result.output.filter((item:any)=>item?.type==="web_search_call");
  if(searchCalls.length===0)throw new Error("Provider returned an answer without a web search call");
  const textParts:string[]=[];
  const cited:unknown[]=[];
  for(const item of result.output){
    if(item?.type!=="message"||!Array.isArray(item.content))continue;
    for(const part of item.content){
      if(part?.type!=="output_text"||typeof part.text!=="string")continue;
      textParts.push(part.text);
      for(const note of Array.isArray(part.annotations)?part.annotations:[]){
        if(note?.type==="url_citation")cited.push(note.url);
      }
    }
  }
  const answer=textParts.join("\n").trim();
  if(!answer)throw new Error("AI web search did not return answer text");
  const consulted:unknown[]=[];
  for(const call of searchCalls){
    for(const source of Array.isArray(call.action?.sources)?call.action.sources:[]){
      if(source?.type==="url")consulted.push(source.url);
    }
  }
  return {
    kind:"OPENAI_API_WEB_SEARCH_SAMPLE",
    providerResponseId:result.id,
    model:String(result.model||input.model),
    prompt:input.prompt,
    locale:input.locale,
    answer:answer.slice(0,12000),
    citedUrls:uniqueHttpsUrls(cited),
    consultedUrls:uniqueHttpsUrls(consulted),
    brandMentioned:/\bzen\s*eco\s*homes\b/i.test(answer),
    observedAt:new Date().toISOString(),
    searchPerformed:true,
    representsConsumerChatGPTSearch:false,
  };
}
