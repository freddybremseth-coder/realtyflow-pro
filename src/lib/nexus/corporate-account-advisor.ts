export type CorporateAdvisorContact = {
  id: string;
  name?: string | null;
  title?: string | null;
  buying_role?: string | null;
  status?: string | null;
  is_primary?: boolean | null;
  relationship_status?: string | null;
  influence_level?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
};

export type CorporateAdvisorTouchpoint = {
  id: string;
  channel?: string | null;
  activity_type?: string | null;
  status?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
};

export type CorporateAdvisorInput = {
  prospect: {
    id: string;
    company_name: string;
    organization_type?: string | null;
    industry?: string | null;
    employee_count?: number | null;
    member_count?: number | null;
    status?: string | null;
    fit_score?: number | null;
    fit_tier?: string | null;
    evidence_gaps?: string[] | null;
    evidence?: Record<string, unknown> | null;
    next_action?: string | null;
    next_followup?: string | null;
  };
  strategy?: {
    stage?: string | null;
    priority?: string | null;
    account_models?: string[] | null;
    objective?: string | null;
    entry_angle?: string | null;
    first_offer?: string | null;
    account_owner_email?: string | null;
    strategic_owner_email?: string | null;
    next_review_at?: string | null;
    account_role?: string | null;
    primary_model?: string | null;
    secondary_model?: string | null;
    recommended_entry_role?: string | null;
    problem_hypothesis?: string | null;
    problem_acceptance_goal?: string | null;
    solution_hypothesis?: string | null;
    solution_acceptance_goal?: string | null;
    core_message?: string | null;
    next_best_action?: string | null;
    business_case?: Record<string, unknown> | null;
  } | null;
  contacts?: CorporateAdvisorContact[];
  touchpoints?: CorporateAdvisorTouchpoint[];
  enrichment?: Array<{ provider?: string | null; data_kind?: string | null; fetched_at?: string | null }>;
  now?: Date;
};

export type CorporateAdvisorRecommendation = {
  prospectId: string;
  companyName: string;
  priority: "P1" | "P2" | "P3";
  score: number;
  stage: string;
  recommendedModels: string[];
  recommendedEntryRole: string;
  headline: string;
  whyNow: string[];
  missing: string[];
  nextAction: string;
  channelSequence: Array<{
    order: number;
    channel: "LINKEDIN" | "EMAIL" | "CALL" | "MEETING";
    action: string;
  }>;
  guardrail: string;
  accountRole: string;
  primaryModel: string;
  secondaryModel: string | null;
  scores: { fit: number; timing: number; access: number; intent: number; overall: number };
  businessCaseCompleteness: number;
  stageGuidance: { current: string; exitCriteria: string[]; next: string | null };
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.map(item => text(item)).filter(Boolean)
    : [];
}

function hasCompanyChannel(evidence: Record<string, unknown>) {
  const contact = objectValue(evidence.generic_company_contact);
  return Boolean(text(contact.generic_email) || text(contact.contact_page_url));
}

function hasSignalResearch(evidence: Record<string, unknown>) {
  return Object.keys(objectValue(evidence.company_signal_research)).length > 0;
}

function inferModels(input: CorporateAdvisorInput) {
  const saved = strings(input.strategy?.account_models).slice(0, 3);
  if (saved.length) return saved;

  const type = text(input.prospect.organization_type).toLowerCase();
  const industry = text(input.prospect.industry).toLowerCase();
  const employees = Number(input.prospect.employee_count || 0);
  const members = Number(input.prospect.member_count || 0);
  const models: string[] = [];

  if (type.includes("member") || type.includes("association") || members > 0) {
    models.push("Medlemsfordel", "Kunde-/partnerfordel");
  }
  if (/hr|recruit|consult|technology|it|finance|bank|account|professional|rådgiv/i.test(industry)) {
    models.push("Ansattfordel", "Management retreat");
  }
  if (employees >= 40) models.push("Firmabolig");
  if (!models.length) models.push("Firmabolig", "Ansattfordel");

  return [...new Set(models)].slice(0, 3);
}

