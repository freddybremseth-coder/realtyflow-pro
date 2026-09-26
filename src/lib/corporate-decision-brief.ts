export type CorporateDecisionBriefInput = {
  id: string;
  company_name: string;
  organization_number?: string | null;
  organization_type?: string | null;
  industry?: string | null;
  city?: string | null;
  employee_count?: number | null;
  employee_band?: string | null;
  member_count?: number | null;
  fit_score?: number | null;
  fit_tier?: string | null;
  fit_reasons?: string[] | null;
  evidence_gaps?: string[] | null;
  decision_roles?: string[] | null;
  website_url?: string | null;
  domain?: string | null;
  source_url?: string | null;
  status?: string | null;
  next_action?: string | null;
};

function nonEmpty(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}

function sizeLabel(input: CorporateDecisionBriefInput) {
  const type = String(input.organization_type || "company").toLowerCase();
  if (["association", "member_organization"].includes(type)) {
    return input.member_count
      ? `${input.member_count.toLocaleString("nb-NO")} medlemmer`
      : "Medlemsbase ikke kartlagt";
  }
  if (input.employee_count !== null && input.employee_count !== undefined) {
    return `${input.employee_count.toLocaleString("nb-NO")} ansatte`;
  }
  return input.employee_band || "Antall ansatte ikke kartlagt";
}

function workingModel(input: CorporateDecisionBriefInput) {
  const type = String(input.organization_type || "company").toLowerCase();
  if (["association", "member_organization"].includes(type)) {
    return {
      label: "Member Home · arbeidsmodell",
      rationale: "Vurder en organisasjonseid medlemsbolig med tydelig booking-, kostnads- og bruksmodell.",
    };
  }

  const employees = Number(input.employee_count || 0);
  if (employees >= 150) {
    return {
      label: "Corporate Villa / flere bruksgrupper · arbeidsmodell",
      rationale: "Større brukerbase tilsier at kapasitet, bookingregler og sesongfordeling bør avklares tidlig.",
    };
  }
  if (employees >= 15) {
    return {
      label: "Employee Home · arbeidsmodell",
      rationale: "En felles bedriftsbolig er et naturlig første scenario å teste i discovery og økonomikalkylen.",
    };
  }
  return {
    label: "Corporate Home · avklar modell",
    rationale: "Brukergrunnlaget er ikke godt nok dokumentert til å velge modell ennå.",
  };
}

export function buildCorporateDecisionBrief(input: CorporateDecisionBriefInput) {
  const model = workingModel(input);
  const fitReasons = Array.isArray(input.fit_reasons) ? input.fit_reasons : [];
  const gaps = Array.isArray(input.evidence_gaps) ? input.evidence_gaps : [];
  const roles = Array.isArray(input.decision_roles) && input.decision_roles.length
    ? input.decision_roles
    : ["CEO / daglig leder", "HR / People", "CFO / økonomi", "Styreleder / styre"];

  const facts = nonEmpty([
    input.organization_number ? `Org.nr. ${input.organization_number}` : null,
    input.industry || null,
    input.city || null,
    sizeLabel(input),
    input.domain || input.website_url || null,
  ]);

  const discoveryQuestions = [
    "Hva er hovedmålet: ansattgode, medlemsfordel, langsiktig eiendel eller en kombinasjon?",
    "Hvor mange brukere skal realistisk ha tilgang, og hvordan skal uker fordeles?",
    "Hvilket budsjett kan ledelsen eller styret faktisk vurdere?",
    "Hvilke krav er absolutte: flyplass, strand, antall soverom, universell utforming, møte-/arbeidsplass?",
    "Hvem eier beslutningen internt, og hvem må signere av økonomi, skatt/juridisk og drift?",
    "Hvordan skal booking, renhold, nøkkelhold, vedlikehold og årlig kontroll organiseres?",
  ];

  const boardChecklist = [
    { label: "Formål og målgruppe", status: "open", note: "Må bekreftes i discovery." },
    { label: "Bruks- og bookingmodell", status: "open", note: "Antall brukere, uker og fordelingsregler må avklares." },
    { label: "Investeringsramme", status: "open", note: "Kjøpsbudsjett og årlige driftskostnader er ikke fastsatt." },
    { label: "Bolig- og områdekriterier", status: "open", note: "Shortlist bør først lages når bruk og budsjett er avklart." },
    { label: "Skatt og juridisk struktur", status: "external", note: "Må kvalitetssikres av kvalifiserte norske/spanske rådgivere." },
    { label: "Lokal drift", status: "available", note: "Zen Care kan brukes som operativ modell etter kjøp." },
    { label: "Beslutningsprosess", status: "open", note: "Kartlegg beslutningstakere, styrebehandling og ønsket tidslinje." },
  ];

  return {
    title: `${input.company_name} · Corporate Homes beslutningsgrunnlag`,
    generatedAt: new Date().toISOString(),
    fit: {
      tier: input.fit_tier || "UNSCORED",
      score: Number(input.fit_score || 0),
      reasons: fitReasons,
      gaps,
    },
    company: {
      name: input.company_name,
      organizationNumber: input.organization_number || null,
      industry: input.industry || null,
      city: input.city || null,
      size: sizeLabel(input),
      website: input.website_url || (input.domain ? `https://${input.domain}` : null),
      sourceUrl: input.source_url || null,
      status: input.status || "DISCOVERED",
      facts,
    },
    workingModel: model,
    buyingCommittee: roles,
    discoveryQuestions,
    boardChecklist,
    nextStep: input.next_action || "Gjennomfør en 20–30 minutters Corporate Homes discovery før boligmatching eller økonomisk forslag.",
    guardrails: [
      "Dette er et internt arbeidsgrunnlag, ikke skatte-, juridisk- eller investeringsråd.",
      "Ukjente forhold skal stå som åpne spørsmål; de skal ikke fylles med antakelser.",
      "Ingen personlig kontaktberikelse eller automatisk outreach inngår i dette grunnlaget.",
    ],
  };
}
