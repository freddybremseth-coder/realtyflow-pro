export type CustomerSalesStage =
  | "NEW"
  | "CONTACT"
  | "QUALIFIED"
  | "MATCHING"
  | "VIEWING"
  | "NEGOTIATION"
  | "RESERVED"
  | "WON"
  | "LOST"
  | "ON_HOLD";

export type CustomerSalesAdvisorInput = {
  contact: Record<string, any>;
  activeBuyerProfile?: Record<string, any> | null;
  criteria?: Array<Record<string, any>>;
  shortlists?: Array<Record<string, any>>;
  workItems?: Array<Record<string, any>>;
  communicationDialogue?: {
    sentCount?: number;
    replyCount?: number;
    lastSentAt?: string | null;
    lastReplyAt?: string | null;
    awaitingReply?: boolean;
    manualTakeover?: boolean;
    emailBlocked?: boolean;
    blockedReason?: string | null;
    messages?: Array<Record<string, any>>;
  };
  timeline?: Array<Record<string, any>>;
  now?: Date;
};

export type CustomerSalesAdvisorOutput = {
  contactId: string;
  stage: CustomerSalesStage;
  priority: "P1" | "P2" | "P3" | "PAUSED";
  score: number;
  headline: string;
  momentum: "HOT" | "WARM" | "COOL" | "PAUSED" | "CLOSED";
  scores: {
    profile: number;
    engagement: number;
    timing: number;
    intent: number;
    overall: number;
  };
  whyNow: string[];
  signals: string[];
  risks: string[];
  missing: string[];
  nextBestAction: {
    action: string;
    why: string;
    channel: "EMAIL" | "CALL" | "MEETING" | "CRM" | "NONE";
  };
  stageGuidance: {
    current: CustomerSalesStage;
    next: CustomerSalesStage | null;
    completionPercent: number;
    readyToAdvance: boolean;
    criteria: Array<{ id: string; label: string; met: boolean; evidence?: string | null }>;
  };
  discoveryQuestions: string[];
  coach: {
    do: string[];
    avoid: string[];
  };
  guardrail: string;
};

