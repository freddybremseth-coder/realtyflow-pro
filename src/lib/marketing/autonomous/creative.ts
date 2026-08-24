/**
 * Phase 7.1 — Creative Generator (kontrakt + brand-aware prompt + provenance).
 * Selve LLM-kallet er en DI-søm (bruk RealtyFlows eksisterende provider-infra).
 * Alt som genereres er DRAFT. Provenance lagres alltid — systemet skal kunne
 * forklare hvor en påstand kom fra.
 */

import type { ContentGenome, MarketingChannel } from "../genome";
import type { GenomeRecommendation } from "../learning";
import { CHANNEL_SPECS } from "./channel";
import type { ContentBrief, GeneratedAsset } from "./schemas";
import type { BrandContext } from "./brand-brain";

export const CREATIVE_PROMPT_VERSION = "cg-1.4";

export interface CreativeRequest {
  brief: ContentBrief;
  brand: BrandContext;
  recommendation?: GenomeRecommendation;
  learningNotes?: string[];
  /** Verifiserbare fakta modellen får bruke (med kilde) — hindrer oppdiktede tall. */
  facts?: Array<{ claim: string; source: string }>;
  propertyIds?: string[];
}

export interface AssetProvenance {
  generatedBy: string;
  model?: string;
  promptVersion: string;
  learningRulesUsed: string[];
  factSources: Array<{ claim: string; source: string }>;
  propertyIds: string[];
  createdAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
}

export interface CreativeResult {
  asset: GeneratedAsset;
  provenance: AssetProvenance;
}

/** DI-søm for ekte generering (RealtyFlows Claude/Gemini-infra). */
export interface CreativeGenerator {
  generate(req: CreativeRequest): Promise<CreativeResult>;
}

const FORMAT_INSTRUCTIONS: Partial<Record<string, string>> = {
  reel: "Reel-caption: kort, energisk caption som følger videoen (IKKE scene-for-scene-manus). Eventuelt manus legges i productionScript.",
  short: "Short-caption: kort, fengende caption som følger klippet. Eventuelt manus legges i productionScript.",
  video: "Video-caption: beskrivelse/caption til videoen med tydelig CTA. Eventuelt manus/struktur legges i productionScript.",
  article: "Nettartikkel: SEO-tittel, meta-beskrivelse, seksjoner, interne lenker, avsluttende CTA.",
  carousel: "Karusell-caption: én ferdig caption til posten (slide-tekstene ligger på bildene, ikke i captionen).",
  post: "Post: fortellende åpning, verdi, tydelig CTA — ferdig caption.",
  landing_page: "Landingsside-copy: hero, verdiforslag, bevis, skjema-CTA.",
  email: "E-post: personlig åpning, én verdi, tydelig neste steg.",
};

