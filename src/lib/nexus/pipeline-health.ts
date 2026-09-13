export type PipelineHealthOwner = "NEXUS" | "FREDDY" | "CUSTOMER" | "SYSTEM";
export type PipelineHealthCategory = "BLOCKED" | "HUMAN_REVIEW" | "AUTOMATION" | "WAITING" | "READY" | "HEALTHY";
export type PipelineHealthSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";

export type PipelineHealthReasonCode =
  | "SUPPRESSED"
  | "PLANNED_WAIT"
  | "UNCLEAR_REPLY_REVIEW"
  | "NEEDS_QUALIFICATION"
  | "MISSING_BUYER_PROFILE"
  | "BUYER_PROFILE_REVIEW"
  | "MATCHING_PENDING"
  | "NO_MATCHES"
  | "SHORTLIST_REVIEW"
  | "PRESENTATION_PENDING"
  | "PRESENTATION_REVIEW"
  | "MESSAGE_DRAFT_PENDING"
  | "MESSAGE_REVIEW"
  | "PREFLIGHT_PENDING"
  | "PREFLIGHT_BLOCKED"
  | "READY_TO_SEND"
  | "SENT_WAITING_REPLY"
  | "CUSTOMER_REPLY_NEEDS_ACTION"
  | "ACTIVE_PIPELINE"
  | "DATA_QUALITY";

export interface PipelineHealthDefinition {
  code: PipelineHealthReasonCode;
  label: string;
  category: PipelineHealthCategory;
  owner: PipelineHealthOwner;
  severity: PipelineHealthSeverity;
  explanation: string;
}

export interface PipelineHealthInput {
  contacts: any[];
  buyerProfiles?: any[];
  shortlists?: any[];
  presentations?: any[];
  messageDrafts?: any[];
  workItems?: any[];
  sendReceipts?: any[];
  now?: Date;
}

export interface PipelineHealthLead {
  contactId: string;
  name: string;
  email: string | null;
  brand: string;
  pipelineStage: string;
  pipelineValue: number;
  reasonCode: PipelineHealthReasonCode;
  reasonLabel: string;
  category: PipelineHealthCategory;
  owner: PipelineHealthOwner;
  severity: PipelineHealthSeverity;
  explanation: string;
  hotLead: boolean;
  profileId: string | null;
  profileStatus: string | null;
  shortlistId: string | null;
  presentationId: string | null;
  messageDraftId: string | null;
  lastInboundReplyAt: string | null;
  href: string;
}

export interface PipelineHealthSnapshot {
  generatedAt: string;
  version: 1;
  summary: {
    activeLeads: number;
    blocked: number;
    humanReview: number;
    automationQueue: number;
    waitingCustomer: number;
    readyToSend: number;
    hotLeads: number;
    dataQuality: number;
  };
  bottlenecks: Array<PipelineHealthDefinition & { count: number }>;
  byBrand: Array<{ brand: string; activeLeads: number; blocked: number; humanReview: number; automationQueue: number; readyToSend: number }>;
  byPipelineStage: Array<{ stage: string; count: number }>;
  leads: PipelineHealthLead[];
  safety: {
    readOnly: true;
    customerSend: false;
    crmMutation: false;
    buyerProfileMutation: false;
  };
}

