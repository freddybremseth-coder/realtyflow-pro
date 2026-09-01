import { localeFromSource, resolveSequence, type NurtureSequence } from "@/services/growth/nurture-sequences";

export type RoutingPersona =
  | "retiree"
  | "family"
  | "investor"
  | "holiday_home"
  | "permanent_resident"
  | "nature_seeker"
  | "coastal_social";

const PERSONA_INTROS: Record<RoutingPersona, { subject: string; intro: string }> = {
  retiree: {
    subject: "{name}, et viktig råd før du velger bolig for hverdagen i Spania",
    intro: "Siden du vurderer en bolig som skal fungere godt i hverdagen, ville jeg startet med områdene: gangbarhet, helsetjenester, helårsliv, avstander og hvor enkelt boligen faktisk blir å bruke over tid.",
  },
  family: {
    subject: "{name}, finn området som fungerer for hele familien",
    intro: "For en familie handler riktig bolig om mer enn selve huset. Skole, aktiviteter, trygg hverdag, transport og hva som finnes rundt dere bør være med før vi velger konkrete boliger.",
  },
  investor: {
    subject: "{name}, før vi ser på investeringsboliger i Spania",
    intro: "Når målet også er investering eller utleie, bør vi først avklare område, realistisk etterspørsel, kostnader, bruksmønster og hvilke boliger som faktisk passer strategien din – ikke bare se på høyest annonsert avkastning.",
  },
  holiday_home: {
    subject: "{name}, slik finner du en feriebolig som faktisk blir brukt",
    intro: "For feriebolig ser jeg først på hvor enkelt det er å komme frem, hva du har i gangavstand, vedlikeholdsbehov og hvordan området fungerer de månedene du faktisk vil bruke boligen.",
  },
  permanent_resident: {
    subject: "{name}, velg hverdagen før du velger boligen",
    intro: "Når planen er å bo fast i Spania, er helårsliv, tjenester, transport, nabolag og riktig avstand til det du bruker hver uke viktigere enn hvordan området ser ut på en kort ferie.",
  },
  nature_seeker: {
    subject: "{name}, la oss finne riktig balanse mellom natur, ro og hverdag",
    intro: "Du ser ut til å verdsette natur og ro. Da er det viktig å skille mellom områder som bare virker rolige på visning og steder som faktisk gir tilgang til turer, landskap og den hverdagen du ønsker uten at alt praktisk blir for langt unna.",
  },
  coastal_social: {
    subject: "{name}, hvor på Costa Blanca passer hverdagen du ønsker?",
    intro: "Du ser ut til å verdsette kystliv og ting i nærheten. Da ville jeg prioritert gangavstand, strand, restauranter og hvor levende området er gjennom året – ikke bare i høysesongen.",
  },
};

export function isRoutingPersona(value: unknown): value is RoutingPersona {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PERSONA_INTROS, value);
}

function soleadaRelationshipSequence(base: NurtureSequence): NurtureSequence {
  return {
    ...base,
    eligibleStatuses: ["NEW", "CONTACT", "QUALIFIED", ""],
    maxNewEnrollmentsPerRun: 25,
    sendBrandId: "zeneco",
    fromName: "Freddy Bremseth – Zen Eco Homes",
    steps: [
      {
        id: "reconnect",
        dayOffset: 0,
        channel: "email",
        subject: "Er bolig i Spania fortsatt aktuelt for deg?",
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
}

/**
 * Applies reviewed relationship copy first, then persona-specific copy only when a
 * human-approved routing persona exists. Non-Norwegian persona variants intentionally
 * fall back to their reviewed language-specific base sequence until translated variants exist.
 */
export function resolveNurtureSequenceWithPersona(
  brandId: string,
  source?: string | null,
  routingPersona?: string | null,
): NurtureSequence | null {
  const base = resolveSequence(brandId, source);
  if (!base) return null;

  if (brandId === "soleada") return soleadaRelationshipSequence(base);
  if (brandId !== "zeneco" || localeFromSource(source) !== "no" || !isRoutingPersona(routingPersona)) return base;

  const context = PERSONA_INTROS[routingPersona];
  const [first, ...rest] = base.steps;
  if (!first) return base;

  const personalizedFirst = {
    ...first,
    subject: context.subject,
    text: first.text.replace(/\n\n/, `\n\n${context.intro}\n\n`),
  };

  return {
    ...base,
    id: `${base.id}:persona:${routingPersona}`,
    steps: [personalizedFirst, ...rest],
  };
}
