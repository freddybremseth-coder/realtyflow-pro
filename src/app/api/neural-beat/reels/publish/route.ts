import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { getTokensForBrandPlatform } from "@/lib/oauth/channels";
import { makeGraphApi, makeMetaPublisher } from "@/services/marketing/publishers/meta-publisher";
import { getChannelInfo, uploadVideo } from "@/services/integrations/youtube-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const brands = z.enum(["art","books","zeneco","freddybremseth","pinosoecolife","donaanna"]);
type Brand = z.infer<typeof brands>;
type Channel = "instagram" | "youtube";

/** Explicitly bound owner destinations. Do not borrow another brand's social account. */
const REEL_DESTINATIONS: Record<Brand, Record<Channel,string|null>> = {
  art: { instagram:"freddyart",youtube:null },
  books: { instagram:null,youtube:null },
  zeneco: { instagram:"zeneco",youtube:"zeneco" },
  freddybremseth: { instagram:null,youtube:"freddyb" },
  pinosoecolife: { instagram:"pinosoecolife",youtube:null },
  donaanna: { instagram:"donaanna",youtube:"donaanna" },
};

const postSchema=z.object({jobId:z.string().uuid(),channel:z.enum(["instagram","youtube"])}).strict();
const jobIdSchema=z.string().uuid();
const BUCKET="remaster-reels";
function db(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
}
function fail(message:string,status=400){return NextResponse.json({error:message},{status});}
type ResolvedChannel = {
  connected:boolean;brandId:string|null;channelId:string|null;account:string|null;
  externalId:string|null;reason:string;
};
async function resolveChannel(brand:Brand,platform:Channel):Promise<ResolvedChannel>{
  const brandId=REEL_DESTINATIONS[brand][platform];
  if(!brandId)return {connected:false,brandId:null,channelId:null,account:null,externalId:null,reason:"Ingen egen "+platform+"-kanal er knyttet til denne merkevaren i RealtyFlow."};
  try {
    const target=await getTokensForBrandPlatform(brandId,platform);
    if(!target?.tokens.accessToken || (platform==="youtube"&&!target.tokens.refreshToken))
      return {connected:false,brandId,channelId:null,account:null,externalId:null,reason:"Kanalen mangler gyldig lagret OAuth-tilkobling i RealtyFlow."};
    const scopes=target.tokens.scopes;
    if(platform==="instagram"&&!scopes.some(scope=>["instagram_content_publish","instagram_business_content_publish"].includes(scope)))
      return {connected:false,brandId,channelId:null,account:null,externalId:null,reason:"Instagram-tilkoblingen mangler publiseringsrettighet."};
    if(platform==="youtube"&&!scopes.some(scope=>["https://www.googleapis.com/auth/youtube.upload","https://www.googleapis.com/auth/youtube"].includes(scope)))
      return {connected:false,brandId,channelId:null,account:null,externalId:null,reason:"YouTube-tilkoblingen mangler opplastingsrettighet."};
    return {connected:true,brandId,channelId:target.channel.id,account:target.channel.display_name,
      externalId:target.channel.external_id,reason:""};
  }catch{
    return {connected:false,brandId,channelId:null,account:null,externalId:null,reason:"Flere kanaler eller en uleselig OAuth-tilkobling; velg/korriger kontoen i RealtyFlow."};
  }
}
async function loadReadyJob(supabase:NonNullable<ReturnType<typeof db>>,jobId:string){
  const {data,error}=await supabase.from("remaster_reel_jobs")
    .select("id,brand,title,state,video_path,caption,channels").eq("id",jobId).maybeSingle();
  if(error||!data)return null;
  if(!brands.safeParse(data.brand).success || data.state!=="ready" || data.video_path!==jobId+".mp4" ||
      !data.caption || !Array.isArray(data.channels))return null;
  return data as typeof data & {brand:Brand};
}

/** Owner history + capability probe. No external publication is performed by GET. */
export async function GET(request:NextRequest){
  const denied=await requireAdminApi(request);if(denied)return denied;
  const supabase=db();if(!supabase)return fail("Supabase not configured.",503);
  const jobId=request.nextUrl.searchParams.get("jobId")||"";
  if(!jobIdSchema.safeParse(jobId).success)return fail("Valid Reel jobId required.");
  const job=await loadReadyJob(supabase,jobId);
  if(!job)return fail("Reel is not ready.",404);
  const [instagram,youtube,{data:deliveries,error}]=await Promise.all([
    resolveChannel(job.brand,"instagram"),resolveChannel(job.brand,"youtube"),
    supabase.from("remaster_reel_deliveries")
      .select("channel,state,external_id,external_url,error,updated_at").eq("reel_id",jobId),
  ]);
  if(error)return fail("Reel delivery history is not configured: "+error.message,503);
  return NextResponse.json({channels:{instagram,youtube},deliveries:deliveries||[]},
    {headers:{"Cache-Control":"private, no-store"}});
}

/** Only a real owner POST begins the external action. Unique reel/channel reservation
 * prevents double submits; an ambiguous result requires manual reconciliation. */
