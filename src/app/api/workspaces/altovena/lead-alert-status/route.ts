import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

// Read-only, brand-scoped scheduler heartbeat; never returns recipients or CRM data.
export const dynamic="force-dynamic";
export const revalidate=0;
const noStore={"Cache-Control":"private, no-store"};
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:noStore});

export async function GET(request:NextRequest){
  const access=await requireBrandWorkspace(request,"altovena","crm.read");
  if(!access.value)return access.response;

  const configured=process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED==="true";
  if(!configured)return reply({
    ok:true,brand:"altovena",state:"disabled",lastScanAt:null,
    pending:0,deliveryEnabled:false,
  });
  const {data,error}=await access.value.supabase
    .from("altovena_alert_scan_state")
    .select("brand_key,last_scan_at,pending_count")
    .eq("brand_key","altovena")
    .maybeSingle();
  if(error)return reply({ok:false,error:{code:"ALERT_STATUS_UNAVAILABLE"}},503);
  if(!data)return reply({
    ok:true,brand:"altovena",state:"no_scan",lastScanAt:null,
    pending:null,deliveryEnabled:false,
  });
  const parsed=Date.parse(String(data.last_scan_at||""));
  if(data.brand_key!=="altovena" || !Number.isFinite(parsed) ||
    !Number.isSafeInteger(data.pending_count) || data.pending_count<0)
    return reply({ok:false,error:{code:"INVALID_ALERT_STATUS"}},503);

  const age=Date.now()-parsed;
  const state=age>=0 && age<=45*60_000?"recent":"stale";
  return reply({ok:true,brand:"altovena",state,
    lastScanAt:new Date(parsed).toISOString(),pending:data.pending_count,
    deliveryEnabled:false});
}
