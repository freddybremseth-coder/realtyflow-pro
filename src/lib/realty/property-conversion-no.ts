import { createHash } from "node:crypto";
import { askClaude } from "@/services/ai/claude-client";

const CONVERSION_VERSION = "conversion-v1";
const FORBIDDEN = /\b(drømmebolig|unik|fantastisk|eksklusiv|spektakulær|perfekt|førsteklasses|uslåelig|enestående)\b/i;
const PLACEHOLDER = /\b(ikke angitt|ukjent|ikke oppgitt|ikke spesifisert|mangler)\b/i;

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
  else if (/fellesbasseng|communal pool|community pool|piscina comunitaria/.test(text)) items.push("Fellesbasseng");
  else if (/\bbasseng\b|\bpool\b|\bpiscina\b/.test(text)) items.push("Basseng");
  if (/\bterrasse\b|\bterrace\b|\bterraza\b/.test(text)) items.push("Terrasse");
  if (/\bhage\b|\bgarden\b|\bjard[ií]n\b/.test(text)) items.push("Hage");
  if (/\bsolarium\b/.test(text)) items.push("Solarium");
  if (/\bgarasje\b|\bgarage\b|\bgaraje\b/.test(text)) items.push("Garasje");
  if (/\bparkering\b|\bparking\b|\baparcamiento\b/.test(text)) items.push("Parkering");
  if (/\bheis\b|\blift\b|\bascensor\b/.test(text)) items.push("Heis");
  if (/\bhavutsikt\b|\bsea views?\b|\bvistas al mar\b/.test(text)) items.push("Havutsikt");
  if (/\baircondition\b|\bair conditioning\b|\baire acondicionado\b/.test(text)) items.push("Aircondition");
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

function placeLabel(source: ConversionSource): string {
  return source.town || source.region || "Spania";
}

export function buildPropertyConversionFallback(
  property: Record<string, unknown>,
  now = new Date(),
): PropertyConversionNo {
  const source = propertyConversionSource(property);
  const type = deCaps(source.type);
  const place = placeLabel(source);
  const features = documentedFeatures(source);

  const facts = [
    source.bedrooms ? `${source.bedrooms} soverom` : "",
    source.bathrooms ? `${source.bathrooms} bad` : "",
    source.builtArea ? `${Math.round(source.builtArea)} m² bolig` : "",
    source.plotSize ? `${Math.round(source.plotSize)} m² tomt` : "",
    source.terraceSize ? `${Math.round(source.terraceSize)} m² terrasse` : "",
  ].filter(Boolean);

  const introFacts = facts.slice(0, 3).join(", ");
  const featureTail = features.slice(0, 3).join(", ").toLowerCase();
  const sellingIntro = `${type} i ${place}${introFacts ? ` med ${introFacts}` : ""}. ${
    featureTail
      ? `Det som gjør boligen verdt å se nærmere på er kombinasjonen av ${featureTail}.`
      : "Planløsning, beliggenhet og leveranse bør vurderes samlet før du sammenligner den med andre alternativer."
  }`;

  const reasons = Array.from(new Set([
    source.bedrooms ? `${source.bedrooms} separate soverom gir fleksibilitet for familie, gjester eller hjemmekontor.` : "",
    source.bathrooms && source.bathrooms > 1 ? `${source.bathrooms} bad gjør boligen mer praktisk når flere bruker den samtidig.` : "",
    source.builtArea ? `Oppgitt boligareal er ${Math.round(source.builtArea)} m².` : "",
    source.plotSize ? `Tomten er oppgitt til ${Math.round(source.plotSize)} m².` : "",
    source.terraceSize ? `Terrassen er oppgitt til ${Math.round(source.terraceSize)} m².` : "",
    ...features.map((feature) => `${feature} er oppgitt i boligdataene.`),
  ].filter(Boolean))).slice(0, 5);

  const outdoor = features.filter((item) => /basseng|terrasse|hage|solarium/i.test(item));
  const lifestyle = outdoor.length
    ? `${outdoor.join(", ")} gir boligen et tydelig utefokus. Sammen med planløsningen er dette noe vi ville vurdert konkret på visning.`
    : `Denne boligen bør vurderes ut fra hvordan planløsningen fungerer i praksis, hvilke kvaliteter som faktisk følger leveransen og hvordan beliggenheten passer hverdagen din.`;

  const idealFor = Array.from(new Set([
    source.bedrooms && source.bedrooms >= 3 ? `Familie eller par som ønsker ${source.bedrooms} soverom.` : "",
    source.bedrooms && source.bedrooms >= 2 ? "Kjøpere som ønsker plass til gjester eller hjemmekontor." : "",
    outdoor.length ? "Kjøpere som prioriterer privat eller felles uteareal." : "",
    source.plotSize ? "Kjøpere som ønsker en bolig med egen tomt." : "",
  ].filter(Boolean))).slice(0, 3);

  return {
    selling_intro_no: sellingIntro,
    key_reasons_no: reasons,
    lifestyle_no: lifestyle,
    ideal_for_no: idealFor,
    cta_reason_no: "Be om komplett prospekt og plantegninger, så sjekker vi oppdatert tilgjengelighet, hva som faktisk er inkludert og hvordan boligen står seg mot relevante alternativer.",
    source_hash: computePropertyConversionSourceHash(property),
    generated_at: now.toISOString(),
    model: "template-conversion-v1",
    generation_mode: "template",
    version: CONVERSION_VERSION,
  };
}

