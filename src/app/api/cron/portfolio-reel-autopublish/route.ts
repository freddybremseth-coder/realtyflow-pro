export const dynamic="force-dynamic";
export const maxDuration=300;

import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import {
  publishAutonomousPortfolioReel,
  type AutoReelChannel,
  type AutonomousReelJob,
} from "@/services/pipelines/remaster-portfolio-reel-autopublish";

const PATH="/api/cron/portfolio-reel-autopublish";
const CHANNEL_ORDER:AutoReelChannel[]=["instagram","facebook","youtube"];

function snapshotChannels(job:AutonomousReelJob):AutoReelChannel[]{
  const rows=Array.isArray(job.selection?.destinations)
    ? job.selection!.destinations as Array<Record<string,unknown>>
    : [];
  const set=new Set(rows.map(item=>String(item.platform||""))
    .filter((value):value is AutoReelChannel=>CHANNEL_ORDER.includes(value as AutoReelChannel)));
  return CHANNEL_ORDER.filter(channel=>set.has(channel));
}

async function log(db:any,status:string,details:Record<string,unknown>){
  try{
    await db.from("automation_logs").insert({
      action:"portfolio_reel_autopublish",
      agent_name:"nexus_portfolio_reel_autopublish",
      status,details,
    });
  }catch{}
}

async function finalizeIfComplete(db:any,job:AutonomousReelJob,channels:AutoReelChannel[]){
  const {data,error}=await db.from("remaster_reel_deliveries")
    .select("channel,state,external_id,external_url,error")
    .eq("reel_id",job.id);
  if(error)throw new Error("REEL_DELIVERY_FINALIZE_READ_FAILED: "+error.message);
  const byChannel=new Map((data||[]).map((row:any)=>[String(row.channel),row]));
  if(!channels.every(channel=>byChannel.has(channel)))return {complete:false,deliveries:data||[]};
  const rows=channels.map(channel=>byChannel.get(channel));
  const hasReview=rows.some((row:any)=>row?.state==="needs_review");
  const allPublished=rows.every((row:any)=>row?.state==="published");
  const state=allPublished?"published":hasReview?"needs_review":"ready";
  if(state!=="ready"){
    const {error:updateError}=await db.from("remaster_reel_jobs").update({
      state,
      error:hasReview?"One or more autonomous channel deliveries need review.":null,
      updated_at:new Date().toISOString(),
    }).eq("id",job.id).eq("state","ready");
    if(updateError)throw new Error("REEL_JOB_FINALIZE_FAILED: "+updateError.message);
  }
  return {complete:state!=="ready",state,deliveries:rows};
}

export async function GET(request:NextRequest){
  const unauthorized=await requireNexusSchedulerApi(request);
  if(unauthorized)return unauthorized;
  const safe=await evaluateCronSafeMode(PATH);
  if(safe.skip)return NextResponse.json({success:true,skipped:true,reason:safe.reason,mode:safe.mode});

  const db=getServiceSupabase();
  if(!db)return NextResponse.json({error:"Supabase not configured"},{status:503});
  const {data:jobs,error:jobsError}=await db.from("remaster_reel_jobs")
    .select("id,brand,title,state,video_path,caption,channels,selection,created_at")
    .eq("state","ready")
    .contains("selection",{autopilot:true})
    .order("created_at",{ascending:true})
    .limit(30);
  if(jobsError)return NextResponse.json({error:jobsError.message},{status:500});

  for(const raw of jobs||[]){
    const job=raw as AutonomousReelJob;
    // This is a second hard boundary in addition to producer types and channel
    // bindings. The Freddy Bremseth umbrella is never an autonomous destination.
    if(String(job.brand)==="freddybremseth"){
      await db.from("remaster_reel_jobs").update({
        state:"needs_review",
        error:"FREDDY_PERSONAL_AUTOPILOT_FORBIDDEN",
        updated_at:new Date().toISOString(),
      }).eq("id",job.id).eq("state","ready");
      continue;
    }
    const channels=snapshotChannels(job);
    if(!channels.length){
      await db.from("remaster_reel_jobs").update({
        state:"needs_review",
        error:"NO_VERIFIED_AUTONOMOUS_DESTINATIONS",
        updated_at:new Date().toISOString(),
      }).eq("id",job.id).eq("state","ready");
      continue;
    }

    const {data:deliveries,error:deliveryError}=await db.from("remaster_reel_deliveries")
      .select("channel,state").eq("reel_id",job.id);
    if(deliveryError)return NextResponse.json({error:deliveryError.message},{status:500});
    const reserved=new Set((deliveries||[]).map((row:any)=>String(row.channel)));
    const next=channels.find(channel=>!reserved.has(channel));
    if(!next){
      const final=await finalizeIfComplete(db,job,channels);
      await log(db,"success",{jobId:job.id,brand:job.brand,final});
      if(final.complete)return NextResponse.json({success:true,processed:0,jobId:job.id,finalized:final});
      continue;
    }

    if((next==="instagram"||next==="facebook")&&process.env.MARKETING_META_LIVE!=="true"){
      await log(db,"partial",{jobId:job.id,brand:job.brand,channel:next,skipped:true,reason:"MARKETING_META_LIVE_NOT_ENABLED"});
      return NextResponse.json({success:true,processed:0,skipped:true,reason:"MARKETING_META_LIVE_NOT_ENABLED",jobId:job.id,channel:next});
    }

    const result=await publishAutonomousPortfolioReel(db as any,job,next);
    if(!result.success&&result.permanent){
      await db.from("remaster_reel_jobs").update({
        state:"needs_review",
        error:String(result.reason||"AUTONOMOUS_REEL_PUBLISH_BLOCKED").slice(0,700),
        updated_at:new Date().toISOString(),
      }).eq("id",job.id).eq("state","ready");
      await log(db,"partial",{jobId:job.id,brand:job.brand,channel:next,result});
      return NextResponse.json({success:true,processed:0,jobId:job.id,channel:next,result,needsReview:true});
    }

    const final=await finalizeIfComplete(db,job,channels);
    await log(db,result.success?"success":"partial",{jobId:job.id,brand:job.brand,channel:next,result,final});
    return NextResponse.json({success:result.success,processed:result.success?1:0,jobId:job.id,brand:job.brand,channel:next,result,final});
  }

  await log(db,"success",{processed:0,reason:"no_ready_autonomous_reels"});
  return NextResponse.json({success:true,processed:0,reason:"no_ready_autonomous_reels"});
}
