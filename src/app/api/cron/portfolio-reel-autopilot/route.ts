export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import {
  autopilotTargetHours,
  dueAutopilotTargetHour,
  localAutopilotSlot,
  parseLearnedAutopilotHour,
} from "@/lib/marketing/autopilot-safety";
import { channelLearningScope } from "@/lib/marketing/learning-scope";
import { recommendForGeneration } from "@/services/marketing/learning-adapter";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import {
  AUTONOMOUS_REEL_BRANDS,
  createAutonomousPortfolioReel,
} from "@/services/pipelines/remaster-portfolio-reel-autopilot";

const PATH="/api/cron/portfolio-reel-autopilot";

async function recentAutonomousJob(db:any,reelBrand:string){
  const since=new Date(Date.now()-11.5*60*60*1000).toISOString();
  const {data,error}=await db.from("remaster_reel_jobs")
    .select("id,state,created_at")
    .eq("brand",reelBrand)
    .contains("selection",{autopilot:true})
    .gte("created_at",since)
    .order("created_at",{ascending:false})
    .limit(1);
  if(error) throw new Error("REEL_AUTOPILOT_RECENT_CHECK_FAILED: "+error.message);
  return data?.[0]||null;
}

async function log(db:any,status:string,details:Record<string,unknown>){
  try{
    await db.from("automation_logs").insert({
      action:"portfolio_reel_autopilot",
      agent_name:"nexus_portfolio_reel_autopilot",
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
  const considered:Array<Record<string,unknown>>=[];

  for(const definition of AUTONOMOUS_REEL_BRANDS){
    const recommendation=await recommendForGeneration(db as any,{
      scope:channelLearningScope(definition.growthBrandId,"instagram"),
    }).catch(()=>undefined);
    const learnedHour=parseLearnedAutopilotHour(recommendation?.favor?.publishHour?.value);
    const targetHours=autopilotTargetHours(definition.growthBrandId,learnedHour);
    const targetHour=dueAutopilotTargetHour(localHour,targetHours);
    if(targetHour==null){
      considered.push({
        brandId:definition.growthBrandId,reelBrand:definition.reelBrand,
        skipped:true,reason:"12h_slot_not_due",localHour,targetHours,
      });
      continue;
    }
    if(targetHour!==targetHours[1]){
      considered.push({
        brandId:definition.growthBrandId,reelBrand:definition.reelBrand,
        skipped:true,reason:"marketing_post_slot_reserved",localHour,targetHours,
      });
      continue;
    }

    const recent=await recentAutonomousJob(db,definition.reelBrand);
    if(recent){
      considered.push({
        brandId:definition.growthBrandId,reelBrand:definition.reelBrand,
        skipped:true,reason:"recent_autonomous_reel_exists",recentId:recent.id,
        recentState:recent.state,targetHours,
      });
      continue;
    }

    const slotKey=`${localDate}:h${String(targetHour).padStart(2,"0")}`;
    try{
      const result=await createAutonomousPortfolioReel(db as any,definition,slotKey);
      const details={
        brandId:definition.growthBrandId,
        reelBrand:definition.reelBrand,
        localHour,targetHours,slotKey,
        result:result.skipped?result:{skipped:false,reelId:result.reel.id,destinations:result.destinations,signals:result.signals},
      };
      await log(db,result.skipped?"partial":"success",details);
      return NextResponse.json({
        success:true,
        processed:result.skipped?0:1,
        timeZone,
        ...details,
        considered,
      });
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      // Unique-slot conflicts are safe scheduler races: another invocation won.
      if(/remaster_reel_autopilot_slot_unique_idx|duplicate key|23505/i.test(message)){
        await log(db,"success",{brandId:definition.growthBrandId,reelBrand:definition.reelBrand,slotKey,raceWonByOtherInvocation:true});
        return NextResponse.json({success:true,processed:0,skipped:true,reason:"slot_already_claimed",brandId:definition.growthBrandId,slotKey});
      }
      await log(db,"error",{brandId:definition.growthBrandId,reelBrand:definition.reelBrand,slotKey,error:message.slice(0,700)});
      return NextResponse.json({success:false,brandId:definition.growthBrandId,reelBrand:definition.reelBrand,slotKey,error:message},{status:500});
    }
  }

  await log(db,"success",{processed:0,localHour,timeZone,considered});
  return NextResponse.json({success:true,processed:0,localHour,timeZone,considered});
}
