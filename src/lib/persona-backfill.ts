import { isRoutingPersona, type RoutingPersona } from "@/services/growth/nurture-persona-routing";

export interface PersonaBackfillContact {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  property_interest?: string | null;
  pipeline_status?: string | null;
  pipeline_value?: number | null;
  source?: string | null;
  interactions?: Array<Record<string, unknown>> | null;
}

export interface PersonaEvidence {
  field: "notes" | "property_interest" | "interactions";
  signal: string;
  excerpt: string;
  weight: number;
}

export interface PersonaBackfillCandidate {
  contactId: string;
  persona: RoutingPersona | null;
  confidence: number;
  evidence: PersonaEvidence[];
  missingInformation: string[];
  reason: string;
  requiresHumanReview: true;
}

export interface PersonaBackfillApprovalValidation {
  ok: boolean;
  persona: RoutingPersona | null;
  reason: string;
  candidate: PersonaBackfillCandidate;
}

const PERSONA_RULES: Record<RoutingPersona, Array<{ pattern: RegExp; signal: string; weight: number }>> = {
  retiree: [
    { pattern: /\b(retire|retirement|pensjon|pensjonist|pensionad[oa]|senior)\b/i, signal: "retirement intent", weight: 5 },
    { pattern: /\b(healthcare|hospital|doctor|helse|sykehus|lege|clinic)\b/i, signal: "healthcare proximity", weight: 2 },
    { pattern: /\b(walkable|gangavstand|flat terrain|flatt terreng|elevator|lift|heis)\b/i, signal: "easy daily mobility", weight: 2 },
  ],
  family: [
    { pattern: /\b(family|familie|children|kids|barn|school|skole|kindergarten|barnehage)\b/i, signal: "family/school needs", weight: 5 },
    { pattern: /\b(playground|activities|aktiviteter|sports|idrett)\b/i, signal: "children activities", weight: 2 },
    { pattern: /\b(3\s*bed|three bedroom|3 bedroom|3 soverom|4\s*bed|4 bedroom|4 soverom)\b/i, signal: "family-sized property", weight: 1 },
  ],
  investor: [
    { pattern: /\b(invest|investment|investor|investering|utleie|rental|rent|yield|roi|avkastning)\b/i, signal: "investment/rental intent", weight: 6 },
    { pattern: /\b(airbnb|short[- ]term rental|ferieutleie|long[- ]term rental|langtidsutleie)\b/i, signal: "rental strategy", weight: 3 },
  ],
  holiday_home: [
    { pattern: /\b(holiday home|vacation home|second home|feriebolig|fritidsbolig|segunda residencia)\b/i, signal: "holiday-home intent", weight: 6 },
    { pattern: /\b(weeks? per year|months? per year|noen uker|ferier|holidays)\b/i, signal: "periodic use", weight: 2 },
    { pattern: /\b(lock and leave|low maintenance|lite vedlikehold|vedlikeholdsfri)\b/i, signal: "low-maintenance use", weight: 2 },
  ],
  permanent_resident: [
    { pattern: /\b(move permanently|permanent residence|live permanently|flytte fast|bo fast|fast bosted|relocate|relocation|permanent)\b/i, signal: "permanent relocation intent", weight: 6 },
    { pattern: /\b(year[- ]round|helårs|everyday life|hverdagsliv|daily life|hverdagen)\b/i, signal: "year-round daily life", weight: 2 },
    { pattern: /\b(residency|residencia|empadronamiento|schooling|healthcare)\b/i, signal: "relocation practicalities", weight: 2 },
  ],
  nature_seeker: [
    { pattern: /\b(nature|natur|mountain|mountains|fjell|hiking|tur|rural|country|countryside|landlig|quiet|rolig|peaceful)\b/i, signal: "nature/quiet preference", weight: 4 },
    { pattern: /\b(plot|tomt|finca|campo|inland|innland|Pinoso|Aspe|Novelda)\b/i, signal: "rural/inland preference", weight: 3 },
  ],
  coastal_social: [
    { pattern: /\b(beach|strand|sea|sjø|coast|kyst|seafront|promenade|paseo)\b/i, signal: "coastal lifestyle", weight: 3 },
    { pattern: /\b(restaurants?|caf[eé]|barer|bars|nightlife|uteliv|social|sosial|walkable|gangavstand)\b/i, signal: "walkable/social amenities", weight: 3 },
    { pattern: /\b(Benidorm|Albir|Altea|Villajoyosa|Calpe|Moraira|D[eé]nia)\b/i, signal: "coastal area interest", weight: 1 },
  ],
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function interactionText(interactions: PersonaBackfillContact["interactions"]) {
  if (!Array.isArray(interactions)) return "";
  return interactions
    .filter((item) => item && typeof item === "object")
    .map((item) => [item.content, item.title, item.note, item.details].map(text).filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n");
}

function excerptFor(source: string, pattern: RegExp) {
  const match = source.match(pattern);
  if (!match || match.index === undefined) return source.slice(0, 160);
  const start = Math.max(0, match.index - 55);
  const end = Math.min(source.length, match.index + match[0].length + 85);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

function evidenceFromField(field: PersonaEvidence["field"], source: string, persona: RoutingPersona) {
  const rows: PersonaEvidence[] = [];
  for (const rule of PERSONA_RULES[persona]) {
    if (!rule.pattern.test(source)) continue;
    rows.push({ field, signal: rule.signal, excerpt: excerptFor(source, rule.pattern), weight: rule.weight });
  }
  return rows;
}

export function inferPersonaBackfillCandidate(contact: PersonaBackfillContact): PersonaBackfillCandidate {
  const sources: Array<[PersonaEvidence["field"], string]> = [
    ["notes", text(contact.notes)],
    ["property_interest", text(contact.property_interest)],
    ["interactions", interactionText(contact.interactions)],
  ].filter((entry): entry is [PersonaEvidence["field"], string] => Boolean(entry[1]));

  const scores = new Map<RoutingPersona, { score: number; evidence: PersonaEvidence[] }>();
  for (const persona of Object.keys(PERSONA_RULES) as RoutingPersona[]) {
    const evidence = sources.flatMap(([field, source]) => evidenceFromField(field, source, persona));
    const uniqueSignals = new Map(evidence.map((row) => [`${row.field}:${row.signal}`, row]));
    const rows = [...uniqueSignals.values()];
    scores.set(persona, { score: rows.reduce((sum, row) => sum + row.weight, 0), evidence: rows });
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  const [bestPersona, best] = ranked[0] || [null, { score: 0, evidence: [] }];
  const runnerUp = ranked[1]?.[1].score || 0;
  const margin = best.score - runnerUp;
  const strongEnough = best.score >= 5 && margin >= 2;
  const confidence = strongEnough ? Math.min(95, Math.round(48 + best.score * 5 + margin * 3)) : Math.min(49, Math.round(best.score * 7));

  const missingInformation: string[] = [];
  if (!contact.pipeline_value || Number(contact.pipeline_value) <= 0) missingInformation.push("budsjett");
  if (!text(contact.property_interest)) missingInformation.push("område / boligønske");
  if (!text(contact.notes) && !interactionText(contact.interactions)) missingInformation.push("kundens begrunnelse / livsstilsbehov");
  if (!strongEnough) missingInformation.unshift("tydelig formål med boligkjøpet");

  if (!strongEnough || !bestPersona) {
    return {
      contactId: contact.id,
      persona: null,
      confidence,
      evidence: best.evidence.slice(0, 5),
      missingInformation: [...new Set(missingInformation)].slice(0, 5),
      reason: best.score === 0
        ? "Ingen tydelig Persona kan dokumenteres fra eksisterende CRM-data."
        : "CRM-data inneholder signaler, men de er for svake eller motstridende til å foreslå Persona sikkert.",
      requiresHumanReview: true,
    };
  }

  return {
    contactId: contact.id,
    persona: bestPersona,
    confidence,
    evidence: best.evidence.sort((a, b) => b.weight - a.weight).slice(0, 6),
    missingInformation: [...new Set(missingInformation)].slice(0, 5),
    reason: `Forslaget bygger på ${best.evidence.length} dokumenterte CRM-signal(er) og har tydelig margin til nest sterkeste Persona.`,
    requiresHumanReview: true,
  };
}

export function validatePersonaBackfillApproval(
  contact: PersonaBackfillContact,
  requestedPersona: unknown,
  minimumConfidence = 80,
): PersonaBackfillApprovalValidation {
  const candidate = inferPersonaBackfillCandidate(contact);
  if (!isRoutingPersona(requestedPersona)) {
    return { ok: false, persona: null, reason: "Ugyldig routing-persona.", candidate };
  }
  if (!candidate.persona) {
    return { ok: false, persona: requestedPersona, reason: "Persona kan ikke godkjennes fordi CRM-evidensen ikke gir en entydig kandidat.", candidate };
  }
  if (candidate.persona !== requestedPersona) {
    return { ok: false, persona: requestedPersona, reason: "Persona-forslaget har endret seg eller valgt Persona samsvarer ikke med rekalkulert CRM-evidens.", candidate };
  }
  if (candidate.confidence < minimumConfidence) {
    return { ok: false, persona: requestedPersona, reason: `Persona krever minst ${minimumConfidence}% confidence for direkte backfill-godkjenning.`, candidate };
  }
  return { ok: true, persona: requestedPersona, reason: candidate.reason, candidate };
}

export function prioritizePersonaBackfill<T extends PersonaBackfillContact>(contacts: T[]) {
  return contacts
    .map((contact) => ({ contact, candidate: inferPersonaBackfillCandidate(contact) }))
    .sort((a, b) => {
      if (Boolean(a.candidate.persona) !== Boolean(b.candidate.persona)) return a.candidate.persona ? -1 : 1;
      if (b.candidate.confidence !== a.candidate.confidence) return b.candidate.confidence - a.candidate.confidence;
      return Number(b.contact.pipeline_value || 0) - Number(a.contact.pipeline_value || 0);
    });
}
