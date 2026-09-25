export const dynamic="force-dynamic";
export const maxDuration=120;

import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { localAutopilotSlot } from "@/lib/marketing/autopilot-safety";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { queueAdaptiveYouTubeMix } from "@/services/pipelines/remaster-mix-autopilot";

const PATH="/api/cron/remaster-mix-autopilot";
const MIX_HOURS=new Set([10,22]);

async function log(db:any,status:string,details:Record<string,unknown>){
  try{
    await db.from("automation_logs").insert({
      action:"remaster_mix_autopilot",
      agent_name:"nexus_remaster_mix_autopilot",
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
  if(!MIX_HOURS.has(localHour))
    return NextResponse.json({success:true,skipped:true,reason:"12h_mix_slot_not_due",localHour,timeZone});

  const slotKey=`${localDate}:h${String(localHour).padStart(2,"0")}`;
  const {data:existingSlot,error:slotError}=await db.from("remaster_mix_jobs")
    .select("id,status,youtube_url")
    .eq("source","growth-autopilot")
    .contains("input_snapshot",{autopilot:true,autopilotSlotKey:slotKey})
    .limit(1).maybeSingle();
  if(slotError)return NextResponse.json({error:slotError.message},{status:500});
  if(existingSlot)
    return NextResponse.json({success:true,skipped:true,reason:"mix_slot_already_exists",slotKey,mix:existingSlot});

  // Never pile a second long render/upload behind an unfinished autonomous mix.
  const {data:active,error:activeError}=await db.from("remaster_mix_jobs")
    .select("id,status,pipeline_step,created_at")
    .eq("source","growth-autopilot")
    .in("status",["queued","running"])
    .order("created_at",{ascending:true}).limit(1).maybeSingle();
  if(activeError)return NextResponse.json({error:activeError.message},{status:500});
  if(active){
    await log(db,"partial",{slotKey,skipped:true,reason:"previous_autonomous_mix_still_active",active});
    return NextResponse.json({success:true,skipped:true,reason:"previous_autonomous_mix_still_active",slotKey,active});
  }

  try{
    const queued=await queueAdaptiveYouTubeMix(db as any,slotKey);
    await log(db,"success",{
      slotKey,mixId:queued.job.id,
      promotionBrand:queued.promotionBrand,
      growthBrandId:queued.growthBrandId,
      exploratory:queued.exploratory,
      targetMinutes:queued.targetMinutes,
      style:queued.style,
      learning:queued.learning,
    });
    return NextResponse.json({
      success:true,queued:true,slotKey,mixId:queued.job.id,
      promotionBrand:queued.promotionBrand,
      growthBrandId:queued.growthBrandId,
      exploratory:queued.exploratory,
      targetMinutes:queued.targetMinutes,
      style:queued.style,
    });
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(/remaster_mix_growth_autopilot_slot_unique_idx|duplicate key|23505/i.test(message))
      return NextResponse.json({success:true,skipped:true,reason:"mix_slot_claimed_by_other_invocation",slotKey});
    await log(db,"error",{slotKey,error:message.slice(0,1000)});
    return NextResponse.json({success:false,slotKey,error:message},{status:500});
  }
}
