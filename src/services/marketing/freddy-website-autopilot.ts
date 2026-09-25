import { askClaude } from "@/services/ai/claude-client";
import { slugifyCmsTitle } from "@/lib/website-cms";
import { loadAutopilotSignalGuidance } from "@/services/marketing/autopilot-signal-guidance";
import {
  loadFreddyPublicSource,
  markFreddyPublicSourcePlanned,
  type FreddyPublicSource,
} from "@/services/marketing/freddy-public-source";

type Db=any;

function firstParagraph(markdown:string){
  return markdown.split(/\n{2,}/)
    .map(part=>part.replace(/^#{1,6}\s*/gm,"").trim())
    .find(Boolean)?.slice(0,260)||"";
}
function articleTitle(source:FreddyPublicSource){
  if(source.verifiedKind==="artwork")return `Om kunstverket «${source.title}»`;
  if(source.verifiedKind==="book")return `Om boken «${source.title}»`;
  if(source.verifiedKind==="song")return `Om låten «${source.title}»`;
  return source.title;
}
function factualPayload(source:FreddyPublicSource){
  return {
    type:source.verifiedKind,
    title:source.title,
    canonicalUrl:source.sourceUrl,
    language:source.payload?.language??null,
    seriesNumber:source.payload?.series_number??null,
    amazonUrl:source.payload?.amazon_url??null,
    samplePdfPath:source.payload?.sample_pdf_path??null,
    editorialAngle:source.payload?.editorial_angle??null,
    suggestedCopy:source.payload?.suggested_copy??null,
  };
}

export async function publishFreddyWebsiteArticle(db:Db,localDate:string){
  const dailyTag=`autopilot:freddyb-website:${localDate}`;
  const {data:existing,error:existingError}=await db.from("content_publications")
    .select("id,title,published_at")
    .eq("brand_id","freddyb").eq("status","published")
    .contains("tags",[dailyTag]).limit(1).maybeSingle();
  if(existingError)throw new Error("FREDDY_WEBSITE_IDEMPOTENCY_CHECK_FAILED: "+existingError.message);
  if(existing)return {skipped:true,reason:"daily_website_article_already_published",publication:existing} as const;

  const source=await loadFreddyPublicSource(db,{cooldownDays:21,preferSpotlight:true});
  if(!source)return {skipped:true,reason:"no_fresh_verified_website_source"} as const;
  if(source.verifiedKind==="website")
    return {skipped:true,reason:"existing_website_source_not_rewritten",sourceId:source.id} as const;

  const signals=await loadAutopilotSignalGuidance(db,"freddyb")
    .catch(()=>({text:"",evidence:{seo:null,youtube:null}}));
  const title=articleTitle(source);
  const facts=JSON.stringify(factualPayload(source));
  const systemPrompt=[
    "Du skriver faglig og redaksjonelt innhold til freddybremseth.com.",
    "Skriv på norsk Bokmål i en personlig, profesjonell og nøktern tone.",
    "Bruk KUN eksplisitte fakta i kildedataene. Ikke dikt opp motivasjon, tilblivelseshistorie, årstall, priser, salg, anmeldelser, priser/utmerkelser, lesertall eller resultater.",
    "Hvis faktagrunnlaget er lite, skriv kortere fremfor å fylle ut med antakelser.",
    "Returner bare gyldig Markdown. Ikke legg til kommentarer til redaktøren.",
  ].join(" ");
  const prompt=[
    `Skriv en ferdig artikkel med tittelen "# ${title}".`,
    "Mål: gi leseren nyttig kontekst om et verifisert prosjekt fra Freddy Bremseth og lede naturlig til originalkilden.",
    "Lengde: normalt 450–750 ord, men kortere dersom faktagrunnlaget ikke bærer mer.",
    "Bruk 2–4 ##-mellomtitler. Ingen overdreven salgstekst.",
    "Den eksakte kildelenken skal stå naturlig mot slutten.",
    "Verifiserte kildedata: "+facts+".",
    signals.text?("Målt SEO-/publikumssignal kan brukes kun til vinkling, ikke som faktagrunnlag:"+signals.text):"",
  ].filter(Boolean).join("\n\n");

  const markdown=await askClaude(prompt,{
    systemPrompt,
    model:"sonnet",
    maxTokens:3000,
    temperature:0.35,
  });
  if(!markdown.trim())throw new Error("FREDDY_WEBSITE_AI_EMPTY");
  if(!markdown.includes(source.sourceUrl))
    throw new Error("FREDDY_WEBSITE_SOURCE_LINK_MISSING");

  const slug=slugifyCmsTitle(title);
  if(!slug)throw new Error("FREDDY_WEBSITE_SLUG_EMPTY");
  const now=new Date().toISOString();
  const tags=[
    "website","cms:artikler",`slug:${slug}`,"autopilot","freddy-public",
    dailyTag,`source-queue:${source.id}`,`source-kind:${source.verifiedKind}`,
  ];
  const payload={
    brand_id:"freddyb",
    content_type:"website_article",
    title,
    description:markdown.trim(),
    tags,
    media_urls:source.mediaUrl?[source.mediaUrl]:[],
    ai_generated:true,
    ai_title:title,
    ai_description:firstParagraph(markdown),
    ai_tags:["Freddy Bremseth",source.verifiedKind],
    ai_image_url:source.mediaUrl||null,
    status:"published",
    published_at:now,
    updated_at:now,
  };
  const {data:publication,error:insertError}=await db.from("content_publications")
    .insert(payload).select("id,title,published_at").single();
  if(insertError||!publication)throw new Error("FREDDY_WEBSITE_PUBLICATION_FAILED: "+(insertError?.message||"unknown"));
  await markFreddyPublicSourcePlanned(db,source.id);
  return {
    skipped:false,
    publication,
    source:{id:source.id,kind:source.verifiedKind,title:source.title,url:source.sourceUrl},
    externalUrl:`https://freddybremseth.com/artikler/${slug}`,
    signalEvidence:signals.evidence,
  } as const;
}
