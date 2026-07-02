export type RevenueCampaignSettings = {
  industry: string;
  area: string;
  offer: string;
  cta: string;
  bookingUrl: string;
  packageName: string;
};

export type RevenueEngineImport = {
  id: string;
  website_url: string;
  company_name?: string | null;
  detected_industry?: string | null;
  recommended_template_slug?: string | null;
  confidence_score?: number | string | null;
  profile?: Record<string, unknown> | null;
  editable_fields?: Record<string, unknown> | null;
  warnings?: string[] | null;
  source_pages?: string[] | null;
  created_order_id?: string | null;
  applied_order_id?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export type RevenueEngineOrder = {
  id: string;
  order_number?: string | null;
  status?: string | null;
  company_name?: string | null;
  industry?: string | null;
  website_url?: string | null;
  template_slug?: string | null;
  preview_url?: string | null;
  claim_url?: string | null;
  claim_token?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  created_at?: string | null;
};

export type RevenueEngineLead = {
  id: string;
  company_name?: string | null;
  website_url?: string | null;
  domain?: string | null;
  industry?: string | null;
  lead_status?: string | null;
  outreach_status?: string | null;
  demo_preview_url?: string | null;
  demo_claim_url?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type RevenueEngineStage =
  | "analysis_ready"
  | "demo_ready"
  | "outreach_ready"
  | "follow_up"
  | "session_booked"
  | "won"
  | "not_fit";

export type RevenueEngineOpportunity = {
  id: string;
  leadId?: string | null;
  orderId?: string | null;
  companyName: string;
  websiteUrl: string;
  industry: string;
  templateSlug: string;
  stage: RevenueEngineStage;
  priorityScore: number;
  confidenceScore: number;
  previewUrl: string;
  claimUrl: string;
  source: "import" | "lead";
  reasons: string[];
  risks: string[];
  nextAction: string;
  followUpAt?: string | null;
  workflowNote?: string | null;
  sessionBrief: RevenueSessionBrief;
  outreach: RevenueOutreachDrafts;
  createdAt?: string | null;
};

export type RevenueWorklistItem = {
  id: string;
  companyName: string;
  stage: RevenueEngineStage;
  priorityScore: number;
  action: string;
  followUpAt?: string | null;
};

export type RevenueSessionBrief = {
  hook: string;
  problems: string[];
  improvements: string[];
  agenda: string[];
  closeQuestion: string;
};

export type RevenueOutreachDrafts = {
  emailSubject: string;
  emailOne: string;
  emailTwo: string;
  emailThree: string;
  emailFour: string;
  dm: string;
  callOpener: string;
};

const DEFAULT_CAMPAIGN: RevenueCampaignSettings = {
  industry: "Lokale bedrifter",
  area: "Norge",
  offer: "privat DemoSite med AI-assistent og tydeligere kundehenvendelser",
  cta: "Se privat demo",
  bookingUrl: "",
  packageName: "Start: 4.900 NOK setup + 990 NOK/mnd",
};

const STAGE_LABELS: Record<RevenueEngineStage, string> = {
  analysis_ready: "Analyse klar",
  demo_ready: "Demo klar",
  outreach_ready: "Klar til kontakt",
  follow_up: "Følg opp",
  session_booked: "Session booket",
  won: "Vunnet",
  not_fit: "Ikke fit",
};

function text(value: unknown, fallback = "") {
  const output = String(value || "").trim();
  return output || fallback;
}

function list(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString();
  } catch {
    return raw;
  }
}

function domainKey(value: unknown) {
  const url = normalizeUrl(value);
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
  }
}

function getImportFields(item: RevenueEngineImport) {
  return record(item.editable_fields);
}

function getImportProfile(item: RevenueEngineImport) {
  return record(item.profile);
}

function importCompanyName(item: RevenueEngineImport) {
  const profile = getImportProfile(item);
  return text(profile.company_name) || text(item.company_name) || "Ukjent bedrift";
}

function importWebsiteUrl(item: RevenueEngineImport) {
  const profile = getImportProfile(item);
  return normalizeUrl(profile.website_url || item.website_url);
}

function importIndustry(item: RevenueEngineImport) {
  const profile = getImportProfile(item);
  return text(profile.detected_industry) || text(item.detected_industry) || text(item.recommended_template_slug) || "Ikke valgt";
}

