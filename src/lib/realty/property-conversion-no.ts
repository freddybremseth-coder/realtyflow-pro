import { createHash } from "node:crypto";
import { askClaude } from "@/services/ai/claude-client";
import { unsupportedOutcomeClaims } from "@/lib/marketing/autonomous/claim-guard";

const CONVERSION_VERSION = "conversion-v6";
const FORBIDDEN = /\b(drømmebolig|unik|fantastisk|fabelaktig|eksklusiv|spektakulær|perfekt|førsteklasses|uslåelig|enestående|attraktiv(?:t|e)?|ideell(?:t|e)?|idealet)\b/i;
const PLACEHOLDER = /\b(ikke angitt|ukjent|ikke oppgitt|ikke spesifisert|mangler)\b/i;
const UNSUPPORTED_AUDIENCE = /\b(investor(?:er|ene)?|investering(?:sformål|spotensial)?|utleie(?:potensial|inntekt)?|ferieutleie|avkastning)\b/i;
const DEMOGRAPHIC_AUDIENCE = /\b(familie(?:r|n)?|barnefamilie(?:r|n)?|par(?:et)?|pensjonist(?:er|ene)?|førstegangskjøper(?:e|ne)?|personer|de som|for deg som)\b/i;
const UNSUPPORTED_LIFESTYLE = /\b(aktiv livsstil|naturskjønn(?:e|t)?|fredelig(?:e)?|rolig(?:e)? omgivelser|sosial atmosfære|underholdning|året rundt komfort|komfort året rundt)\b/i;
const SUBJECTIVE_SOURCE_COPY = /\b(romslig(?:e|t)?|fullt utstyrt|velutstyrt|stor tomt|typisk spansk landsby|sosialt område|konsolidert urbanisering|godt tilpasset|komfortabel(?:t|e)? opphold|nyte utendørsarealer|flott(?:e|t)? område|god beliggenhet)\b/i;

export interface PropertyConversionNo {
  selling_intro_no: string;
  key_reasons_no: string[];
  lifestyle_no: string;
  ideal_for_no: string[];
  cta_reason_no: string;
  source_hash: string;
  generated_at: string;
  model: string;
  generation_mode: "ai" | "template";
  version: string;
}

type ConversionSource = {
  type: string;
  town: string;
  region: string;
  bedrooms: number | null;
  bathrooms: number | null;
  builtArea: number | null;
  plotSize: number | null;
  terraceSize: number | null;
  price: number | null;
  pool: boolean;
  garage: boolean;
  energy: string;
  features: string[];
  rawDescription: string;
};

type ConversionCopy = Omit<PropertyConversionNo, "source_hash" | "generated_at" | "model" | "generation_mode" | "version">;

function clean(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/&#13;|&#10;|&nbsp;/gi, " ")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

function positiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(clean).filter(Boolean))).slice(0, 18);
}

function metric(value: string) {
  return value.replace(".", ",");
}

export function propertyConversionSource(property: Record<string, unknown>): ConversionSource {
  const features = textArray(property.amenities_no ?? property.features);
  return {
    type: clean(property.property_type ?? property.type) || "Bolig",
    town: clean(property.town),
    region: clean(property.location),
    bedrooms: positiveNumber(property.bedrooms),
    bathrooms: positiveNumber(property.bathrooms),
    builtArea: positiveNumber(property.built_area ?? property.area_m2 ?? property.area),
    plotSize: positiveNumber(property.plot_size),
    terraceSize: positiveNumber(property.terrace_size),
    price: positiveNumber(property.price),
    pool: property.pool === true,
    garage: property.garage === true,
    energy: clean(property.energy_rating),
    features,
    rawDescription: clean(property.source_description ?? property.description ?? property.description_no).slice(0, 6500),
  };
}

export function computePropertyConversionSourceHash(property: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify({ version: CONVERSION_VERSION, ...propertyConversionSource(property) }))
    .digest("hex");
}

