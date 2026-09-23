/** Owner-initiated Facebook Page Reel (not a text/link feed post).
 * The caller owns the unique reel/platform reservation and never auto-retries an
 * ambiguous Meta response. Source video must be an existing public MP4 URL.
 */
export async function publishFacebookPageReel(input:{
  pageId:string;accessToken:string;videoUrl:string;title:string;description:string;
}, http:typeof fetch=fetch):Promise<{videoId:string;videoUrl:string}>{
  const {pageId,accessToken,videoUrl,title,description}=input;
  if(!/^\d{6,25}$/.test(pageId)||!accessToken||!videoUrl.startsWith("https://"))
    throw new Error("FACEBOOK_REEL_INVALID_DESTINATION_OR_MEDIA");
  const graph="https://graph.facebook.com/v25.0";
  async function json(res:Response,phase:string):Promise<Record<string,unknown>>{
    const payload=await res.json().catch(()=>({})) as Record<string,unknown>;
    if(!res.ok || typeof payload.error==="object")
      throw new Error("FACEBOOK_REEL_"+phase+"_FAILED: "+String((payload.error as {message?:string}|undefined)?.message||res.status).slice(0,350));
    return payload;
  }
  // Preflight: confirm that the page token belongs to the selected Page.
  const me=await json(await http(graph+"/me?fields=id&access_token="+encodeURIComponent(accessToken),{cache:"no-store"}),"PAGE_PREFLIGHT");
  if(me.id!==pageId)throw new Error("FACEBOOK_REEL_WRONG_PAGE: connected token does not belong to the selected Page.");
  const start=await json(await http(graph+"/me/video_reels",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({access_token:accessToken,upload_phase:"start"}).toString(),
  }),"START");
  const videoId=String(start.video_id||"");
  const uploadUrl=String(start.upload_url||"");
  if(!/^\d{6,25}$/.test(videoId))throw new Error("FACEBOOK_REEL_MISSING_VIDEO_ID");
  // Never upload an OAuth token to an untrusted host supplied in a response.
  let upload:URL;
  try{upload=new URL(uploadUrl);}catch{throw new Error("FACEBOOK_REEL_UPLOAD_URL_INVALID");}
  if(upload.protocol!=="https:"||upload.hostname!=="rupload.facebook.com"||
     !upload.pathname.includes("/video-upload/")||!upload.pathname.endsWith("/"+videoId))
    throw new Error("FACEBOOK_REEL_UPLOAD_URL_INVALID");
  const transferred=await json(await http(upload.toString(),{
    method:"POST",headers:{Authorization:"OAuth "+accessToken,file_url:videoUrl},
  }),"UPLOAD");
  if(transferred.success!==true)throw new Error("FACEBOOK_REEL_UPLOAD_NOT_CONFIRMED");
  const finished=await json(await http(graph+"/me/video_reels",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({access_token:accessToken,video_id:videoId,upload_phase:"finish",
      video_state:"PUBLISHED",description:description.slice(0,2000),title:title.slice(0,100)}).toString(),
  }),"FINISH");
  if(finished.success!==true)throw new Error("FACEBOOK_REEL_PUBLISH_NOT_CONFIRMED");
  // Facebook accepted the Reel; it may continue processing before it is viewable.
  return {videoId,videoUrl:"https://www.facebook.com/reel/"+videoId};
}