const DEFINITIONS: Record<PipelineHealthReasonCode, PipelineHealthDefinition> = {
  SUPPRESSED: { code: "SUPPRESSED", label: "Kontakt sperret", category: "HEALTHY", owner: "SYSTEM", severity: "INFO", explanation: "Kunden er under do-not-contact eller e-postsperre og skal ikke automatiseres videre." },
  PLANNED_WAIT: { code: "PLANNED_WAIT", label: "Planlagt venting", category: "WAITING", owner: "CUSTOMER", severity: "INFO", explanation: "Kunden er satt på vent til avtalt tidspunkt. Dette skal ikke behandles som stagnasjon." },
  UNCLEAR_REPLY_REVIEW: { code: "UNCLEAR_REPLY_REVIEW", label: "Uklart kundesvar", category: "HUMAN_REVIEW", owner: "FREDDY", severity: "HIGH", explanation: "Kundens siste svar er uklart og må vurderes før pipeline, profil eller matching endres." },
  NEEDS_QUALIFICATION: { code: "NEEDS_QUALIFICATION", label: "Må kvalifiseres", category: "HUMAN_REVIEW", owner: "FREDDY", severity: "MEDIUM", explanation: "Leadet er aktivt, men har ikke nok bekreftet kjøpsinformasjon til Buyer Profile og matching." },
  MISSING_BUYER_PROFILE: { code: "MISSING_BUYER_PROFILE", label: "Buyer Profile mangler", category: "BLOCKED", owner: "FREDDY", severity: "HIGH", explanation: "Kunden er kommet til en salgsfase der matching krever en Buyer Profile, men ingen profil finnes." },
  BUYER_PROFILE_REVIEW: { code: "BUYER_PROFILE_REVIEW", label: "Buyer Profile venter review", category: "HUMAN_REVIEW", owner: "FREDDY", severity: "HIGH", explanation: "Buyer Profile finnes, men er ikke godkjent eller må revideres etter ny kundeevidens." },
  MATCHING_PENDING: { code: "MATCHING_PENDING", label: "Matching venter", category: "AUTOMATION", owner: "NEXUS", severity: "MEDIUM", explanation: "Godkjent Buyer Profile finnes, men Nexus har ennå ikke klargjort et matching-resultat." },
  NO_MATCHES: { code: "NO_MATCHES", label: "Ingen gode treff", category: "BLOCKED", owner: "FREDDY", severity: "HIGH", explanation: "Matching er kjørt uten gode nok treff. Kriterier eller marked må vurderes uten å brede søket automatisk." },
  SHORTLIST_REVIEW: { code: "SHORTLIST_REVIEW", label: "Shortlist venter review", category: "HUMAN_REVIEW", owner: "FREDDY", severity: "HIGH", explanation: "Shortlist er laget, men er ikke ferdig menneskelig kvalitetssikret for kunden." },
  PRESENTATION_PENDING: { code: "PRESENTATION_PENDING", label: "Presentasjon venter", category: "AUTOMATION", owner: "NEXUS", severity: "MEDIUM", explanation: "Godkjent shortlist finnes og kundepresentasjonen skal klargjøres av Nexus." },
  PRESENTATION_REVIEW: { code: "PRESENTATION_REVIEW", label: "Presentasjon venter review", category: "HUMAN_REVIEW", owner: "FREDDY", severity: "HIGH", explanation: "Kundepresentasjonen finnes, men mangler eksplisitt sluttgodkjenning." },
  MESSAGE_DRAFT_PENDING: { code: "MESSAGE_DRAFT_PENDING", label: "Meldingsutkast venter", category: "AUTOMATION", owner: "NEXUS", severity: "MEDIUM", explanation: "Presentasjonen er godkjent, men kundemeldingen er ikke ferdig klargjort." },
  MESSAGE_REVIEW: { code: "MESSAGE_REVIEW", label: "Melding venter godkjenning", category: "HUMAN_REVIEW", owner: "FREDDY", severity: "HIGH", explanation: "Kundemeldingen finnes, men er ikke godkjent for den styrte sendeflyten." },
  PREFLIGHT_PENDING: { code: "PREFLIGHT_PENDING", label: "Send-preflight venter", category: "AUTOMATION", owner: "NEXUS", severity: "MEDIUM", explanation: "Alt innhold er godkjent, men fersk suppression-, brand- og sendesikkerhetskontroll gjenstår." },
  PREFLIGHT_BLOCKED: { code: "PREFLIGHT_BLOCKED", label: "Send-preflight blokkert", category: "BLOCKED", owner: "FREDDY", severity: "CRITICAL", explanation: "Siste send-preflight blokkerte utsending. Årsaken må løses før kunden kan kontaktes." },
  READY_TO_SEND: { code: "READY_TO_SEND", label: "Klar for styrt sending", category: "READY", owner: "NEXUS", severity: "INFO", explanation: "Godkjenninger og preflight er på plass for den eksplisitt autoriserte sendeflyten." },
  SENT_WAITING_REPLY: { code: "SENT_WAITING_REPLY", label: "Sendt – venter på svar", category: "WAITING", owner: "CUSTOMER", severity: "INFO", explanation: "Boligforslag er sendt og kunden har ikke svart etter siste registrerte sending." },
  CUSTOMER_REPLY_NEEDS_ACTION: { code: "CUSTOMER_REPLY_NEEDS_ACTION", label: "Kundesvar krever handling", category: "HUMAN_REVIEW", owner: "FREDDY", severity: "HIGH", explanation: "Kunden har svart etter siste utsending og oppfølgingen er ikke avsluttet." },
  ACTIVE_PIPELINE: { code: "ACTIVE_PIPELINE", label: "Aktiv salgsfase", category: "HEALTHY", owner: "FREDDY", severity: "INFO", explanation: "Kunden er i en aktiv salgsfase uten en tydelig teknisk blokkering i anbefalingskjeden." },
  DATA_QUALITY: { code: "DATA_QUALITY", label: "Datakvalitet må kontrolleres", category: "BLOCKED", owner: "SYSTEM", severity: "HIGH", explanation: "Pipeline-data er ikke konsistent nok til at Nexus kan fastslå et trygt neste steg." },
};