function deCaps(value: string): string {
  if (!value) return "Bolig";
  if (/[A-ZÆØÅ]/.test(value) && !/[a-zæøå]/.test(value)) {
    return value.toLowerCase().replace(/(^|\s)([a-zæøå])/g, (_m, s, c) => `${s}${c.toUpperCase()}`);
  }
  return value;
}

function safeFeature(value: string): string | null {
  const v = value.toLowerCase();
  if (/private pool|privat basseng|piscina privada/.test(v)) return "Privat basseng";
  if (/communal pool|community pool|shared pool|fellesbasseng|piscina comunitaria/.test(v)) return "Fellesbasseng";
  if (/\b(pool|basseng|piscina)\b/.test(v)) return "Basseng";
  if (/\b(terrace|terrasse|terraza)\b/.test(v)) return "Terrasse";
  if (/\b(garden|hage|jardin|jardín)\b/.test(v)) return "Hage";
  if (/\b(solarium)\b/.test(v)) return "Solarium";
  if (/\b(garage|garasje|garaje)\b/.test(v)) return "Garasje";
  if (/\b(parking|parkering|aparcamiento)\b/.test(v)) return "Parkering";
  if (/\b(lift|elevator|heis|ascensor)\b/.test(v)) return "Heis";
  if (/\b(sea view|sea views|havutsikt|vistas al mar)\b/.test(v)) return "Havutsikt";
  if (/air conditioning|aircondition|aire acondicionado|a\/c/.test(v)) return "Aircondition";
  return null;
}

function explicitRawFeatures(source: ConversionSource): string[] {
  const text = source.rawDescription.toLowerCase();
  const items: string[] = [];
  if (/privat(?:e)? basseng|private pool|piscina privada/.test(text)) items.push("Privat basseng");
  else if (/felles svømmebasseng|fellesbasseng|communal pool|community pool|piscina comunitaria/.test(text)) items.push("Fellesbasseng");
  else if (/\bbasseng\b|\bpool\b|\bpiscina\b/.test(text)) items.push("Basseng");
  if (/\bterrasse\b|\bterrace\b|\bterraza\b/.test(text)) items.push("Terrasse");
  if (/\bhage\b|\bgarden\b|\bjard[ií]n\b/.test(text)) items.push("Hage");
  if (/\bsolarium\b/.test(text)) items.push("Solarium");
  if (/\bgarasje\b|\bgarage\b|\bgaraje\b/.test(text)) items.push("Garasje");
  if (/\bparkering\b|\bparking\b|\baparcamiento\b/.test(text)) items.push("Parkering");
  if (/\bheis\b|\blift\b|\bascensor\b/.test(text)) items.push("Heis");
  if (/\bhavutsikt\b|\bsea views?\b|\bvistas al mar\b/.test(text)) items.push("Havutsikt");
  if (/\baircondition\b|\bair conditioning\b|\baire acondicionado\b|\bklimaanlegg\b/.test(text)) items.push("Aircondition");
  if (/åpen(?:t)? kjøkken|open[- ]plan kitchen|open plan kitchen|cocina abierta/.test(text)) items.push("Åpen kjøkkenløsning");
  return items;
}

function documentedFeatures(source: ConversionSource): string[] {
  return Array.from(new Set([
    ...source.features.map(safeFeature).filter((item): item is string => Boolean(item)),
    ...explicitRawFeatures(source),
    ...(source.pool ? ["Basseng"] : []),
    ...(source.garage ? ["Garasje"] : []),
  ])).slice(0, 8);
}

