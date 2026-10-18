import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import { findZenecoAiPrompt } from "@/services/agents/visibility-ai-prompt-panel";
import { runOpenAiWebSearchSample } from "@/services/agents/visibility-openai-web-search";

export const dynamic="force-dynamic";
export const maxDuration=90;
const headers={"Cache-Control":"private, no-store"};
const brand="zeneco";
const provider="openai_api_web_search";

function database(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
}
async function isOwner(request:NextRequest){
 const ctx=await getRequestAccessContext(request);
 return ctx?.role==="OWNER"&&ctx.source==="owner-session";
}
function enabled(){
 return process.env.ALTOVENA_OPENAI_SAMPLING_ENABLED==="true" &&
 Boolean(process.env.ALTOVENA_OPENAI_API_KEY?.trim()) &&
 Boolean(process.env.ALTOVENA_OPENAI_MODEL?.trim());
}
function reply(body:unknown,status=200){
 return NextResponse.json(body,{status,headers});
}

/** Owner-only audit surface. Sampling is always disabled until explicitly configured. */
export async function GET(request:NextRequest){
 if(!await isOwner(request))return reply({error:"Owner session required"},403);
 const db=database();
 if(!db)return reply({enabled:false,error:"Database unavailable"},503);
 const {data,error}=await db.from("visibility_ai_provider_sample_runs")
  .select("id,brand_id,provider,sample_day,prompt_id,prompt,locale,status,model,provider_response_id,answer,cited_urls,consulted_urls,brand_mentioned,failure_category,created_at,finished_at")
  .eq("brand_id",brand).order("created_at",{ascending:false}).limit(30);
 if(error)return reply({enabled:enabled(),error:"AI sample evidence unavailable"},503);
 return reply({
  enabled:enabled(),provider,brandId:brand,
  quota:"at_most_one_reservation_per_utc_day",
  automaticSchedulingEnabled:false,
  consumerChatGPTSearchEquivalent:false,
  samples:data||[],
 });
}

/**
 * Deliberate, owner-confirmed sample only. Atomic database uniqueness reserves
 * today's quota before a paid external call. Failed calls still consume quota.
 * Neither the API key nor authenticated request is exposed to the client.
 */
export async function POST(request:NextRequest){
 if(!await isOwner(request))return reply({error:"Owner session required"},403);
 const origin=request.headers.get("origin");
 if(origin!==request.nextUrl.origin || request.headers.get("sec-fetch-site")==="cross-site")
  return reply({error:"Invalid request origin"},403);
 const input=await request.json().catch(()=>null) as {brandId?:unknown;promptId?:unknown;confirmRun?:unknown}|null;
 if(input?.brandId!==brand||input.confirmRun!==true||typeof input.promptId!=="string")
  return reply({error:"An explicit owner-confirmed ZenEco prompt is required"},400);
 const scenario=findZenecoAiPrompt(input.promptId);
 if(!scenario)return reply({error:"Unknown fixed sampling prompt"},400);
 if(!enabled())return reply({enabled:false,error:"OpenAI sampling is disabled"},503);
 const db=database();
 if(!db)return reply({error:"Database unavailable"},503);
 const day=new Date().toISOString().slice(0,10);
 const {data:reservation,error:reserveError}=await db.from("visibility_ai_provider_sample_runs")
  .insert({brand_id:brand,provider,sample_day:day,prompt_id:scenario.id,prompt:scenario.prompt,locale:scenario.locale,status:"RESERVED"})
  .select("id").single();
 if(reserveError){
  if(reserveError.code==="23505")return reply({error:"Daily AI sampling limit already reserved",quota:"one_per_utc_day"},409);
  return reply({error:"Could not reserve AI sampling quota"},503);
 }
 if(!reservation?.id)return reply({error:"AI sampling reservation unavailable"},503);
 try{
  const sample=await runOpenAiWebSearchSample({
   prompt:scenario.prompt,locale:scenario.locale,
   apiKey:process.env.ALTOVENA_OPENAI_API_KEY!,
   model:process.env.ALTOVENA_OPENAI_MODEL!,
  });
  const {error:saveError}=await db.from("visibility_ai_provider_sample_runs")
   .update({status:"COMPLETED",provider_response_id:sample.providerResponseId,
    model:sample.model,answer:sample.answer,cited_urls:sample.citedUrls,
    consulted_urls:sample.consultedUrls,brand_mentioned:sample.brandMentioned,
    finished_at:new Date().toISOString()})
   .eq("id",reservation.id).eq("status","RESERVED");
  if(saveError)return reply({error:"Provider response received but evidence storage failed. The daily quota remains consumed."},503);
  return reply({id:reservation.id,status:"COMPLETED",kind:sample.kind,
   providerResponseId:sample.providerResponseId,model:sample.model,
   citedUrls:sample.citedUrls,consultedUrls:sample.consultedUrls,
   brandMentioned:sample.brandMentioned,
   consumerChatGPTSearchEquivalent:false,automatedPublishingAuthorized:false},201);
 }catch{
  await db.from("visibility_ai_provider_sample_runs")
   .update({status:"FAILED",failure_category:"PROVIDER_ERROR",finished_at:new Date().toISOString()})
   .eq("id",reservation.id).eq("status","RESERVED");
  return reply({error:"Provider sample failed; the daily request quota remains consumed"},502);
 }
}
