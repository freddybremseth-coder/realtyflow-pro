import { NextRequest,NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import { assessAiVisibilityObservation, type AiVisibilityObservation } from "@/services/agents/visibility-ai-observation";
export const dynamic="force-dynamic";
function database(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;}
async function owner(request:NextRequest){const ctx=await getRequestAccessContext(request);return ctx?.role==="OWNER"&&ctx.source==="owner-session";}
export async function GET(request:NextRequest){
 if(!await owner(request))return NextResponse.json({error:"Owner session required"},{status:403});
 const db=database();if(!db)return NextResponse.json({error:"Database unavailable"},{status:503});
 const {data,error}=await db.from("visibility_ai_observations").select("id,brand_id,provider,prompt,locale,observed_at,response_excerpt,cited_urls,brand_mentioned,captured_by,evidence_state,verification_state")
  .eq("brand_id","zeneco").order("observed_at",{ascending:false}).limit(100);
 if(error)return NextResponse.json({error:["42P01","PGRST205"].includes(error.code||"")?"AI observation storage is not installed":"Observations unavailable",code:["42P01","PGRST205"].includes(error.code||"")?"STORAGE_NOT_INSTALLED":"OBSERVATIONS_UNAVAILABLE"},{status:503});
 return NextResponse.json({observations:data||[],source:"stored_manual_observations_unverified",automatedCollectionConnected:false},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:NextRequest){
 if(!await owner(request))return NextResponse.json({error:"Owner session required"},{status:403});
 const origin=request.headers.get("origin");
 if((origin&&origin!==request.nextUrl.origin)||request.headers.get("sec-fetch-site")==="cross-site")return NextResponse.json({error:"Invalid origin"},{status:403});
 const input=await request.json().catch(()=>null) as (Partial<AiVisibilityObservation>&{brandId?:unknown})|null;
 if(input?.brandId!=="zeneco"||!["chatgpt","perplexity","google_ai","copilot"].includes(String(input.provider))||
 typeof input.prompt!=="string"||input.prompt.length>2000||typeof input.locale!=="string"||input.locale.length>40||
 typeof input.responseExcerpt!=="string"||input.responseExcerpt.length>4000||typeof input.observedAt!=="string"||
 !Array.isArray(input.citedUrls)||input.citedUrls.length>20||input.citedUrls.some(u=>typeof u!=="string"||u.length>2048)||
 typeof input.brandMentioned!=="boolean"||input.capturedBy!=="manual"||
 !Number.isFinite(Date.parse(input.observedAt))||Date.parse(input.observedAt)>Date.now()||
 Date.parse(input.observedAt)<Date.now()-366*86400000)
 return NextResponse.json({error:"Invalid observation"},{status:400});
 const observation=input as AiVisibilityObservation;
 const assessment=assessAiVisibilityObservation(observation,"zenecohomes.com");
 if(assessment.state==="INVALID_EVIDENCE")return NextResponse.json({error:"Invalid evidence"},{status:400});
 const db=database();if(!db)return NextResponse.json({error:"Database unavailable"},{status:503});
 const {data,error}=await db.from("visibility_ai_observations").insert({
 brand_id:"zeneco",provider:observation.provider,prompt:observation.prompt,locale:observation.locale,observed_at:observation.observedAt,
 response_excerpt:observation.responseExcerpt,cited_urls:observation.citedUrls,brand_mentioned:observation.brandMentioned,captured_by:"manual",evidence_state:assessment.state,verification_state:"UNVERIFIED",
 }).select("id").single();
 if(error||!data)return NextResponse.json({error:"Observation not stored"},{status:503});
 return NextResponse.json({id:data.id,state:assessment.state,verification_state:"UNVERIFIED",automatedCollectionConnected:false},{status:201,headers:{"Cache-Control":"private, no-store"}});
}