function sourceFactHighlights(source: ConversionSource): string[] {
  const raw = source.rawDescription;
  const items: string[] = [];
  const add = (value: string | null) => { if (value) items.push(value); };
  let m: RegExpMatchArray | null;

  if (/\bgolfutsikt\b/i.test(raw)) add("Golfutsikt er oppgitt i kildebeskrivelsen.");
  if (/frontlinjen av\s+ALHAMA SIGNATURE GOLF/i.test(raw)) add("Frontlinje ved Alhama Signature Golf er oppgitt i kildebeskrivelsen.");
  if (/18-hulls golfbane designet av Jack Nicklaus/i.test(raw)) add("Kildebeskrivelsen oppgir en 18-hulls golfbane designet av Jack Nicklaus.");
  if (/\bhavutsikt\b/i.test(raw)) add("Havutsikt er oppgitt i kildebeskrivelsen.");
  if (/felles svømmebasseng|fellesbasseng/i.test(raw)) add("Felles svømmebasseng er oppgitt i kildebeskrivelsen.");
  if (/privat(?:e)? basseng/i.test(raw)) add("Privat basseng er oppgitt i kildebeskrivelsen.");
  if (/\b2 minutters gange fra stranden\b/i.test(raw)) add("Kildebeskrivelsen oppgir 2 minutters gange til stranden.");
  if (/aerotermisk system|aerotermikk/i.test(raw)) add("Aerotermisk system er oppgitt i kildebeskrivelsen.");
  if (/gulvvarme/i.test(raw)) add("Gulvvarme er oppgitt i kildebeskrivelsen.");
  if (/sørøst orientert/i.test(raw)) add("Sørøstlig orientering er oppgitt i kildebeskrivelsen.");
  if (/kan tilpasses|tilpasses med/i.test(raw)) add("Kildebeskrivelsen oppgir mulighet for enkelte tilpasninger.");
  if (/\bnybyggvilla\b|\bnye leiligheter\b/i.test(raw)) add("Boligen er omtalt som nybygg i kildebeskrivelsen.");
  if (/\bi én etasje\b/i.test(raw)) add("Boligen er oppgitt i én etasje.");

  m = raw.match(/(?:bygget på en\s+)?(\d+(?:[,.]\d+)?)\s*m(?:2|²)\s*tomt/i);
  if (m) add(`Tomten er oppgitt til ${metric(m[1])} m².`);
  m = raw.match(/konstruert areal på\s*(\d+(?:[,.]\d+)?)\s*m(?:2|²)/i);
  if (m) add(`Konstruert areal er oppgitt til ${metric(m[1])} m².`);
  m = raw.match(/(?:en\s+)?(\d+(?:[,.]\d+)?)\s*m(?:2|²)\s*veranda/i);
  if (m) add(`Veranda er oppgitt til ${metric(m[1])} m².`);
  m = raw.match(/(?:en\s+)?(\d+(?:[,.]\d+)?)\s*m(?:2|²)\s*stue-spisestue-kjøkken/i);
  if (m) add(`Stue, spisestue og kjøkken er oppgitt til ${metric(m[1])} m².`);
  m = raw.match(/(?:et\s+)?(\d+(?:[,.]\d+)?)\s*m(?:2|²)\s*solarium/i);
  if (m) add(`Solarium er oppgitt til ${metric(m[1])} m².`);

  return Array.from(new Set(items)).slice(0, 8);
}

function placeLabel(source: ConversionSource): string {
  return source.town || source.region || "Spania";
}

export function propertyConversionFactSources(source: ConversionSource): Array<{ claim: string; source: string }> {
  const facts = [
    source.type ? `Boligtype: ${deCaps(source.type)}` : "",
    source.town ? `Sted: ${source.town}` : "",
    source.region ? `Region: ${source.region}` : "",
    source.bedrooms ? `Soverom: ${source.bedrooms}` : "",
    source.bathrooms ? `Bad: ${source.bathrooms}` : "",
    source.builtArea ? `Boligareal: ${source.builtArea} m²` : "",
    source.plotSize ? `Tomt: ${source.plotSize} m²` : "",
    source.terraceSize ? `Terrasse: ${source.terraceSize} m²` : "",
    source.price ? `Pris: €${source.price}` : "",
    source.pool ? "Basseng: ja" : "",
    source.garage ? "Garasje: ja" : "",
    source.energy && source.energy !== "X" ? `Energiklasse: ${source.energy}` : "",
    ...documentedFeatures(source).map((feature) => `Fasilitet: ${feature}`),
    ...sourceFactHighlights(source).map((fact) => `Kilde: ${fact}`),
  ].filter(Boolean);
  return facts.map((claim) => ({ claim, source: "RealtyFlow Inventory" }));
}