function importTemplateSlug(item: RevenueEngineImport) {
  const fields = getImportFields(item);
  const profile = getImportProfile(item);
  return text(profile.recommended_template_slug) || text(fields.template_slug) || text(item.recommended_template_slug) || "local-service";
}

function orderPreviewUrl(order?: RevenueEngineOrder) {
  if (!order) return "";
  if (order.preview_url?.includes("/demosites/preview/")) return order.preview_url;
  if (order.claim_url?.includes("/demosites/claim/")) return order.claim_url.replace("/demosites/claim/", "/demosites/preview/");
  return order.preview_url || "";
}

function findOrderForImport(item: RevenueEngineImport, orders: RevenueEngineOrder[]) {
  const orderId = item.created_order_id || item.applied_order_id;
  const importDomain = domainKey(importWebsiteUrl(item));
  return orders.find((order) => order.id === orderId)
    || orders.find((order) => importDomain && domainKey(order.website_url) === importDomain)
    || null;
}

function findLeadForImport(item: RevenueEngineImport, leads: RevenueEngineLead[]) {
  const importDomain = domainKey(importWebsiteUrl(item));
  const company = importCompanyName(item).toLowerCase();
  return leads.find((lead) => importDomain && (domainKey(lead.website_url) === importDomain || text(lead.domain).toLowerCase() === importDomain))
    || leads.find((lead) => company && text(lead.company_name).toLowerCase() === company)
    || null;
}

function getLeadWorkflow(lead: RevenueEngineLead | null) {
  const metadata = record(lead?.metadata);
  const revenueEngine = record(metadata.revenue_engine);

  return {
    followUpAt: text(revenueEngine.next_follow_up_at),
    workflowNote: text(revenueEngine.note || revenueEngine.last_action),
  };
}

function stageFromData(item: RevenueEngineImport, order: RevenueEngineOrder | null, lead: RevenueEngineLead | null): RevenueEngineStage {
  const leadStatus = text(lead?.lead_status).toLowerCase();
  const outreachStatus = text(lead?.outreach_status).toLowerCase();
  const importStatus = text(item.status).toLowerCase();
  const orderStatus = text(order?.status).toLowerCase();

  if (leadStatus === "converted" || orderStatus === "deployed" || orderStatus === "approved") return "won";
  if (leadStatus === "not_fit" || leadStatus === "opted_out" || leadStatus === "archived" || importStatus === "discarded") return "not_fit";
  if (leadStatus === "responded") return "session_booked";
  if (leadStatus === "contacted" || outreachStatus === "sent") return "follow_up";
  if (leadStatus === "outreach_ready" || outreachStatus === "approved") return "outreach_ready";
  if (order || importStatus === "created_demo" || importStatus === "applied_to_demo") return "demo_ready";
  return "analysis_ready";
}

function stageFromLead(lead: RevenueEngineLead): RevenueEngineStage {
  const leadStatus = text(lead.lead_status).toLowerCase();
  const outreachStatus = text(lead.outreach_status).toLowerCase();

  if (leadStatus === "converted") return "won";
  if (leadStatus === "not_fit" || leadStatus === "opted_out" || leadStatus === "archived") return "not_fit";
  if (leadStatus === "responded") return "session_booked";
  if (leadStatus === "contacted" || outreachStatus === "sent") return "follow_up";
  if (leadStatus === "outreach_ready" || outreachStatus === "approved") return "outreach_ready";
  if (leadStatus === "demo_created") return "demo_ready";
  return "analysis_ready";
}

function getLeadSignals(item: RevenueEngineImport, order: RevenueEngineOrder | null, lead: RevenueEngineLead | null) {
  const fields = getImportFields(item);
  const profile = getImportProfile(item);
  const services = list(fields.services).length ? list(fields.services) : list(profile.services);
  const products = list(fields.products).length ? list(fields.products) : list(profile.products);
  const prices = list(fields.prices).length ? list(fields.prices) : list(profile.prices);
  const trust = list(fields.trust_points).length ? list(fields.trust_points) : list(profile.trust_points);
  const warnings = Array.isArray(item.warnings) ? item.warnings : [];
  const confidence = numberValue(profile.confidence_score ?? item.confidence_score, 0);
  const hasCta = Boolean(text(fields.call_to_action));
  const hasContactText = Boolean(text(fields.contact_text));
  const hasLogo = Boolean(text(fields.logo_url) || text(profile.logo_url));
  const hasGallery = list(fields.gallery_images).length > 0 || list(profile.image_urls).length > 0;
  const hasContact = Boolean(text(record(profile.contact).email) || text(record(profile.contact).phone) || text(lead?.website_url));

  return {
    confidence,
    services,
    products,
    prices,
    trust,
    warnings,
    hasCta,
    hasContactText,
    hasLogo,
    hasGallery,
    hasContact,
    hasOrder: Boolean(order),
  };
}

