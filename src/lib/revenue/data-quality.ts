import { extractAttribution, type AttributionContactInput } from "@/lib/revenue/attribution";
import { normalizeForecastStage, type ForecastStage } from "@/lib/revenue/forecast";

export const REVENUE_DATA_BRANDS = ["zeneco", "soleada", "pinosoecolife", "keyholding"] as const;
export type RevenueDataBrand = (typeof REVENUE_DATA_BRANDS)[number];
export type QualitySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type QualityCategory =
  | "DUPLICATE"
  | "BRAND"
  | "SOURCE"
  | "FOLLOWUP"
  | "VALUE"
  | "COMMISSION"
  | "STATUS"
  | "CONTACT"
  | "KEYHOLDING";
export type QualityAction =
  | "NORMALIZE_STATUS"
  | "APPLY_DETECTED_SOURCE"
  | "SET_BRAND"
  | "SCHEDULE_FOLLOWUP"
  | "MARK_DUPLICATE_REVIEWED";
export type ReadinessStatus = "READY" | "WARNING" | "BLOCKED";

export interface RevenueQualityContactInput extends AttributionContactInput {
  phone?: string | null;
  next_followup?: string | null;
  last_contact?: string | null;
  won_at?: string | null;
  closed_at?: string | null;
  sale_date?: string | null;
  property_interest?: string | null;
  location?: string | null;
}

export interface ProductionProbe {
  id: string;
  label: string;
  required: boolean;
  configured?: boolean;
  ok: boolean;
  count?: number | null;
  latencyMs?: number | null;
  detail?: string | null;
}

export interface ProductionReadinessInput {
  environment: {
    supabaseUrl: boolean;
    serviceRole: boolean;
    sessionSecret: boolean;
    adminEmails: boolean;
    vercelEnv?: string | null;
    deploymentUrl?: string | null;
    commitSha?: string | null;
  };
  probes: ProductionProbe[];
}

export interface ProductionReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  required: boolean;
  count?: number | null;
  latencyMs?: number | null;
}

export interface ProductionReadiness {
  status: ReadinessStatus;
  score: number;
  environment: ProductionReadinessInput["environment"];
  checks: ProductionReadinessCheck[];
  blockers: string[];
  warnings: string[];
}

export interface RevenueDataIssue {
  id: string;
  category: QualityCategory;
  severity: QualitySeverity;
  title: string;
  description: string;
  recommendation: string;
  contactIds: string[];
  primaryContactId: string;
  contactName: string;
  brandId: string | null;
  field: string | null;
  currentValue: string | null;
  suggestedValue: string | null;
  actions: QualityAction[];
  href: string;
}

export interface RevenueDataHealthReport {
  generatedAt: string;
  status: ReadinessStatus;
  score: number;
  readiness: ProductionReadiness;
  summary: {
    contacts: number;
    activeDeals: number;
    wonDeals: number;
    issues: number;
    critical: number;
    high: number;
    duplicateGroups: number;
    contactsInDuplicateGroups: number;
    knownBrandPercent: number;
    knownSourcePercent: number;
    activeFollowupCoveragePercent: number;
    wonCommissionCoveragePercent: number;
    wonValueCoveragePercent: number;
  };
  issues: RevenueDataIssue[];
  categoryCounts: Record<QualityCategory, number>;
}

const CANONICAL_STATUSES = new Set(["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION", "ON_HOLD", "WON", "LOST"]);
const ACTIVE_STAGES = new Set<ForecastStage>(["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION", "ON_HOLD"]);
const ADVANCED_STAGES = new Set<ForecastStage>(["QUALIFIED", "VIEWING", "NEGOTIATION"]);
const SEVERITY_WEIGHT: Record<QualitySeverity, number> = { CRITICAL: 12, HIGH: 7, MEDIUM: 4, LOW: 2 };
const SEVERITY_RANK: Record<QualitySeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const BRAND_ALIASES: Record<string, RevenueDataBrand> = {
  zeneco: "zeneco",
  zenecohomes: "zeneco",
  zenecohome: "zeneco",
  soleada: "soleada",
  soleadano: "soleada",
  pinoso: "pinosoecolife",
  pinosoecolife: "pinosoecolife",
  keyholding: "keyholding",
  keyholdingcostablanca: "keyholding",
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function token(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "");
}

