/**
 * Phase 7.1K — kanal/format-kontrakt. Streng separasjon mellom
 * PRODUKSJONSMANUS (reel-script, scene-anvisninger) og den FERDIGE
 * kundevendte captionen som faktisk sendes til Meta.
 *
 * Bakgrunn: AI-modus genererte et helt Reel-produksjonsmanus som «FINAL
 * INSTAGRAM CAPTION» fordi genome defaulter til format="reel". En Meta-caption
 * skal ALDRI inneholde produksjonsanvisninger — uansett format. Sosial copy
 * skal heller ikke inneholde Markdown-lenker eller repetere samme CTA-URL.
 */

import type { ContentFormat } from "../genome";

/** Statiske markører som avslører at teksten ikke er en ren kanal-caption. */
const FORMAT_MARKERS: Array<{ label: string; re: RegExp }> = [
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
  { label: "Markdown-link", re: /\[[^\]\n]{1,160}\]\(\s*https?:\/\/[^)\s]+\s*\)/i },
];

function repeatedUrlBase(text: string): boolean {
  const urls = text.match(/https?:\/\/[^\s)\]]+/gi) ?? [];
  const counts = new Map<string, number>();
  for (const raw of urls) {
    const clean = raw.replace(/[.,;!?]+$/g, "");
    const base = clean.split("#")[0].replace(/\/$/, "").toLowerCase();
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  // Den kanoniske property-CTA-en bruker samme base to ganger (bolig + #kontakt).
  // Tre eller flere forekomster betyr at modellen også har lagt lenken i body.
  return Array.from(counts.values()).some((count) => count >= 3);
}

/**
 * Returnerer formatmarkører i teksten (tom = ren caption). Navnet beholdes for
 * bakoverkompatibilitet, men inkluderer nå også Markdown-/CTA-duplikatbrudd.
 */
export function findProductionDirection(text: string | null | undefined): string[] {
  const t = text ?? "";
  const markers = FORMAT_MARKERS.filter((m) => m.re.test(t)).map((m) => m.label);
  if (repeatedUrlBase(t)) markers.push("Repeated CTA URL");
  return markers;
}

export interface ChannelFormatFitness {
  ok: boolean;
  markers: string[];
  reason: string;
}

/**
 * Caption-fitness for kanalen: en Meta-caption (uansett format) skal være ren
 * kundevendt tekst — aldri produksjonsmanus, Markdown-lenke eller CTA-duplikat.
 * For reel kan manus ligge i et EGET felt/artefakt, men captionen selv må være ren.
 */
export function channelFormatFitness(caption: string | null | undefined): ChannelFormatFitness {
  const markers = findProductionDirection(caption);
  return markers.length === 0
    ? { ok: true, markers: [], reason: "Ren caption." }
    : { ok: false, markers, reason: `CHANNEL_FORMAT_MISMATCH: captionen bryter kanalformatet (${markers.join(", ")}) — regenerer kundevendt tekst.` };
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