function buildPriority(item: RevenueEngineImport, order: RevenueEngineOrder | null, lead: RevenueEngineLead | null) {
  const signals = getLeadSignals(item, order, lead);
  let score = 35;
  const reasons: string[] = [];
  const risks: string[] = [];

  if (signals.hasOrder) {
    score += 20;
    reasons.push("Privat demo finnes allerede.");
  } else {
    risks.push("Demo er ikke opprettet ennå.");
  }

  if (signals.confidence >= 75) {
    score += 12;
    reasons.push("Bransje og innhold er analysert med høy confidence.");
  } else if (signals.confidence >= 45) {
    score += 7;
    reasons.push("Analysen har nok signaler til manuell vurdering.");
  } else {
    risks.push("Lav confidence, bør kvalitetssikres før kontakt.");
  }

  if (signals.services.length >= 3) {
    score += 10;
    reasons.push("Minst tre konkrete tjenester er klare.");
  } else {
    risks.push("Få konkrete tjenester, bør fylles ut før session.");
  }

  if (signals.products.length || signals.prices.length) {
    score += 8;
    reasons.push("Pakker eller prislinjer finnes for tydelig tilbud.");
  }

  if (signals.trust.length >= 2) score += 6;
  if (signals.hasCta) score += 5;
  if (signals.hasContactText) score += 4;
  if (signals.hasLogo) score += 4;
  if (signals.hasGallery) score += 4;
  if (signals.hasContact) score += 5;
  if (signals.warnings.length > 2) {
    score -= 8;
    risks.push("Analysen har flere warnings.");
  }

  if (!reasons.length) reasons.push("Leadet har nok data til å vurderes manuelt.");
  if (!risks.length) risks.push("Ingen store blokkere, men Freddy bør godkjenne før outreach.");

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    confidence: Math.max(0, Math.min(100, Math.round(signals.confidence))),
    reasons,
    risks,
    signals,
  };
}

function stageNextAction(stage: RevenueEngineStage) {
  switch (stage) {
    case "analysis_ready":
      return "Opprett eller kvalitetssikre demo før kontakt.";
    case "demo_ready":
      return "Godkjenn outreach og kontakt bedriften manuelt.";
    case "outreach_ready":
      return "Send første godkjente melding og legg follow-up.";
    case "follow_up":
      return "Følg opp med e-post 2 eller ring.";
    case "session_booked":
      return "Kjør 10-min session og send tilbud samme dag.";
    case "won":
      return "Onboard kunden og sikre MRR.";
    case "not_fit":
      return "Ikke bruk mer salgstid nå.";
  }
}

function stageWorklistWeight(stage: RevenueEngineStage) {
  switch (stage) {
    case "follow_up":
      return 50;
    case "outreach_ready":
      return 45;
    case "demo_ready":
      return 40;
    case "session_booked":
      return 35;
    case "analysis_ready":
      return 20;
    case "won":
    case "not_fit":
      return 0;
  }
}

function firstThree(values: string[], fallback: string[]) {
  const output = values.map((item) => text(item)).filter(Boolean).slice(0, 3);
  return output.length ? output : fallback;
}

function buildSessionBrief(
  companyName: string,
  industry: string,
  campaign: RevenueCampaignSettings,
  signals: ReturnType<typeof getLeadSignals>,
): RevenueSessionBrief {
  const services = firstThree(signals.services, ["tjenester", "kontaktvei", "kundehenvendelser"]);
  const offer = text(campaign.offer, DEFAULT_CAMPAIGN.offer);
  const cta = text(campaign.cta, DEFAULT_CAMPAIGN.cta);

  return {
    hook: `Jeg har laget en privat demo for ${companyName} som viser hvordan ${industry.toLowerCase()} kan presenteres mer moderne og mer salgsrettet.`,
    problems: [
      "Kunden må raskt forstå hva de skal velge først.",
      "Kontakt, tilbud eller booking bør være tydeligere gjennom hele siden.",
      "Siden bør bygge tillit før kunden tar kontakt.",
    ],
    improvements: [
      `Løft ${services.join(", ")} som konkrete valg.`,
      `Bruk CTA-en "${cta}" som hovedvei til neste steg.`,
      `Presenter ${offer} som en enkel, privat demo de kan godkjenne manuelt.`,
    ],
    agenda: [
      "Vis hva analysen fant på nettsiden.",
      "Vis privat DemoSite og de viktigste forbedringene.",
      "Vis kontaktflyt/AI-assistent og spør om neste steg.",
    ],
    closeQuestion: "Hvis vi kan gjøre dette klart for dere, er det interessant at jeg sender et enkelt tilbud?",
  };
}

