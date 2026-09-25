export const dynamic="force-dynamic";
export const maxDuration=180;

import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { summarizeRemasterAnalytics } from "@/services/growth/remaster-analytics-observation";
import { readBrandYouTubeAnalytics } from "@/services/integrations/remaster-youtube-analytics";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

const PATH="/api/cron/youtube-brand-analytics-snapshot";
const METRIC_WINDOW="28d";
const SOURCE="youtube_analytics_v2";
const BRANDS=[
  "zeneco","pinosoecolife","donaanna","freddyart",
  "freddypublishing","chatgenius","freddyai",
] as const;

function utcDayStart(date=new Date()){
  return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())).toISOString();
}

export async function GET(request:NextRequest){
  const unauthorized=await requireNexusSchedulerApi(request);
  if(unauthorized)return unauthorized;
  const safe=await evaluateCronSafeMode(PATH);
  if(safe.skip)return NextResponse.json({success:true,skipped:true,reason:safe.reason,mode:safe.mode});

  const db=getServiceSupabase();
  if(!db)return NextResponse.json({error:"Supabase not configured"},{status:503});
  const results:Array<Record<string,unknown>>=[];
  const dayStart=utcDayStart();

  for(const brandId of BRANDS){
    const analytics=await readBrandYouTubeAnalytics(brandId,28);
    if(analytics.state!=="READY"){
      results.push({
        brandId,state:analytics.state,analyticsReady:analytics.analyticsReady,
        skipped:true,error:analytics.error||null,reconnectHref:analytics.reconnectHref,
      });
      continue;
    }

    const {data:existing,error:existingError}=await db.from("engagement_snapshots")
      .select("post_id,raw_data").eq("platform","youtube").eq("metric_window",METRIC_WINDOW)
      .gte("snapshot_at",dayStart);
    if(existingError){
      results.push({brandId,state:"ERROR",error:existingError.message});
      continue;
    }
    const existingIds=new Set((existing||[])
      .filter((row:any)=>row?.raw_data?.brand===brandId&&row?.raw_data?.source===SOURCE)
      .map((row:any)=>String(row.post_id||"")).filter(Boolean));

    const observation=summarizeRemasterAnalytics(analytics.videos);
    const byId=new Map(observation.observations.map(row=>[row.videoId,row]));
    const now=new Date().toISOString();
    const rows=analytics.videos.filter(video=>!existingIds.has(video.videoId)).map(video=>{
      const observed=byId.get(video.videoId);
      return {
        platform:"youtube",
        post_id:video.videoId,
        likes:Math.round(video.likes),
        comments:Math.round(video.comments),
        shares:Math.round(video.shares),
        views:Math.round(video.views),
        saves:0,
        total_interactions:Math.round(video.likes+video.comments+video.shares),
        media_type:"video",
        metric_window:METRIC_WINDOW,
        snapshot_at:now,
        raw_data:{
          brand:brandId,
          source:SOURCE,
          analytics_start_date:analytics.startDate,
          analytics_end_date:analytics.endDate,
          estimated_minutes_watched:video.estimatedMinutesWatched,
          average_view_duration:video.averageViewDuration,
          average_view_percentage:video.averageViewPercentage,
          subscribers_gained:video.subscribersGained,
          subscribers_lost:video.subscribersLost,
          net_subscribers:video.subscribersGained-video.subscribersLost,
          watch_quality:observed?.watchQuality||"INSUFFICIENT_DATA",
          engagement_quality:observed?.engagementQuality||"INSUFFICIENT_DATA",
          engagement_rate_pct:observed?.engagementRatePct??null,
          cohort_median_average_view_percentage:observation.cohort.medianAverageViewPercentage,
          cohort_median_engagement_rate_pct:observation.cohort.medianEngagementRatePct,
        },
      };
    });
    if(rows.length){
      const {error:insertError}=await db.from("engagement_snapshots").insert(rows);
      if(insertError){
        results.push({brandId,state:"ERROR",error:insertError.message});
        continue;
      }
    }
    results.push({
      brandId,state:"READY",measuredVideos:analytics.videos.length,
      snapshotsInserted:rows.length,eligibleVideos:observation.eligibleVideos,
      cohort:observation.cohort,
    });
  }

  const ready=results.filter(row=>row.state==="READY").length;
  const errors=results.filter(row=>row.state==="ERROR").length;
  const status=ready===0&&errors>0?"error":errors>0?"partial":"success";
  try{
    await db.from("automation_logs").insert({
      action:"youtube_brand_analytics_snapshot",
      agent_name:"nexus_youtube_brand_analytics",
      status,
      details:{brands:results,excludedBrands:["freddyb","remasterfreddy"],metricWindow:METRIC_WINDOW},
    });
  }catch{}
  return NextResponse.json({success:status!=="error",status,results});
}
