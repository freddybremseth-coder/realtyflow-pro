import { createHash } from "node:crypto";
import { askClaude } from "@/services/ai/claude-client";

export const PROPERTY_EDITORIAL_NO_SYSTEM_PROMPT = `Du er en norsk eiendomsredaktør for ZenEco Homes (Costa Blanca, Spania).
Du får rådata om én bolig. Skriv en kort, nøktern norsk annonsetekst i et
FAST format. Regler:
- Ikke overdriv, ikke bruk superlativer ("drømmebolig", "unik", "fantastisk").
- Ikke finn på fakta. Bruk kun det som står i rådataene.
- Naturlig, korrekt norsk — ingen maskinoversettelse-preg.
- Returner KUN gyldig JSON etter skjemaet. Ingen forklaring, ingen markdown.
- headline_no skal være kort og faktabasert. Ikke konverter antall soverom til et antall "rom" med mindre kilden sier det eksplisitt.
- bullets_no skal bare inneholde fasiliteter eller egenskaper som er eksplisitt støttet av rådataene.
- orientation_no skal være "Ikke angitt" hvis bruksorientering ikke er eksplisitt støttet av rådataene.`;

const FORBIDDEN_CLAIMS = /\b(drømmebolig|unik|fantastisk|eksklusiv|spektakulær|perfekt)\b/i;

export interface PropertyEditorialNo {
  headline_no: string;
  intro_no: string;
  bullets_no: string[];
  orientation_no: string;
  source_hash: string;
  generated_at: string;
  model: string;
}

export interface EditorialSourceData {
  type: string;
  beds: number | null;
  baths: number | null;
  area: string;
  m2: number | null;
  floor: string;
  features: string[];
  epc: string;
  price: number | null;
  rawDescription: string;
  orientation: string;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function toFiniteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(normalizeText).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right, "nb"));
}

export function propertyEditorialSource(property: Record<string, unknown>): EditorialSourceData {
  const features = stringArray(property.amenities_no ?? property.features);
  if (property.pool === true && !features.some((feature) => /basseng|pool/i.test(feature))) {
    features.push("Basseng");
  }
  if (property.garage === true && !features.some((feature) => /garasje|garage|parkering/i.test(feature))) {
    features.push("Garasje");
  }

  return {
    type: normalizeText(property.property_type ?? property.type) || "Eiendom",
    beds: toFiniteNumber(property.bedrooms ?? property.beds),
    baths: toFiniteNumber(property.bathrooms ?? property.baths),
    area: normalizeText(property.location ?? property.town) || "Ikke angitt",
    m2: toFiniteNumber(property.built_area ?? property.area ?? property.m2),
    floor: normalizeText(property.floor_label ?? property.floor) || "Ikke angitt",
    features,
    epc: normalizeText(property.energy_rating ?? property.epc) || "Ikke angitt",
    price: toFiniteNumber(property.price),
    rawDescription:
      normalizeText(property.source_description ?? property.raw_description ?? property.description ?? property.description_no),
    orientation: normalizeText(property.orientation_source ?? property.orientation),
  };
}

