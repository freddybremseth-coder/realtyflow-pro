/**
 * Pinoso Eco Life editorial skills used by the live Marketing Autopilot.
 *
 * These are source/creative instructions, NOT extra Meta permissions. Actual
 * account resolution, Inventory fact checks, media checks, novelty, approvals,
 * external publishing and CRM attribution remain in their existing pipelines.
 */
export type PinosoPillar = "plots" | "villas" | "lifestyle" | "process";
export type PinosoSkill = {
  id: string;
  purpose: string;
  evidence: string;
  rule: string;
};

export const PINOSO_MARKETING_SKILLS: readonly PinosoSkill[] = [
  {
    id: "inventory_grounding",
    purpose: "Use one actual, available RealtyFlow Inventory property as the post's source.",
    evidence: "Inventory facts, property identifier, documented location and approved primary image.",
    rule: "Never present a concept, generated rendering or unsourced property as a real available listing.",
  },
  {
    id: "plot_price_clarity",
    purpose: "Help buyers compare plot size, house price and total project cost.",
    evidence: "Verified plot area, price and explicit land-included / land-excluded / unknown status.",
    rule: "Never imply a plot, pool, tax, fees or building work is included unless the source explicitly confirms it.",
  },
  {
    id: "planning_and_building_caution",
    purpose: "Explain phased construction and informed land due diligence without selling hypothetical rights.",
    evidence: "Property-specific documented approvals, buildability and project inclusions.",
    rule: "Do not promise extension rights, guesthouses, garages, build permissions, utilities, schedules or total cost.",
  },
  {
    id: "authentic_visuals",
    purpose: "Use media the business is authorised to publish.",
    evidence: "Actual approved Inventory image and confirmed right to use it.",
    rule: "Never label AI renderings or stock visuals as a real listing or location.",
  },
  {
    id: "inland_lifestyle",
    purpose: "Show what spacious inland living can mean without fictional place claims.",
    evidence: "Verified municipality or region and the selected property's documented features.",
    rule: "Do not invent driving times, schools, restaurants, climate, views, cultivation or amenities.",
  },
  {
    id: "channel_copy",
    purpose: "Make Facebook explanatory and Instagram concise, both in natural Norwegian.",
    evidence: "Connected account and verified brand contact URLs.",
    rule: "Never say link in bio unless independently confirmed; no fabricated reviews, urgency or performance claims.",
  },
  {
    id: "lead_qualification",
    purpose: "Invite useful, low-pressure enquiries.",
    evidence: "Approved pinosoecolife.com domain or a verified exact property URL.",
    rule: "Ask about desired area, total budget, plot and home needs; do not claim a link or contact method exists without verification.",
  },
  {
    id: "editorial_rotation",
    purpose: "Avoid four almost identical property ads each week.",
    evidence: "Europe/Madrid local date and preapproved Mon/Wed/Fri/Sun cadence.",
    rule: "Rotate plots, villas, inland lifestyle and process; existing novelty/cooldown checks still decide if publishing is allowed.",
  },
] as const;

const FIVE_WEEK_PLAN: readonly (readonly PinosoPillar[])[] = [
  ["plots", "villas", "process", "lifestyle"],
  ["plots", "villas", "plots", "lifestyle"],
  ["plots", "villas", "process", "lifestyle"],
  ["plots", "villas", "plots", "lifestyle"],
  ["plots", "villas", "villas", "lifestyle"],
] as const;

// Monday 2026-09-21 is the fixed editorial anchor, not the deployment date.
// Unlike changing the slot based on the latest post, this is retry-stable.
const ANCHOR_MONDAY_UTC = Date.UTC(2026, 8, 21);
const WEEK_MS = 7 * 86_400_000;
const SLOT_INDEX_BY_WEEKDAY: Readonly<Record<number, number>> = { 1: 0, 3: 1, 5: 2, 0: 3 };

