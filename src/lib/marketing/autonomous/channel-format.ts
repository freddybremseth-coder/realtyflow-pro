/**
 * Phase 7.1K — kanal/format-kontrakt. Streng separasjon mellom
 * PRODUKSJONSMANUS (reel-script, scene-anvisninger) og den FERDIGE
 * kundevendte captionen som faktisk sendes til Meta.
 *
 * Bakgrunn: AI-modus genererte et helt Reel-produksjonsmanus som «FINAL
 * INSTAGRAM CAPTION» fordi genome defaulter til format="reel". En Meta-caption
 * skal ALDRI inneholde produksjonsanvisninger — uansett format.
 */

import type { ContentFormat } from "../genome";

/** Markører som avslører at teksten er et produksjonsmanus, ikke en caption. */
const PRODUCTION_MARKERS: Array<{ label: string; re: RegExp }> = [
  { label: "HOOK", re: /(^|\n|\s)HOOK\b/ },
  { label: "SCENE", re: /(^|\n|\s)SCENE\b|scene\s*\d/i },
  { label: "Bilde:", re: /(^|\n)\s*bilde\s*:/i },
  { label: "Tekst-overlay:", re: /tekst-?overlay\s*:/i },
  { label: "CTA-SCENE", re: /cta[-\s]?scene/i },
  { label: "Caption:", re: /(^|\n)\s*caption\s*:/i },
  { label: "Voiceover:", re: /voiceover\s*:/i },
  { label: "Shot", re: /(^|\n|\s)shot\s*\d/i },
  { label: "Klipp:", re: /(^|\n)\s*klipp\s*:/i },
  { label: "B-roll", re: /\bb-roll\b/i },
];

/** Returnerer funne produksjonsmarkører i teksten (tom = ren caption). */
export function findProductionDirection(text: string | null | undefined): string[] {
  const t = text ?? "";
  return PRODUCTION_MARKERS.filter((m) => m.re.test(t)).map((m) => m.label);
}

export interface ChannelFormatFitness {
  ok: boolean;
  markers: string[];
  reason: string;
}

/**
 * Caption-fitness for kanalen: en Meta-caption (uansett format) skal være ren
 * kundevendt tekst — aldri produksjonsmanus. For reel kan manus ligge i et EGET
 * felt/artefakt, men captionen selv må være ren.
 */
export function channelFormatFitness(caption: string | null | undefined): ChannelFormatFitness {
  const markers = findProductionDirection(caption);
  return markers.length === 0
    ? { ok: true, markers: [], reason: "Ren caption." }
    : { ok: false, markers, reason: `CHANNEL_FORMAT_MISMATCH: captionen inneholder produksjonsanvisninger (${markers.join(", ")}) — ikke kundevendt tekst.` };
}

/**
 * Rut content-format fra media. ALDRI reel bare fordi kanal=instagram:
 *   video-URL → reel · flere bilder (carousel) → carousel · statisk bilde → post.
 * Uten media → undefined (behold eksisterende default).
 */
export function routeContentFormat(media?: { imageUrl?: string; videoUrl?: string; imageUrls?: string[] } | string | null): ContentFormat | undefined {
  if (!media) return undefined;
  if (typeof media === "string") {
    return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(media) ? "reel" : /^https?:\/\//i.test(media) ? "post" : undefined;
  }
  if (media.videoUrl) return "reel";
  if (Array.isArray(media.imageUrls) && media.imageUrls.length > 1) return "carousel";
  if (media.imageUrl) return "post";
  return undefined;
}