function buildOutreach(
  companyName: string,
  websiteUrl: string,
  previewUrl: string,
  campaign: RevenueCampaignSettings,
  brief: RevenueSessionBrief,
): RevenueOutreachDrafts {
  const offer = text(campaign.offer, DEFAULT_CAMPAIGN.offer);
  const cta = text(campaign.cta, DEFAULT_CAMPAIGN.cta);
  const booking = text(campaign.bookingUrl);
  const previewLine = previewUrl ? `\n\nHer er previewen:\n${previewUrl}` : "";
  const bookingLine = booking ? `\n\nBook 10 min her:\n${booking}` : "";

  return {
    emailSubject: `Privat demo av nettsiden til ${companyName}`,
    emailOne: `Hei,\n\nJeg så på nettsiden til ${companyName}${websiteUrl ? ` (${websiteUrl})` : ""} og laget et forslag til hvordan den kan bli mer moderne, tydeligere og bedre på henvendelser.\n\nDet er ikke publisert noe. Bare en privat demo basert på offentlig informasjon.\n\nVil du se den på 10 minutter?${previewLine}\n\nMvh\nFreddy`,
    emailTwo: `Hei,\n\nJeg ville spesielt gjort tre ting enklere for ${companyName}:\n\n1. Hva kunden bør velge først\n2. Hvordan de raskt ber om pris, time eller kontakt\n3. Hvorfor de skal stole på dere før de tar kontakt\n\nJeg har lagt dette inn i demoen.${previewLine}\n\nSkal jeg vise deg raskt hva jeg mener?\n\nFreddy`,
    emailThree: `Hei,\n\nPoenget med demoen er ikke bare at siden skal se penere ut.\n\nDen er bygget for at kunder raskere skal forstå tilbudet, velge riktig tjeneste og sende henvendelse. For ${companyName} ville jeg brukt "${cta}" som tydelig hovedhandling.\n\n${offer.charAt(0).toUpperCase()}${offer.slice(1)} kan være et lavterskel første steg.${bookingLine}\n\nFreddy`,
    emailFour: `Hei,\n\nSkal jeg lukke den private demoen jeg laget for ${companyName}, eller vil du se den først?\n\nHvis det ikke passer nå, null stress.${previewLine}\n\nFreddy`,
    dm: `Hei, jeg laget en privat demo av hvordan nettsiden til ${companyName} kan bli mer moderne og bedre på henvendelser. Ikke publisert, bare preview. Vil du se den?`,
    callOpener: `Hei, det er Freddy. Jeg ringer kort fordi jeg har laget en privat demo av hvordan nettsiden til ${companyName} kan se ut med tydeligere tjenester, bedre kontaktflyt og AI-assistent. Tar det 10 minutter å vise deg?`,
  };
}

export function getRevenueStageLabel(stage: RevenueEngineStage) {
  return STAGE_LABELS[stage];
}

export function getDefaultRevenueCampaign(): RevenueCampaignSettings {
  return { ...DEFAULT_CAMPAIGN };
}