export function buildPropertyConversionFallback(
  property: Record<string, unknown>,
  now = new Date(),
): PropertyConversionNo {
  const source = propertyConversionSource(property);
  const type = deCaps(source.type);
  const place = placeLabel(source);
  const features = documentedFeatures(source);
  const highlights = sourceFactHighlights(source);
  const facts = [
    source.bedrooms ? `${source.bedrooms} soverom` : "",
    source.bathrooms ? `${source.bathrooms} bad` : "",
    source.builtArea ? `${source.builtArea} m² bolig` : "",
    source.plotSize ? `${source.plotSize} m² tomt` : "",
    source.terraceSize ? `${source.terraceSize} m² terrasse` : "",
  ].filter(Boolean);

  const introFacts = facts.slice(0, 3).join(", ");
  const featureTail = features.slice(0, 3).join(", ").toLowerCase();
  const sellingIntro = `${type} i ${place}${introFacts ? ` med ${introFacts}` : ""}. ${highlights.length
    ? highlights.slice(0, 2).join(" ")
    : featureTail
      ? `Fasiliteter oppgitt i boligdataene: ${featureTail}.`
      : "Ytterligere kvaliteter bør bekreftes i prospekt og plantegninger før de beskrives nærmere."}`;

  const reasons = Array.from(new Set([
    source.bedrooms ? `${source.bedrooms} soverom er oppgitt i boligdataene.` : "",
    source.bathrooms ? `${source.bathrooms} bad er oppgitt i boligdataene.` : "",
    ...highlights,
    source.builtArea ? `Oppgitt boligareal er ${source.builtArea} m².` : "",
    source.plotSize ? `Tomten er oppgitt til ${source.plotSize} m².` : "",
    source.terraceSize ? `Terrassen er oppgitt til ${source.terraceSize} m².` : "",
    ...features.map((feature) => `${feature} er oppgitt i boligdataene.`),
    `Boligtypen er oppgitt som ${type}.`,
  ].filter(Boolean))).slice(0, 6);

  const outdoor = features.filter((item) => /basseng|terrasse|hage|solarium/i.test(item));
  const practicalFacts = highlights.filter((item) => /veranda|solarium|én etasje|golfutsikt|havutsikt|basseng|orientering|gulvvarme|aerotermisk/i.test(item));
  const lifestyle = practicalFacts.length
    ? practicalFacts.slice(0, 2).join(" ")
    : outdoor.length
      ? `${outdoor.join(", ")} er oppgitt i boligdataene. Bruk og utforming bør bekreftes i prospekt og plantegninger.`
      : "Boligdataene gir ikke grunnlag for å beskrive livsstil eller praktisk bruk utover de oppgitte faktaene.";

  const idealFor = Array.from(new Set([
    source.bedrooms && source.bedrooms >= 2 ? `Kjøpere som ønsker ${source.bedrooms} separate soverom.` : "",
    source.bathrooms && source.bathrooms >= 2 ? `Kjøpere som ønsker ${source.bathrooms} bad.` : "",
    /golfutsikt/i.test(source.rawDescription) ? "Kjøpere som ønsker dokumentert golfutsikt." : "",
    /havutsikt/i.test(source.rawDescription) ? "Kjøpere som ønsker dokumentert havutsikt." : "",
    /\bi én etasje\b/i.test(source.rawDescription) ? "Kjøpere som ønsker bolig i én etasje." : "",
    outdoor.length ? "Kjøpere som ønsker dokumentert uteareal eller basseng." : "",
    source.plotSize || /\bm(?:2|²)\s*tomt/i.test(source.rawDescription) ? "Kjøpere som ønsker en bolig med oppgitt egen tomt." : "",
  ].filter(Boolean))).slice(0, 4);

  return {
    selling_intro_no: sellingIntro,
    key_reasons_no: reasons,
    lifestyle_no: lifestyle,
    ideal_for_no: idealFor,
    cta_reason_no: "Be om komplett prospekt og plantegninger for å bekrefte tilgjengelighet, leveranseomfang og øvrige boligfakta.",
    source_hash: computePropertyConversionSourceHash(property),
    generated_at: now.toISOString(),
    model: "template-conversion-v6",
    generation_mode: "template",
    version: CONVERSION_VERSION,
  };
}

