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
  brandName: string;
  advisor: string;
  bookingUrl: string;
  /** Eksplisitt avsenderadresse når merket har flere e-postkonfig-rader.
   *  F.eks. pinosoecolife skal sende som freddy@pinosoecolife.com. */
  fromAddress?: string;
  /** Send via ET ANNET merkes SMTP-konto enn kontaktens merke. Brukes når vi
   *  ikke kan sende fra merkets eget domene (soleada.no), men fra et vi kan
   *  (freddy@zenecohomes.com). Default: kontaktens eget merke. */
  sendBrandId?: string;
  /** Overstyr visningsnavn i Fra-feltet. */
  fromName?: string;
  /**
   * welcome      = ferske leads, tidsregning fra created_at (lead nettopp inn).
   * reactivation = sovende leads, tidsregning fra innmeldingsdato (nurture_enrolled_at),
   *                med daglig innmeldingstak slik at vi ikke masse-sender.
   */
  mode: "welcome" | "reactivation";
  /** Hvilke pipeline-statuser som er kvalifisert for denne sekvensen. */
  eligibleStatuses: string[];
  /** Kun reactivation: maks antall NYE innmeldinger per kjøring (daglig bolk). */
  maxNewEnrollmentsPerRun?: number;
  steps: NurtureStep[];
}