const TERMINAL_STAGES = new Set(["LOST", "WON"]);
const OPEN_WORK_STATUSES = new Set(["TO_DO", "IN_PROGRESS", "REVIEW"]);
const SALES_STAGES_REQUIRING_PROFILE = new Set(["QUALIFIED", "MATCHING", "VIEWING", "NEGOTIATION", "RESERVED"]);
const HOT_CLASSIFICATIONS = new Set(["viewing_request", "property_interest", "active_interest"]);

function text(value: unknown) { return String(value || "").trim(); }
function upper(value: unknown) { return text(value).toUpperCase(); }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function time(value: unknown) { const ms = new Date(text(value)).getTime(); return Number.isFinite(ms) ? ms : 0; }
function boolean(value: unknown) { return value === true || text(value).toLowerCase() === "true"; }

function groupLatest(rows: any[], key: (row: any) => string) {
  const map = new Map<string, any[]>();
  for (const row of rows) {
    const id = key(row);
    if (!id) continue;
    const bucket = map.get(id) || [];
    bucket.push(row);
    map.set(id, bucket);
  }
  for (const bucket of map.values()) bucket.sort((a, b) => time(b.updated_at || b.created_at || b.sent_at) - time(a.updated_at || a.created_at || a.sent_at));
  return map;
}

function latestOpenWork(rows: any[]) {
  return rows
    .filter((row) => OPEN_WORK_STATUSES.has(upper(row.status)))
    .sort((a, b) => time(b.updated_at || b.created_at) - time(a.updated_at || a.created_at));
}

function resultFrom(code: PipelineHealthReasonCode) { return DEFINITIONS[code]; }

function workContactId(row: any, profileContactById: Map<string, string>) {
  const metadata = record(row?.metadata);
  return text(metadata.contact_id || metadata.contactId || profileContactById.get(text(metadata.buyer_profile_id)) || row?.source_id);
}