function statusToken(value: unknown) {
  return clean(value)
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Æ/g, "AE")
    .replace(/Ø/g, "O")
    .replace(/Å/g, "A")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  const digits = clean(value).replace(/[^0-9]/g, "");
  if (digits.length < 7) return "";
  return digits.length > 9 ? digits.slice(-9) : digits;
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 100;
}

function nameFor(contact: RevenueQualityContactInput) {
  return clean(contact.name || contact.email || contact.phone) || "Ukjent kontakt";
}

export function canonicalRevenueBrand(value: unknown): RevenueDataBrand | null {
  return BRAND_ALIASES[token(value)] || null;
}

export function canonicalPipelineStatus(value: unknown): ForecastStage {
  return normalizeForecastStage(value);
}

export function isLegacyPipelineStatus(value: unknown) {
  const raw = statusToken(value);
  if (!raw) return false;
  return !CANONICAL_STATUSES.has(raw) || raw !== canonicalPipelineStatus(value);
}

function confirmedCommission(contact: RevenueQualityContactInput) {
  const explicit = Math.max(0, numberValue(contact.commission_amount));
  if (explicit > 0) return explicit;
  const rate = numberValue(contact.commission_percent);
  const value = Math.max(0, numberValue(contact.pipeline_value) || numberValue(contact.sale_price));
  return rate > 0 && rate <= 100 && value > 0 ? value * (rate / 100) : 0;
}

function interactionRows(contact: RevenueQualityContactInput) {
  return (Array.isArray(contact.interactions) ? contact.interactions : [])
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"));
}

function hasDuplicateReviewed(contact: RevenueQualityContactInput, groupKey: string) {
  return interactionRows(contact).some((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    return String(row.action || metadata.action || "") === "data_quality_duplicate_reviewed"
      && String(metadata.group_key || "") === groupKey;
  });
}

function keyholdingDataIssue(contact: RevenueQualityContactInput): RevenueDataIssue | null {
  const rows = interactionRows(contact);
  const lifecycleRows = rows
    .map((row) => {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
      return {
        action: String(row.action || metadata.action || ""),
        metadata,
        date: safeDate(row.date || row.created_at || metadata.date),
      };
    })
    .filter((row) => ["keyholding_contract_started", "keyholding_contract_renewed"].includes(row.action))
    .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  const latest = lifecycleRows[0];
  if (!latest) return null;
  const plan = clean(latest.metadata.plan || latest.metadata.keyholding_plan);
  const renewal = safeDate(latest.metadata.renewal_at || latest.metadata.renewal_date);
  if (plan && renewal) return null;
  const missing = [!plan ? "plan" : "", !renewal ? "fornyelsesdato" : ""].filter(Boolean).join(" og ");
  return {
    id: `keyholding:${contact.id}`,
    category: "KEYHOLDING",
    severity: "HIGH",
    title: `Aktiv Keyholding-avtale mangler ${missing}`,
    description: "Avtalen er registrert startet eller fornyet, men abonnementsgrunnlaget er ikke komplett.",
    recommendation: "Åpne Keyholding Revenue og registrer korrekt plan og kontrakts-/fornyelsesdato.",
    contactIds: [contact.id],
    primaryContactId: contact.id,
    contactName: nameFor(contact),
    brandId: canonicalRevenueBrand(contact.brand_id || contact.brand),
    field: "interactions",
    currentValue: null,
    suggestedValue: null,
    actions: [],
    href: "/service-revenue",
  };
}

