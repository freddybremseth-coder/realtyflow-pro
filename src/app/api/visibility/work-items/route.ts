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
 return NextResponse.json({work_items:(data||[]).filter(x=>x.metadata?.product==="altovena_visibility").map(x=>({
  ...x,visibility_state:visibilityWorkDisplayState(x.status,x.metadata),
 }))},{headers:{"Cache-Control":"no-store"}});
}