export function buildPipelineHealthSnapshot(input: PipelineHealthInput): PipelineHealthSnapshot {
  const now = input.now || new Date();
  const contacts = input.contacts || [];
  const profiles = input.buyerProfiles || [];
  const shortlists = input.shortlists || [];
  const presentations = input.presentations || [];
  const drafts = input.messageDrafts || [];
  const workItems = input.workItems || [];
  const receipts = input.sendReceipts || [];

  const profilesByContact = groupLatest(profiles, (row) => text(row.contact_id));
  const profileContactById = new Map<string, string>(
    profiles
      .map((row): [string, string] => [text(row.id), text(row.contact_id)])
      .filter(([id, contactId]) => Boolean(id && contactId)),
  );
  const shortlistsByProfile = groupLatest(shortlists.filter((row) => !row.archived_at), (row) => text(row.buyer_profile_id));
  const presentationsByProfile = groupLatest(presentations.filter((row) => !row.archived_at), (row) => text(row.buyer_profile_id));
  const draftsByPresentation = groupLatest(drafts, (row) => text(row.presentation_id));
  const receiptsByDraft = groupLatest(receipts, (row) => text(row.message_draft_id));
  const workByContact = groupLatest(workItems, (row) => workContactId(row, profileContactById));

  const leads: PipelineHealthLead[] = [];

  for (const contact of contacts) {
    const stage = upper(contact.pipeline_status || "NEW") || "NEW";
    if (TERMINAL_STAGES.has(stage)) continue;

    const contactId = text(contact.id);
    if (!contactId) continue;
    const brand = text(contact.brand_id || contact.brand) || "unknown";
    const contactProfiles = profilesByContact.get(contactId) || [];
    const profile = contactProfiles.find((row) => upper(row.status) === "APPROVED") || contactProfiles[0] || null;
    const profileStatus = profile ? upper(profile.status) : null;
    const profileId = profile ? text(profile.id) : null;
    const shortlist = profileId ? (shortlistsByProfile.get(profileId) || [])[0] || null : null;
    const presentation = profileId ? (presentationsByProfile.get(profileId) || [])[0] || null : null;
    const draft = presentation ? (draftsByPresentation.get(text(presentation.id)) || [])[0] || null : null;
    const receipt = draft ? (receiptsByDraft.get(text(draft.id)) || [])[0] || null : null;
    const openWork = latestOpenWork(workByContact.get(contactId) || []);
    const primaryWork = openWork[0] || null;
    const metadata = record(primaryWork?.metadata);
    const classification = text(metadata.classification || contact.last_reply_classification).toLowerCase();
    const hotLead = HOT_CLASSIFICATIONS.has(classification) || boolean(metadata.hot_lead) || upper(primaryWork?.priority) === "CRITICAL";
    const lastInboundMs = time(contact.last_inbound_reply_at);
    const sentAtMs = time(receipt?.sent_at || draft?.sent_at);
    const plannedWaitMs = time(contact.waiting_until);

    let definition: PipelineHealthDefinition;

    if (contact.do_not_contact || contact.email_suppressed) {
      definition = resultFrom("SUPPRESSED");
    } else if (stage === "ON_HOLD" && plannedWaitMs > now.getTime()) {
      definition = resultFrom("PLANNED_WAIT");
    } else if (classification === "unclear" || text(metadata.event_type) === "manual_review") {
      definition = resultFrom("UNCLEAR_REPLY_REVIEW");
    } else if (!profile && SALES_STAGES_REQUIRING_PROFILE.has(stage)) {
      definition = resultFrom("MISSING_BUYER_PROFILE");
    } else if (!profile && ["NEW", "CONTACT"].includes(stage)) {
      definition = resultFrom("NEEDS_QUALIFICATION");
    } else if (profile && (profileStatus !== "APPROVED" || boolean(metadata.buyer_profile_revision_required) || upper(metadata.buyer_profile_status) === "REVIEW_REQUIRED")) {
      definition = resultFrom("BUYER_PROFILE_REVIEW");
    } else if (!profile) {
      definition = resultFrom("DATA_QUALITY");
    } else if (receipt && upper(receipt.status) === "SENT") {
      definition = lastInboundMs > sentAtMs ? resultFrom("CUSTOMER_REPLY_NEEDS_ACTION") : resultFrom("SENT_WAITING_REPLY");
    } else if (!shortlist) {
      const matchPrepared = Boolean(metadata.property_match_prepared_at);
      const matchCount = Number(metadata.property_match_count ?? NaN);
      definition = matchPrepared && Number.isFinite(matchCount) && matchCount === 0 ? resultFrom("NO_MATCHES") : resultFrom("MATCHING_PENDING");
    } else if (!shortlist.approved_at && !["APPROVED", "CLIENT_READY"].includes(upper(shortlist.status))) {
      definition = resultFrom("SHORTLIST_REVIEW");
    } else if (!presentation) {
      definition = resultFrom("PRESENTATION_PENDING");
    } else if (!presentation.approved_at && !["APPROVED", "CLIENT_READY"].includes(upper(presentation.status))) {
      definition = resultFrom("PRESENTATION_REVIEW");
    } else if (!draft) {
      definition = resultFrom("MESSAGE_DRAFT_PENDING");
    } else if (draft.sent_at || upper(draft.status) === "SENT") {
      definition = lastInboundMs > time(draft.sent_at) ? resultFrom("CUSTOMER_REPLY_NEEDS_ACTION") : resultFrom("SENT_WAITING_REPLY");
    } else if (draft.cancelled_at) {
      definition = resultFrom("MESSAGE_DRAFT_PENDING");
    } else if (upper(draft.status) !== "APPROVED") {
      definition = resultFrom("MESSAGE_REVIEW");
    } else if (upper(metadata.send_preflight_status) === "BLOCKED" || (metadata.send_preflight_checked_at && metadata.send_preflight_ready === false)) {
      definition = resultFrom("PREFLIGHT_BLOCKED");
    } else if (boolean(metadata.send_preflight_ready) && boolean(metadata.property_recommendation_auto_send_authorized)) {
      definition = resultFrom("READY_TO_SEND");
    } else if (metadata.presentation_human_approved_at && metadata.presentation_human_approved_by) {
      definition = resultFrom("PREFLIGHT_PENDING");
    } else if (presentation.approved_at) {
      definition = resultFrom("PRESENTATION_REVIEW");
    } else {
      definition = resultFrom("ACTIVE_PIPELINE");
    }

    const href = profileId && ["MATCHING_PENDING", "NO_MATCHES", "SHORTLIST_REVIEW", "PRESENTATION_PENDING"].includes(definition.code)
      ? `/lead-intelligence?buyerProfileId=${encodeURIComponent(profileId)}&brand=${encodeURIComponent(brand)}`
      : `/customers?contactId=${encodeURIComponent(contactId)}`;

    leads.push({
      contactId,
      name: text(contact.name || contact.email) || "Ukjent kunde",
      email: text(contact.email) || null,
      brand,
      pipelineStage: stage,
      pipelineValue: Number(contact.pipeline_value || 0),
      reasonCode: definition.code,
      reasonLabel: definition.label,
      category: definition.category,
      owner: definition.owner,
      severity: definition.severity,
      explanation: definition.explanation,
      hotLead,
      profileId,
      profileStatus,
      shortlistId: shortlist ? text(shortlist.id) : null,
      presentationId: presentation ? text(presentation.id) : null,
      messageDraftId: draft ? text(draft.id) : null,
      lastInboundReplyAt: text(contact.last_inbound_reply_at) || null,
      href,
    });
  }

  const bottleneckCounts = new Map<PipelineHealthReasonCode, number>();
  const brandRows = new Map<string, { brand: string; activeLeads: number; blocked: number; humanReview: number; automationQueue: number; readyToSend: number }>();
  const stageCounts = new Map<string, number>();

  for (const lead of leads) {
    bottleneckCounts.set(lead.reasonCode, (bottleneckCounts.get(lead.reasonCode) || 0) + 1);
    stageCounts.set(lead.pipelineStage, (stageCounts.get(lead.pipelineStage) || 0) + 1);
    const brand = brandRows.get(lead.brand) || { brand: lead.brand, activeLeads: 0, blocked: 0, humanReview: 0, automationQueue: 0, readyToSend: 0 };
    brand.activeLeads += 1;
    if (lead.category === "BLOCKED") brand.blocked += 1;
    if (lead.category === "HUMAN_REVIEW") brand.humanReview += 1;
    if (lead.category === "AUTOMATION") brand.automationQueue += 1;
    if (lead.category === "READY") brand.readyToSend += 1;
    brandRows.set(lead.brand, brand);
  }

  const severityOrder: Record<PipelineHealthSeverity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, INFO: 1 };
  const bottlenecks = Array.from(bottleneckCounts.entries())
    .map(([code, count]) => ({ ...DEFINITIONS[code], count }))
    .sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity] || b.count - a.count || a.label.localeCompare(b.label));

  leads.sort((a, b) => Number(b.hotLead) - Number(a.hotLead) || severityOrder[b.severity] - severityOrder[a.severity] || b.pipelineValue - a.pipelineValue || a.name.localeCompare(b.name));

  return {
    generatedAt: now.toISOString(),
    version: 1,
    summary: {
      activeLeads: leads.length,
      blocked: leads.filter((lead) => lead.category === "BLOCKED").length,
      humanReview: leads.filter((lead) => lead.category === "HUMAN_REVIEW").length,
      automationQueue: leads.filter((lead) => lead.category === "AUTOMATION").length,
      waitingCustomer: leads.filter((lead) => lead.category === "WAITING").length,
      readyToSend: leads.filter((lead) => lead.category === "READY").length,
      hotLeads: leads.filter((lead) => lead.hotLead).length,
      dataQuality: leads.filter((lead) => lead.reasonCode === "DATA_QUALITY").length,
    },
    bottlenecks,
    byBrand: Array.from(brandRows.values()).sort((a, b) => b.activeLeads - a.activeLeads || a.brand.localeCompare(b.brand)),
    byPipelineStage: Array.from(stageCounts.entries()).map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage)),
    leads: leads.slice(0, 250),
    safety: { readOnly: true, customerSend: false, crmMutation: false, buyerProfileMutation: false },
  };
}

export function pipelineHealthDefinition(code: PipelineHealthReasonCode) { return DEFINITIONS[code]; }