const ZENECO: NurtureSequence = {
  id: "zeneco-buyer-v1",
  brandId: "zeneco",
  brandName: "Zen Eco Homes",
  advisor: "Freddy Bremseth",
  bookingUrl: "https://appointment.chatgenius.pro/zeneco",
  mode: "welcome",
  eligibleStatuses: ["NEW", "CONTACT", ""],
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

// Reaktivering av Soleada-kunder som Freddy følger opp personlig.
// Soleada beholder kundeforholdet og står bak et eventuelt salg. Zen Eco Homes
// brukes som Freddys praktiske kommunikasjons- og rådgivningsplattform.
// Varsom: maks 25 nye innmeldinger per kjøring og tydelig avmelding.
const SOLEADA_REACTIVATION: NurtureSequence = {
  id: "soleada-reactivation-v1",
  brandId: "soleada",
  brandName: "Soleada.no",
  advisor: "Freddy Bremseth",
  bookingUrl: "https://appointment.chatgenius.pro/freddy",
  mode: "reactivation",
  eligibleStatuses: ["NEW", "CONTACT", "QUALIFIED", ""],
  maxNewEnrollmentsPerRun: 25,
  sendBrandId: "zeneco",
  fromName: "Freddy Bremseth – Zen Eco Homes",
  steps: [
    {
      id: "reconnect",
      dayOffset: 0,
      channel: "email",
      subject: "Er bolig i Spania fortsatt aktuelt for deg, {name}?",
      text: `Hei {name},

Vi har tidligere vært i kontakt gjennom Soleada.no om bolig i Spania, og jeg ønsker å følge deg opp personlig.

Jeg heter Freddy Bremseth og jobber videre med kundene jeg har hatt kontakt med gjennom Soleada. Selve kundeforholdet og et eventuelt boligsalg ligger fortsatt hos Soleada.no.

Denne e-posten kommer fra Zen Eco Homes fordi det er plattformen og e-postsystemet jeg nå bruker i mitt daglige rådgivningsarbeid på Costa Blanca. Det endrer altså ikke hvem som står bak kundeforholdet eller et eventuelt salg – Soleada er fortsatt ansvarlig part på den siden.

Jeg ønsker først og fremst å høre om bolig i Spania fortsatt er aktuelt for deg.

Hvis det er det, kan jeg gjerne hjelpe deg videre med blant annet:
– hvilke områder som passer best til hvordan du ønsker å bruke boligen
– hva budsjettet ditt realistisk gir i dagens marked
– aktuelle boliger som passer behovene dine
– spørsmål om kjøpsprosessen og det praktiske rundt et kjøp i Spania

Svar gjerne kort på denne e-posten med hvor du står i prosessen nå. Det holder fint med for eksempel «fortsatt interessert», «kanskje senere» eller «ikke aktuelt lenger».

Vennlig hilsen

Freddy Bremseth
Eiendomsrådgiver
Zen Eco Homes

Oppfølging av kundehenvendelse fra Soleada.no
Eventuelt boligsalg håndteres gjennom Soleada.no

PS: Hvis du ikke ønsker videre oppfølging, svar «stopp», så registrerer jeg det.`,
    },
    {
      id: "right-place",
      dayOffset: 3,
      channel: "email",
      subject: "{name}, det de fleste glemmer før de kjøper i Spania",
      text: `Hei {name},

Hvis bolig i Spania fortsatt er aktuelt, er dette noe av det viktigste jeg hjelper kunder med før vi begynner å se på konkrete boliger:

De fleste ser først på boliger de liker, men det er ofte smartere å finne ut HVOR man faktisk vil trives. Costa Blanca er stort, og riktig område avhenger av hvordan du ønsker å leve, bruke boligen og hvor mye du vil ha i nærheten i hverdagen.

Jeg kjenner områdene godt og kan hjelpe deg med å snevre inn valget. Hvis du svarer med noen få ord om hva du ser for deg – feriebolig eller fast bosted, ønsket område og omtrent budsjett – kan jeg komme med noen konkrete forslag.

Jeg følger deg opp personlig gjennom Zen Eco Homes, mens kundeforholdet og et eventuelt boligsalg fortsatt håndteres gjennom Soleada.no.

Vennlig hilsen
Freddy Bremseth
Zen Eco Homes

PS: Vil du ikke ha flere e-poster, svar «stopp».`,
    },
    {
      id: "soft-call",
      dayOffset: 7,
      channel: "email",
      subject: "En kort prat, {name}?",
      text: `Hei {name},

Dette er siste automatiske oppfølging fra meg hvis jeg ikke hører noe.

Hvis bolig i Spania fortsatt er aktuelt, tar jeg gjerne en kort og uforpliktende videoprat. På 15 minutter kan vi avklare hvilke områder som passer, hva budsjettet realistisk gir og hva som er et fornuftig neste steg.

Book et tidspunkt her: {booking_url}
Eller svar på denne e-posten med et par tidspunkt som passer.

Jeg følger deg opp personlig fra Zen Eco Homes. Kundeforholdet og et eventuelt boligsalg ligger fortsatt hos Soleada.no.

Vennlig hilsen
Freddy Bremseth
Zen Eco Homes

PS: Vil du ikke høre mer, svar «stopp».`,
    },
  ],
};

// Tysk velkomst-sekvens (leads fra /de med source=zenecohomes-de).
const ZENECO_DE: NurtureSequence = {
  id: "zeneco-buyer-de-v1",
  brandId: "zeneco",
  brandName: "Zen Eco Homes",
  advisor: "Freddy Bremseth",
  bookingUrl: "https://appointment.chatgenius.pro/zeneco",
  mode: "welcome",
  eligibleStatuses: ["NEW", "CONTACT", ""],
  steps: [
    {
      id: "welcome",
      dayOffset: 0,
      channel: "email",
      subject: "Danke, {name} – ein Rat, bevor Sie Immobilien ansehen",
      text: `Hallo {name},

danke für Ihre Anfrage zu einer Immobilie in Spanien. Ich bin Freddy Bremseth, Immobilienberater an der Costa Blanca, und habe vielen internationalen Käufern bei genau diesem Schritt geholfen.

Das Wichtigste zuerst: Die meisten sehen sich Immobilien an, bevor sie wissen, WO sie wohnen möchten. Die Costa Blanca ist groß – manche Orte passen besser zu manchen Menschen als zu anderen, je nach Persönlichkeit und gewünschtem Alltag. Ich kenne die Regionen gut und helfe Ihnen gern, herauszufinden, was zu Ihnen passt.

Antworten Sie einfach kurz: Was ist Ihnen am wichtigsten? Ich lese jede Antwort selbst.

Herzliche Grüße
Freddy Bremseth
{brand}`,
    },
    {
      id: "right-place",
      dayOffset: 2,
      channel: "email",
      subject: "{name}, so finden Sie den richtigen Ort",
      text: `Hallo {name},

hier ist, was den meisten hilft, den richtigen Ort zu finden – nicht nur eine schöne Immobilie:

1. Welchen Alltag wünschen Sie sich? Ruhiges Dorf oder lebendige Küstenstadt?
2. Was zählt am meisten – Sonne und Aussicht, Strandnähe oder Ruhe und Grün?
3. Praktisch: Nähe zum Flughafen, gute Ärzte und ein internationales Umfeld.
4. Ganzjährig oder als Ferienimmobilie? Das ändert, welche Regionen passen.
5. Was das Budget tatsächlich bietet – das variiert stark je Region.

Möchten Sie, dass ich passende Orte für Sie vorschlage? Antworten Sie mit ein paar Stichworten zu Ihren Wünschen.

Freddy
{brand}`,
    },
    {
      id: "matching",
      dayOffset: 5,
      channel: "email",
      subject: "{name}, machen wir den Traum konkret",
      text: `Hallo {name},

wenn wir die passende Region kennen, wird der Rest leicht. Dann finden wir die Immobilie, die zu Ihrem Leben passt – nicht nur ein schönes Inserat.

Erzählen Sie mir kurz von Ihrem Vorhaben – Budget, und ob es Ferienimmobilie, Vermietung oder Hauptwohnsitz sein soll – dann erstelle ich eine kurze, persönliche Auswahl. Keine 200 Anzeigen, sondern die 3–5, die wirklich passen.

Antworten Sie einfach auf diese E-Mail.

Freddy
{brand}`,
    },
    {
      id: "book-call",
      dayOffset: 9,
      channel: "email",
      subject: "{name}, ein kurzes Gespräch für mehr Klarheit",
      text: `Hallo {name},

der einfachste nächste Schritt ist ein kurzes, freundliches Videogespräch. In 15 Minuten erhalten Sie:
– Vorschläge für Regionen, die zu Ihnen passen
– ein realistisches Bild, was Ihr Budget dort ermöglicht
– Antworten auf Ihre wichtigsten Fragen – ganz unverbindlich

Buchen Sie einen passenden Termin hier: {booking_url}
Oder antworten Sie mit ein paar Zeitvorschlägen.

Herzliche Grüße
Freddy Bremseth
{brand}`,
    },
  ],
};

// Engelsk velkomst-sekvens (leads fra /en med source=zenecohomes-en).
const ZENECO_EN: NurtureSequence = {
  id: "zeneco-buyer-en-v1",
  brandId: "zeneco",
  brandName: "Zen Eco Homes",
  advisor: "Freddy Bremseth",
  bookingUrl: "https://appointment.chatgenius.pro/zeneco",
  mode: "welcome",
  eligibleStatuses: ["NEW", "CONTACT", ""],
  steps: [
    {
      id: "welcome",
      dayOffset: 0,
      channel: "email",
      subject: "Thanks, {name} – one tip before you look at properties",
      text: `Hi {name},

thank you for your enquiry about property in Spain. I'm Freddy Bremseth, a property advisor on the Costa Blanca, and I've helped many international buyers through exactly this step.

First things first: most people look at properties before they know WHERE they want to live. The Costa Blanca is large – some places suit some people better than others, depending on personality and the daily life you want. I know the areas well and would be glad to help you work out what fits you.

Just reply with one thing: what matters most to you right now? I read every reply myself.

Kind regards
Freddy Bremseth
{brand}`,
    },
    {
      id: "right-place",
      dayOffset: 2,
      channel: "email",
      subject: "{name}, how to find the right place to live",
      text: `Hi {name},

here's what helps most people find the right place – not just a nice property:

1. What daily life do you dream of? A quiet village or a lively coastal town?
2. What matters most – sun and views, walking distance to the beach, or green and calm?
3. Practical: proximity to the airport, good healthcare and an international community.
4. Year-round or a holiday home? That changes which areas truly fit.
5. What your budget actually buys – it varies a lot by area.

Would you like me to suggest areas that fit you? Reply with a few words about what you have in mind.

Freddy
{brand}`,
    },
    {
      id: "matching",
      dayOffset: 5,
      channel: "email",
      subject: "{name}, let's make the dream concrete",
      text: `Hi {name},

once we know the right area, the rest is the fun part. Then we find the property that matches the life you picture – not just a nice listing.

Tell me a little about your plan – budget, and whether it's a holiday home, rental or main residence – and I'll put together a short, personal shortlist. Not 200 listings, but the 3–5 that actually fit.

Just reply to this email.

Freddy
{brand}`,
    },
    {
      id: "book-call",
      dayOffset: 9,
      channel: "email",
      subject: "{name}, a 15-minute call to clarify your plans",
      text: `Hi {name},

the easiest next step is a short, friendly video call. In 15 minutes you'll get:
– suggestions for areas that fit you
– a realistic picture of what your budget allows there
– answers to your main questions – with no obligation

Book a time that suits you here: {booking_url}
Or reply with a couple of times that work for you.

Kind regards
Freddy Bremseth
{brand}`,
    },
  ],
};

// Registry: nøkkel er brandId eller "brandId:locale" for språk-spesifikke sekvenser.
export const NURTURE_SEQUENCES: Record<string, NurtureSequence> = {
  zeneco: ZENECO,
  "zeneco:de": ZENECO_DE,
  "zeneco:en": ZENECO_EN,
  soleada: SOLEADA_REACTIVATION,
};

/** Utled språk fra lead-kilden (zenecohomes-de / -en, ellers norsk). */
export function localeFromSource(source?: string | null): "no" | "de" | "en" {
  const s = String(source || "").toLowerCase();
  if (/(^|[-_:])de$/.test(s) || s.includes("zenecohomes-de")) return "de";
  if (/(^|[-_:])en$/.test(s) || s.includes("zenecohomes-en")) return "en";
  return "no";
}

/** Velg sekvens ut fra merke + kilde (språk). Faller tilbake til merkets standard. */
export function resolveSequence(brandId: string, source?: string | null): NurtureSequence | null {
  const locale = localeFromSource(source);
  if (locale !== "no" && NURTURE_SEQUENCES[`${brandId}:${locale}`]) {
    return NURTURE_SEQUENCES[`${brandId}:${locale}`];
  }
  return NURTURE_SEQUENCES[brandId] || null;
}

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
