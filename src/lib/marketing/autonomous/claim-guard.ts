/**
 * Phase 7.1L — kvalitativ/komparativ påstandsverifisering for AI-generert copy.
 */
import type { BrandContext } from "./brand-brain";

const OUTCOME_CLAIM_MARKERS: Array<{ label: string; re: RegExp }> = [
  { label: "lower energy costs", re: /lower(?:s|ed|ing)?\s+energy\s+costs?/i },
  { label: "lavere energikostnader", re: /laver[et]\s+energikostnad(?:er)?/i },
  { label: "lavere strømregning", re: /laver[et]\s+strøm(?:regning(?:er)?|utgifter|kostnad(?:er)?)/i },
  { label: "lower electricity bills", re: /lower\s+electricity\s+bills?/i },
  { label: "reduced consumption", re: /reduce[ds]?\s+(?:energy\s+)?consumption/i },
  { label: "redusert energiforbruk", re: /(?:redusert|laver[et])\s+(?:energi)?forbruk/i },
  { label: "reduced costs", re: /reduce[ds]?\s+(?:running\s+|operating\s+|maintenance\s+)?costs?/i },
  { label: "lower running costs", re: /lower\s+(?:running|operating)\s+costs?/i },
  { label: "lavere kostnader", re: /laver[et]\s+(?:drifts?|vedlikeholds?)?kostnad(?:er)?/i },
  { label: "lower maintenance", re: /(?:lower|reduced)\s+maintenance/i },
  { label: "lavere vedlikehold", re: /laver[et]\s+vedlikehold/i },
  { label: "lower tax", re: /lower\s+tax(?:es)?/i },
  { label: "lavere skatt", re: /laver[et]\s+skatt/i },
  { label: "save money", re: /sav(?:e|es|ing|ings)\s+money/i },
  { label: "sparer penger", re: /spar(?:er|e|t)\s+penger/i },
  { label: "guaranteed savings", re: /guarantee[ds]?\s+savings?/i },
  { label: "higher return", re: /higher\s+returns?/i },
  { label: "higher ROI", re: /higher\s+roi|better\s+roi/i },
  { label: "høyere avkastning", re: /høyere\s+avkastning/i },
  { label: "guaranteed return", re: /guarantee[ds]?\s+returns?/i },
  { label: "garantert avkastning", re: /garantert?\s+avkastning/i },
  { label: "better investment", re: /better\s+investment/i },
  { label: "bedre investering", re: /bedre\s+investering/i },
  { label: "more profitable", re: /more\s+profitable/i },
  { label: "lønnsomt", re: /(?:mer\s+)?lønnsom[t]?/i },
  { label: "increased property value", re: /increase[ds]?\s+(?:property\s+|resale\s+)?value|value\s+appreciation|resale\s+appreciation/i },
  { label: "høyere verdi", re: /(?:høyere|økt)\s+(?:bolig|eiendoms?)?verdi|verdiøkning/i },
  { label: "higher rental income", re: /higher\s+rental\s+income/i },
  { label: "høyere leieinntekt", re: /høyere\s+leieinntekt(?:er)?/i },
  { label: "faster sale", re: /faster\s+sale|sells?\s+faster/i },
  { label: "raskere salg", re: /raskere\s+salg|selges?\s+raskere/i },
  { label: "more Norwegians looking to Costa Blanca", re: /(?:flere|stadig\s+flere)\s+nordmenn[^.!?]{0,80}(?:ser|vender|flytter|søker)[^.!?]{0,50}(?:mot|til)\s+Costa\s+Blanca/i },
  { label: "more buyers looking to Costa Blanca", re: /more\s+(?:Norwegians|buyers|people)[^.!?]{0,80}(?:looking|moving|turning)[^.!?]{0,50}(?:to|toward(?:s)?)\s+Costa\s+Blanca/i },
  { label: "sought-after area", re: /(?:svært\s+)?ettertrakt(?:et|ede)\s+(?:bolig)?områd(?:e|er|ene)?/i },
  { label: "most popular area", re: /(?:mest\s+populær(?:e|t)?|most\s+popular)\s+(?:bolig)?områd(?:e|er|ene)?/i },
  { label: "most attractive area", re: /(?:mest\s+attraktiv(?:e|t)?|most\s+attractive)\s+(?:bolig)?områd(?:e|er|ene)?/i },
  { label: "prestigious area", re: /(?:prestisjefylt(?:e)?|prestigious)\s+(?:bolig)?områd(?:e|er|ene)?/i },
  { label: "modern property", re: /(?:moderne\s+(?:bolig(?:en|er|ene)?|villa(?:en|er|ene)?|leilighet(?:en|er|ene)?|hjem(?:met)?|boligprosjekt(?:et|er|ene)?|arkitektur|design)|modern\s+(?:home|villa|apartment|property|residence|development|architecture|design))/i },
  { label: "luxury property", re: /(?:(?:luksuriøs(?:e|t)?|luksus)\s+(?:bolig(?:en|er|ene)?|villa(?:en|er|ene)?|leilighet(?:en|er|ene)?|hjem(?:met)?|boligprosjekt(?:et|er|ene)?)|(?:luxury|luxurious)\s+(?:home|villa|apartment|property|residence|development))/i },
  { label: "exclusive property", re: /(?:eksklusiv(?:e|t)?\s+(?:bolig(?:en|er|ene)?|villa(?:en|er|ene)?|leilighet(?:en|er|ene)?|hjem(?:met)?|boligprosjekt(?:et|er|ene)?)|exclusive\s+(?:home|villa|apartment|property|residence|development))/i },
  { label: "energy-efficient property", re: /(?:energieffektiv(?:e|t)?\s+(?:bolig(?:en|er|ene)?|villa(?:en|er|ene)?|leilighet(?:en|er|ene)?|hjem(?:met)?|boligprosjekt(?:et|er|ene)?)|(?:bolig(?:en|er|ene)?|villa(?:en|er|ene)?|leilighet(?:en|er|ene)?|hjem(?:met)?|boligprosjekt(?:et|er|ene)?)[^.!?]{0,50}\benergieffektiv(?:e|t)?\b|energy[-\s]?efficient\s+(?:home|villa|apartment|property|residence|development)|(?:home|villa|apartment|property|residence|development)[^.!?]{0,50}\benergy[-\s]?efficient\b)/i },
  { label: "lowers cholesterol", re: /(?:senker|reduserer)\s+(?:kolesterol(?:et)?|LDL)|lower(?:s|ing)?\s+(?:LDL\s+)?cholesterol/i },
  { label: "prevents disease", re: /(?:forebygger|forhindrer)\s+(?:sykdom|sykdommer)|prevent(?:s|ing)?\s+disease/i },
  { label: "treats disease", re: /(?:behandler|kurerer)\s+(?:sykdom|sykdommer)|(?:treats?|cures?)\s+disease/i },
  { label: "anti-inflammatory", re: /(?:antiinflammatorisk|betennelsesdempende|anti[-\s]?inflammatory)/i },
  { label: "heart healthy", re: /(?:bra|godt)\s+for\s+hjertet|hjertevennlig|heart[-\s]?healthy|good\s+for\s+your\s+heart/i },
  { label: "reduces disease risk", re: /(?:reduserer|senker)\s+risiko(?:en)?\s+for\s+(?:sykdom|hjerte|kreft|diabetes)|reduce[sd]?\s+(?:the\s+)?risk\s+of\s+(?:disease|heart\s+disease|cancer|diabetes)/i },
  { label: "healthier than other oils", re: /(?:sunnere|mer\s+helsefremmende)\s+enn\s+(?:andre\s+)?oljer|healthier\s+than\s+(?:other\s+)?oils/i },
  { label: "proven health benefits", re: /(?:dokumentert(?:e)?|bevist(?:e)?)\s+helse(?:gevinst|fordel)(?:er)?|proven\s+health\s+benefits?/i },
  { label: "sun year-round", re: /(?:sol\s+(?:året\s+rundt|hele\s+året|året\s+gjennom)|year[-\s]?round\s+sun(?:shine)?|sun(?:shine)?\s+all\s+year)/i },
  { label: "no hidden surprises", re: /(?:ingen\s+skjulte\s+overraskelser|no\s+hidden\s+surprises?|no\s+surprises?)/i },
  { label: "no language barriers", re: /(?:ingen\s+språkbarrierer|uten\s+språkbarrierer|no\s+language\s+barriers?)/i },
  { label: "guaranteed", re: /\bguaranteed\b/i },
  { label: "garantert", re: /\bgarantert?e?\b/i },
];