export function buildRevenueOpportunities(
  imports: RevenueEngineImport[],
  orders: RevenueEngineOrder[],
  leads: RevenueEngineLead[],
  campaignInput?: Partial<RevenueCampaignSettings>,
): RevenueEngineOpportunity[] {
  const campaign = { ...DEFAULT_CAMPAIGN, ...campaignInput };
  const opportunities = imports.map((item) => {
    const order = findOrderForImport(item, orders);
    const lead = findLeadForImport(item, leads);
    const companyName = importCompanyName(item);
    const websiteUrl = importWebsiteUrl(item);
    const industry = importIndustry(item);
    const templateSlug = importTemplateSlug(item);
    const stage = stageFromData(item, order, lead);
    const priority = buildPriority(item, order, lead);
    const previewUrl = orderPreviewUrl(order || undefined) || text(lead?.demo_preview_url);
    const claimUrl = text(order?.claim_url);
    const workflow = getLeadWorkflow(lead);
    const sessionBrief = buildSessionBrief(companyName, industry, campaign, priority.signals);

    return {
      id: item.id,
      leadId: lead?.id || null,
      orderId: order?.id || item.created_order_id || item.applied_order_id || null,
      companyName,
      websiteUrl,
      industry,
      templateSlug,
      stage,
      priorityScore: priority.score,
      confidenceScore: priority.confidence,
      previewUrl,
      claimUrl,
      source: "import" as const,
      reasons: priority.reasons,
      risks: priority.risks,
      nextAction: stageNextAction(stage),
      followUpAt: workflow.followUpAt,
      workflowNote: workflow.workflowNote,
      sessionBrief,
      outreach: buildOutreach(companyName, websiteUrl, previewUrl, campaign, sessionBrief),
      createdAt: item.created_at,
    };
  });

  const importDomains = new Set(imports.map((item) => domainKey(importWebsiteUrl(item))).filter(Boolean));
  const leadOnlyOpportunities = leads
    .filter((lead) => {
      const leadDomain = domainKey(lead.website_url);
      return leadDomain && !importDomains.has(leadDomain);
    })
    .map((lead) => {
      const companyName = text(lead.company_name, "Ukjent lead");
      const websiteUrl = normalizeUrl(lead.website_url);
      const stage = stageFromLead(lead);
      const workflow = getLeadWorkflow(lead);
      const sessionBrief = buildSessionBrief(companyName, text(lead.industry, campaign.industry), campaign, {
        confidence: 0,
        services: [],
        products: [],
        prices: [],
        trust: [],
        warnings: [],
        hasCta: false,
        hasContactText: false,
        hasLogo: false,
        hasGallery: false,
        hasContact: Boolean(lead.website_url),
        hasOrder: false,
      });

      return {
        id: lead.id,
        leadId: lead.id,
        orderId: null,
        companyName,
        websiteUrl,
        industry: text(lead.industry, campaign.industry),
        templateSlug: "local-service",
        stage,
        priorityScore: 35,
        confidenceScore: 0,
        previewUrl: text(lead.demo_preview_url),
        claimUrl: "",
        source: "lead" as const,
        reasons: ["Lead finnes i pipeline, men bør analyseres før outreach."],
        risks: ["Ingen importanalyse koblet til leadet ennå."],
        nextAction: stageNextAction(stage),
        followUpAt: workflow.followUpAt,
        workflowNote: workflow.workflowNote,
        sessionBrief,
        outreach: buildOutreach(companyName, websiteUrl, text(lead.demo_preview_url), campaign, sessionBrief),
        createdAt: lead.created_at,
      };
    });

  return [...opportunities, ...leadOnlyOpportunities].sort((a, b) => b.priorityScore - a.priorityScore);
}

export function buildRevenueDailyWorklist(opportunities: RevenueEngineOpportunity[], limit = 5): RevenueWorklistItem[] {
  return opportunities
    .filter((item) => item.stage !== "won" && item.stage !== "not_fit")
    .map((item) => ({
      id: item.id,
      companyName: item.companyName,
      stage: item.stage,
      priorityScore: item.priorityScore,
      action: item.nextAction,
      followUpAt: item.followUpAt,
    }))
    .sort((a, b) => {
      const stageDelta = stageWorklistWeight(b.stage) - stageWorklistWeight(a.stage);
      if (stageDelta) return stageDelta;
      if (a.followUpAt && b.followUpAt && a.followUpAt !== b.followUpAt) return a.followUpAt.localeCompare(b.followUpAt);
      if (a.followUpAt && !b.followUpAt) return -1;
      if (!a.followUpAt && b.followUpAt) return 1;
      return b.priorityScore - a.priorityScore;
    })
    .slice(0, limit);
}

export function buildRevenueSummary(opportunities: RevenueEngineOpportunity[]) {
  return {
    total: opportunities.length,
    demoReady: opportunities.filter((item) => item.stage === "demo_ready" || item.stage === "outreach_ready").length,
    followUp: opportunities.filter((item) => item.stage === "follow_up").length,
    sessions: opportunities.filter((item) => item.stage === "session_booked").length,
    won: opportunities.filter((item) => item.stage === "won").length,
    highPriority: opportunities.filter((item) => item.priorityScore >= 75).length,
  };
}