export function computePropertyEditorialSourceHash(property: Record<string, unknown>): string {
  const source = propertyEditorialSource(property);
  const canonical = JSON.stringify({
    type: source.type,
    beds: source.beds,
    baths: source.baths,
    area: source.area,
    m2: source.m2,
    floor: source.floor,
    features: [...source.features].sort((a, b) => a.localeCompare(b, "nb")),
    epc: source.epc,
    price: source.price,
    raw_description: source.rawDescription,
    orientation: source.orientation,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function bedroomPhrase(count: number | null): string {
  return count ? `${count} soverom` : "";
}

function bathroomPhrase(count: number | null): string {
  return count ? `${count} bad` : "";
}

export function buildPropertyEditorialFallback(
  property: Record<string, unknown>,
  now: Date = new Date(),
): PropertyEditorialNo {
  const source = propertyEditorialSource(property);
  const sourceHash = computePropertyEditorialSourceHash(property);
  const locationSuffix = source.area !== "Ikke angitt" ? ` i ${source.area}` : "";
  const bedText = bedroomPhrase(source.beds);
  const bathText = bathroomPhrase(source.baths);
  const facts = [bedText, bathText].filter(Boolean);

  const headline = facts.length > 0
    ? `${source.type} med ${facts[0]}${locationSuffix}`
    : `${source.type}${locationSuffix}`;

  const introParts: string[] = [];
  if (facts.length > 0) introParts.push(`${source.type} med ${facts.join(" og ")}${locationSuffix}.`);
  else introParts.push(`${source.type}${locationSuffix}.`);
  if (source.m2) introParts.push(`Bruksareal ${source.m2} m².`);
  if (source.epc !== "Ikke angitt") introParts.push(`Energiklasse ${source.epc}.`);

  const bullets = [...source.features].slice(0, 5);
  if (source.floor !== "Ikke angitt" && !bullets.some((item) => item.toLowerCase().includes("etasje"))) {
    bullets.push(`Etasje/plan: ${source.floor}`);
  }

  return {
    headline_no: headline,
    intro_no: introParts.join(" "),
    bullets_no: bullets.slice(0, 5),
    orientation_no: source.orientation || "Ikke angitt",
    source_hash: sourceHash,
    generated_at: now.toISOString(),
    model: "template-v1",
  };
}

function editableAiShape(value: unknown): value is {
  headline_no: string;
  intro_no: string;
  bullets_no: string[];
  orientation_no: string;
} {
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  if (typeof object.headline_no !== "string" || !object.headline_no.trim()) return false;
  if (typeof object.intro_no !== "string" || !object.intro_no.trim()) return false;
  if (!Array.isArray(object.bullets_no) || !object.bullets_no.every((item) => typeof item === "string")) return false;
  if (typeof object.orientation_no !== "string" || !object.orientation_no.trim()) return false;
  const combined = [object.headline_no, object.intro_no, ...object.bullets_no, object.orientation_no].join(" ");
  return !FORBIDDEN_CLAIMS.test(combined);
}

function parseAiEditorial(text: string): {
  headline_no: string;
  intro_no: string;
  bullets_no: string[];
  orientation_no: string;
} | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!editableAiShape(parsed)) return null;
    return {
      headline_no: parsed.headline_no.trim(),
      intro_no: parsed.intro_no.trim(),
      bullets_no: Array.from(new Set(parsed.bullets_no.map((item) => item.trim()).filter(Boolean))).slice(0, 6),
      orientation_no: parsed.orientation_no.trim(),
    };
  } catch {
    return null;
  }
}

function buildUserPrompt(source: EditorialSourceData): string {
  return `Boligtype: ${source.type}          Soverom: ${source.beds ?? "Ikke angitt"}     Bad: ${source.baths ?? "Ikke angitt"}
Område/by: ${source.area}          Bruksareal: ${source.m2 ?? "Ikke angitt"} m² Etasje/plan: ${source.floor}
Fasiliteter: ${source.features.length > 0 ? source.features.join(", ") : "Ikke angitt"}    Energiklasse: ${source.epc}  Pris: ${source.price ? `€${source.price}` : "Ikke angitt"}
Beskrivelse (kilde): ${source.rawDescription || "Ikke angitt"}`;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    headline_no: { type: "string" },
    intro_no: { type: "string" },
    bullets_no: { type: "array", items: { type: "string" } },
    orientation_no: { type: "string" },
  },
  required: ["headline_no", "intro_no", "bullets_no", "orientation_no"],
  additionalProperties: false,
};

export async function generatePropertyEditorialNo(
  property: Record<string, unknown>,
  options?: { forceTemplate?: boolean; now?: Date },
): Promise<{ editorial: PropertyEditorialNo; usedFallback: boolean }> {
  const fallback = buildPropertyEditorialFallback(property, options?.now);
  if (options?.forceTemplate) return { editorial: fallback, usedFallback: true };

  const hasAiProvider = Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY,
  );
  if (!hasAiProvider) return { editorial: fallback, usedFallback: true };

  const source = propertyEditorialSource(property);
  try {
    const raw = await askClaude(buildUserPrompt(source), {
      systemPrompt: PROPERTY_EDITORIAL_NO_SYSTEM_PROMPT,
      model: "haiku",
      maxTokens: 650,
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      validateResponse: (text) => parseAiEditorial(text) !== null,
      fallbackOnInvalidResponse: true,
    });
    const parsed = parseAiEditorial(raw);
    if (!parsed) return { editorial: fallback, usedFallback: true };

    return {
      editorial: {
        ...parsed,
        source_hash: fallback.source_hash,
        generated_at: (options?.now ?? new Date()).toISOString(),
        model: "realtyflow-ai-chain/haiku",
      },
      usedFallback: false,
    };
  } catch (error) {
    console.warn(
      "[property-editorial-no] AI generation failed, using deterministic fallback:",
      error instanceof Error ? error.message : error,
    );
    return { editorial: fallback, usedFallback: true };
  }
}

export function existingEditorialHasSameSource(
  property: Record<string, unknown>,
  editorial: unknown,
): editorial is PropertyEditorialNo {
  if (!editorial || typeof editorial !== "object") return false;
  const sourceHash = (editorial as Record<string, unknown>).source_hash;
  return typeof sourceHash === "string" && sourceHash === computePropertyEditorialSourceHash(property);
}
