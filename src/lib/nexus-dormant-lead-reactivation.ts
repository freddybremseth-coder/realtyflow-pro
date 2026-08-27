import {
  buildBuyerLifestyleProfile,
  buyerLifestyleDiscoveryGaps,
  type BuyerLifestyleCriterionLike,
} from "@/lib/nexus-buyer-lifestyle";

const DAY_MS = 86_400_000;

export type DormantLeadSegment = "hot_dormant" | "warm_dormant" | "cold_dormant" | "do_not_reactivate";

export interface DormantLeadContact {
  id: string;
  name?: string | null;
  email?: string | null;
  brandId?: string | null;
  pipelineStatus?: string | null;
  nurtureStatus?: string | null;
  propertyInterest?: string | null;
  createdAt?: string | null;
  lastContact?: string | null;
  lastAiFollowup?: string | null;
  latestInteractionAt?: string | null;
  latestRevenueEventAt?: string | null;
  latestNurtureSentAt?: string | null;
  explicitlyOptedOut?: boolean;
  invalidEmail?: boolean;
}

export interface DormantLeadAssessment {
  contactId: string;
  segment: DormantLeadSegment;
  score: number;
  dormantDays: number | null;
  lastMeaningfulEngagementAt: string | null;
  reasons: string[];
  eligibleForDraft: boolean;
  lifestyleSummary: string[];
  inferredQuestions: string[];
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function lastMeaningfulEngagement(contact: DormantLeadContact) {
  const values = [
    contact.lastContact,
    contact.lastAiFollowup,
    contact.latestInteractionAt,
    contact.latestRevenueEventAt,
    contact.latestNurtureSentAt,
  ]
    .map(validDate)
    .filter((date): date is Date => Boolean(date));

  if (!values.length) return null;
  return new Date(Math.max(...values.map((date) => date.getTime()))).toISOString();
}

export function assessDormantLead(
  contact: DormantLeadContact,
  criteria: BuyerLifestyleCriterionLike[] = [],
  now = new Date(),
): DormantLeadAssessment {
  const reasons: string[] = [];
  const status = String(contact.pipelineStatus || "").toUpperCase();
  const nurtureStatus = String(contact.nurtureStatus || "active").toLowerCase();
  const email = String(contact.email || "").trim();
  const lastEngagement = lastMeaningfulEngagement(contact);
  const anchor = validDate(lastEngagement) || validDate(contact.createdAt);
  const dormantDays = anchor ? Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / DAY_MS)) : null;
  const lifestyle = buildBuyerLifestyleProfile(criteria);
  const gaps = buyerLifestyleDiscoveryGaps(criteria);

  const suppressed =
    contact.explicitlyOptedOut === true ||
    contact.invalidEmail === true ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    ["paused", "stopped", "unsubscribed"].includes(nurtureStatus) ||
    ["WON", "LOST", "ARCHIVED"].includes(status);

  if (suppressed) {
    reasons.push("Kontakt er under suppression eller mangler gyldig e-post.");
    return {
      contactId: contact.id,
      segment: "do_not_reactivate",
      score: 0,
      dormantDays,
      lastMeaningfulEngagementAt: lastEngagement,
      reasons,
      eligibleForDraft: false,
      lifestyleSummary: lifestyle.confirmed.slice(0, 5).map((item) => `${item.namespace}:${item.dimension}`),
      inferredQuestions: gaps.slice(0, 3).map((item) => item.question),
    };
  }

  let score = 20; // valid contact channel
  reasons.push("Gyldig e-post og ingen eksplisitt suppression.");

  if (status === "QUALIFIED") {
    score += 25;
    reasons.push("Tidligere kvalifisert kjøper.");
  } else if (status === "CONTACT") {
    score += 15;
    reasons.push("Tidligere etablert kontakt.");
  } else if (status === "NEW" || status === "") {
    score += 5;
  }

  if (dormantDays !== null) {
    if (dormantDays >= 730) {
      score += 20;
      reasons.push("Ingen dokumentert aktivitet på minst 24 måneder.");
    } else if (dormantDays >= 365) {
      score += 18;
      reasons.push("Ingen dokumentert aktivitet på minst 12 måneder.");
    } else if (dormantDays >= 120) {
      score += 12;
      reasons.push("Ingen dokumentert aktivitet på minst 120 dager.");
    } else if (dormantDays < 45) {
      score -= 30;
      reasons.push("For nylig aktivitet for dormant reaktivering.");
    }
  } else {
    reasons.push("Ingen sikker aktivitetsdato; alder er ukjent.");
  }

  if (contact.propertyInterest) {
    score += 10;
    reasons.push("Dokumentert bolig-/områdeinteresse finnes.");
  }
  if (lifestyle.confirmed.length) {
    score += Math.min(15, lifestyle.confirmed.length * 4);
    reasons.push("Bekreftede livsstilspreferanser gir grunnlag for personlig reaktivering.");
  }

  score = Math.max(0, Math.min(100, score));
  const segment: DormantLeadSegment = score >= 75
    ? "hot_dormant"
    : score >= 50
      ? "warm_dormant"
      : "cold_dormant";

  return {
    contactId: contact.id,
    segment,
    score,
    dormantDays,
    lastMeaningfulEngagementAt: lastEngagement,
    reasons,
    eligibleForDraft: dormantDays === null ? score >= 75 : dormantDays >= 90 && score >= 45,
    lifestyleSummary: lifestyle.confirmed.slice(0, 5).map((item) => `${item.namespace}:${item.dimension}`),
    inferredQuestions: gaps.slice(0, 3).map((item) => item.question),
  };
}