function outputIsSafe(value: Omit<PropertyConversionNo, "source_hash" | "generated_at" | "model" | "generation_mode" | "version">) {
  const all = [value.selling_intro_no, ...value.key_reasons_no, value.lifestyle_no, ...value.ideal_for_no, value.cta_reason_no]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return Boolean(all) && !FORBIDDEN.test(all) && !PLACEHOLDER.test(all)
    && value.selling_intro_no.length >= 80
    && value.key_reasons_no.length >= 3
    && value.key_reasons_no.length <= 6
    && value.ideal_for_no.length <= 4;
}

function parseAi(text: string) {
  try {
    const candidate = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const raw = JSON.parse(candidate) as Record<string, unknown>;
    const parsed = {
      selling_intro_no: clean(raw.selling_intro_no),
      key_reasons_no: textArray(raw.key_reasons_no).slice(0, 6),
      lifestyle_no: clean(raw.lifestyle_no),
      ideal_for_no: textArray(raw.ideal_for_no).slice(0, 4),
      cta_reason_no: clean(raw.cta_reason_no),
    };
    return outputIsSafe(parsed) ? parsed : null;
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

const SYSTEM_PROMPT = `Du skriver konverterende, men nøktern norsk boligtekst for Zen Eco Homes.
Målet er at en seriøs boligkjøper skal forstå hvorfor akkurat denne boligen er verdt å undersøke videre og få lyst til å be om prospekt eller visning.

Regler:
- Bruk KUN fakta i input. Ikke finn på avstander, utsikt, solforhold, møbler, materialkvalitet, ferdigstillelse, utleiepotensial, nærservice eller hva som er inkludert.
- Hvis noe ikke er dokumentert, utelat det. Ikke skriv plassholdere.
- Ikke bruk superlativer eller klassisk meglerhype: drømmebolig, unik, fantastisk, eksklusiv, spektakulær, perfekt, førsteklasses, uslåelig, enestående.
- Du kan forklare praktisk verdi av dokumenterte fakta med forsiktig språk, for eksempel "gir fleksibilitet", "kan passe for" og "gjør boligen praktisk når flere bruker den".
- selling_intro_no: 2–4 naturlige setninger som skaper interesse gjennom konkrete kvaliteter, ikke hype.
- key_reasons_no: 3–6 korte, ulike grunner basert på dokumenterte fakta.
- lifestyle_no: 1–3 setninger om hvordan de dokumenterte boligkvalitetene kan påvirke bruken av hjemmet. Ikke dikt opp nærområdet.
- ideal_for_no: 1–4 korte målgruppebeskrivelser formulert som "kan passe for" eller tilsvarende, utledet forsiktig fra planløsning/uteareal.
- cta_reason_no: én konkret grunn til å ta kontakt: prospekt, plantegninger, oppdatert tilgjengelighet, leveranseomfang og sammenligning med alternativer.
- Returner KUN gyldig JSON etter skjemaet.`;

function buildUserPrompt(source: ConversionSource) {
  return `Boligtype: ${source.type}\nBy/sted (kanonisk): ${source.town || "-"}\nRegion/feed-lokasjon: ${source.region || "-"}\nSoverom: ${source.bedrooms ?? "-"}\nBad: ${source.bathrooms ?? "-"}\nBoligareal: ${source.builtArea ?? "-"}\nTomt: ${source.plotSize ?? "-"}\nTerrasse: ${source.terraceSize ?? "-"}\nPris: ${source.price ?? "-"}\nBassengflag: ${source.pool ? "ja" : "nei/ikke oppgitt"}\nGarasjeflag: ${source.garage ? "ja" : "nei/ikke oppgitt"}\nEnergiklasse: ${source.energy || "-"}\nDokumenterte fasiliteter: ${source.features.join(", ") || "-"}\nKildebeskrivelse: ${source.rawDescription || "-"}`;
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
      maxTokens: 950,
      temperature: 0.25,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      validateResponse: (value) => parseAi(value) !== null,
      fallbackOnInvalidResponse: true,
    });
    const parsed = parseAi(raw);
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