export function buildCreativePrompt(req: CreativeRequest): { system: string; user: string } {
  const { brief, brand } = req;
  const spec = CHANNEL_SPECS[brief.channel as MarketingChannel];
  const favored = req.recommendation ? Object.entries(req.recommendation.favor).map(([d, v]) => `${d}=${v?.value}`).join(", ") : "";
  const avoided = req.recommendation ? req.recommendation.avoid.map((a) => `${a.dimension}=${a.value}`).join(", ") : "";

  const system = [
    `Du er markedsføringsforfatter for ${brand.brandName}.`,
    brand.voice && `Tone: ${brand.voice}.`,
    brand.audience && `Målgruppe: ${brand.audience}.`,
    brand.valueProposition && `Verdiforslag: ${brand.valueProposition}.`,
    brand.languages.length && `Språk: ${brand.languages.join(", ")}.`,
    brand.allowedClaims.length && `Tillatte påstander: ${brand.allowedClaims.join("; ")}.`,
    brand.forbiddenClaims.length && `FORBUDTE påstander (bruk aldri): ${brand.forbiddenClaims.join("; ")}.`,
    `Sensitive tall (pris, skatt, rente, markedsstatistikk) MÅ ha kilde. Uten kilde: ikke oppgi tallet.`,
    `Målbare/komparative utfallspåstander (lavere energikostnader, lavere kostnader, høyere avkastning, bedre investering, økt verdi, sparer penger, «garantert» noe) er FORBUDT uten en oppgitt, uavhengig kilde. Bruk heller trygg posisjonering (energieffektive nybygg, moderne boliger, norsk oppfølging) uten å love et konkret økonomisk utfall.`,
    `Hvis en factSource bare oppgir en energimerking (for eksempel «Energimerking: B»), gjengi KUN selve energimerkingen. Ikke utled eller skriv at boligen derfor er «moderne», «energieffektiv», har «lavt energiforbruk», «lavere kostnader» eller lignende med mindre akkurat den egenskapen også står eksplisitt i en factSource.`,
    `Leverandør-/Inventory-beskrivelser kan inneholde markedsføringsspråk. Ikke gjør subjektive superlativer, rangeringer eller popularitetsord til nye fakta. Ikke omskriv «et av de beste områdene» til «et av de mest populære områdene», «mest attraktive», «mest ettertraktede», «best beliggende» eller lignende uten en egen uavhengig factSource. Foretrekk nøkterne formuleringer om sted, boligtype, utsikt, fasiliteter og dokumenterte egenskaper.`,
    `En factSource kan være avkortet eller ende med «...». ALDRI fullfør, gjett eller rekonstruer den manglende delen. Bruk bare ordene og fakta som faktisk er synlige i factSource. Hvis en setning stopper midt i et stedsnavn, avstand, fasilitet eller annen påstand, utelat den delen helt.`,
    `Skriv aldri «lenke i bio», «link i bio», «se bio», «klikk på lenken i profilen» eller tilsvarende med mindre en eksplisitt verifisert factSource/channel-fact sier at en slik lenke finnes og peker til riktig destinasjon. Uten slik kilde: bruk CTA som «Book en gratis boligsamtale» eller «Kontakt oss».`,
    `Markeds-/trendpåstander og absolutte løfter er også FORBUDT uten uavhengig kilde. Skriv ikke «flere nordmenn ser mot Costa Blanca», «sol året rundt», «ingen skjulte overraskelser», «ingen språkbarrierer» eller tilsvarende. Bruk nøkternt, sant språk: «et hjem i solen», «norsktalende veiledning», «vi hjelper deg gjennom kjøpsprosessen».`,
    `Unngå absolutte ord som «alltid», «aldri», «ingen», «garantert» når de beskriver et resultat, marked, klima eller tjenesteløfte. Absolutter er bare tillatt når de er eksplisitt støttet av en verifiserbar factSource.`,
    (req.brand as { ownsInventory?: boolean }).ownsInventory
      ? `${brand.brandName} eier/utvikler boligene og kan omtale dem som «våre boliger».`
      : `${brand.brandName} er rådgiver/formidler — IKKE eier/utvikler. Skriv aldri «våre boliger/villaer/eiendommer». Bruk «boligene vi formidler», «boligene vi hjelper deg å finne» eller «eiendommene vi presenterer».`,
  ].filter(Boolean).join("\n");

  const user = [
    `Kanal: ${brief.channel} — ${spec?.adaptationNote ?? ""}`,
    FORMAT_INSTRUCTIONS[brief.genome.format] && `Format: ${FORMAT_INSTRUCTIONS[brief.genome.format]}`,
    `Vinkel: ${brief.angle}`,
    `Mål: ${brief.goal.kind}.`,
    brand.preferredCta && `Foretrukket CTA: ${brand.preferredCta}.`,
    favored && `Bruk det som funker (learning): ${favored}.`,
    avoided && `Unngå: ${avoided}.`,
    req.facts?.length && `Verifiserbare fakta du kan bruke:\n${req.facts.map((f) => `- ${f.claim} (kilde: ${f.source})`).join("\n")}`,
    `Hvis ingen verifiserbare fakta er oppgitt, hold teksten på Brand Brain-nivå: rådgivning, moderne/energieffektive boliger, Costa Blanca, kvalitet, trygghet og CTA. Ikke finn opp trender, garantier, besparelser eller absolutte løfter.`,
    `Skriv KUN den ferdige, kundevendte posten — aldri prosessbeskrivelse («Jeg setter opp…», «Here is your post…», «As an AI…»).`,
    `"body" er den ferdige captionen som publiseres direkte på Meta. Den skal ALDRI inneholde produksjonsanvisninger: ingen «HOOK», «SCENE», «Bilde:», «Tekst-overlay:», «CTA-SCENE», «Voiceover:», «Shot 1», «Klipp:», «B-roll» eller «Caption:»-etiketter. Skriv ekte kundevendt tekst, ikke et manus.`,
    `Trenger du et reel-/video-manus, legg HELE manuset i feltet "productionScript" — aldri i "body".`,
    `Returner KUN gyldig JSON: { "headline": string, "body": string, "cta": string, "publishable": boolean, "productionScript"?: string }. Sett publishable=true kun hvis "body" er en ekte, ferdig caption (ikke et manus) klar til å publiseres.`,
  ].filter(Boolean).join("\n");

  return { system, user };
}

export function assembleAsset(
  req: CreativeRequest,
  output: { headline?: string; body?: string; cta?: string },
  meta: { model?: string; costEur?: number; now?: string },
): CreativeResult {
  const now = meta.now ?? new Date().toISOString();
  const genome: ContentGenome = req.brief.genome;
  const learningRulesUsed = req.recommendation ? Object.entries(req.recommendation.favor).map(([d, v]) => `${d}=${v?.value}`) : [];
  return {
    asset: {
      contentId: req.brief.contentId,
      creativeVariantId: `${req.brief.contentId}_v1`,
      campaignId: req.brief.campaignId,
      channel: req.brief.channel,
      genome,
      headline: output.headline,
      body: output.body,
      cta: output.cta ?? req.brand.preferredCta,
      factSources: req.facts ?? [],
      generator: { model: meta.model, costEur: meta.costEur ?? 0 },
    },
    provenance: {
      generatedBy: "creative-generator",
      model: meta.model,
      promptVersion: CREATIVE_PROMPT_VERSION,
      learningRulesUsed,
      factSources: req.facts ?? [],
      propertyIds: req.propertyIds ?? [],
      createdAt: now,
      approvedBy: null,
      approvedAt: null,
    },
  };
}
