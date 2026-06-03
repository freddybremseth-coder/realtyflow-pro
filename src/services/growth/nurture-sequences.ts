/**
 * Nurture-sekvenser pr. merkevare.
 *
 * Dette er copy-en Freddy godkjenner FØR noe sendes på ekte. Rediger fritt –
 * tonen er bygget rundt kjøperens reelle frykt i en utenlandstransaksjon
 * (trygghet, jus/skatt, valuta, "hva hvis"), ikke rundt "luksus/livsstil".
 *
 * Tokens som fylles inn automatisk:
 *   {name}            – kontaktens fornavn
 *   {area}            – område/property_interest
 *   {advisor}         – rådgivers navn
 *   {brand}           – merkenavn
 *   {booking_url}     – lenke til videomøte-booking
 */

export interface NurtureStep {
  id: string;
  /** Dager etter at leadet kom inn før dette steget er "due". */
  dayOffset: number;
  channel: "email";
  subject: string;
  /** Ren tekst. {tokens} fylles inn. */
  text: string;
}

export interface NurtureSequence {
  id: string;
  brandId: string;
  advisor: string;
  bookingUrl: string;
  steps: NurtureStep[];
}

const ZENECO: NurtureSequence = {
  id: "zeneco-buyer-v1",
  brandId: "zeneco",
  advisor: "Freddy Bremseth",
  bookingUrl: "https://appointment.chatgenius.pro/zeneco",
  steps: [
    {
      id: "welcome",
      dayOffset: 0,
      channel: "email",
      subject: "Takk, {name} – ett råd før du ser på boliger",
      text: `Hei {name},

Takk for at du tok kontakt om bolig i Spania. Jeg er Freddy Bremseth, norsk eiendomsrådgiver på Costa Blanca, og jeg har hjulpet mange nordmenn gjennom akkurat dette.

Det viktigste først: de fleste ser på boliger de liker før de vet HVOR de skal bo. Costa Blanca er stort, og det passer for de fleste – men noen steder passer bedre for noen enn for andre. Det kommer an på hvem du er og hvilken personlighet du/dere har. Jeg er lokalkjent i de fleste områdene her og har jobbet i mange år med å kartlegge behov. Jeg tar gjerne en gjennomgang av hvem dere er og hva dere liker, og kommer med forslag til områder som passer. Jeg har også skrevet noen dokumenter og bøker om områdene – gi beskjed, så sender jeg dem til dere.

Imens: svar gjerne på denne e-posten med ett spørsmål – hva er du mest usikker på akkurat nå? Jeg leser alle svar selv.

Vennlig hilsen
Freddy Bremseth
{brand}`,
    },
    {
      id: "right-place",
      dayOffset: 2,
      channel: "email",
      subject: "{name}, slik finner dere riktig sted å bo",
      text: `Hei {name},

Som lovet – her er det som hjelper de fleste å finne riktig sted, ikke bare en fin bolig:

1. Hvilken hverdag drømmer dere om? Rolig landsby med spansk sjarm, eller livlig kystby med alt i nærheten?
2. Hva betyr mest – sol og utsikt, gangavstand til sjøen, eller grønt og ro?
3. Praktisk: nærhet til flyplass, gode helsetjenester og et norsk/internasjonalt miljø.
4. Helårsliv eller feriebolig? Det endrer hvilke områder som virkelig passer.
5. Hva budsjettet faktisk gir – det varierer mye fra område til område.

Jeg har skrevet egne dokumenter og bøker om de ulike områdene her. Vil du ha dem? Svar "ja", så sender jeg dem til dere.

Freddy
{brand}`,
    },
    {
      id: "matching",
      dayOffset: 5,
      channel: "email",
      subject: "{name}, la oss gjøre drømmen konkret",
      text: `Hei {name},

Når vi vet hvilket område som passer dere, blir resten gøy. Da finner vi boligen som matcher livet dere ser for dere – ikke bare en fin annonse.

Forteller du meg litt om drømmen – budsjett, og om det er feriebolig, utleie eller fast bopel – lager jeg en kort, personlig liste til dere. Ikke 200 annonser, men de 3–5 som faktisk passer dere og stedet dere vil bo.

Svar på denne, så er vi i gang.

Freddy
{brand}`,
    },
    {
      id: "book-call",
      dayOffset: 9,
      channel: "email",
      subject: "{name}, en 15-minutters prat som gjør drømmen tydeligere",
      text: `Hei {name},

Det enkleste neste steget er en kort, hyggelig videoprat. På 15 minutter får dere:
– forslag til områder som passer akkurat dere og livsstilen deres
– et realistisk bilde av hva budsjettet gir på de stedene
– svar på det dere lurer mest på – helt uforpliktende

Book et tidspunkt som passer dere her: {booking_url}

Eller svar på denne e-posten med et par tidspunkt, så ordner jeg resten.

Vennlig hilsen
Freddy Bremseth
{brand}`,
    },
  ],
};

export const NURTURE_SEQUENCES: Record<string, NurtureSequence> = {
  zeneco: ZENECO,
};

export function getSequenceForBrand(brandId: string): NurtureSequence | null {
  return NURTURE_SEQUENCES[brandId] || null;
}

export function renderTemplate(
  template: string,
  ctx: { name?: string; area?: string; advisor?: string; brand?: string; booking_url?: string }
): string {
  const firstName = (ctx.name || "").trim().split(/\s+/)[0] || "der";
  return template
    .replace(/\{name\}/g, firstName)
    .replace(/\{area\}/g, ctx.area?.trim() || "Costa Blanca")
    .replace(/\{advisor\}/g, ctx.advisor || "Freddy Bremseth")
    .replace(/\{brand\}/g, ctx.brand || "Zen Eco Homes")
    .replace(/\{booking_url\}/g, ctx.booking_url || "");
}