export function findOutcomeClaims(text: string | null | undefined): string[] {
  const t = text ?? "";
  return OUTCOME_CLAIM_MARKERS.filter((m) => m.re.test(t)).map((m) => m.label);
}

export function unsupportedOutcomeClaims(
  caption: string | null | undefined,
  factSources: Array<{ claim: string; source: string }> = [],
): string[] {
  const present = OUTCOME_CLAIM_MARKERS.filter((m) => m.re.test(caption ?? ""));
  if (!present.length) return [];
  const sourced = present.filter((m) => factSources.some((f) => m.re.test(f.claim ?? "")));
  const sourcedLabels = new Set(sourced.map((m) => m.label));
  return present.filter((m) => !sourcedLabels.has(m.label)).map((m) => m.label);
}

const OWNERSHIP_MARKERS: Array<{ label: string; re: RegExp }> = [
  { label: "our homes", re: /\bour\s+homes?\b/i },
  { label: "our properties", re: /\bour\s+propert(?:y|ies)\b/i },
  { label: "our villas", re: /\bour\s+villas?\b/i },
  { label: "our apartments", re: /\bour\s+apartments?\b/i },
  { label: "our developments", re: /\bour\s+developments?\b/i },
  { label: "our projects", re: /\bour\s+(?:residential\s+|new[- ]?build\s+)?projects?\b/i },
  { label: "our complexes", re: /\bour\s+(?:residential\s+)?complex(?:es)?\b/i },
  { label: "våre boliger", re: /(?:^|[^a-zæøå])vår[et]?\s+bolig(?:er|en|ene)?(?![a-zæøå])/i },
  { label: "våre villaer", re: /(?:^|[^a-zæøå])vår[et]?\s+villa(?:er|en|ene)?(?![a-zæøå])/i },
  { label: "våre eiendommer", re: /(?:^|[^a-zæøå])vår[et]?\s+eiendom(?:mer|men|mene)?(?![a-zæøå])/i },
  { label: "våre leiligheter", re: /(?:^|[^a-zæøå])vår[et]?\s+leilighet(?:er|en|ene)?(?![a-zæøå])/i },
  { label: "våre prosjekter", re: /(?:^|[^a-zæøå])vår[et]?\s+prosjekt(?:er|et|ene)?(?![a-zæøå])/i },
  { label: "våre boligprosjekter", re: /(?:^|[^a-zæøå])vår[et]?\s+(?:nybygg)?boligprosjekt(?:er|et|ene)?(?![a-zæøå])/i },
  { label: "våre boligkomplekser", re: /(?:^|[^a-zæøå])vår[et]?\s+boligkompleks(?:er|et|ene)?(?![a-zæøå])/i },
  { label: "våre komplekser", re: /(?:^|[^a-zæøå])vår[et]?\s+kompleks(?:er|et|ene)?(?![a-zæøå])/i },
];

export function findOwnershipClaims(text: string | null | undefined): string[] {
  const t = text ?? "";
  return OWNERSHIP_MARKERS.filter((m) => m.re.test(t)).map((m) => m.label);
}

const OWNERSHIP_TOKENS = [
  "utbygger", "utvikler", "developer", "vi eier", "vi bygger", "vi utvikler",
  "we build", "we develop", "we own", "eiendomsutvikler", "boligutvikler",
];

export function brandSupportsOwnership(brand?: Pick<BrandContext, "allowedClaims" | "services"> & { ownsInventory?: boolean }): boolean {
  if (!brand) return false;
  if (brand.ownsInventory === true) return true;
  const hay = [...(brand.services ?? []), ...(brand.allowedClaims ?? [])].join(" ").toLowerCase();
  return OWNERSHIP_TOKENS.some((t) => hay.includes(t));
}
