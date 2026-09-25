export type FreddyPublicSource = {
  id:string;
  sourceType:"creative_spotlight"|"book"|"website";
  sourceId:string;
  sourceUrl:string;
  title:string;
  payload:Record<string,any>;
  mediaUrl?:string;
  verifiedKind:"artwork"|"book"|"song"|"website";
};

type Db=any;

function clean(value:unknown,max=1000){
  return String(value??"").replace(/\s+/g," ").trim().slice(0,max);
}
function safeHttps(value:unknown){
  const text=clean(value,1500);
  try{const url=new URL(text);return url.protocol==="https:"?url.href:"";}catch{return "";}
}
function bookCover(value:unknown){
  const raw=clean(value,400);
  if(!raw)return "";
  if(/^https:\/\//i.test(raw)) return safeHttps(raw);
  if(/^\/?assets\/covers\/[a-zA-Z0-9_.\/-]+$/.test(raw))
    return "https://books.freddybremseth.com/"+raw.replace(/^\//,"");
  return "";
}

async function verifyCreativeSpotlight(db:Db,row:any):Promise<FreddyPublicSource|null>{
  const payload=(row.payload&&typeof row.payload==="object")?row.payload:{};
  const kind=clean(payload.source_type,30);
  const verifiedUrl=safeHttps(payload.verified_url||row.source_url);
  const originalId=clean(payload.source_id,160);
  if(!verifiedUrl||!originalId)return null;

  if(kind==="artwork"){
    if(!verifiedUrl.startsWith("https://art.freddybremseth.com/verk/"))return null;
    const {data,error}=await db.from("art_gallery_works")
      .select("id,published,public_preview_path").eq("id",originalId).maybeSingle();
    if(error||!data?.published||!/^[a-z0-9][a-z0-9-]{0,120}\/view\.webp$/i.test(String(data.public_preview_path||"")))return null;
    const preview=safeHttps(payload.approved_art_preview);
    if(!preview.includes("/storage/v1/object/public/art-previews/"))return null;
    return {id:String(row.id),sourceType:"creative_spotlight",sourceId:String(row.source_id),
      sourceUrl:verifiedUrl,title:clean(row.title,220).replace(/^Freddy story:\s*/i,""),payload,
      mediaUrl:preview,verifiedKind:"artwork"};
  }

  if(kind==="book"){
    if(!verifiedUrl.startsWith("https://books.freddybremseth.com/book/"))return null;
    const {data,error}=await db.from("book_titles")
      .select("id,status,cover_image_url,slug,language,series_number").eq("id",originalId).maybeSingle();
    if(error||data?.status!=="published")return null;
    return {id:String(row.id),sourceType:"creative_spotlight",sourceId:String(row.source_id),
      sourceUrl:verifiedUrl,title:clean(row.title,220).replace(/^Freddy story:\s*/i,""),
      payload:{...payload,language:data.language??payload.language,series_number:data.series_number??payload.series_number},
      mediaUrl:bookCover(data.cover_image_url),verifiedKind:"book"};
  }

  if(kind==="song"){
    if(!verifiedUrl.startsWith("https://www.youtube.com/watch?v="))return null;
    const {data,error}=await db.from("songs")
      .select("id,brand,youtube_url,file_url,thumbnail_url,image_url").eq("id",originalId).maybeSingle();
    if(error||data?.brand!=="remasterfreddy"||!data.file_url||String(data.youtube_url||"")!==verifiedUrl)return null;
    return {id:String(row.id),sourceType:"creative_spotlight",sourceId:String(row.source_id),
      sourceUrl:verifiedUrl,title:clean(row.title,220).replace(/^Freddy story:\s*/i,""),payload,
      mediaUrl:safeHttps(data.thumbnail_url||data.image_url),verifiedKind:"song"};
  }
  return null;
}

async function verifyBook(db:Db,row:any):Promise<FreddyPublicSource|null>{
  const payload=(row.payload&&typeof row.payload==="object")?row.payload:{};
  const id=clean(payload.book_id||row.source_id,160);
  const url=safeHttps(payload.book_page_url||row.source_url);
  if(!id||!url.startsWith("https://books.freddybremseth.com/book/"))return null;
  const {data,error}=await db.from("book_titles")
    .select("id,status,cover_image_url,slug,language,series_number,amazon_url,sample_pdf_path")
    .eq("id",id).maybeSingle();
  if(error||data?.status!=="published")return null;
  return {id:String(row.id),sourceType:"book",sourceId:String(row.source_id),sourceUrl:url,
    title:clean(row.title,220),payload:{...payload,...data},mediaUrl:bookCover(data.cover_image_url||payload.cover_image_url),
    verifiedKind:"book"};
}

async function verifyWebsite(row:any):Promise<FreddyPublicSource|null>{
  const payload=(row.payload&&typeof row.payload==="object")?row.payload:{};
  const url=safeHttps(row.source_url||payload.url);
  if(!url||!/^https:\/\/(?:www\.)?freddybremseth\.com\//i.test(url))return null;
  return {id:String(row.id),sourceType:"website",sourceId:String(row.source_id),sourceUrl:url,
    title:clean(row.title,220),payload,mediaUrl:safeHttps(payload.image_url),verifiedKind:"website"};
}

export async function loadFreddyPublicSource(db:Db,options:{cooldownDays?:number;preferSpotlight?:boolean}={}):Promise<FreddyPublicSource|null>{
  const cooldownDays=Math.max(1,Math.min(60,Number(options.cooldownDays||14)));
  const cutoff=new Date(Date.now()-cooldownDays*86400000).toISOString();
  const {data,error}=await db.from("marketing_source_queue")
    .select("id,brand_id,source_type,source_id,source_url,title,payload,status,last_planned_at,priority,created_at")
    .eq("brand_id","freddyb").eq("status","ready")
    .in("source_type",["creative_spotlight","book","website"])
    .or(`last_planned_at.is.null,last_planned_at.lt.${cutoff}`)
    .order("priority",{ascending:false,nullsFirst:false})
    .order("created_at",{ascending:true})
    .limit(80);
  if(error)throw new Error("FREDDY_SOURCE_LOOKUP_FAILED: "+error.message);
  const rows=[...(data||[])].sort((a:any,b:any)=>{
    if(options.preferSpotlight!==false){
      const rank=(row:any)=>row.source_type==="creative_spotlight"?0:row.source_type==="website"?1:2;
      const delta=rank(a)-rank(b);if(delta)return delta;
    }
    return 0;
  });
  for(const row of rows){
    const verified=row.source_type==="creative_spotlight"
      ? await verifyCreativeSpotlight(db,row)
      : row.source_type==="book" ? await verifyBook(db,row) : await verifyWebsite(row);
    if(verified)return verified;
  }
  return null;
}

export function freddyPublicMasterIdea(source:FreddyPublicSource,guidance=""){
  const facts=JSON.stringify({
    kind:source.verifiedKind,
    title:source.title,
    url:source.sourceUrl,
    language:source.payload?.language??null,
    seriesNumber:source.payload?.series_number??null,
    editorialAngle:source.payload?.editorial_angle??null,
    suggestedCopy:source.payload?.suggested_copy??null,
  });
  return [
    "Skriv et kort, profesjonelt innlegg i jeg-form for den OFFENTLIGE Freddy Bremseth-siden.",
    "Bruk kun de verifiserte opplysningene nedenfor. Ikke dikt opp motivasjon, bakgrunnshistorie, skapelsesår, anmeldelser, salgstall, priser, utmerkelser eller resultater.",
    "Skriv en ny introduksjon, ikke kopier teksten fra underbrandet ordrett.",
    "Avslutt med den eksakte verifiserte lenken. Ikke skriv 'link i bio'.",
    "Verifisert kilde: "+facts+".",
    guidance,
  ].filter(Boolean).join(" ");
}

export async function markFreddyPublicSourcePlanned(db:Db,sourceId:string){
  const now=new Date().toISOString();
  const {error}=await db.from("marketing_source_queue").update({last_planned_at:now,updated_at:now})
    .eq("id",sourceId).eq("brand_id","freddyb");
  if(error)throw new Error("FREDDY_SOURCE_MARK_FAILED: "+error.message);
}