function firstName(name: string | null | undefined) {
  return String(name || "").trim().split(/\s+/)[0] || "hei";
}

function humanizeDimension(namespace: string, dimension: string) {
  const key = `${namespace}:${dimension}`;
  const labels: Record<string, string> = {
    "lifestyle:beach": "strandliv",
    "lifestyle:restaurants_cafes": "restauranter og kaféliv",
    "lifestyle:hiking_nature": "tur og natur",
    "environment:quiet": "rolige omgivelser",
    "environment:local_spanish": "et mer lokalt spansk miljø",
    "social:scandinavian": "et skandinavisk miljø",
    "mobility:walkable": "en hverdag der mye kan nås til fots",
    "mobility:flat_terrain": "flatt og lettgått terreng",
    "daily_life:beach_walkability": "gåavstand til stranden",
    "daily_life:restaurants_walkability": "restauranter i gangavstand",
  };
  return labels[key] || dimension.replaceAll("_", " ");
}

export function composeDormantLeadReactivationDraft(
  contact: DormantLeadContact,
  criteria: BuyerLifestyleCriterionLike[] = [],
  assessment = assessDormantLead(contact, criteria),
) {
  if (!assessment.eligibleForDraft || assessment.segment === "do_not_reactivate") return null;

  const lifestyle = buildBuyerLifestyleProfile(criteria);
  const confirmedStrong = lifestyle.confirmed
    .filter((item) => item.strength === "must_have" || item.strength === "strong_preference")
    .slice(0, 3);
  const confirmedText = confirmedStrong.map((item) => humanizeDimension(item.namespace, item.dimension));
  const interestText = String(contact.propertyInterest || "").trim();
  const name = firstName(contact.name);

  const remembered = confirmedText.length
    ? `Jeg har notert at ${confirmedText.join(", ")} var viktig for deg.`
    : interestText
      ? `Jeg har notert at du tidligere så på ${interestText}.`
      : "Vi var tidligere i kontakt om bolig i Spania.";

  const question = assessment.inferredQuestions[0]
    ? `${assessment.inferredQuestions[0]} Det holder med et kort svar.`
    : "Er dette fortsatt aktuelt for deg, eller har planene endret seg?";

  return {
    subject: `${name}, er bolig i Spania fortsatt aktuelt?`,
    body: [
      `Hei ${name},`,
      "",
      remembered,
      "",
      "Det er en stund siden vi var i kontakt, så jeg vil ikke anta at ønskene dine er de samme i dag.",
      question,
      "",
      "Du kan gjerne bare svare med ett av disse: fortsatt aktuelt / ønskene har endret seg / kanskje senere / ikke aktuelt.",
      "",
      "Hvis det fortsatt er aktuelt, oppdaterer jeg profilen din først og sender deretter bare noen få forslag som faktisk passer — ikke en lang liste med tilfeldige boliger.",
      "",
      "Vennlig hilsen",
      "Freddy Bremseth",
      "",
      "PS: Svar «stopp» hvis du ikke ønsker flere henvendelser.",
    ].join("\n"),
    objective: "get_reply" as const,
    segment: assessment.segment,
    score: assessment.score,
    safety: {
      confirmedFactsOnlyInAssertions: true,
      inferredSignalsUsedAsQuestionsOnly: true,
      externalActionExecuted: false,
    },
  };
}
