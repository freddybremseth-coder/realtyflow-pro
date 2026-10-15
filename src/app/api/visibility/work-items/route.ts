import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { VISIBILITY_BRANDS, type VisibilityFinding } from "@/lib/visibility-product";
import { planVisibilityWorkItem, visibilityWorkDisplayState } from "@/services/agents/visibility-work-queue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function db() {
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 return url && key ? createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}) : null;
}
export async function GET(request: NextRequest) {
 const denied = await requireAdminApi(request); if(denied) return denied;
 const client=db(); if(!client) return NextResponse.json({error:"Database unavailable"},{status:503});
 const {data,error}=await client.from("work_items")
  .select("id,title,brand_id,status,source_id,updated_at,assigned_agent,metadata,next_action")
  .eq("source_type","ai_agent").like("source_id","visibility:%")
  .order("updated_at",{ascending:false}).limit(150);
 if(error) return NextResponse.json({error:"Work queue unavailable"},{status:503});
 return NextResponse.json({work_items:(data||[]).filter(x=>x.metadata?.product==="altovena_visibility").map(x=>({
  ...x,visibility_state:visibilityWorkDisplayState(x.status,x.metadata),
 }))},{headers:{"Cache-Control":"no-store"}});
}
/**
 * Manually register a finding as a REVIEW PROPOSAL only, never a command.
 * Real source verification and autonomous execution are separate milestones.
 */
export async function POST(request: NextRequest) {
 const denied = await requireAdminApi(request); if(denied) return denied;
 const client=db(); if(!client) return NextResponse.json({error:"Database unavailable"},{status:503});
 const body=await request.json().catch(()=>null);
 if(!body || typeof body!=="object" || !body.finding)
   return NextResponse.json({error:"finding required"},{status:400});
 const f=body.finding as Partial<VisibilityFinding>;
 if(typeof f.id!=="string" || typeof f.brandId!=="string" || !Object.hasOwn(VISIBILITY_BRANDS,f.brandId)
 || typeof f.title!=="string" || typeof f.detail!=="string" || typeof f.nextStep!=="string"
 || !["high","medium","unknown"].includes(String(f.priority))
 || !["technical","publishing","missing-data"].includes(String(f.category))
 || !["RECENT","AGED","UNKNOWN"].includes(String(f.evidenceAge))
 || !(f.url===null || (typeof f.url==="string" && f.url.startsWith("https://")))
 || !(f.updatedAt===null || (typeof f.updatedAt==="string" && Number.isFinite(Date.parse(f.updatedAt)))))
 return NextResponse.json({error:"Invalid finding"},{status:400});
 let plan;
 try { plan=planVisibilityWorkItem(f as VisibilityFinding); }
 catch {return NextResponse.json({error:"Invalid finding identity"},{status:400});}
 const {data,error}=await client.rpc("enqueue_visibility_review",{
  p_brand_id:plan.brand_id,p_finding_id:plan.metadata.finding_id,
  p_title:plan.title,p_description:plan.description,p_next_action:plan.next_action,
  p_priority:plan.priority,p_evidence_at:plan.metadata.evidence_at,
  p_evidence_age:plan.metadata.evidence_age,p_category:plan.metadata.category,
  p_target_url:plan.metadata.target_url
 });
 if(error) return NextResponse.json({error:"Could not save review proposal; check migration"},{status:503});
 return NextResponse.json({id:data,state:"PROPOSED",source_verified:false,publishing_authorized:false},
  {status:201,headers:{"Cache-Control":"no-store"}});
}