function sourceAllowsClaim(source: ConversionSource, claim: RegExp) {
  return claim.test([source.rawDescription, source.features.join(" ")].join(" "));
}

function numericClaimsAreGrounded(text: string, source: ConversionSource) {
  const normalized = text.replace(/,/g, ".");
  const values = Array.from(normalized.matchAll(/\b(\d+(?:\.\d+)?)\s*m(?:²|2)\b/gi)).map((m) => Number(m[1]));
  if (!values.length) return true;
  const structured = [source.builtArea, source.plotSize, source.terraceSize].filter((n): n is number => Boolean(n));
  const rawNormalized = source.rawDescription.replace(/,/g, ".");
  return values.every((value) =>
    structured.some((n) => Math.abs(n - value) < 0.011) ||
    new RegExp(`(^|\\D)${String(value).replace(".", "\\.")}\\s*m(?:²|2)(\\D|$)`, "i").test(rawNormalized),
  );
}

function idealForClaimsAreGrounded(items: string[], source: ConversionSource) {
  if (items.length < 1 || items.length > 4) return false;
  const features = documentedFeatures(source).join(" ").toLowerCase();
  const raw = source.rawDescription.toLowerCase();

  return items.every((item) => {
    if (!/^Kjøpere som ønsker\b/i.test(item)) return false;
    if (DEMOGRAPHIC_AUDIENCE.test(item) || UNSUPPORTED_AUDIENCE.test(item)) return false;

    const lower = item.toLowerCase();
    if (/soverom/.test(lower)) return Boolean(source.bedrooms && new RegExp(`\\b${source.bedrooms}\\b`).test(lower));
    if (/\bbad\b/.test(lower)) return Boolean(source.bathrooms && new RegExp(`\\b${source.bathrooms}\\b`).test(lower));
    if (/havutsikt|sjøutsikt|utsikt mot havet/.test(lower)) return /sea views?|havutsikt|vistas al mar/.test(raw);
    if (/golf/.test(lower)) return /golf/.test(raw);
    if (/basseng/.test(lower)) return /basseng|pool|piscina/.test(`${features} ${raw}`);
    if (/terrasse|hage|solarium|uteareal/.test(lower)) return /terrasse|terrace|terraza|hage|garden|jard[ií]n|solarium|basseng|pool|piscina/.test(`${features} ${raw}`);
    if (/tomt/.test(lower)) return Boolean(source.plotSize || /tomt|plot|parcela/.test(raw));
    if (/nybygg/.test(lower)) return /nybygg|new build|obra nueva/.test(raw);
    if (/én etasje|en etasje|ett plan/.test(lower)) return /én etasje|en etasje|one floor|single storey|single-story|una planta/.test(raw);
    return false;
  });
}

