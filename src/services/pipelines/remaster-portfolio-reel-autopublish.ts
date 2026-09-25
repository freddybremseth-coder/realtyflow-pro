import { getTokensForBrandPlatform } from "@/lib/oauth/channels";
import { makeGraphApi, makeMetaPublisher } from "@/services/marketing/publishers/meta-publisher";
import { getChannelInfo, uploadVideo } from "@/services/integrations/youtube-client";
import { publishFacebookPageReel } from "./remaster-facebook-reel-publisher";
import type { ReelBrand } from "./remaster-portfolio-reels";

type AutoReelBrand=Exclude<ReelBrand,"freddybremseth">;
export type AutoReelChannel="instagram"|"facebook"|"youtube";

const DESTINATIONS:Record<AutoReelBrand,string>={
  art:"freddyart",
  books:"freddypublishing",
  zeneco:"zeneco",
  pinosoecolife:"pinosoecolife",
  donaanna:"donaanna",
  chatgenius:"chatgenius",
  freddyai:"freddyai",
  remasterfreddy:"remasterfreddy",
};

const BUCKET="remaster-reels";

export type AutonomousReelJob={
  id:string;
  brand:string;
  title:string;
  state:string;
  video_path:string|null;
  caption:string|null;
  channels:string[];
  selection:Record<string,unknown>|null;
};

type Resolved={
  connected:boolean;
  brandId:string;
  channelId:string|null;
  externalId:string|null;
  account:string|null;
  accessToken:string|null;
  reason:string|null;
};

function isAutoBrand(value:string):value is AutoReelBrand{
  return Object.prototype.hasOwnProperty.call(DESTINATIONS,value);
}

function intended(job:AutonomousReelJob,channel:AutoReelChannel){
  const destinations=Array.isArray(job.selection?.destinations)
    ? job.selection!.destinations as Array<Record<string,unknown>>
    : [];
  return destinations.some(item=>String(item.platform||"")===channel);
}

async function resolve(db:any,brand:AutoReelBrand,channel:AutoReelChannel):Promise<Resolved>{
  const brandId=DESTINATIONS[brand];
  try{
    const target=await getTokensForBrandPlatform(brandId,channel);
    if(!target?.tokens.accessToken || (channel==="youtube"&&!target.tokens.refreshToken)){
      return {connected:false,brandId,channelId:null,externalId:null,account:null,accessToken:null,reason:"missing_oauth"};
    }
    const scopes=target.tokens.scopes||[];
    if(channel==="facebook"&&!scopes.includes("pages_manage_posts"))
      return {connected:false,brandId,channelId:target.channel.id,externalId:target.channel.external_id,account:target.channel.display_name,accessToken:null,reason:"facebook_scope_missing"};
    if(channel==="instagram"&&!scopes.some(scope=>["instagram_content_publish","instagram_business_content_publish"].includes(scope)))
      return {connected:false,brandId,channelId:target.channel.id,externalId:target.channel.external_id,account:target.channel.display_name,accessToken:null,reason:"instagram_scope_missing"};
    if(channel==="youtube"&&!scopes.some(scope=>["https://www.googleapis.com/auth/youtube.upload","https://www.googleapis.com/auth/youtube"].includes(scope)))
      return {connected:false,brandId,channelId:target.channel.id,externalId:target.channel.external_id,account:target.channel.display_name,accessToken:null,reason:"youtube_scope_missing"};

    if(channel==="youtube"){
      const {data:other,error}=await db.from("social_channels")
        .select("brand_id").eq("platform","youtube").eq("external_id",target.channel.external_id)
        .eq("is_active",true).neq("brand_id",brandId).limit(1);
      if(error)throw new Error("YOUTUBE_CHANNEL_CONFLICT_CHECK_FAILED");
      if(other?.length)
        return {connected:false,brandId,channelId:target.channel.id,externalId:target.channel.external_id,account:target.channel.display_name,accessToken:null,reason:"youtube_channel_shared_between_brands"};
      const live=await getChannelInfo(brandId,{requireBrandToken:true});
      if(live.id!==target.channel.external_id)
        return {connected:false,brandId,channelId:target.channel.id,externalId:target.channel.external_id,account:target.channel.display_name,accessToken:null,reason:"youtube_oauth_channel_mismatch"};
    }

    return {
      connected:true,brandId,
      channelId:target.channel.id,
      externalId:target.channel.external_id,
      account:target.channel.display_name,
      accessToken:target.tokens.accessToken,
      reason:null,
    };
  }catch(error){
    return {
      connected:false,brandId,channelId:null,externalId:null,account:null,accessToken:null,
      reason:error instanceof Error?error.message:"channel_resolution_failed",
    };
  }
}