function issue(params: Omit<RevenueDataIssue, "href"> & { href?: string }): RevenueDataIssue {
  return { ...params, href: params.href || `/customers/${encodeURIComponent(params.primaryContactId)}` };
}

function duplicateIssues(contacts: RevenueQualityContactInput[]) {
  const evidence = new Map<string, { ids: Set<string>; labels: Set<string> }>();
  const contactMap = new Map(contacts.map((contact) => [contact.id, contact]));
  const add = (kind: string, value: string, contactId: string) => {
    if (!value) return;
    const key = `${kind}:${value}`;
    const row = evidence.get(key) || { ids: new Set<string>(), labels: new Set<string>() };
    row.ids.add(contactId);
    row.labels.add(kind === "email" ? `e-post ${value}` : `telefon ${value}`);
    evidence.set(key, row);
  };
  for (const contact of contacts) {
    add("email", normalizeEmail(contact.email), contact.id);
    add("phone", normalizePhone(contact.phone), contact.id);
  }
  const groups = new Map<string, { ids: string[]; labels: Set<string> }>();
  for (const row of evidence.values()) {
    if (row.ids.size < 2) continue;
    const ids = [...row.ids].sort();
    const key = ids.join("|");
    const group = groups.get(key) || { ids, labels: new Set<string>() };
    row.labels.forEach((label) => group.labels.add(label));
    groups.set(key, group);
  }
  const result: RevenueDataIssue[] = [];
  for (const [groupKey, group] of groups) {
    const primary = contactMap.get(group.ids[0]);
    if (!primary) continue;
    if (group.ids.every((id) => hasDuplicateReviewed(contactMap.get(id)!, groupKey))) continue;
    result.push(issue({
      id: `duplicate:${groupKey}`,
      category: "DUPLICATE",
      severity: "CRITICAL",
      title: `${group.ids.length} mulige duplikater`,
      description: `Samme ${[...group.labels].join(" og ")} finnes på flere kontakter. Ingen poster blir slått sammen automatisk.`,
      recommendation: "Sammenlign Customer 360-postene, velg hvilken som skal beholdes og marker gruppen som gjennomgått.",
      contactIds: group.ids,
      primaryContactId: primary.id,
      contactName: nameFor(primary),
      brandId: canonicalRevenueBrand(primary.brand_id || primary.brand),
      field: null,
      currentValue: [...group.labels].join(" · "),
      suggestedValue: null,
      actions: ["MARK_DUPLICATE_REVIEWED"],
    }));
  }
  return result;
}

export function buildProductionReadiness(input: ProductionReadinessInput): ProductionReadiness {
  const checks: ProductionReadinessCheck[] = [
    {
      id: "supabase-url",
      label: "Supabase URL",
      status: input.environment.supabaseUrl ? "READY" : "BLOCKED",
      detail: input.environment.supabaseUrl ? "Servermiljøet har Supabase URL." : "NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_URL mangler.",
      required: true,
    },
    {
      id: "service-role",
      label: "Supabase service role",
      status: input.environment.serviceRole ? "READY" : "BLOCKED",
      detail: input.environment.serviceRole ? "Server-side datatilgang er konfigurert." : "SUPABASE_SERVICE_ROLE_KEY mangler.",
      required: true,
    },
    {
      id: "session-secret",
      label: "Admin session secret",
      status: input.environment.sessionSecret ? "READY" : "WARNING",
      detail: input.environment.sessionSecret ? "Egen sessionsignering er konfigurert." : "REALTYFLOW_SESSION_SECRET mangler; service-role-nøkkelen brukes som fallback.",
      required: false,
    },
    {
      id: "admin-emails",
      label: "Admin allowlist",
      status: input.environment.adminEmails ? "READY" : "WARNING",
      detail: input.environment.adminEmails ? "REALTYFLOW_ADMIN_EMAILS er eksplisitt konfigurert." : "Standard adminadresse brukes. Sett REALTYFLOW_ADMIN_EMAILS i produksjon.",
      required: false,
    },
    ...input.probes.map((probe) => ({
      id: probe.id,
      label: probe.label,
      status: probe.ok ? "READY" as const : probe.required ? "BLOCKED" as const : "WARNING" as const,
      detail: probe.detail || (probe.ok ? "Kilden svarte korrekt." : "Kilden svarte ikke korrekt."),
      required: probe.required,
      count: probe.count,
      latencyMs: probe.latencyMs,
    })),
  ];
  const blockers = checks.filter((check) => check.status === "BLOCKED").map((check) => check.label);
  const warnings = checks.filter((check) => check.status === "WARNING").map((check) => check.label);
  const penalty = checks.reduce((sum, check) => sum + (check.status === "BLOCKED" ? 18 : check.status === "WARNING" ? 6 : 0), 0);
  const score = Math.max(0, 100 - penalty);
  return {
    status: blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "WARNING" : "READY",
    score,
    environment: input.environment,
    checks,
    blockers,
    warnings,
  };
}