export function propertyConversionOutputIsSafe(value: ConversionCopy, source?: ConversionSource) {
  const all = [value.selling_intro_no, ...value.key_reasons_no, value.lifestyle_no, ...value.ideal_for_no, value.cta_reason_no]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!all || FORBIDDEN.test(all) || PLACEHOLDER.test(all) || UNSUPPORTED_AUDIENCE.test(all) || DEMOGRAPHIC_AUDIENCE.test(all) || UNSUPPORTED_LIFESTYLE.test(all) || SUBJECTIVE_SOURCE_COPY.test(all)) return false;
  if (value.selling_intro_no.length < 80 || value.key_reasons_no.length < 3 || value.key_reasons_no.length > 6 || value.ideal_for_no.length < 1 || value.ideal_for_no.length > 4) return false;

  if (source) {
    const sharedUnsupported = unsupportedOutcomeClaims(all, propertyConversionFactSources(source), { inventoryBound: true });
    if (sharedUnsupported.length > 0) return false;
    if (!idealForClaimsAreGrounded(value.ideal_for_no, source)) return false;

    const lower = all.toLowerCase();
    const groundedClaims: Array<[RegExp, RegExp, boolean]> = [
      [/\b(havutsikt|sjøutsikt|utsikt mot havet)\b/i, /sea views?|havutsikt|vistas al mar/i, false],
      [/\b(golf|golfbane|golfanlegg)\b/i, /golf/i, false],
      [/\b(strand|kystliv|sjøen)\b/i, /beach|strand|playa|sea|mar/i, false],
      [/\b(solarium)\b/i, /solarium/i, false],
      [/\b(terrasse)\b/i, /terrace|terrasse|terraza/i, Boolean(source.terraceSize)],
      [/\b(basseng)\b/i, /pool|basseng|piscina/i, source.pool],
      [/\b(garasje)\b/i, /garage|garasje|garaje/i, source.garage],
      [/\b(aircondition|klimaanlegg)\b/i, /air conditioning|aircondition|aire acondicionado|a\/c/i, false],
    ];
    for (const [outputPattern, sourcePattern, explicitFlag] of groundedClaims) {
      if (outputPattern.test(lower) && !explicitFlag && !sourceAllowsClaim(source, sourcePattern)) return false;
    }

    if (!numericClaimsAreGrounded(all, source)) return false;
  }

  return true;
}