export function pinosoEditorialPillar(localDate: string, dayIndex: number): PinosoPillar {
  const slot = SLOT_INDEX_BY_WEEKDAY[dayIndex];
  if (slot === undefined) return "plots"; // an explicit manual run outside the planned days
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return "plots";
  const [year, month, day] = localDate.split("-").map(Number);
  const dateMs = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(dateMs) || new Date(dateMs).toISOString().slice(0, 10) !== localDate) return "plots";
  const week = Math.floor((dateMs - ANCHOR_MONDAY_UTC) / WEEK_MS);
  const index = ((week % FIVE_WEEK_PLAN.length) + FIVE_WEEK_PLAN.length) % FIVE_WEEK_PLAN.length;
  return FIVE_WEEK_PLAN[index][slot];
}

const PILLAR_BRIEFS: Record<PinosoPillar, string> = {
  plots: "TOMTER: Fokuser på faktisk oppgitt tomtestørrelse og eiendommens dokumenterte forhold. Oppgi tomt inkludert/ekskludert/ukjent bare når dataene sier det. Ikke utled bygge- eller bruksrettigheter av arealet.",
  villas: "VILLAER OG NYBYGG: Presenter verifiserte rom, boligareal, arkitektur og tilgjengelighet for den valgte eiendommen. Bruk kun bilde og egenskaper som tilhører eiendommen.",
  lifestyle: "LIVET I INNLANDET: Vis plass og uteområder som er synlig eller dokumentert for den valgte eiendommen; bruk kommunen bare når den er verifisert. Ingen oppdiktede lokale attraksjoner, kjøretider eller omgivelser.",
  process: "BYGG OG KJØPSPROSESS: Forklar ett konkret spørsmål kjøperen bør avklare om tomt, vann, strøm, regulering eller bygging. Henvis til fagkyndig kontroll; ikke lov bestemte tillatelser, ekstra bygg, totalpris eller byggetid.",
};

export function pinosoAutopilotIdea(args: {
  localDate: string;
  dayIndex: number;
  channel: "facebook" | "instagram";
  guidance?: string;
}): string {
  const pillar = pinosoEditorialPillar(args.localDate, args.dayIndex);
  const channel = args.channel === "instagram"
    ? "INSTAGRAM: kort, visuelt og naturlig på norsk. Bruk «send oss en melding» hvis ingen profil-lenke er verifisert. Ingen oppdiktet «lenke i bio»."
    : "FACEBOOK: forklar litt mer, med relevant CTA. Bruk kun pinosoecolife.com eller en faktisk verifisert boliglenke.";
  return [
    "Du er Pinoso Eco Life sin eiendomsredaktør. Publiseringskilde er ÉN aktuell og verifisert eiendom fra RealtyFlow Inventory; bruk bare dens faktakilder og dens godkjente ekte eiendomsbilde.",
    `REDAKSJONELT TEMA: ${pillar}. ${PILLAR_BRIEFS[pillar]}`,
    "AKTIVE FAGFERDIGHETER (krav til tekst, ikke ekstra teknisk tilgang): " + PINOSO_MARKETING_SKILLS.map((skill) => `${skill.id}: dokumentasjon ${skill.evidence}; regel ${skill.rule}`).join(" | "),
    "Ikke finn på tomt inkludert i prisen, offentlig tillatelse, boligareal, sted, avstand, investeringseffekt, fasiliteter eller rettigheter. Er et relevant forhold ukjent, si at det må avklares eller utelat det. Ikke bruk falske anmeldelser, press eller nesten identiske innlegg.",
    channel,
    "Målet er en nyttig, selvstendig post med én tydelig vinkel, ikke en gjentakelse av hele boligannonsen. CTA kan be om ønsket totalbudsjett, tomtestørrelse og område. Ingen annonsering eller automatiske DM til leads.",
    args.guidance ?? "",
  ].filter(Boolean).join("\n\n");
}
