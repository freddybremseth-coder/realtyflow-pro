"export type CorporatePriority = \"CRITICAL\" | \"HIGH\" | \"MEDIUM\";

export type CorporateLeadProfile = {
  isCorporate: boolean;
  organization: string | null;
  organizationType: string | null;
  users: number | null;
  role: string | null;
  model: string | null;
  budgetLabel: string | null;
  timeline: string | null;
  needs: string | null;
  score: number;
  priority: CorporatePriority;
  stageLabel: string;
  nextAction: string;
};

function text(value: unknown) {
  return String(value || \"\").trim();
}

function taggedValue(input: string, labels: string[]) {
  const lines = input.split(/\\r?\\n/).map((line) => line.trim());
  for (const label of labels) {
    const prefix = label.toLowerCase() + \":\";
    const match = lines.find((line) => line.toLowerCase().startsWith(prefix));
    if (match) return match.slice(match.indexOf(\":\") + 1).trim();
  }
  return \"\";
}

export function parseBudgetEstimate(value: unknown): number {
  const raw = text(value);
  if (!raw) return 0;
  const compact = raw.replace(/\\u00a0/g, \" \");
  const matches = compact.match(/\\d[\\d\\s.,]*/g) || [];
  const values = matches
    .map((chunk) => {
      const normalized = chunk.replace(/[\\s.]/g, \"\").replace(\",\", \".\");
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    })
    .filter((number) => number > 0);
  if (!values.length) return 0;
  if (values.length === 1) return Math.round(values[0]);
  return Math.round((Math.min(...values) + Math.max(...values)) / 2);
}

function interactionText(interactions: unknown) {
  if (!Array.isArray(interactions)) return \"\";
  return interactions
    .slice(0, 20)
    .map((row: any) => [row?.content, row?.message, row?.metadata?.request_type, row?.metadata?.source].filter(Boolean).join(\"\\n\"))
    .filter(Boolean)
    .join(\"\\n\");
}

export function isCorporateHomeLead(contact: Record<string, any>) {
  const haystack = [contact.source, contact.notes, contact.property_interest, interactionText(contact.interactions)]
    .map(text)
    .join(\"\\n\")
    .toLowerCase();
  return haystack.includes(\"zeneco-corporate-homes\") || haystack.includes(\"corporate-home\") || haystack.includes(\"bedriftshytte\") || haystack.includes(\"medlemsbolig\") || haystack.includes(\"shared corporate home\");
}

function stageLabel(status: unknown) {
  const stage = text(status).toUpperCase();
  const labels: Record<string, string> = {
    NEW: \"Ny B2B-henvendelse\",
    CONTACT: \"Discovery\",
    QUALIFIED: \"Business case\",
    MATCHING: \"Bolig-shortlist\",
    VIEWING: \"Visning / site review\",
    NEGOTIATION: \"Styre / juridisk / forhandling\",
    RESERVED: \"Reservasjon\",
    WON: \"Kjøpt / aktiv bedriftskunde\",
    ON_HOLD: \"På vent\",
    LOST: \"Avsluttet\",
  };
  return labels[stage] || stage || \"Ny B2B-henvendelse\";
}

function nextActionFor(status: unknown, profile: { users: number | null; role: string | null; budgetLabel: string | null; timeline: string | null }) {
  const stage = text(status).toUpperCase();
  if (stage === \"NEW\") {
    if (!profile.role) return \"Bekreft beslutningstaker og book 20 min discovery.\";
    if (!profile.users) return \"Avklar hvor mange ansatte/medlemmer som skal ha tilgang.\";
    if (!profile.budgetLabel) return \"Avklar investeringsramme og om kjøpet skal finansieres.\";
    return \"Book discovery og avklar mål, bruk, bookingmodell og styreprosess.\";
  }
  if (stage === \"CONTACT\") return \"Lag business case med 2–3 prisnivåer, drift og brukerøkonomi.\";
  if (stage === \"QUALIFIED\") return \"Lag shortlist på 3–5 boliger tilpasset kapasitet, drift og flytilgang.\";
  if (stage === \"MATCHING\") return \"Avklar styrets favoritter og planlegg digital eller fysisk gjennomgang.\";
  if (stage === \"VIEWING\") return \"Oppsummer alternativene og bygg beslutningspakke for styret.\";
  if (stage === \"NEGOTIATION\") return \"Koordiner pris, eierstruktur, juridisk/skatt og beslutningsdato.\";
  if (stage === \"RESERVED\") return \"Følg closing, overtakelse, bookingmodell og Property Care-oppsett.\";
  if (stage === \"WON\") return \"Følg bruk, drift og potensial for bolig nummer 2 eller henvisninger.\";
  if (stage === \"ON_HOLD\") return \"Sett konkret gjenopptaksdato og dokumenter hva som må endres.\";
  return \"Gå gjennom siste aktivitet og velg et konkret neste B2B-steg.\";
}

export function corporateLeadProfile(contact: Record<string, any>): CorporateLeadProfile {
  const combined = [text(contact.notes), interactionText(contact.interactions)].filter(Boolean).join(\"\\n\");
  const organization = taggedValue(combined, [\"Virksomhet/organisasjon\", \"Virksomhet\", \"Organisasjon\"]) || null;
  const organizationType = taggedValue(combined, [\"Type\"]) || null;
  const usersRaw = taggedValue(combined, [\"Antall ansatte/medlemmer\", \"Ansatte/medlemmer\", \"Brukere\"]);
  const usersMatch = usersRaw.match(/\\d+/);
  const users = usersMatch ? Number(usersMatch[0]) : null;
  const role = taggedValue(combined, [\"Rolle\"]) || null;
  const model = taggedValue(combined, [\"Ønsket modell\", \"Modell\"]) || null;
  const budgetLabel = taggedValue(combined, [\"Budsjett\"]) || (contact.pipeline_value ? String(contact.pipeline_value) : null);
  const timeline = taggedValue(combined, [\"Tidslinje\"]) || null;
  const needs = taggedValue(combined, [\"Behov\"]) || null;
  const isCorporate = isCorporateHomeLead(contact);
  let score = isCorporate ? 35 : 0;
  const pipelineValue = Number(contact.pipeline_value || 0) || parseBudgetEstimate(budgetLabel);
  if (pipelineValue >= 750000) score += 25;
  else if (pipelineValue >= 500000) score += 20;
  else if (pipelineValue >= 300000) score += 14;
  else if (pipelineValue > 0) score += 8;
  if (users !== null) {
    if (users >= 100) score += 20;
    else if (users >= 50) score += 16;
    else if (users >= 20) score += 12;
    else if (users >= 10) score += 8;
    else score += 3;
  }
  const normalizedTimeline = text(timeline).toLowerCase();
  if (/0.?3|klar|nå|now/.test(normalizedTimeline)) score += 14;
  else if (/3.?12|innen.*12/.test(normalizedTimeline)) score += 10;
  else if (/12.?24/.test(normalizedTimeline)) score += 5;
  const normalizedRole = text(role).toLowerCase();
  if (/daglig leder|ceo|cfo|hr|people|styre|leder|owner|founder/.test(normalizedRole)) score += 10;
  if (organization) score += 4;
  if (model) score += 3;
  score = Math.max(0, Math.min(100, score));
  const priority: CorporatePriority = score >= 85 ? \"CRITICAL\" : score >= 65 ? \"HIGH\" : \"MEDIUM\";
  return { isCorporate, organization, organizationType, users, role, model, budgetLabel, timeline, needs, score, priority, stageLabel: stageLabel(contact.pipeline_status), nextAction: nextActionFor(contact.pipeline_status, { users, role, budgetLabel, timeline }) };
}
"