export async function POST(request:NextRequest){
  const denied=await requireAdminApi(request);if(denied)return denied;
  const context=await getRequestAccessContext(request);
  if(!context||context.role!=="OWNER")return fail("Owner account required.",403);
  const parsed=postSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return fail("Valid Reel jobId and channel required.");
  const {jobId,channel}=parsed.data;
  const supabase=db();if(!supabase)return fail("Supabase not configured.",503);
  const job=await loadReadyJob(supabase,jobId);
  if(!job)return fail("Reel is not ready; render and review the MP4 first.",409);
  if(channel==="instagram" && !job.channels.includes("instagram"))
    return fail("Denne Reel ble ikke klargjort for Instagram. Velg Instagram når du lager en ny Reel.",409);
  const target=await resolveChannel(job.brand,channel);
  if(!target.connected||!target.channelId||!target.externalId||!target.brandId)
    return fail(target.reason||"The selected brand has no connected "+channel+" account.",409);
  if(channel==="youtube"){
    try {
      // YouTube OAuth may point to another channel despite the local channel row.
      const live=await getChannelInfo(target.brandId,{requireBrandToken:true});
      if(live.id!==target.externalId)return fail("YouTube OAuth points at a different channel. Correct the connection in RealtyFlow.",409);
    }catch(error){
      return fail("YouTube channel preflight failed: "+(error instanceof Error?error.message:"Refresh the account in RealtyFlow."),409);
    }
  }

  const {data:reservation,error:reserveError}=await supabase.from("remaster_reel_deliveries").insert({
    reel_id:jobId,channel,brand_id:target.brandId,social_channel_id:target.channelId,
    state:"publishing",created_by:context.email,
  }).select("id").single();
  if(reserveError||!reservation){
    const {data:existing}=await supabase.from("remaster_reel_deliveries")
      .select("channel,state,external_id,external_url,error").eq("reel_id",jobId).eq("channel",channel).maybeSingle();
    if(existing)return NextResponse.json({error:"Denne Reel har allerede et publiseringsforsøk på "+channel+
      ". Kontroller status før du gjør noe mer.",delivery:existing},{status:409});
    return fail("Unable to reserve the Reel publication: "+(reserveError?.message||"Unknown error"),503);
  }
  const publicationId="manual-reel:"+jobId+":"+channel;
  try{
    const publicUrl=supabase.storage.from(BUCKET).getPublicUrl(job.video_path).data.publicUrl;
    if(!publicUrl.startsWith("https://")||!publicUrl.includes("/storage/v1/object/public/"+BUCKET+"/"))
      throw new Error("REEL_VIDEO_URL_INVALID");
    let externalId="",externalUrl="";
    if(channel==="instagram"){
      const connection=await getTokensForBrandPlatform(target.brandId,"instagram");
      if(!connection||connection.channel.id!==target.channelId||connection.channel.external_id!==target.externalId)
        throw new Error("INSTAGRAM_ACCOUNT_CHANGED");
      const publisher=makeMetaPublisher({supabase:supabase as any,graph:makeGraphApi(connection.tokens.accessToken),
        igUserId:target.externalId,live:true});
      const result=await publisher.publish({
        contentId:publicationId,channel:"instagram",headline:"",body:String(job.caption),cta:"",
        media:{videoUrl:publicUrl,mediaType:"reel"},
      } as any,{
        idempotencyKey:publicationId,publicationId,accountId:target.externalId,channel:"instagram",
      });
      if(result.dryRun||result.state!=="published"||!result.externalId)throw new Error("INSTAGRAM_PUBLICATION_UNCONFIRMED");
      externalId=result.externalId;
    }else{
      const {data:download,error}=await supabase.storage.from(BUCKET).download(job.video_path);
      if(error||!download)throw new Error("REEL_MP4_DOWNLOAD_FAILED: "+(error?.message||"no media"));
      const buffer=Buffer.from(await download.arrayBuffer());
      if(buffer.length<20_000||buffer.length>80*1024*1024)throw new Error("REEL_MP4_SIZE_INVALID");
      const result=await uploadVideo(buffer,{
        title:String(job.title).slice(0,100),description:String(job.caption).slice(0,4900),
        tags:["ReMasterFreddy","Shorts"],categoryId:"22",privacyStatus:"public",
      },target.brandId,{requireBrandToken:true,expectedChannelId:target.externalId,singleInsertAttempt:true});
      if(result.channelId!==target.externalId||!result.videoId)throw new Error("YOUTUBE_PUBLISHED_CHANNEL_UNCONFIRMED");
      externalId=result.videoId;externalUrl=result.videoUrl;
    }
    const {error:saved}=await supabase.from("remaster_reel_deliveries").update({
      state:"published",external_id:externalId,external_url:externalUrl,error:null,updated_at:new Date().toISOString(),
    }).eq("id",reservation.id).eq("state","publishing");
    if(saved)throw new Error("VIDEO_PUBLISHED_BUT_DELIVERY_RECEIPT_SAVE_FAILED: "+saved.message);
    return NextResponse.json({success:true,channel,externalId,externalUrl,account:target.account});
  }catch(error){
    const message=error instanceof Error?error.message:"Unconfirmed external publication";
    await supabase.from("remaster_reel_deliveries").update({
      state:"needs_review",error:message.slice(0,600),updated_at:new Date().toISOString(),
    }).eq("id",reservation.id).eq("state","publishing");
    return NextResponse.json({success:false,needsReview:true,
      error:"Publiseringen er ikke bekreftet. Kontroller kontoen i RealtyFlow/hos plattformen før du gjør et nytt forsøk. "+message.slice(0,240),
      channel},{status:502});
  }
}
