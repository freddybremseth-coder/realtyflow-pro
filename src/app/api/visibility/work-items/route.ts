import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import { visibilityWorkDisplayState } from "@/services/agents/visibility-work-queue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function db() {
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 return url && key ? createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}) : null;
}
export async function GET(request: NextRequest) {
 const ctx = await getRequestAccessContext(request);
 if(ctx?.role!=="OWNER" || ctx.source!=="owner-session") return NextResponse.json({error:"Owner session required"},{status:403});
 const client=db(); if(!client) return NextResponse.json({error:"Database unavailable"},{status:503});
 const {data,error}=await client.from("work_items")
  .select("id,title,brand_id,status,source_id,updated_at,assigned_agent,metadata,next_action")
  .eq("source_type","ai_agent").like("source_id","visibility:%")
  .order("updated_at",{ascending:false}).limit(150);
 if(error) return NextResponse.json({error:"Work queue unavailable"},{status:503});
 // Evidence is stored in separate service-only audit logs, not in editable
 // work-item metadata. A probe result is a fresh observation, NEVER proof of
 // a repaired website, an approval to publish, or a closed task.
 const {data:logs,error:logError}=await client.from("automation_logs")
  .select("created_at,details").eq("action","visibility_independent_investigation")
  .order("created_at",{ascending:false}).limit(200);
 if(logError) return NextResponse.json({error:"Investigation evidence unavailable"},{status:503});
 const latest=new Map<string, {result:string;checked_at:string;evidence:unknown;issue_code:string}>();
 for(const log of logs||[]){
  const d=log.details;
  if(typeof d?.work_item_id!=="string" || latest.has(d.work_item_id) ||
    d.read_only!==true || d.publication_authorized!==false) continue;
  latest.set(d.work_item_id,{result:d.result,checked_at:d.checked_at,
    evidence:d.evidence,issue_code:d.issue_code});
 }
 return NextResponse.json({work_items:(data||[]).filter(x=>x.metadata?.product==="altovena_visibility").map(x=>({
  ...x,visibility_state:visibilityWorkDisplayState(x.status,x.metadata),
  investigation:latest.get(x.id)??null,
 }))},{headers:{"Cache-Control":"private, no-store"}});
}