export function buildRevenueDataHealth(params: {
  contacts: RevenueQualityContactInput[];
  readiness: ProductionReadiness;
  now?: Date;
}): RevenueDataHealthReport {
  const now = params.now || new Date();
  const contacts = params.contacts.filter((contact) => Boolean(contact?.id));
  const issues: RevenueDataIssue[] = duplicateIssues(contacts);
  let activeDeals = 0;
  let wonDeals = 0;
  let knownBrands = 0;
  let knownSources = 0;
  let activeWithFollowup = 0;
  let wonWithCommission = 0;
  let wonWithValue = 0;

  for (const contact of contacts) {
    const rawStatus = contact.pipeline_status || contact.status || contact.stage;
    const stage = canonicalPipelineStatus(rawStatus);
    const active = ACTIVE_STAGES.has(stage);
    const won = stage === "WON";
    if (active) activeDeals += 1;
    if (won) wonDeals += 1;

    const brand = canonicalRevenueBrand(contact.brand_id || contact.brand);
    if (brand) knownBrands += 1;
    else {
      issues.push(issue({
        id: `brand:${contact.id}`,
        category: "BRAND",
        severity: "HIGH",
        title: "Brand mangler eller er ukjent",
        description: `Registrert brand er ${clean(contact.brand_id || contact.brand) || "tomt"}.`,
        recommendation: "Velg korrekt revenue-brand manuelt. Systemet gjetter ikke brand.",
        contactIds: [contact.id],
        primaryContactId: contact.id,
        contactName: nameFor(contact),
        brandId: null,
        field: "brand_id",
        currentValue: clean(contact.brand_id || contact.brand) || null,
        suggestedValue: null,
        actions: ["SET_BRAND"],
      }));
    }

    const attribution = extractAttribution(contact);
    if (attribution.sourceId !== "unknown") knownSources += 1;
    if (attribution.sourceId === "unknown") {
      issues.push(issue({
        id: `source:${contact.id}`,
        category: "SOURCE",
        severity: won ? "HIGH" : "MEDIUM",
        title: "Lead-kilde mangler",
        description: "Ingen strukturert eller dokumentert førstegangskilde ble funnet.",
        recommendation: "Registrer faktisk kilde manuelt etter kontroll av kundehistorikken.",
        contactIds: [contact.id],
        primaryContactId: contact.id,
        contactName: nameFor(contact),
        brandId: brand,
        field: "source",
        currentValue: clean(contact.source) || null,
        suggestedValue: null,
        actions: [],
        href: `/customers/${encodeURIComponent(contact.id)}`,
      }));
    } else if (!clean(contact.source) && attribution.rawSource) {
      issues.push(issue({
        id: `source-structure:${contact.id}`,
        category: "SOURCE",
        severity: "LOW",
        title: "Dokumentert kilde finnes bare i historikken",
        description: `${attribution.sourceLabel} ble funnet via ${attribution.evidence.toLowerCase()}, men kontaktens source-felt er tomt.`,
        recommendation: "Kontroller beviset og bruk den dokumenterte råkilden som strukturert source.",
        contactIds: [contact.id],
        primaryContactId: contact.id,
        contactName: nameFor(contact),
        brandId: brand,
        field: "source",
        currentValue: null,
        suggestedValue: attribution.rawSource,
        actions: ["APPLY_DETECTED_SOURCE"],
      }));
    }

    if (isLegacyPipelineStatus(rawStatus)) {
      issues.push(issue({
        id: `status:${contact.id}`,
        category: "STATUS",
        severity: "MEDIUM",
        title: "Eldre eller inkonsistent pipeline-status",
        description: `${clean(rawStatus) || "Tom status"} normaliseres i analyser til ${stage}, men er ikke lagret kanonisk.`,
        recommendation: `Lagre statusen som ${stage} etter manuell kontroll.`,
        contactIds: [contact.id],
        primaryContactId: contact.id,
        contactName: nameFor(contact),
        brandId: brand,
        field: "pipeline_status",
        currentValue: clean(rawStatus) || null,
        suggestedValue: stage,
        actions: ["NORMALIZE_STATUS"],
      }));
    }

    const nextFollowup = safeDate(contact.next_followup);
    if (active && nextFollowup) activeWithFollowup += 1;
    if (active && !nextFollowup) {
      issues.push(issue({
        id: `followup:${contact.id}`,
        category: "FOLLOWUP",
        severity: stage === "NEGOTIATION" ? "CRITICAL" : ADVANCED_STAGES.has(stage) ? "HIGH" : "MEDIUM",
        title: "Aktiv sak mangler neste oppfølging",
        description: `Saken står i ${stage}, men har ingen konkret neste dato.`,
        recommendation: "Sett en intern oppfølgingsdato. Ingen melding sendes automatisk.",
        contactIds: [contact.id],
        primaryContactId: contact.id,
        contactName: nameFor(contact),
        brandId: brand,
        field: "next_followup",
        currentValue: null,
        suggestedValue: null,
        actions: ["SCHEDULE_FOLLOWUP"],
      }));
    } else if (active && nextFollowup && nextFollowup.getTime() < now.getTime()) {
      issues.push(issue({
        id: `overdue:${contact.id}`,
        category: "FOLLOWUP",
        severity: stage === "NEGOTIATION" ? "CRITICAL" : "HIGH",
        title: "Oppfølging er forfalt",
        description: `Neste oppfølging var ${nextFollowup.toISOString().slice(0, 10)}.`,
        recommendation: "Gjennomfør den manuelle oppfølgingen og sett en ny konkret dato.",
        contactIds: [contact.id],
        primaryContactId: contact.id,
        contactName: nameFor(contact),
        brandId: brand,
        field: "next_followup",
        currentValue: nextFollowup.toISOString(),
        suggestedValue: null,
        actions: ["SCHEDULE_FOLLOWUP"],
        href: "/today",
      }));
    }

    const dealValue = Math.max(0, numberValue(contact.pipeline_value) || numberValue(contact.sale_price));
    if (won && dealValue > 0) wonWithValue += 1;
    if ((won || ADVANCED_STAGES.has(stage)) && dealValue <= 0) {
      issues.push(issue({
        id: `value:${contact.id}`,
        category: "VALUE",
        severity: won ? "CRITICAL" : "HIGH",
        title: won ? "Vunnet salg mangler salgsverdi" : "Avansert sak mangler boligverdi",
        description: "Pipeline- og salgsverdien er tom eller null.",
        recommendation: won ? "Registrer faktisk salgsverdi før økonomirapportering." : "Registrer en realistisk boligverdi for prognose og prioritering.",
        contactIds: [contact.id],
        primaryContactId: contact.id,
        contactName: nameFor(contact),
        brandId: brand,
        field: "pipeline_value",
        currentValue: null,
        suggestedValue: null,
        actions: [],
        href: won ? "/commissions" : `/customers/${encodeURIComponent(contact.id)}`,
      }));
    }

    const commission = confirmedCommission(contact);
    if (won && commission > 0) wonWithCommission += 1;
    if (won && commission <= 0) {
      issues.push(issue({
        id: `commission:${contact.id}`,
        category: "COMMISSION",
        severity: "CRITICAL",
        title: "Vunnet salg mangler bekreftet provisjon",
        description: "Verken faktisk provisjonsbeløp eller gyldig provisjonssats med salgsverdi er registrert.",
        recommendation: "Registrer avtalt provisjonsgrunnlag i Commission & Cash. 3 %-reserven brukes ikke som bekreftet inntekt.",
        contactIds: [contact.id],
        primaryContactId: contact.id,
        contactName: nameFor(contact),
        brandId: brand,
        field: "commission_amount",
        currentValue: null,
        suggestedValue: null,
        actions: [],
        href: "/commissions",
      }));
    }

    if (!normalizeEmail(contact.email) && !normalizePhone(contact.phone)) {
      issues.push(issue({
        id: `contact:${contact.id}`,
        category: "CONTACT",
        severity: active || won ? "HIGH" : "MEDIUM",
        title: "Gyldig kontaktkanal mangler",
        description: "Kontakten har verken brukbar e-post eller telefon.",
        recommendation: "Finn og registrer en verifisert kontaktkanal før videre oppfølging.",
        contactIds: [contact.id],
        primaryContactId: contact.id,
        contactName: nameFor(contact),
        brandId: brand,
        field: null,
        currentValue: null,
        suggestedValue: null,
        actions: [],
      }));
    }

    const keyholding = keyholdingDataIssue(contact);
    if (keyholding) issues.push(keyholding);
  }

  issues.sort((a, b) => {
    const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severity) return severity;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.contactName.localeCompare(b.contactName, "nb");
  });

  const categoryCounts = {
    DUPLICATE: 0,
    BRAND: 0,
    SOURCE: 0,
    FOLLOWUP: 0,
    VALUE: 0,
    COMMISSION: 0,
    STATUS: 0,
    CONTACT: 0,
    KEYHOLDING: 0,
  } satisfies Record<QualityCategory, number>;
  issues.forEach((item) => { categoryCounts[item.category] += 1; });
  const issuePenalty = issues.reduce((sum, item) => sum + SEVERITY_WEIGHT[item.severity], 0);
  const dataScore = Math.max(0, Math.round(100 - issuePenalty / Math.max(1, contacts.length) * 2.2));
  const score = Math.round(dataScore * 0.7 + params.readiness.score * 0.3);
  const critical = issues.filter((item) => item.severity === "CRITICAL").length;
  const high = issues.filter((item) => item.severity === "HIGH").length;
  const duplicateGroups = issues.filter((item) => item.category === "DUPLICATE");
  const duplicateContacts = new Set(duplicateGroups.flatMap((item) => item.contactIds));

  return {
    generatedAt: now.toISOString(),
    status: params.readiness.status === "BLOCKED" || critical > 0 ? "BLOCKED" : params.readiness.status === "WARNING" || high > 0 ? "WARNING" : "READY",
    score,
    readiness: params.readiness,
    summary: {
      contacts: contacts.length,
      activeDeals,
      wonDeals,
      issues: issues.length,
      critical,
      high,
      duplicateGroups: duplicateGroups.length,
      contactsInDuplicateGroups: duplicateContacts.size,
      knownBrandPercent: percent(knownBrands, contacts.length),
      knownSourcePercent: percent(knownSources, contacts.length),
      activeFollowupCoveragePercent: percent(activeWithFollowup, activeDeals),
      wonCommissionCoveragePercent: percent(wonWithCommission, wonDeals),
      wonValueCoveragePercent: percent(wonWithValue, wonDeals),
    },
    issues,
    categoryCounts,
  };
}