function parseAi(text: string, source: ConversionSource) {
  try {
    const candidate = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const raw = JSON.parse(candidate) as Record<string, unknown>;
    const parsed: ConversionCopy = {
      selling_intro_no: clean(raw.selling_intro_no),
      key_reasons_no: textArray(raw.key_reasons_no).slice(0, 6),
      lifestyle_no: clean(raw.lifestyle_no),
      ideal_for_no: textArray(raw.ideal_for_no).slice(0, 4),
      cta_reason_no: clean(raw.cta_reason_no),
    };
    return propertyConversionOutputIsSafe(parsed, source) ? parsed : null;
  } catch {
    return null;
  }
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    selling_intro_no: { type: "string" },
    key_reasons_no: { type: "array", items: { type: "string" } },
    lifestyle_no: { type: "string" },
    ideal_for_no: { type: "array", items: { type: "string" } },
    cta_reason_no: { type: "string" },
  },
  required: ["selling_intro_no", "key_reasons_no", "lifestyle_no", "ideal_for_no", "cta_reason_no"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Du skriver faktabasert, nøktern norsk boligtekst for Zen Eco Homes.
Målet er å gjøre dokumenterte egenskaper enklere å forstå, ikke å overtale med antakelser eller markedsføringsspråk.

Regler:
- Bruk KUN eksplisitte fakta i input. Hvis et faktum ikke står i input, skal det ikke omtales.
- Ikke utled investor-/utleiepotensial, avkastning, målgrupper eller livsstil som ikke følger direkte av dokumenterte boligegenskaper.
- Ikke gjenta subjektive salgsord fra kildebeskrivelsen. Ord som luksus/luksuriøs, moderne, romslig, sjarmerende, vakker, flott, fantastisk, fabelaktig, eksklusiv, perfekt, ideell eller attraktiv skal utelates selv om de finnes i feedteksten.
- Unngå også vage formuleringer som «stor tomt», «fullt utstyrt», «velutstyrt», «typisk spansk landsby», «sosialt område», «konsolidert urbanisering», «godt tilpasset» og formuleringer om å «nyte» en bestemt livsstil. Beskriv heller den konkrete egenskapen.
- Ikke utled energieffektivitet, lave kostnader eller komfort fra energiklasse eller tekniske systemer alene.
- Ikke finn på eller generaliser avstander, utsikt, solforhold, møbler, materialkvalitet, ferdigstillelse, nærservice eller hva som er inkludert.
- Tall i teksten skal være de samme som i input eller stå bokstavelig i kildebeskrivelsen. Ikke regn ut eller avrund nye tall.
- selling_intro_no: 2–4 naturlige setninger basert på boligtype, sted og dokumenterte egenskaper.
- key_reasons_no: 3–6 korte, ulike og faktabaserte punkter. Beskriv hva som er oppgitt; unngå antatte fordeler.
- lifestyle_no: beskriv bare dokumenterte planløsnings-/utearealfakta. Ingen stemning, områdekarakter eller antatt livsstil.
- ideal_for_no: 1–4 nøkterne behovsbeskrivelser. HVER linje skal starte med «Kjøpere som ønsker ...». Ikke bruk familier, personer, par, pensjonister, investorer, «de som» eller annen demografi. Bruk bare dokumenterte behov som antall soverom/bad, eksplisitt dokumentert havutsikt/golf/basseng/uteareal/tomt/nybygg/én etasje.
- cta_reason_no: én konkret grunn til å be om prospekt/plantegninger og få bekreftet leveranse/tilgjengelighet.
- Returner KUN gyldig JSON etter skjemaet.`;

function buildUserPrompt(source: ConversionSource) {
  return `Boligtype: ${source.type}\
By/sted (kanonisk): ${source.town || "-"}\
Region/feed-lokasjon: ${source.region || "-"}\
Soverom: ${source.bedrooms ?? "-"}\
Bad: ${source.bathrooms ?? "-"}\
Boligareal: ${source.builtArea ?? "-"}\
Tomt: ${source.plotSize ?? "-"}\
Terrasse: ${source.terraceSize ?? "-"}\
Pris: ${source.price ?? "-"}\
Bassengflag: ${source.pool ? "ja" : "nei/ikke oppgitt"}\
Garasjeflag: ${source.garage ? "ja" : "nei/ikke oppgitt"}\
Energiklasse: ${source.energy || "-"}\
Dokumenterte fasiliteter: ${source.features.join(", ") || "-"}\
Kildebeskrivelse: ${source.rawDescription || "-"}`;
}

export async function generatePropertyConversionNo(
  property: Record<string, unknown>,
  options?: { now?: Date; forceTemplate?: boolean },
): Promise<PropertyConversionNo> {
  const now = options?.now ?? new Date();
  const fallback = buildPropertyConversionFallback(property, now);
  if (options?.forceTemplate) return fallback;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) return fallback;

  try {
    const source = propertyConversionSource(property);
    const raw = await askClaude(buildUserPrompt(source), {
      systemPrompt: SYSTEM_PROMPT,
      model: "haiku",
      maxTokens: 900,
      temperature: 0.15,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      validateResponse: (value) => parseAi(value, source) !== null,
      fallbackOnInvalidResponse: true,
    });
    const parsed = parseAi(raw, source);
    if (!parsed) return fallback;
    return {
      ...parsed,
      source_hash: computePropertyConversionSourceHash(property),
      generated_at: now.toISOString(),
      model: "realtyflow-ai-chain/haiku",
      generation_mode: "ai",
      version: CONVERSION_VERSION,
    };
  } catch (error) {
    console.warn("[property-conversion-no] AI generation failed; using factual fallback:", error instanceof Error ? error.message : error);
    return fallback;
  }
}
