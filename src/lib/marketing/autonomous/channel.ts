/**
 * Phase 7 — channel-native generering. Én idé, forskjellig utførelse per kanal.
 * Ikke kopier samme post mellom kanaler.
 */

import type { ContentFormat, ContentGenome, MarketingChannel } from "../genome";

export interface ChannelSpec {
  focus: string[];
  defaultFormat: ContentFormat;
  primaryMetrics: string[];
  adaptationNote: string;
}

export const CHANNEL_SPECS: Record<MarketingChannel, ChannelSpec> = {
  instagram: { focus: ["sterke første sekunder", "visuell hook", "reels"], defaultFormat: "reel", primaryMetrics: ["saves", "shares", "engagedViews"], adaptationNote: "Visuell hook i første 2 sek, tekst-overlay, tydelig CTA i caption." },
  facebook: { focus: ["storytelling", "property/community", "conversations"], defaultFormat: "post", primaryMetrics: ["shares", "clicks", "engagedViews"], adaptationNote: "Fortellende, community-vinkel, galleri eller video." },
  linkedin: { focus: ["expertise", "market insight", "founder/personal brand"], defaultFormat: "article", primaryMetrics: ["clicks", "engagedViews"], adaptationNote: "Ekspertise/markedsinnsikt, business-kontekst, personlig avsender." },
  youtube: { focus: ["CTR", "retention", "watch time", "search intent"], defaultFormat: "video", primaryMetrics: ["engagedViews", "views"], adaptationNote: "Tittel/thumbnail for CTR, retention-struktur, søkeintensjon." },
  youtube_shorts: { focus: ["hook", "loop", "retention"], defaultFormat: "short", primaryMetrics: ["views", "engagedViews"], adaptationNote: "Rask hook, vertikalt, loop-vennlig." },
  tiktok: { focus: ["trend", "hook", "native feel"], defaultFormat: "short", primaryMetrics: ["views", "shares"], adaptationNote: "Trend-drevet, native, rask hook." },
  website: { focus: ["SEO intent", "deep information", "internal links", "conversion CTA"], defaultFormat: "article", primaryMetrics: ["clicks", "leads"], adaptationNote: "Søkeintensjon, dyp info, interne lenker, konverterings-CTA." },
  email: { focus: ["relationship", "nurture", "conversion"], defaultFormat: "email", primaryMetrics: ["clicks", "leads"], adaptationNote: "Personlig, nurture-sekvens, tydelig neste steg." },
};

/**
 * Tilpass et master-genome til en kanal (setter format + kanal, beholder
 * læringsdimensjoner). `formatOverride` vinner over kanalens default — brukes
 * når faktisk media dikterer format (statisk bilde → post, ikke reel). Formatet
 * skal ALDRI antas til reel bare fordi kanal=instagram.
 */
export function adaptGenomeToChannel(base: ContentGenome, channel: MarketingChannel, formatOverride?: ContentFormat): ContentGenome {
  const spec = CHANNEL_SPECS[channel];
  return { ...base, channel, format: formatOverride ?? spec.defaultFormat };
}
