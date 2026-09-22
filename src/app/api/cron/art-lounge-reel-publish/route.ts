import { NextRequest, NextResponse } from 'next/server';
import { requireNexusSchedulerApi } from '@/lib/nexus/scheduler-auth';
import { evaluateCronSafeMode } from '@/lib/cron/safe-mode';
import { getServiceSupabase, makeConfiguredMetaPublisher } from '@/services/marketing/campaign-production';
import { getTokensForBrandPlatform } from '@/lib/oauth/channels';
import { REEL_BUCKET } from '@/services/pipelines/art-lounge-reels';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;
const BRAND='freddyart';
type Channel='instagram';
type Delivery={id:string;job_id:string;channel:Channel;state:string;updated_at:string};
type Job={id:string;video_path:string;caption:string;song_title:string;slot_date:string};

/**
 * Work one external action at a time. At-most-once on the dedicated ART Instagram:
 * - conditional reserved -> publishing claim before Graph call
 * - on ambiguous result, do NOT retry a new external upload
 * - IG PROCESSING explicitly resumes the saved container via the existing
 *   marketing_publish_attempts ledger (no duplicate container).
 * A missing ART Instagram account blocks publishing: the personal umbrella
 * Facebook Page is never a fallback for the daily ART reel.
 */
export async function GET(request:NextRequest) {
  const unauthorized=await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safe=await evaluateCronSafeMode('/api/cron/art-lounge-reel-publish');
  if (safe.skip) return NextResponse.json({skipped:true,reason:safe.reason});
  const db=getServiceSupabase();
  if (!db) return NextResponse.json({error:'SUPABASE_UNAVAILABLE'},{status:503});
  if (process.env.MARKETING_META_LIVE!=='true')
    return NextResponse.json({skipped:true,reason:'MARKETING_META_LIVE_NOT_ENABLED'});
  const {data:settings,error:settingsError}=await db.from('art_lounge_reel_settings')
    .select('enabled,automatic,channels,destination_brand').eq('singleton',true).maybeSingle();
  if (settingsError || !settings?.enabled || !settings?.automatic || settings.destination_brand!==BRAND ||
      JSON.stringify([...settings.channels].sort())!==JSON.stringify(['instagram']))
    return NextResponse.json({skipped:true,reason:'ART_LOUNGE_SETTINGS_NOT_READY'});
  // Exact art brand + Instagram OAuth only. NEVER borrow umbrella or music tokens.
  let ig:Awaited<ReturnType<typeof getTokensForBrandPlatform>>;
  try {
    ig=await getTokensForBrandPlatform(BRAND,'instagram');
    if (!ig?.tokens.accessToken)
      return NextResponse.json({skipped:true,reason:'ART_LOUNGE_CONNECT_ART_INSTAGRAM'});
  } catch {
    return NextResponse.json({skipped:true,reason:'ART_LOUNGE_ART_INSTAGRAM_AMBIGUOUS_OR_UNAVAILABLE'});
  }
  const {data:ready,error:queueError}=await db.from('art_lounge_reel_jobs')
    .select('id,video_path,caption,song_title,slot_date').eq('state','ready')
    .order('slot_date',{ascending:true}).limit(7);
  if (queueError) return NextResponse.json({error:'ART_LOUNGE_QUEUE_READ_FAILED'},{status:503});
  const deliveries:Array<{id:string;job:Job;channel:Channel;state:string}>=[];
  for (const job of (ready||[]) as Job[]) {
    const {data:rows,error}=await db.from('art_lounge_reel_deliveries')
      .select('id,job_id,channel,state,updated_at').eq('job_id',job.id);
    if (error) return NextResponse.json({error:'ART_LOUNGE_DELIVERY_READ_FAILED'},{status:503});
    for (const row of (rows||[]) as Delivery[]) {
      if (row.channel !== 'instagram') continue; // no legacy Facebook daily syndication
      if (row.state==='reserved' ||
          (row.state==='processing' && Date.parse(row.updated_at)<Date.now()-30*60_000))
        deliveries.push({id:row.id,job,channel:row.channel,state:row.state});
    }
  }
  if (!deliveries.length) return NextResponse.json({success:true,processed:0});
  // Bound each cron to one channel action; the second channel is picked up
  // by the next cron slot, independent of Instagram's processing time.
  const item=deliveries[0];
  const {data:claim,error:claimError}=await db.from('art_lounge_reel_deliveries')
    .update({state:'publishing',updated_at:new Date().toISOString()})
    .eq('id',item.id).eq('state',item.state).select('id').maybeSingle();
  if (claimError || !claim) return NextResponse.json({skipped:true,reason:'DELIVERY_ALREADY_CLAIMED'});
  try {
    if (!item.job.video_path || !item.job.caption)
      throw new Error('ART_LOUNGE_MISSING_RENDERED_VIDEO_OR_CAPTION');
    const videoUrl=db.storage.from(REEL_BUCKET).getPublicUrl(item.job.video_path).data.publicUrl;
    if (!videoUrl.startsWith('https://') || !videoUrl.includes('/storage/v1/object/public/'+REEL_BUCKET+'/'))
      throw new Error('ART_LOUNGE_INVALID_MEDIA_URL');
    const publisher=makeConfiguredMetaPublisher(db as any,BRAND);
    const result=await publisher.publish({
      contentId:'art-lounge-'+item.job.id,
      channel:item.channel,
      headline:'',
      body:item.job.caption,
      cta:'',
      media:{videoUrl,mediaType:'reel'},
    } as any,{
      idempotencyKey:'art-lounge-reel:'+item.job.id+':'+item.channel,
      publicationId:'art-lounge-reel:'+item.job.id+':'+item.channel,
      accountId:ig!.channel.external_id,
      channel:item.channel,
    });
    if (result.dryRun || result.state!=='published' || !result.externalId)
      throw new Error('ART_LOUNGE_PROVIDER_DID_NOT_CONFIRM_PUBLICATION');
    const {error:savedError}=await db.from('art_lounge_reel_deliveries')
      .update({state:'posted',external_id:result.externalId,error:null,updated_at:new Date().toISOString()})
      .eq('id',item.id).eq('state','publishing');
    if (savedError) throw new Error('ART_LOUNGE_POSTED_BUT_DB_UPDATE_FAILED');
    return NextResponse.json({success:true,jobId:item.job.id,channel:item.channel,externalId:result.externalId});
  } catch(err) {
    const message=err instanceof Error?err.message:'ART_LOUNGE_META_UNCONFIRMED';
    // Only Instagram's confirmed container PROCESSING can safely resume.
    // All other unknown Meta outcomes require human reconciliation, never
    // automatic re-posting or a second Facebook START/upload session.
    const processing=message.includes('IG_CONTAINER_PROCESSING');
    await db.from('art_lounge_reel_deliveries').update({
      state:processing?'processing':'needs_review',
      error:message.slice(0,700),updated_at:new Date().toISOString(),
    }).eq('id',item.id).eq('state','publishing');
    return NextResponse.json({success:false,jobId:item.job.id,channel:item.channel,
      status:processing?'processing':'needs_review',error:message},{status:processing?200:502});
  }
}