function inferEntryRole(models: string[], input: CorporateAdvisorInput) {
  if (models.some(model => /medlem|partner/i.test(model))) return "Partnerskap / medlemsansvarlig";
  if (models.some(model => /ansatt|retreat|firmabolig/i.test(model))) return "HR / People";
  if (Number(input.prospect.employee_count || 0) < 30) return "CEO / eier";
  return "HR / People";
}

export function buildCorporateAccountAdvice(input: CorporateAdvisorInput): CorporateAdvisorRecommendation {
  const now = input.now || new Date();
  const evidence = objectValue(input.prospect.evidence);
  const contacts = input.contacts || [];
  const touchpoints = input.touchpoints || [];
  const strategy = input.strategy || null;
  const models = inferModels(input);
  const primaryModel = text(strategy?.primary_model) || models[0] || "Firmabolig";
  const secondaryModel = text(strategy?.secondary_model) || models.find(model => model !== primaryModel) || null;
  const accountRole = text(strategy?.account_role) || "END_CUSTOMER";
  const entryRole = text(strategy?.recommended_entry_role) || inferEntryRole(models, input);

  const fitScore = Math.max(0, Math.min(100, Number(input.prospect.fit_score || 0)));
  let timingScore = 20;
  let accessScore = 10;
  let intentScore = 10;
  let score = Math.round(fitScore * 0.55);
  const whyNow: string[] = [];
  const missing: string[] = [];

  const primary = contacts.find(c => c.is_primary) || null;
  const decisionMaker = contacts.find(c =>
    text(c.influence_level).toUpperCase() === "DECISION_MAKER" ||
    /CEO|CFO|HR|PEOPLE|OWNER|EIER|DIRECTOR|DIREKTØR|LEDER/i.test(text(c.buying_role) + " " + text(c.title)),
  ) || null;
  const champion = contacts.find(c => text(c.relationship_status).toUpperCase() === "CHAMPION") || null;
  const verified = contacts.filter(c => ["VERIFIED","CONTACT_READY"].includes(text(c.status).toUpperCase()));
  const companyChannel = hasCompanyChannel(evidence);
  const signalResearch = hasSignalResearch(evidence);
  const provider1881 = (input.enrichment || []).some(row => text(row.provider).toLowerCase() === "api1881");

  const planned = touchpoints.filter(t => text(t.status).toUpperCase() === "PLANNED");
  const overdue = planned.filter(t => {
    const due = Date.parse(text(t.due_at));
    return Number.isFinite(due) && due < now.getTime();
  });
  const nextPlanned = planned
    .filter(t => Number.isFinite(Date.parse(text(t.due_at))))
    .sort((a,b) => Date.parse(text(a.due_at)) - Date.parse(text(b.due_at)))[0];

  if (signalResearch) { score += 8; timingScore += 15; whyNow.push("Selskapsresearch er dokumentert."); }
  else missing.push("Dokumenterte kjøps-/behovssignaler");

  if (strategy?.objective && strategy?.entry_angle) { score += 10; timingScore += 10; whyNow.push("Kontostrategi og inngang er definert."); }
  else missing.push("Klar kontostrategi og inngangsvinkel");

  if (decisionMaker) { score += 10; accessScore += 35; whyNow.push("Relevant beslutningstaker er identifisert."); }
  else missing.push("Beslutningstaker");

  if (primary) { score += 4; accessScore += 10; }
  if (verified.length) { score += 6; accessScore += 20; }
  else if (!companyChannel) missing.push("Verifisert kontaktkanal");

  if (champion) { score += 10; accessScore += 25; intentScore += 10; whyNow.push("Kontoen har en mulig intern champion."); }

  if (planned.length) { score += 5; timingScore += 10; }
  if (overdue.length) { score += 8; whyNow.push(`${overdue.length} planlagt aktivitet er forfalt.`); }
  if (provider1881) score += 3;

  const stage = text(strategy?.stage) || text(input.prospect.status) || "TARGET";
  if (["ENGAGED","MEETING","BUSINESS_CASE","SHORTLIST","DECISION","NEGOTIATION"].includes(stage.toUpperCase())) {
    score += 12;
    intentScore += ["DECISION","NEGOTIATION"].includes(stage.toUpperCase()) ? 65 : ["BUSINESS_CASE","SHORTLIST"].includes(stage.toUpperCase()) ? 45 : 25;
    timingScore += 20;
    whyNow.push(`Kontoen er allerede i ${stage.toLowerCase()}-fasen.`);
  }

  timingScore = Math.max(0, Math.min(100, timingScore));
  accessScore = Math.max(0, Math.min(100, accessScore));
  intentScore = Math.max(0, Math.min(100, intentScore));
  score = Math.max(0, Math.min(100, score));

  let priority: "P1" | "P2" | "P3";
  const savedPriority = text(strategy?.priority).toUpperCase();
  if (savedPriority === "P1" || savedPriority === "P2" || savedPriority === "P3") priority = savedPriority;
  else priority = score >= 72 ? "P1" : score >= 52 ? "P2" : "P3";

  let nextAction = "";
  if (strategy?.next_best_action) {
    nextAction = text(strategy.next_best_action);
  } else if (!strategy?.objective || !strategy?.entry_angle) {
    nextAction = `Definer mål og inngang for ${input.prospect.company_name}; anbefalt start er ${primaryModel} mot ${entryRole}.`;
  } else if (!decisionMaker) {
    nextAction = provider1881
      ? `Bruk tilgjengelig enrichment og offentlig research til å identifisere riktig ${entryRole}-kontakt.`
      : `Berik kontoen og identifiser riktig ${entryRole}-kontakt før første personlige outreach.`;
  } else if (!verified.length && !companyChannel) {
    nextAction = "Verifiser jobbkontakt eller offisiell selskapskanal før første e-post.";
  } else if (overdue.length) {
    nextAction = `Utfør forfalt ${text(overdue[0].channel).toLowerCase()}-aktivitet og loggfør utfallet.`;
  } else if (!planned.length) {
    nextAction = "Lag en koordinert LinkedIn + e-post-plan med menneskelig godkjenning før første kontakt.";
  } else if (nextPlanned) {
    nextAction = `Neste planlagte steg er ${text(nextPlanned.channel)}: ${text(nextPlanned.activity_type).replaceAll("_"," ").toLowerCase()}.`;
  } else {
    nextAction = text(input.prospect.next_action) || "Avklar neste menneskelige salgssteg og sett oppfølging.";
  }

  const channelSequence: CorporateAdvisorRecommendation["channelSequence"] = [
    { order: 1, channel: "LINKEDIN", action: decisionMaker ? "Følg selskapet/personen og bygg gjenkjennelse uten hard pitch." : "Identifiser riktig profesjonell kontakt og offentlig LinkedIn-profil." },
    { order: 2, channel: "EMAIL", action: "Send en kort, konto-spesifikk introduksjon etter menneskelig godkjenning." },
    { order: 3, channel: "LINKEDIN", action: "Følg opp med relevant, kort interaksjon dersom det er naturlig." },
    { order: 4, channel: "CALL", action: "Bruk telefon når interesse, respons eller tydelig relevans er dokumentert." },
  ];

  if (["ENGAGED","MEETING","BUSINESS_CASE"].includes(stage.toUpperCase())) {
    channelSequence.splice(3, 0, { order: 4, channel: "MEETING", action: "Styr mot en kort discovery med behov, beslutningsprosess og business case." });
    channelSequence.forEach((step, index) => { step.order = index + 1; });
  }

  const headline = priority === "P1"
    ? `${input.prospect.company_name} bør bearbeides aktivt nå`
    : priority === "P2"
      ? `${input.prospect.company_name} er en lovende konto som trenger ett tydelig neste steg`
      : `${input.prospect.company_name} bør modnes før aktiv outreach`;

  const stageCriteria: Record<string, { exitCriteria: string[]; next: string | null }> = {
    TARGET: { exitCriteria: ["Kontoen er innenfor målgruppen", "En første relevanshypotese er formulert"], next: "RESEARCH" },
    RESEARCH: { exitCriteria: ["Hvorfor nå er dokumentert", "Minst én relevant inngangsrolle er identifisert"], next: "STRATEGY_READY" },
    STRATEGY_READY: { exitCriteria: ["Primær hypotese og budskap er definert", "Neste handling er konkret"], next: "OUTREACH" },
    OUTREACH: { exitCriteria: ["Menneskelig godkjent kontakt er gjennomført", "Utfallet er loggført"], next: "ENGAGED" },
    ENGAGED: { exitCriteria: ["Reell toveis dialog er etablert", "Kunden har bekreftet eller korrigert et behov"], next: "MEETING" },
    MEETING: { exitCriteria: ["Discovery er gjennomført", "Problem, beslutningsprosess og neste steg er dokumentert"], next: "BUSINESS_CASE" },
    BUSINESS_CASE: { exitCriteria: ["Brukere, økonomi og hovedkrav er kjent", "Åpne rådgiverpunkter er synlige"], next: "SHORTLIST" },
    SHORTLIST: { exitCriteria: ["Område/boligkriterier er godkjent", "Konkrete alternativer er vurdert"], next: "DECISION" },
    DECISION: { exitCriteria: ["Kunden behandler et konkret internt beslutningscase", "Beslutningstakere og forbehold er kjent"], next: "NEGOTIATION" },
    NEGOTIATION: { exitCriteria: ["Kommersielle/juridiske vilkår er avklart", "Kjøpsbeslutning kan tas"], next: "WON" },
    WON: { exitCriteria: ["Overlevering til kjøp/drift er gjort"], next: null },
    LOST: { exitCriteria: ["Tapsårsak er dokumentert", "Eventuell nurture-dato er satt"], next: null },
  };

  const businessCase = objectValue(strategy?.business_case);
  const businessCaseSignals = [
    Number(input.prospect.employee_count || 0) > 0 || Number(input.prospect.member_count || 0) > 0,
    Boolean(text(strategy?.objective)),
    Boolean(primaryModel),
    Boolean(text(strategy?.problem_hypothesis)),
    Boolean(text(strategy?.solution_hypothesis)),
    Boolean(businessCase.budget || businessCase.investmentRange || businessCase.propertyPrice),
    Boolean(businessCase.employeeWeeks || businessCase.users),
    Boolean(businessCase.businessStays || businessCase.hotelAlternative),
  ];
  const businessCaseCompleteness = Math.round((businessCaseSignals.filter(Boolean).length / businessCaseSignals.length) * 100);
  const overallScore = Math.round(fitScore * 0.35 + timingScore * 0.2 + accessScore * 0.2 + intentScore * 0.25);

  return {
    prospectId: input.prospect.id,
    companyName: input.prospect.company_name,
    priority,
    score,
    stage,
    recommendedModels: models,
    recommendedEntryRole: entryRole,
    headline,
    whyNow: whyNow.slice(0, 5),
    missing: [...new Set(missing)].slice(0, 5),
    nextAction,
    channelSequence,
    guardrail: "LinkedIn og e-post skal være menneskelig godkjent. Ikke scrape profiler eller inferer private/sensitive interesser.",
    accountRole,
    primaryModel,
    secondaryModel,
    scores: { fit: fitScore, timing: timingScore, access: accessScore, intent: intentScore, overall: overallScore },
    businessCaseCompleteness,
    stageGuidance: {
      current: stage.toUpperCase(),
      exitCriteria: stageCriteria[stage.toUpperCase()]?.exitCriteria || [],
      next: stageCriteria[stage.toUpperCase()]?.next || null,
    },
  };
}

export function rankCorporateAccountAdvice(items: CorporateAdvisorRecommendation[]) {
  const rank = { P1: 3, P2: 2, P3: 1 };
  return [...items].sort((a,b) =>
    rank[b.priority] - rank[a.priority] || b.score - a.score || a.companyName.localeCompare(b.companyName, "nb"),
  );
}