export async function publishAutonomousPortfolioReel(
  db:any,
  job:AutonomousReelJob,
  channel:AutoReelChannel,
){
  if(job.selection?.autopilot!==true)return {success:false,permanent:true,reason:"not_autopilot_job"} as const;
  if(!isAutoBrand(job.brand))return {success:false,permanent:true,reason:"brand_not_allowed_for_autopilot"} as const;
  if(job.brand==="freddybremseth")return {success:false,permanent:true,reason:"freddy_personal_autopilot_forbidden"} as const;
  if(job.state!=="ready"||!job.video_path||!job.caption)
    return {success:false,permanent:true,reason:"job_not_ready"} as const;
  if(!intended(job,channel))
    return {success:false,permanent:true,reason:"channel_not_in_creation_snapshot"} as const;

  const target=await resolve(db,job.brand,channel);
  if(!target.connected||!target.channelId||!target.externalId||!target.accessToken)
    return {success:false,permanent:true,reason:target.reason||"channel_not_connected",brandId:target.brandId} as const;

  const {data:reservation,error:reserveError}=await db.from("remaster_reel_deliveries").insert({
    reel_id:job.id,
    channel,
    brand_id:target.brandId,
    social_channel_id:target.channelId,
    state:"publishing",
    created_by:"portfolio-autopilot",
  }).select("id").single();

  if(reserveError||!reservation){
    const {data:existing}=await db.from("remaster_reel_deliveries")
      .select("id,channel,state,external_id,external_url,error")
      .eq("reel_id",job.id).eq("channel",channel).maybeSingle();
    if(existing)return {success:true,skipped:true,reason:"delivery_already_reserved",delivery:existing} as const;
    return {success:false,permanent:false,reason:"delivery_reservation_failed"} as const;
  }

  const publicationId=`auto-reel:${job.id}:${channel}`;
  try{
    const publicUrl=db.storage.from(BUCKET).getPublicUrl(job.video_path).data.publicUrl;
    if(!publicUrl.startsWith("https://")||!publicUrl.includes("/storage/v1/object/public/"+BUCKET+"/"))
      throw new Error("REEL_VIDEO_URL_INVALID");

    let externalId="",externalUrl="";
    if(channel==="instagram"){
      const publisher=makeMetaPublisher({
        supabase:db,
        graph:makeGraphApi(target.accessToken),
        igUserId:target.externalId,
        live:true,
      });
      const result=await publisher.publish({
        contentId:publicationId,channel:"instagram",headline:"",body:job.caption,cta:"",
        media:{videoUrl:publicUrl,mediaType:"reel"},
      } as any,{
        idempotencyKey:publicationId,
        publicationId,
        accountId:target.externalId,
        channel:"instagram",
      });
      if(result.dryRun||result.state!=="published"||!result.externalId)
        throw new Error("INSTAGRAM_PUBLICATION_UNCONFIRMED");
      externalId=result.externalId;
    }else if(channel==="facebook"){
      const posted=await publishFacebookPageReel({
        pageId:target.externalId,
        accessToken:target.accessToken,
        videoUrl:publicUrl,
        title:job.title,
        description:job.caption,
      });
      externalId=posted.videoId;
      externalUrl=posted.videoUrl;
    }else{
      const {data:download,error}=await db.storage.from(BUCKET).download(job.video_path);
      if(error||!download)throw new Error("REEL_MP4_DOWNLOAD_FAILED");
      const buffer=Buffer.from(await download.arrayBuffer());
      if(buffer.length<20_000||buffer.length>80*1024*1024)throw new Error("REEL_MP4_SIZE_INVALID");
      const result=await uploadVideo(buffer,{
        title:job.title.slice(0,100),
        description:job.caption.slice(0,4900),
        tags:["ReMasterFreddy",DESTINATIONS[job.brand],"Shorts"],
        categoryId:"22",
        privacyStatus:"public",
      },target.brandId,{
        requireBrandToken:true,
        expectedChannelId:target.externalId,
        singleInsertAttempt:true,
      });
      if(result.channelId!==target.externalId||!result.videoId)
        throw new Error("YOUTUBE_PUBLISHED_CHANNEL_UNCONFIRMED");
      externalId=result.videoId;
      externalUrl=result.videoUrl;
    }

    const {error:saved}=await db.from("remaster_reel_deliveries").update({
      state:"published",
      external_id:externalId,
      external_url:externalUrl,
      error:null,
      updated_at:new Date().toISOString(),
    }).eq("id",reservation.id).eq("state","publishing");
    if(saved)throw new Error("VIDEO_PUBLISHED_BUT_RECEIPT_SAVE_FAILED: "+saved.message);
    return {success:true,skipped:false,channel,brandId:target.brandId,externalId,externalUrl,account:target.account} as const;
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    // Never retry an unknown external outcome. The durable delivery row is the
    // at-most-once barrier; needs_review is reconciled by the owner, not re-posted.
    await db.from("remaster_reel_deliveries").update({
      state:"needs_review",
      error:message.slice(0,700),
      updated_at:new Date().toISOString(),
    }).eq("id",reservation.id).eq("state","publishing");
    return {success:false,permanent:true,needsReview:true,reason:message,channel,brandId:target.brandId} as const;
  }
}