const OPEN_WORK = new Set(["TO_DO", "IN_PROGRESS", "REVIEW"]);
const ACTIVE_STAGES = new Set<CustomerSalesStage>(["NEW", "CONTACT", "QUALIFIED", "MATCHING", "VIEWING", "NEGOTIATION", "RESERVED"]);
const NEXT_STAGE: Record<CustomerSalesStage, CustomerSalesStage | null> = {
  NEW: "CONTACT",
  CONTACT: "QUALIFIED",
  QUALIFIED: "MATCHING",
  MATCHING: "VIEWING",
  VIEWING: "NEGOTIATION",
  NEGOTIATION: "RESERVED",
  RESERVED: "WON",
  WON: null,
  LOST: null,
  ON_HOLD: null,
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function upper(value: unknown) {
  return text(value).toUpperCase();
}

function validDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(value: unknown, now: Date) {
  const date = validDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

function criterion(criteria: Array<Record<string, any>>, key: string) {
  return criteria.find((item) =>
    item?.active !== false &&
    String(item?.approval_status || "approved").toLowerCase() !== "rejected" &&
    String(item?.key || "") === key
  ) || null;
}

function criterionValue(item: Record<string, any> | null) {
  if (!item) return null;
  const value = item.value;
  if (value === null || value === undefined) return null;
  return value;
}

function hasCriterion(criteria: Array<Record<string, any>>, key: string) {
  return Boolean(criterion(criteria, key));
}

function hasTimelineCriterion(criteria: Array<Record<string, any>>) {
  return criteria.some((item) =>
    String(item?.key || "") === "other" &&
    /timeline|tidslinje|purchase timing|kjøpstid|availability_status|future_interest/i.test(
      `${item?.other_key || ""} ${item?.source_text || ""}`,
    )
  );
}

function messageDate(message: Record<string, any> | null | undefined) {
  return message ? validDate(message.received_at || message.created_at) : null;
}

function latestMessage(messages: Array<Record<string, any>>, direction: "inbound" | "outbound") {
  return messages.find((item) => String(item?.direction || "").toLowerCase() === direction) || null;
}

function inferStage(value: unknown): CustomerSalesStage {
  const stage = upper(value) as CustomerSalesStage;
  return Object.prototype.hasOwnProperty.call(NEXT_STAGE, stage) ? stage : "NEW";
}

function stageGate(input: CustomerSalesAdvisorInput, profileScore: number) {
  const contact = input.contact || {};
  const stage = inferStage(contact.pipeline_status);
  const criteria = input.criteria || [];
  const profile = input.activeBuyerProfile || null;
  const shortlists = input.shortlists || [];
  const dialogue = input.communicationDialogue || {};
  const messages = dialogue.messages || [];
  const latestInbound = latestMessage(messages, "inbound");
  const latestInboundText = text(latestInbound?.body_text || latestInbound?.body_html);
  const confirmedCriteria = criteria.filter((item) => item?.customer_confirmed === true).length;
  const approvedCriteria = criteria.filter((item) => String(item?.approval_status || "").toLowerCase() === "approved").length;
  const approvedShortlist = shortlists.some((item) => ["approved", "sent", "presented"].includes(String(item?.status || "").toLowerCase()));
  const anyShortlist = shortlists.length > 0;
  const viewingSignal = /visning|viewing|besøk|befaring/i.test(
    `${contact.notes || ""} ${latestInboundText} ${JSON.stringify(contact.interactions || [])}`
  );
  const negotiationSignal = /bud|offer|forhandling|negotiat|reserv/i.test(
    `${contact.notes || ""} ${latestInboundText} ${JSON.stringify(contact.interactions || [])}`
  );

  const criterionRow = (id: string, label: string, met: boolean, evidence?: string | null) => ({ id, label, met, evidence: evidence || null });

  const byStage: Record<CustomerSalesStage, Array<{ id: string; label: string; met: boolean; evidence?: string | null }>> = {
    NEW: [
      criterionRow("contact-channel", "Trygg kontaktkanal finnes", Boolean(contact.email || contact.phone)),
      criterionRow("first-signal", "Minst ett kjøpssignal eller kundesvar er registrert", Boolean(dialogue.replyCount || contact.last_inbound_reply_at)),
    ],
    CONTACT: [
      criterionRow("two-way", "Toveis dialog er etablert", Number(dialogue.replyCount || 0) > 0),
      criterionRow("intent", "Kjøpsintensjon er bekreftet som aktuell", !["follow_up_later", "no_longer_buying", "purchased_elsewhere", "do_not_contact"].includes(String(contact.last_reply_classification || ""))),
      criterionRow("timing", "Kjøpstidslinje er kjent", Boolean(contact.next_followup || hasTimelineCriterion(criteria))),
    ],
    QUALIFIED: [
      criterionRow("profile", "Buyer Profile er godkjent og tilstrekkelig komplett", Boolean(profile?.id) && String(profile?.status || "").toLowerCase() === "approved" && profileScore >= 70, `Profil ${profileScore}%`),
      criterionRow("budget", "Budsjett er kjent", Boolean(Number(profile?.budget_amount || contact.pipeline_value || 0) > 0 || hasCriterion(criteria, "total_budget") || hasCriterion(criteria, "purchase_price"))),
      criterionRow("location", "Område er konkret nok", Boolean(contact.preferred_location || hasCriterion(criteria, "location"))),
      criterionRow("property-type", "Boligtype/minstekrav er kjent", Boolean(hasCriterion(criteria, "property_type") || hasCriterion(criteria, "bedrooms"))),
    ],
    MATCHING: [
      criterionRow("shortlist", "En relevant shortlist finnes", anyShortlist),
      criterionRow("shortlist-approved", "Shortlist er kvalitetssikret/godkjent", approvedShortlist),
      criterionRow("customer-feedback", "Kunden har gitt feedback på alternativer", Boolean(dialogue.replyCount && (confirmedCriteria > 0 || /bolig|leilighet|villa|alternativ|prosjekt/i.test(latestInboundText)))),
    ],
    VIEWING: [
      criterionRow("viewing", "Visning eller konkret gjennomgang er dokumentert", viewingSignal),
      criterionRow("reaction", "Kundens reaksjon og rangering er registrert", /liker|favoritt|best|ikke aktuell|aktuell|interessert|avviser/i.test(latestInboundText + " " + JSON.stringify(contact.interactions || []))),
      criterionRow("next-commitment", "Neste forpliktende steg er avtalt", Boolean(contact.next_followup)),
    ],
    NEGOTIATION: [
      criterionRow("commercial", "Pris/bud/reservasjon er konkret", negotiationSignal),
      criterionRow("decision", "Kundens beslutningsforbehold er kjent", /finans|bank|advokat|jurid|partner|ektefelle|beslut/i.test(latestInboundText + " " + JSON.stringify(contact.interactions || []))),
      criterionRow("next-commitment", "Neste beslutningssteg er datofestet", Boolean(contact.next_followup)),
    ],
    RESERVED: [
      criterionRow("reservation", "Reservasjon er dokumentert", negotiationSignal || /reserved|reservert/i.test(String(contact.pipeline_status || ""))),
      criterionRow("closing", "Closing/kontrakt er neste aktive løp", true),
    ],
    WON: [criterionRow("won", "Kjøpet er vunnet", true)],
    LOST: [criterionRow("lost", "Tapsårsak er dokumentert", Boolean(contact.lost_reason))],
    ON_HOLD: [criterionRow("hold", "Venteårsak er dokumentert", Boolean(contact.waiting_reason || contact.waiting_until))],
  };

  const rows = byStage[stage] || [];
  const met = rows.filter((item) => item.met).length;
  return {
    current: stage,
    next: NEXT_STAGE[stage],
    completionPercent: rows.length ? Math.round((met / rows.length) * 100) : 100,
    readyToAdvance: rows.length > 0 && met === rows.length && Boolean(NEXT_STAGE[stage]),
    criteria: rows,
  };
}

export function buildCustomerSalesAdvice(input: CustomerSalesAdvisorInput): CustomerSalesAdvisorOutput {
  const now = input.now || new Date();
  const contact = input.contact || {};
  const criteria = input.criteria || [];
  const profile = input.activeBuyerProfile || null;
  const workItems = input.workItems || [];
  const shortlists = input.shortlists || [];
  const dialogue = input.communicationDialogue || {};
  const messages = dialogue.messages || [];
  const stage = inferStage(contact.pipeline_status);
  const latestInbound = latestMessage(messages, "inbound");
  const latestOutbound = latestMessage(messages, "outbound");
  const latestInboundAt = messageDate(latestInbound) || validDate(contact.last_inbound_reply_at);
  const lastReplyDays = latestInboundAt ? daysSince(latestInboundAt, now) : null;
  const nextFollowup = validDate(contact.next_followup);
  const waitingUntil = validDate(contact.waiting_until);
  const activeWork = workItems.filter((item) => OPEN_WORK.has(upper(item.status)));
  const criticalWork = activeWork.filter((item) => ["CRITICAL", "HIGH"].includes(upper(item.priority)));

  const profileSignals = [
    Boolean(profile?.id),
    String(profile?.status || "").toLowerCase() === "approved",
    Number(profile?.budget_amount || contact.pipeline_value || 0) > 0 || hasCriterion(criteria, "total_budget") || hasCriterion(criteria, "purchase_price"),
    Boolean(contact.preferred_location || hasCriterion(criteria, "location")),
    hasCriterion(criteria, "property_type"),
    hasCriterion(criteria, "bedrooms"),
    hasTimelineCriterion(criteria) || Boolean(contact.next_followup),
  ];
  const profileScore = Math.round((profileSignals.filter(Boolean).length / profileSignals.length) * 100);

  let engagementScore = 10;
  if (Number(dialogue.sentCount || 0) > 0) engagementScore += 10;
  if (Number(dialogue.replyCount || 0) > 0) engagementScore += 35;
  if (lastReplyDays !== null && lastReplyDays <= 7) engagementScore += 25;
  else if (lastReplyDays !== null && lastReplyDays <= 30) engagementScore += 15;
  if (!dialogue.awaitingReply && Number(dialogue.replyCount || 0) > 0) engagementScore += 10;
  if (dialogue.manualTakeover) engagementScore += 5;
  engagementScore = Math.max(0, Math.min(100, engagementScore));

  let timingScore = 20;
  if (nextFollowup) timingScore += 20;
  if (lastReplyDays !== null && lastReplyDays <= 14) timingScore += 20;
  if (["VIEWING", "NEGOTIATION", "RESERVED"].includes(stage)) timingScore += 35;
  if (stage === "ON_HOLD") timingScore = 5;
  if (waitingUntil && waitingUntil.getTime() > now.getTime()) timingScore = 5;
  timingScore = Math.max(0, Math.min(100, timingScore));

  let intentScore = 15;
  const replyClass = String(contact.last_reply_classification || "");
  if (["active_interest", "property_interest", "update_preferences"].includes(replyClass)) intentScore += 35;
  if (Number(dialogue.replyCount || 0) > 0) intentScore += 10;
  if (shortlists.length > 0) intentScore += 10;
  if (["MATCHING", "VIEWING", "NEGOTIATION", "RESERVED"].includes(stage)) intentScore += 20;
  if (["follow_up_later", "no_longer_buying", "purchased_elsewhere", "do_not_contact"].includes(replyClass)) intentScore = 0;
  intentScore = Math.max(0, Math.min(100, intentScore));

  const overall = Math.round(profileScore * 0.25 + engagementScore * 0.25 + timingScore * 0.2 + intentScore * 0.3);
  const gate = stageGate(input, profileScore);

  const whyNow: string[] = [];
  const signals: string[] = [];
  const risks: string[] = [];
  const missing: string[] = [];

  if (lastReplyDays !== null && lastReplyDays <= 7) whyNow.push(`Kunden svarte for ${lastReplyDays === 0 ? "mindre enn ett døgn" : `${lastReplyDays} dager`} siden.`);
  if (["VIEWING", "NEGOTIATION", "RESERVED"].includes(stage)) whyNow.push(`Kunden er allerede i ${stage.toLowerCase()}-fasen.`);
  if (criticalWork.length) whyNow.push(`${criticalWork.length} prioritert(e) kundeoppgave(r) er åpne.`);
  if (gate.readyToAdvance && gate.next) whyNow.push(`Fasekriteriene for ${stage} er oppfylt; saken kan flyttes mot ${gate.next}.`);
  if (dialogue.awaitingReply) signals.push("Siste registrerte dialog er utsendt e-post; vi venter på kundesvar.");
  if (Number(dialogue.replyCount || 0) > 0) signals.push(`${dialogue.replyCount} kundesvar er koblet til Customer 360.`);
  if (profile?.id) signals.push(`Buyer Profile finnes (${String(profile.status || "ukjent status")}).`);
  if (shortlists.length) signals.push(`${shortlists.length} shortlist(er) er koblet til kunden.`);
  if (dialogue.manualTakeover) signals.push("Du har tatt over kundedialogen; automatisk e-post er stoppet.");

  for (const item of gate.criteria.filter((row) => !row.met)) missing.push(item.label);
  if (profileScore < 70) risks.push(`Buyer Profile er bare ${profileScore}% salgsklar; matching kan bli for bred eller feil.`);
  if (dialogue.awaitingReply && lastReplyDays === null) risks.push("Systemet venter på svar uten et nyere registrert kundesignal.");
  if (!contact.next_followup && ACTIVE_STAGES.has(stage)) risks.push("Ingen konkret neste oppfølgingsdato er satt.");
  if (activeWork.length > 3) risks.push(`${activeWork.length} åpne kundeoppgaver kan skape parallelle eller motstridende neste steg.`);
  if (dialogue.emailBlocked && !dialogue.manualTakeover && !contact.do_not_contact) risks.push("E-post er blokkert av CRM-suppression; avklar årsaken før ny dialog.");
  if (stage === "QUALIFIED" && profileScore >= 70 && shortlists.length === 0) risks.push("Kunden er kvalifisert, men har ingen shortlist; momentum kan gå tapt.");

  let nextBestAction: CustomerSalesAdvisorOutput["nextBestAction"];
  if (["LOST", "WON"].includes(stage)) {
    nextBestAction = { action: stage === "WON" ? "Hold overlevering og etter-salg ryddig; ingen ny salgsoppfølging." : "Ikke kontakt kunden uten et nytt, dokumentert kjøpssignal.", why: `Saken er ${stage}.`, channel: "NONE" };
  } else if (stage === "ON_HOLD" || (waitingUntil && waitingUntil.getTime() > now.getTime())) {
    nextBestAction = { action: waitingUntil ? `Vent til avtalt dato ${waitingUntil.toLocaleDateString("nb-NO")} før salgsoppfølging.` : "Behold kunden på vent til et nytt kjøpssignal eller avtalt gjenåpningspunkt finnes.", why: text(contact.waiting_reason) || "Kunden er satt på vent.", channel: "NONE" };
  } else if (dialogue.awaitingReply) {
    nextBestAction = { action: "Ikke send en ny automatisk e-post. Gjennomgå siste utsendelse og vent på svar eller ta over dialogen manuelt.", why: "Siste registrerte hendelse er en utsendt e-post.", channel: "CRM" };
  } else if (!profile?.id || profileScore < 70) {
    nextBestAction = { action: `Avklar ${missing.slice(0, 3).join(", ").toLowerCase() || "de viktigste kjøpskriteriene"} og oppdater Buyer Profile.`, why: "Et presist behovsbilde reduserer irrelevante boligforslag.", channel: contact.phone ? "CALL" : "EMAIL" };
  } else if (stage === "QUALIFIED" && shortlists.length === 0) {
    nextBestAction = { action: "Lag en liten, kvalitetssikret shortlist basert på godkjent Buyer Profile – og forklar hvorfor hvert alternativ passer.", why: "Kunden er kvalifisert og profilen er tilstrekkelig komplett til å gå fra behov til konkrete alternativer.", channel: "CRM" };
  } else if (stage === "MATCHING") {
    nextBestAction = { action: "Be kunden rangere alternativene og si hva de liker/misliker. Bruk svaret til å stramme inn profilen før flere boliger sendes.", why: "Feedback på konkrete alternativer er mer verdifullt enn å sende en større liste.", channel: contact.phone ? "CALL" : "EMAIL" };
  } else if (stage === "VIEWING") {
    nextBestAction = { action: "Oppsummer visningen, få kunden til å rangere alternativene og avtal ett konkret neste steg.", why: "Momentum etter visning faller raskt uten en eksplisitt beslutningsdialog.", channel: "CALL" };
  } else if (stage === "NEGOTIATION" || stage === "RESERVED") {
    nextBestAction = { action: "Avklar beslutningsforbehold, pris/vilkår og hvem som må gjøre hva før neste milepæl.", why: "På dette stadiet bør hvert steg redusere konkret beslutningsrisiko.", channel: "CALL" };
  } else if (gate.readyToAdvance && gate.next) {
    nextBestAction = { action: `Fasekriteriene er oppfylt. Flytt kunden mot ${gate.next} og registrer ett konkret neste steg.`, why: "Kunden har tilstrekkelig evidens for neste salgsfase.", channel: "CRM" };
  } else {
    nextBestAction = { action: text(contact.next_action) || "Avklar kundens viktigste åpne spørsmål og avtal et konkret neste steg.", why: "Salgsmomentum skapes ved å redusere den viktigste usikkerheten – ikke ved å øke kontaktfrekvensen.", channel: contact.phone ? "CALL" : "EMAIL" };
  }

  const paused = stage === "ON_HOLD" || Boolean(waitingUntil && waitingUntil.getTime() > now.getTime());
  const closed = stage === "LOST" || stage === "WON";
  const momentum: CustomerSalesAdvisorOutput["momentum"] = closed ? "CLOSED" : paused ? "PAUSED" : overall >= 75 ? "HOT" : overall >= 50 ? "WARM" : "COOL";
  const priority: CustomerSalesAdvisorOutput["priority"] = closed || paused ? "PAUSED" : overall >= 72 ? "P1" : overall >= 50 ? "P2" : "P3";

  const discoveryQuestions: string[] = [];
  if (!hasCriterion(criteria, "location") && !contact.preferred_location) discoveryQuestions.push("Hvis du måtte velge 1–3 områder først, hvilke ville du prioritert?");
  if (!(Number(profile?.budget_amount || contact.pipeline_value || 0) > 0 || hasCriterion(criteria, "total_budget") || hasCriterion(criteria, "purchase_price"))) discoveryQuestions.push("Hvilket totalbudsjett ønsker du komfortabelt å holde deg innenfor?");
  if (!hasCriterion(criteria, "property_type")) discoveryQuestions.push("Ser du helst etter leilighet, rekkehus eller villa – eller er du åpen?");
  if (!hasTimelineCriterion(criteria) && !contact.next_followup) discoveryQuestions.push("Når ser du for deg at et kjøp realistisk kan være aktuelt?");
  if (stage === "MATCHING") discoveryQuestions.push("Hvilket av alternativene er nærmest riktig – og hva er den viktigste grunnen?");
  if (stage === "VIEWING") discoveryQuestions.push("Hva må være annerledes eller bedre for at du skal være klar til å gå videre med en bolig?");
  if (["NEGOTIATION", "RESERVED"].includes(stage)) discoveryQuestions.push("Hva er det viktigste som fortsatt må avklares før du kan ta en beslutning?");

  return {
    contactId: String(contact.id || ""),
    stage,
    priority,
    score: overall,
    headline: closed
      ? stage === "WON" ? "Kunden er vunnet – flytt fokus til trygg overlevering." : "Saken er avsluttet – ikke skap ny aktivitet uten nytt kundesignal."
      : paused
        ? "Kunden er på vent – respekter timing og unngå unødvendig oppfølging."
        : gate.readyToAdvance && gate.next
          ? `Kunden er klar for neste steg mot ${gate.next}.`
          : `${nextBestAction.action}`,
    momentum,
    scores: { profile: profileScore, engagement: engagementScore, timing: timingScore, intent: intentScore, overall },
    whyNow: whyNow.slice(0, 5),
    signals: signals.slice(0, 6),
    risks: [...new Set(risks)].slice(0, 6),
    missing: [...new Set(missing)].slice(0, 6),
    nextBestAction,
    stageGuidance: gate,
    discoveryQuestions: [...new Set(discoveryQuestions)].slice(0, 5),
    coach: {
      do: [
        "Bruk kundens egne ord og siste svar som utgangspunkt.",
        "Reduser én konkret usikkerhet om gangen.",
        "Avslutt dialogen med ett gjensidig, konkret neste steg.",
        "Oppdater Buyer Profile når kunden korrigerer eller prioriterer kriterier.",
      ],
      avoid: [
        "Ikke send flere boliger bare for å skape aktivitet.",
        "Ikke behandle stillhet som interesse.",
        "Ikke starte automatisk oppfølging når kunden er på vent eller du har tatt over dialogen.",
      ],
    },
    guardrail: "Rådene kan foreslå handling og utkast, men kundekontakt skal respektere STOPP, ON_HOLD, manuell takeover og eksisterende e-postsperrer.",
  };
}
