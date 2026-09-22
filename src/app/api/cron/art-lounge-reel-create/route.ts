import { NextRequest, NextResponse } from 'next/server';
import { requireNexusSchedulerApi } from '@/lib/nexus/scheduler-auth';
import { evaluateCronSafeMode } from '@/lib/cron/safe-mode';
import { getServiceSupabase } from '@/services/marketing/campaign-production';
import { getTokensForBrandPlatform } from '@/lib/oauth/channels';
import {
  REEL_BUCKET, reelCaption, renderArtLoungeReel, selectReelAssets, type ReelSong,
} from '@/services/pipelines/art-lounge-reels';
import { loadPublishedMixArt } from '@/services/pipelines/remaster-mix-promotions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const DESTINATION_BRAND = 'freddyb';

function madridDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US',{
    timeZone: 'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(date);
  const part=(key:string) => parts.find(p=>p.type===key)?.value;
  return [part('year'),part('month'),part('day')].join('-');
}

/** Cron builds one Reel a day and deposits it in a durable RealtyFlow queue.
 * It does NOT make an external Meta request. Publishing has its own bounded
 * scheduler so slow rendering cannot leave an ambiguous external upload.
 */
export async function GET(request: NextRequest) {
  const unauthorized=await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safe=await evaluateCronSafeMode('/api/cron/art-lounge-reel-create');
  if (safe.skip) return NextResponse.json({skipped:true,reason:safe.reason});
  const db=getServiceSupabase();
  if (!db) return NextResponse.json({error:'SUPABASE_UNAVAILABLE'},{status:503});
  const {data:settings,error:settingsError}=await db.from('art_lounge_reel_settings')
    .select('enabled,automatic,channels,destination_brand').eq('singleton',true).maybeSingle();
  if (settingsError) return NextResponse.json({error:'ART_LOUNGE_MIGRATION_REQUIRED'},{status:503});
  if (!settings?.enabled || !settings.automatic || settings.destination_brand!==DESTINATION_BRAND ||
      JSON.stringify([...settings.channels].sort())!==JSON.stringify(['facebook','instagram']))
    return NextResponse.json({skipped:true,reason:'ART_LOUNGE_SETTINGS_DISABLED_OR_UNEXPECTED'});
  // No partial automatic publishing to an unrelated Meta account. Both exact
  // brand credentials are required before even rendering the daily asset.
  if (process.env.MARKETING_META_LIVE!=='true')
    return NextResponse.json({skipped:true,reason:'MARKETING_META_LIVE_NOT_ENABLED'});
  try {
    const [fb,ig]=await Promise.all([
      getTokensForBrandPlatform(DESTINATION_BRAND,'facebook'),
      getTokensForBrandPlatform(DESTINATION_BRAND,'instagram'),
    ]);
    if (!fb?.tokens.accessToken || !ig?.tokens.accessToken)
      return NextResponse.json({skipped:true,reason:'ART_LOUNGE_CONNECT_BOTH_BRAND_ACCOUNTS'});
  } catch {
    return NextResponse.json({skipped:true,reason:'ART_LOUNGE_BRAND_ACCOUNT_AMBIGUOUS_OR_UNAVAILABLE'});
  }
  const slot=madridDay(new Date());
  const {data:claimed,error:claimError}=await db.rpc('claim_art_lounge_reel_day',{p_date:slot});
  if (claimError) return NextResponse.json({error:'ART_LOUNGE_DAILY_CLAIM_FAILED'},{status:503});
  if (!claimed) return NextResponse.json({skipped:true,reason:'ART_LOUNGE_DAY_ALREADY_CLAIMED',slot});
  try {
    const since=madridDay(new Date(Date.now()-14*86400_000));
    const [songsResult,recentResult,art]=await Promise.all([
      db.from('songs').select('id,name,file_url,youtube_url').eq('brand','remasterfreddy')
        .not('file_url','is',null).not('youtube_url','is',null)
        .order('created_at',{ascending:false}).limit(140),
      db.from('art_lounge_reel_jobs').select('song_id').gte('slot_date',since)
        .not('song_id','is',null).limit(30),
      loadPublishedMixArt(),
    ]);
    if (songsResult.error || recentResult.error)
      throw new Error('ART_LOUNGE_CATALOG_READ_FAILED');
    const chosen=selectReelAssets(slot,songsResult.data as ReelSong[] || [],art,
      (recentResult.data || []).map(x=>String(x.song_id)));
    const video=await renderArtLoungeReel(chosen);
    const objectPath=slot+'.mp4'; // Immutable daily content: upload never overwrites.
    const {error:uploadError}=await db.storage.from(REEL_BUCKET).upload(objectPath,video,{
      contentType:'video/mp4',cacheControl:'3600',upsert:false,
    });
    if (uploadError) throw new Error('ART_LOUNGE_STORAGE_FAILED: '+uploadError.message);
    const {data:job,error:jobError}=await db.from('art_lounge_reel_jobs').update({
      state:'ready',song_id:chosen.song.id,song_title:chosen.song.name,
      artwork:chosen.artwork.map(x=>({id:x.id,title:x.title,url:x.detailUrl})),
      video_path:objectPath,caption:reelCaption(chosen),updated_at:new Date().toISOString(),
    }).eq('slot_date',slot).eq('state','rendering').select('id').single();
    if (jobError || !job?.id) throw new Error('ART_LOUNGE_JOB_SAVE_FAILED');
    const {error:deliveryError}=await db.from('art_lounge_reel_deliveries').insert([
      {job_id:job.id,channel:'facebook',state:'reserved'},
      {job_id:job.id,channel:'instagram',state:'reserved'},
    ]);
    if (deliveryError) throw new Error('ART_LOUNGE_DELIVERY_QUEUE_FAILED');
    return NextResponse.json({success:true,slot,jobId:job.id,videoReady:true,channels:['facebook','instagram']});
  } catch(err) {
    const message=err instanceof Error?err.message:'ART_LOUNGE_RENDER_FAILED';
    await db.from('art_lounge_reel_jobs').update({
      state:'failed',error:message.slice(0,500),updated_at:new Date().toISOString(),
    }).eq('slot_date',slot).eq('state','rendering');
    return NextResponse.json({success:false,slot,error:message},{status:500});
  }
}
