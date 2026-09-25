export const dynamic="force-dynamic";
export const maxDuration=120;

import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { localAutopilotSlot } from "@/lib/marketing/autopilot-safety";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { publishFreddyWebsiteArticle } from "@/services/marketing/freddy-website-autopilot";

const PATH="/api/cron/freddy-website-autopilot";
const TARGET_HOUR=9;

async function log(db:any,status:string,details:Record<string,unknown>){
  try{
    await db.from("automation_logs").insert({
      action:"freddy_website_autopilot",
      agent_name:"nexus_freddy_website_autopilot",
      status,details,
    });
  }catch{}
}

export async function GET(request:NextRequest){
  const unauthorized=await requireNexusSchedulerApi(request);
  if(unauthorized)return unauthorized;
  const safe=await evaluateCronSafeMode(PATH);
  if(safe.skip)return NextResponse.json({success:true,skipped:true,reason:safe.reason,mode:safe.mode});

  const db=getServiceSupabase();
  if(!db)return NextResponse.json({error:"Supabase not configured"},{status:503});
  const timeZone=process.env.MARKETING_LEARNING_TIMEZONE||"Europe/Madrid";
  const {hour:localHour,localDate}=localAutopilotSlot(new Date(),timeZone);
  if(localHour!==TARGET_HOUR)
    return NextResponse.json({success:true,skipped:true,reason:"daily_website_slot_not_due",localHour,targetHour:TARGET_HOUR,timeZone});

  const {data:plan,error:planError}=await db.from("marketing_brand_growth_plans")
    .select("brand_id,website,status,autonomy_mode,metadata")
    .eq("brand_id","freddyb").maybeSingle();
  if(planError)return NextResponse.json({error:planError.message},{status:500});
  const website=String(plan?.website||"").replace(/\/$/,"");
  if(plan?.status!=="active"||plan?.autonomy_mode!=="controlled_auto"||
     !["https://freddybremseth.com","https://www.freddybremseth.com"].includes(website)){
    const details={localDate,skipped:true,reason:"freddy_website_autopilot_not_authorized",
      status:plan?.status||null,autonomyMode:plan?.autonomy_mode||null,website};
    await log(db,"partial",details);
    return NextResponse.json({success:true,...details});
  }

  try{
    const result=await publishFreddyWebsiteArticle(db as any,localDate);
    await log(db,result.skipped?"partial":"success",{localDate,localHour,timeZone,result});
    return NextResponse.json({success:true,localDate,localHour,timeZone,...result});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    await log(db,"error",{localDate,localHour,timeZone,error:message.slice(0,1000)});
    return NextResponse.json({success:false,error:message,localDate},{status:500});
  }
}
