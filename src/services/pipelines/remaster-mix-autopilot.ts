import { REMASTER_SONG_READ_BRANDS } from "@/services/integrations/airtable-client";
import { loadAutopilotSignalGuidance } from "@/services/marketing/autopilot-signal-guidance";
import type { PromotionBrand } from "./remaster-mix-promotions";
import type { RemasterMixStyle } from "./remaster-mix-planner";

type MixCandidate={
  promotionBrand:PromotionBrand;
  growthBrandId:"zeneco"|"freddyart"|"freddypublishing"|"remasterfreddy";
  label:string;
};

const CANDIDATES:MixCandidate[]=[
  {promotionBrand:"zeneco",growthBrandId:"zeneco",label:"Zen Eco Homes"},
  {promotionBrand:"art",growthBrandId:"freddyart",label:"Freddy Bremseth Art"},
  {promotionBrand:"books",growthBrandId:"freddypublishing",label:"Freddy Publishing"},
  {promotionBrand:"none",growthBrandId:"remasterfreddy",label:"Re-Master Freddy"},
];

const STYLES:RemasterMixStyle[]=[
  "mediterranean-sunset","poolside","luxury-lounge","mediterranean-night","morning-chill",
];

function hash(value:string){
  let h=2166136261;
  for(const char of value){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}

function finite(value:unknown){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

async function historicalMixPerformance(db:any){
  const since=new Date(Date.now()-90*86400000).toISOString();
  const {data:jobs,error}=await db.from("remaster_mix_jobs")
    .select("youtube_video_id,input_snapshot,completed_at")
    .eq("source","growth-autopilot")
    .eq("status","completed")
    .not("youtube_video_id","is",null)
    .gte("completed_at",since)
    .order("completed_at",{ascending:false})
    .limit(80);
  if(error)return new Map<string,{views:number;retention:number|null;samples:number}>();
  const ids=(jobs||[]).map((row:any)=>String(row.youtube_video_id||"")).filter(Boolean);
  if(!ids.length)return new Map<string,{views:number;retention:number|null;samples:number}>();
  const {data:snapshots}=await db.from("engagement_snapshots")
    .select("post_id,views,raw_data,snapshot_at")
    .eq("platform","youtube").in("post_id",ids)
    .order("snapshot_at",{ascending:false});
  const latest=new Map<string,any>();
  for(const row of snapshots||[]){
    const id=String(row.post_id||"");
    if(id&&!latest.has(id))latest.set(id,row);
  }
  const accum=new Map<string,{views:number;retentionTotal:number;retentionSamples:number;samples:number}>();
  for(const job of jobs||[]){
    const brand=String(job.input_snapshot?.visualPlan?.brand||job.input_snapshot?.visualPlan?.source||"none");
    const snap=latest.get(String(job.youtube_video_id||""));
    if(!snap)continue;
    const current=accum.get(brand)||{views:0,retentionTotal:0,retentionSamples:0,samples:0};
    current.views+=finite(snap.views)||0;
    const retention=finite(snap.raw_data?.average_view_percentage);
    if(retention!=null){current.retentionTotal+=retention;current.retentionSamples++;}
    current.samples++;
    accum.set(brand,current);
  }
  return new Map([...accum].map(([brand,row])=>[
    brand,{
      views:Math.round(row.views),
      retention:row.retentionSamples?Math.round((row.retentionTotal/row.retentionSamples)*10)/10:null,
      samples:row.samples,
    },
  ]));
}

async function chooseCandidate(db:any,slotKey:string){
  const historical=await historicalMixPerformance(db);
  const evaluated=[];
  for(const candidate of CANDIDATES){
    const signals=await loadAutopilotSignalGuidance(db,candidate.growthBrandId)
      .catch(()=>({text:"",evidence:{seo:null,youtube:null}}));
    const seoCurrent=finite(signals.evidence.seo?.current)||0;
    const history=historical.get(candidate.promotionBrand)||{views:0,retention:null,samples:0};
    const score=Math.log1p(seoCurrent)*2+Math.log1p(history.views)+((history.retention||0)/8);
    evaluated.push({candidate,signals,history,score});
  }
  const ordered=[...evaluated].sort((a,b)=>b.score-a.score);
  const slotHash=hash(slotKey);
  // Keep deliberate exploration: one in four slots chooses a rotating format.
  const exploratory=(slotHash%4)===0||ordered.every(item=>item.score===0);
  const selected=exploratory
    ? evaluated[slotHash%evaluated.length]
    : ordered[0];
  return {selected,evaluated,exploratory};
}

function targetMinutes(retention:number|null){
  if(retention==null)return 12;
  if(retention<25)return 8;
  if(retention>=55)return 20;
  return 12;
}

async function chooseTracks(db:any,slotKey:string,count=5){
  const since=new Date(Date.now()-21*86400000).toISOString();
  const [{data:songs,error:songError},{data:recent}]=await Promise.all([
    db.from("songs").select("id,name,artist,file_url,genre,mood,bpm,duration,brand,created_at")
      .in("brand",[...REMASTER_SONG_READ_BRANDS]).not("file_url","is",null)
      .order("created_at",{ascending:false}).limit(120),
    db.from("remaster_mix_jobs").select("track_ids").eq("source","growth-autopilot")
      .gte("created_at",since).order("created_at",{ascending:false}).limit(12),
  ]);
  if(songError)throw new Error("MIX_AUTOPILOT_SONG_LOOKUP_FAILED: "+songError.message);
  const recentIds=new Set((recent||[]).flatMap((row:any)=>Array.isArray(row.track_ids)?row.track_ids:[]).map(String));
  const valid=(songs||[]).filter((row:any)=>row.id&&row.file_url);
  const fresh=valid.filter((row:any)=>!recentIds.has(String(row.id)));
  const pool=(fresh.length>=2?fresh:valid).sort((a:any,b:any)=>
    hash(slotKey+String(a.id))-hash(slotKey+String(b.id)));
  const picked=pool.slice(0,Math.max(2,Math.min(count,pool.length)));
  if(picked.length<2)throw new Error("MIX_AUTOPILOT_NEEDS_TWO_AUDIO_TRACKS");
  return picked;
}

function title(candidate:MixCandidate,style:RemasterMixStyle){
  const nice=style.split("-").map(word=>word[0].toUpperCase()+word.slice(1)).join(" ");
  if(candidate.promotionBrand==="zeneco")return `${nice} Costa Blanca Mix | Re-Master Freddy × Zen Eco Homes`;
  if(candidate.promotionBrand==="art")return `Art Lounge ${nice} Mix | Re-Master Freddy`;
  if(candidate.promotionBrand==="books")return `Books & Music ${nice} Mix | Re-Master Freddy`;
  return `${nice} Mix | Re-Master Freddy`;
}

function cta(candidate:MixCandidate){
  if(candidate.promotionBrand==="zeneco")return "Explore current Costa Blanca homes at ZenEcoHomes.com.";
  if(candidate.promotionBrand==="art")return "Explore published artworks at art.freddybremseth.com.";
  if(candidate.promotionBrand==="books")return "Discover the book collection at books.freddybremseth.com.";
  return "More original music at remaster.freddybremseth.com.";
}

export async function queueAdaptiveYouTubeMix(db:any,slotKey:string){
  const {selected,evaluated,exploratory}=await chooseCandidate(db,slotKey);
  const minutes=targetMinutes(selected.history.retention);
  const style=STYLES[hash(slotKey+selected.candidate.promotionBrand)%STYLES.length];
  const tracks=await chooseTracks(db,slotKey,minutes>=20?7:5);
  const exactAudioSeconds=minutes*60;
  const now=new Date().toISOString();
  const snapshot={
    version:"cross-brand-mix-v2",
    autopilot:true,
    autopilotSlotKey:slotKey,
    learning:{
      exploratory,
      selectedScore:selected.score,
      seo:selected.signals.evidence.seo,
      youtube:selected.signals.evidence.youtube,
      historicalMix:selected.history,
      candidates:evaluated.map(item=>({
        promotionBrand:item.candidate.promotionBrand,
        growthBrandId:item.candidate.growthBrandId,
        score:item.score,
        history:item.history,
        seoCurrent:item.signals.evidence.seo?.current??null,
      })),
    },
    exactAudioSeconds,
    tracks:tracks.map((song:any,index:number)=>({
      position:index+1,
      id:String(song.id),
      title:String(song.name||"Untitled"),
      artist:String(song.artist||"Re-Master Freddy"),
      audioUrl:String(song.file_url),
      genre:song.genre||null,
      mood:song.mood||null,
      bpm:song.bpm||null,
      durationSeconds:song.duration||null,
    })),
    visualPlan:{
      source:selected.candidate.promotionBrand,
      brand:selected.candidate.promotionBrand,
      promotionBrand:selected.candidate.promotionBrand,
      randomSeed:slotKey,
      artStyles:[],artCollections:[],artIds:[],
      bookSeries:[],bookLanguages:[],bookIds:[],
      region:selected.candidate.promotionBrand==="zeneco"?"north":"any",
      type:"mixed",
      visualTypes:["mixed"],
      sponsorIntervalMinutes:10,
      ctaText:cta(selected.candidate),
      thumbnailStyle:selected.candidate.promotionBrand==="art"?"art-lounge":"standard",
      thumbnailTitle:title(selected.candidate,style),
      commentStyle:"detailed",
    },
  };
  const row={
    brand:"remasterfreddy",
    title:title(selected.candidate,style),
    style,
    target_minutes:minutes,
    crossfade_seconds:8,
    playlist_name:"Re-Master Freddy | Growth Mixes",
    zenecohomes_enabled:selected.candidate.promotionBrand==="zeneco",
    visual_region:selected.candidate.promotionBrand==="zeneco"?"north":"any",
    visual_type:"mixed",
    sponsor_interval_minutes:10,
    cta_text:cta(selected.candidate),
    track_ids:tracks.map((song:any)=>String(song.id)),
    input_snapshot:snapshot,
    status:"queued",
    pipeline_step:"queued",
    progress:0,
    retry_count:0,
    max_retries:2,
    source:"growth-autopilot",
    created_by:"growth-autopilot",
    created_at:now,
    updated_at:now,
    queued_at:now,
  };
  const {data,error}=await db.from("remaster_mix_jobs").insert(row).select("*").single();
  if(error)throw new Error("MIX_AUTOPILOT_QUEUE_FAILED: "+error.message);
  return {
    job:data,
    promotionBrand:selected.candidate.promotionBrand,
    growthBrandId:selected.candidate.growthBrandId,
    exploratory,
    targetMinutes:minutes,
    style,
    learning:snapshot.learning,
  };
}
