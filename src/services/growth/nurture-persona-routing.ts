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

/**
 * Apply persona-specific copy only when a human-approved routing persona exists.
 * Soleada keeps its relationship-clarification sequence unchanged, and non-Norwegian
 * sequences keep their reviewed language-specific copy until translated persona variants exist.
 */
export function resolveNurtureSequenceWithPersona(
  brandId: string,
  source?: string | null,
  routingPersona?: string | null,
): NurtureSequence | null {
  const base = resolveSequence(brandId, source);
  if (!base || brandId !== "zeneco" || localeFromSource(source) !== "no" || !isRoutingPersona(routingPersona)) return base;

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