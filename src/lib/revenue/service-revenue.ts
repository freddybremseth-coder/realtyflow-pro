export type KeyholdingPlan = "BASIC" | "STANDARD" | "PREMIUM";
export type ServiceLifecycle =
  | "PROSPECT"
  | "OFFER_PLANNED"
  | "OFFERED"
  | "ACTIVE"
  | "RENEWAL_DUE"
  | "PAUSED"
  | "CANCELLED";
export type ServicePriority = "HIGH" | "MEDIUM" | "LOW";

export const KEYHOLDING_PLAN_MONTHLY_EUR: Record<KeyholdingPlan, number> = {
  BASIC: 55,
  STANDARD: 89,
  PREMIUM: 169,
};

export const KEYHOLDING_PLAN_LABELS: Record<KeyholdingPlan, string> = {
  BASIC: "Basic · Trygghet",
  STANDARD: "Standard · Komplett",
  PREMIUM: "Premium · Konsiérge",
};

export interface ServiceContactInput {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  pipeline_status?: string | null;
  brand_id?: string | null;
  brand?: string | null;
  pipeline_value?: number | null;
  sale_price?: number | null;
  property_interest?: string | null;
  location?: string | null;
  notes?: string | null;
  interactions?: unknown[] | null;
  won_at?: string | null;
  closed_at?: string | null;
  sale_date?: string | null;
  last_contact?: string | null;
  next_followup?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface ServiceRevenueAccount {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  sourceBrandId: string;
  propertyInterest: string | null;
  location: string | null;
  propertyValue: number;
  lifecycle: ServiceLifecycle;
  priority: ServicePriority;
  score: number;
  recommendedPlan: KeyholdingPlan;
  currentPlan: KeyholdingPlan | null;
  monthlyRevenue: number;
  annualRevenue: number;
  potentialMonthlyRevenue: number;
  potentialAnnualRevenue: number;
  offeredAt: string | null;
  startedAt: string | null;
  renewalAt: string | null;
  pausedAt: string | null;
  cancelledAt: string | null;
  lastServiceActivityAt: string | null;
  nextFollowupAt: string | null;
  overdue: boolean;
  renewalDue: boolean;
  issues: string[];
  recommendedAction: string;
  href: string;
}

export interface ServiceRevenueSummary {
  eligibleCustomers: number;
  prospects: number;
  offersOutstanding: number;
  activeContracts: number;
  renewalDue: number;
  pausedContracts: number;
  cancelledContracts: number;
  monthlyRecurringRevenue: number;
  annualRecurringRevenue: number;
  potentialMonthlyRevenue: number;
  potentialAnnualRevenue: number;
  overdueFollowups: number;
}

export interface ServiceRevenueWorkspace {
  generatedAt: string;
  summary: ServiceRevenueSummary;
  accounts: ServiceRevenueAccount[];
}

const WON_STATUSES = new Set([
  "WON",
  "VUNNET",
  "SOLGT",
  "SOLD",
  "CLOSED_WON",
  "CLOSED",
  "COMPLETED",
  "CUSTOMER",
  "KUNDE",
  "VIP",
]);

const SERVICE_ACTIONS = new Set([
  "keyholding_offer_planned",
  "keyholding_offer_made",
  "keyholding_contract_started",
  "keyholding_contract_renewed",
  "keyholding_contract_paused",
  "keyholding_contract_cancelled",
  "keyholding_followup_logged",
]);

interface InteractionRow {
  action: string;
  date: Date | null;
  metadata: Record<string, unknown>;
  raw: Record<string, unknown>;
}

function normalized(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(date: Date | null) {
  return date ? date.toISOString() : null;
}

function daysBetween(earlier: Date, later: Date) {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86_400_000));
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function interactionRows(interactions?: unknown[] | null): InteractionRow[] {
  return (interactions || [])
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((raw) => {
      const metadata = raw.metadata && typeof raw.metadata === "object"
        ? raw.metadata as Record<string, unknown>
        : {};
      const action = String(raw.action || metadata.action || "").trim();
      return {
        action,
        date: safeDate(raw.date || raw.created_at || metadata.date),
        metadata,
        raw,
      };
    })
    .filter((row) => SERVICE_ACTIONS.has(row.action))
    .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
}

function latest(rows: InteractionRow[], actions: string[]) {
  return rows.find((row) => actions.includes(row.action)) || null;
}

function parsePlan(value: unknown): KeyholdingPlan | null {
  const plan = normalized(String(value || ""));
  if (plan.includes("PREMIUM") || plan.includes("CONCIERGE") || plan.includes("KONSIERGE")) return "PREMIUM";
  if (plan.includes("STANDARD") || plan.includes("KOMPLETT")) return "STANDARD";
  if (plan.includes("BASIC") || plan.includes("TRYGGHET")) return "BASIC";
  return null;
}

function rowPlan(row: InteractionRow | null) {
  if (!row) return null;
  return parsePlan(
    row.metadata.plan
      || row.metadata.keyholding_plan
      || row.raw.plan
      || row.raw.content
      || row.raw.message,
  );
}

function recommendationText(contact: ServiceContactInput) {
  return [
    contact.property_interest,
    contact.location,
    contact.notes,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function recommendKeyholdingPlan(contact: ServiceContactInput): KeyholdingPlan {
  const text = recommendationText(contact);
  if (/utleie|rental|airbnb|stor villa|large villa|estate|finca|ukentlig|weekly/.test(text)) return "PREMIUM";
  if (/leilighet|apartment|studio|penthouse|bungalow/.test(text)) return "BASIC";
  return "STANDARD";
}

function sourceBrand(contact: ServiceContactInput) {
  return String(contact.brand_id || contact.brand || "zeneco").trim().toLowerCase() || "zeneco";
}

function hasServiceSignal(contact: ServiceContactInput, rows: InteractionRow[]) {
  return sourceBrand(contact) === "keyholding" || rows.length > 0;
}

function wonDate(contact: ServiceContactInput) {
  return safeDate(contact.won_at || contact.closed_at || contact.sale_date || contact.updated_at || contact.created_at);
}

export function buildServiceRevenueAccount(
  contact: ServiceContactInput,
  now = new Date(),
): ServiceRevenueAccount | null {
  const rows = interactionRows(contact.interactions);
  const isWonCustomer = WON_STATUSES.has(normalized(contact.pipeline_status));
  if (!isWonCustomer && !hasServiceSignal(contact, rows)) return null;

  const planned = latest(rows, ["keyholding_offer_planned"]);
  const offered = latest(rows, ["keyholding_offer_made"]);
  const started = latest(rows, ["keyholding_contract_started"]);
  const renewed = latest(rows, ["keyholding_contract_renewed"]);
  const paused = latest(rows, ["keyholding_contract_paused"]);
  const cancelled = latest(rows, ["keyholding_contract_cancelled"]);
  const latestLifecycle = latest(rows, [
    "keyholding_contract_cancelled",
    "keyholding_contract_paused",
    "keyholding_contract_renewed",
    "keyholding_contract_started",
    "keyholding_offer_made",
    "keyholding_offer_planned",
  ]);

  const recommendedPlan = recommendKeyholdingPlan(contact);
  const activeRow = renewed || started;
  const currentPlan = rowPlan(activeRow) || rowPlan(offered) || rowPlan(planned);
  const renewalDate = safeDate(
    activeRow?.metadata.renewal_at
      || activeRow?.metadata.renewal_date
      || activeRow?.raw.renewal_at,
  ) || (activeRow?.date
    ? new Date(activeRow.date.getTime() + 365 * 86_400_000)
    : null);

  let lifecycle: ServiceLifecycle = "PROSPECT";
  if (latestLifecycle?.action === "keyholding_offer_planned") lifecycle = "OFFER_PLANNED";
  if (latestLifecycle?.action === "keyholding_offer_made") lifecycle = "OFFERED";
  if (["keyholding_contract_started", "keyholding_contract_renewed"].includes(latestLifecycle?.action || "")) lifecycle = "ACTIVE";
  if (latestLifecycle?.action === "keyholding_contract_paused") lifecycle = "PAUSED";
  if (latestLifecycle?.action === "keyholding_contract_cancelled") lifecycle = "CANCELLED";

  const renewalDue = lifecycle === "ACTIVE"
    && Boolean(renewalDate)
    && renewalDate!.getTime() <= now.getTime() + 30 * 86_400_000;
  if (renewalDue) lifecycle = "RENEWAL_DUE";

  const nextFollowup = safeDate(contact.next_followup);
  const overdue = Boolean(nextFollowup && nextFollowup.getTime() < now.getTime());
  const propertyValue = numberValue(contact.pipeline_value) || numberValue(contact.sale_price);
  const selectedPlan = currentPlan || recommendedPlan;
  const activeRevenue = lifecycle === "ACTIVE" || lifecycle === "RENEWAL_DUE";
  const monthlyRevenue = activeRevenue ? KEYHOLDING_PLAN_MONTHLY_EUR[selectedPlan] : 0;
  const potentialMonthlyRevenue = lifecycle === "CANCELLED" ? 0 : KEYHOLDING_PLAN_MONTHLY_EUR[recommendedPlan];
  const wonAt = wonDate(contact);
  const daysSinceWon = wonAt ? daysBetween(wonAt, now) : 0;
  const missingContactChannel = !String(contact.email || "").trim() && !String(contact.phone || "").trim();

  let score = 20;
  if (lifecycle === "RENEWAL_DUE") score += 60;
  else if (lifecycle === "PAUSED") score += 40;
  else if (lifecycle === "OFFERED") score += 30;
  else if (lifecycle === "OFFER_PLANNED") score += 22;
  else if (lifecycle === "PROSPECT") score += 18;
  if (overdue) score += 20;
  if (!nextFollowup && ["PROSPECT", "OFFER_PLANNED", "OFFERED", "PAUSED"].includes(lifecycle)) score += 10;
  if (propertyValue >= 750_000) score += 10;
  else if (propertyValue >= 400_000) score += 6;
  if (daysSinceWon <= 60 && lifecycle === "PROSPECT") score += 10;
  if (missingContactChannel) score -= 25;
  if (lifecycle === "CANCELLED") score = 0;
  score = Math.max(0, Math.min(100, score));

  const priority: ServicePriority = score >= 70 ? "HIGH" : score >= 45 ? "MEDIUM" : "LOW";
  const issues: string[] = [];
  if (missingContactChannel) issues.push("Gyldig kontaktkanal mangler");
  if (overdue) issues.push("Intern oppfølging er forsinket");
  if (lifecycle === "RENEWAL_DUE") issues.push("Avtalen må fornyes innen 30 dager");
  if (lifecycle === "PAUSED") issues.push("Avtalen er satt på pause");
  if (lifecycle === "OFFERED" && !nextFollowup) issues.push("Tilbudet mangler ny oppfølgingsdato");

  let recommendedAction = `Vurder ${KEYHOLDING_PLAN_LABELS[recommendedPlan]} og planlegg en personlig behovssamtale.`;
  if (lifecycle === "OFFER_PLANNED") recommendedAction = "Forbered et konkret Keyholding-tilbud og registrer når det er presentert manuelt.";
  if (lifecycle === "OFFERED") recommendedAction = "Følg opp det manuelle tilbudet og registrer utfallet.";
  if (lifecycle === "ACTIVE") recommendedAction = "Følg leveransen og planlegg neste kontraktsgjennomgang.";
  if (lifecycle === "RENEWAL_DUE") recommendedAction = "Gjennomgå avtalen og registrer fornyelse før perioden utløper.";
  if (lifecycle === "PAUSED") recommendedAction = "Avklar om avtalen skal reaktiveres, endres eller avsluttes.";
  if (lifecycle === "CANCELLED") recommendedAction = "Behold historikken lukket. Ny aktivering krever et nytt eksplisitt kundesignal.";
  if (missingContactChannel) recommendedAction = "Finn en gyldig kontaktkanal før et Keyholding-tilbud vurderes.";

  return {
    id: contact.id,
    name: String(contact.name || contact.email || "Ukjent kunde"),
    email: contact.email || null,
    phone: contact.phone || null,
    sourceBrandId: sourceBrand(contact),
    propertyInterest: contact.property_interest || null,
    location: contact.location || null,
    propertyValue,
    lifecycle,
    priority,
    score,
    recommendedPlan,
    currentPlan: activeRevenue ? selectedPlan : currentPlan,
    monthlyRevenue,
    annualRevenue: monthlyRevenue * 12,
    potentialMonthlyRevenue,
    potentialAnnualRevenue: potentialMonthlyRevenue * 12,
    offeredAt: iso(offered?.date || null),
    startedAt: iso(started?.date || null),
    renewalAt: iso(renewalDate),
    pausedAt: iso(paused?.date || null),
    cancelledAt: iso(cancelled?.date || null),
    lastServiceActivityAt: iso(rows[0]?.date || null),
    nextFollowupAt: iso(nextFollowup),
    overdue,
    renewalDue,
    issues,
    recommendedAction,
    href: `/customers/${encodeURIComponent(contact.id)}`,
  };
}

const lifecycleRank: Record<ServiceLifecycle, number> = {
  RENEWAL_DUE: 0,
  PAUSED: 1,
  OFFERED: 2,
  OFFER_PLANNED: 3,
  PROSPECT: 4,
  ACTIVE: 5,
  CANCELLED: 6,
};

export function sortServiceRevenueAccounts(accounts: ServiceRevenueAccount[]) {
  return [...accounts].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (lifecycleRank[a.lifecycle] !== lifecycleRank[b.lifecycle]) return lifecycleRank[a.lifecycle] - lifecycleRank[b.lifecycle];
    if (a.score !== b.score) return b.score - a.score;
    if (a.potentialAnnualRevenue !== b.potentialAnnualRevenue) return b.potentialAnnualRevenue - a.potentialAnnualRevenue;
    return a.name.localeCompare(b.name, "nb");
  });
}

export function buildServiceRevenueWorkspace(
  contacts: ServiceContactInput[],
  now = new Date(),
): ServiceRevenueWorkspace {
  const accounts = sortServiceRevenueAccounts(
    contacts
      .map((contact) => buildServiceRevenueAccount(contact, now))
      .filter(Boolean) as ServiceRevenueAccount[],
  );

  const summary: ServiceRevenueSummary = {
    eligibleCustomers: accounts.length,
    prospects: accounts.filter((item) => ["PROSPECT", "OFFER_PLANNED"].includes(item.lifecycle)).length,
    offersOutstanding: accounts.filter((item) => item.lifecycle === "OFFERED").length,
    activeContracts: accounts.filter((item) => ["ACTIVE", "RENEWAL_DUE"].includes(item.lifecycle)).length,
    renewalDue: accounts.filter((item) => item.lifecycle === "RENEWAL_DUE").length,
    pausedContracts: accounts.filter((item) => item.lifecycle === "PAUSED").length,
    cancelledContracts: accounts.filter((item) => item.lifecycle === "CANCELLED").length,
    monthlyRecurringRevenue: accounts.reduce((sum, item) => sum + item.monthlyRevenue, 0),
    annualRecurringRevenue: accounts.reduce((sum, item) => sum + item.annualRevenue, 0),
    potentialMonthlyRevenue: accounts
      .filter((item) => !["ACTIVE", "RENEWAL_DUE", "CANCELLED"].includes(item.lifecycle))
      .reduce((sum, item) => sum + item.potentialMonthlyRevenue, 0),
    potentialAnnualRevenue: accounts
      .filter((item) => !["ACTIVE", "RENEWAL_DUE", "CANCELLED"].includes(item.lifecycle))
      .reduce((sum, item) => sum + item.potentialAnnualRevenue, 0),
    overdueFollowups: accounts.filter((item) => item.overdue).length,
  };

  return {
    generatedAt: now.toISOString(),
    summary,
    accounts,
  };
}
