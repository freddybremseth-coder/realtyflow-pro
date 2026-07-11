export type AfterSalesActionId =
  | "welcome_checkin"
  | "care_offer"
  | "review_request"
  | "referral_request"
  | "annual_review"
  | "welcome_gift";

export type AfterSalesPriority = "HIGH" | "MEDIUM" | "LOW";
export type AfterSalesPhase = "ONBOARDING" | "RELATIONSHIP" | "LONG_TERM";

export interface AfterSalesContactInput {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  pipeline_status?: string | null;
  pipeline_value?: number | null;
  sale_price?: number | null;
  property_interest?: string | null;
  notes?: string | null;
  interactions?: unknown[] | null;
  brand_id?: string | null;
  brand?: string | null;
  last_contact?: string | null;
  next_followup?: string | null;
  won_at?: string | null;
  closed_at?: string | null;
  sale_date?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface AfterSalesOpportunity {
  id: AfterSalesActionId;
  label: string;
  description: string;
  targetBrandId: string;
  dueAfterDays: number;
  due: boolean;
  completed: boolean;
}

export interface AfterSalesCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  brandId: string;
  value: number;
  propertyInterest: string | null;
  phase: AfterSalesPhase;
  priority: AfterSalesPriority;
  score: number;
  wonAt: string;
  daysSinceWon: number;
  lastContactAt: string | null;
  nextFollowupAt: string | null;
  isOverdue: boolean;
  recommendedAction: string;
  opportunities: AfterSalesOpportunity[];
  dueActions: AfterSalesActionId[];
  completedActions: AfterSalesActionId[];
  href: string;
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

const ACTION_IDS: AfterSalesActionId[] = [
  "welcome_checkin",
  "care_offer",
  "review_request",
  "referral_request",
  "annual_review",
  "welcome_gift",
];

function normalizedStatus(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(earlier: Date, later: Date) {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86_400_000));
}

function interactionAction(item: unknown): AfterSalesActionId | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
  const candidates = [row.action, metadata.action, row.after_sales_action, metadata.after_sales_action];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim() as AfterSalesActionId;
    if (ACTION_IDS.includes(value)) return value;
  }

  const text = String(row.content || row.body || row.message || "").toLowerCase();
  if (/overtakelsesoppfølging|welcome check-in|welcome checkin/.test(text)) return "welcome_checkin";
  if (/nøkkelhold|boligtilsyn|eiendomstilsyn|property care/.test(text)) return "care_offer";
  if (/omtale forespurt|review requested|testimonial requested/.test(text)) return "review_request";
  if (/anbefaling forespurt|referral requested/.test(text)) return "referral_request";
  if (/årsoppfølging|annual review/.test(text)) return "annual_review";
  if (/velkomstgave|welcome gift/.test(text)) return "welcome_gift";
  return null;
}

function completedActionSet(interactions?: unknown[] | null) {
  const completed = new Set<AfterSalesActionId>();
  for (const item of interactions || []) {
    const action = interactionAction(item);
    if (action) completed.add(action);
  }
  return completed;
}

function interactionLifecycleAnchor(interactions?: unknown[] | null) {
  for (const item of interactions || []) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    const value = String(metadata.lifecycle_anchor || metadata.won_at || row.lifecycle_anchor || "").trim();
    const date = safeDate(value);
    if (date) return date;
  }
  return null;
}

function phaseFor(daysSinceWon: number): AfterSalesPhase {
  if (daysSinceWon <= 30) return "ONBOARDING";
  if (daysSinceWon <= 180) return "RELATIONSHIP";
  return "LONG_TERM";
}

function opportunityCatalog(brandId: string, daysSinceWon: number, completed: Set<AfterSalesActionId>): AfterSalesOpportunity[] {
  const careLabel = brandId === "pinosoecolife"
    ? "Tilby eiendoms- og tomtetilsyn"
    : "Tilby nøkkelhold og boligtilsyn";
  const careDescription = brandId === "pinosoecolife"
    ? "Avklar behov for tilsyn, vedlikehold, tomtekontroll og praktisk hjelp etter overtakelsen."
    : "Avklar om kunden trenger nøkkelhold, inspeksjoner, håndverkeroppfølging eller annen boligservice.";

  const definitions: Array<Omit<AfterSalesOpportunity, "due" | "completed">> = [
    {
      id: "welcome_checkin",
      label: "Følg opp etter overtakelsen",
      description: "Kontroller at kunden har kommet godt på plass og fang opp praktiske eller juridiske spørsmål tidlig.",
      targetBrandId: brandId,
      dueAfterDays: 3,
    },
    {
      id: "welcome_gift",
      label: "Vurder Dona Anna velkomstgave",
      description: "Vurder en personlig takk eller gavepakke som styrker relasjonen uten automatisk utsending.",
      targetBrandId: "donaanna",
      dueAfterDays: 7,
    },
    {
      id: "care_offer",
      label: careLabel,
      description: careDescription,
      targetBrandId: brandId === "pinosoecolife" ? "pinosoecolife" : "zeneco",
      dueAfterDays: 14,
    },
    {
      id: "review_request",
      label: "Be om omtale eller testimonial",
      description: "Be personlig om en ærlig omtale når kunden har fått erfaring med kjøpsprosessen og boligen.",
      targetBrandId: brandId,
      dueAfterDays: 21,
    },
    {
      id: "referral_request",
      label: "Be om anbefaling til venner eller familie",
      description: "Ta en personlig anbefalingssamtale etter at kunden er trygg og fornøyd med leveransen.",
      targetBrandId: brandId,
      dueAfterDays: 45,
    },
    {
      id: "annual_review",
      label: "Planlegg årlig bolig- og behovsgjennomgang",
      description: "Følg opp verdi, vedlikehold, utleie, videresalg og nye behov minst én gang i året.",
      targetBrandId: brandId,
      dueAfterDays: 300,
    },
  ];

  return definitions.map((item) => ({
    ...item,
    due: daysSinceWon >= item.dueAfterDays,
    completed: completed.has(item.id),
  }));
}

export function buildAfterSalesCustomer(contact: AfterSalesContactInput, now = new Date()): AfterSalesCustomer | null {
  if (!WON_STATUSES.has(normalizedStatus(contact.pipeline_status))) return null;

  const wonDate = safeDate(contact.won_at || contact.closed_at || contact.sale_date)
    || interactionLifecycleAnchor(contact.interactions)
    || safeDate(contact.updated_at || contact.created_at);
  if (!wonDate) return null;

  const brandId = String(contact.brand_id || contact.brand || "zeneco").trim().toLowerCase();
  const daysSinceWon = daysBetween(wonDate, now);
  const completed = completedActionSet(contact.interactions);
  const opportunities = opportunityCatalog(brandId, daysSinceWon, completed);
  const dueActions = opportunities.filter((item) => item.due && !item.completed).map((item) => item.id);
  const lastContact = safeDate(contact.last_contact);
  const nextFollowup = safeDate(contact.next_followup);
  const isOverdue = Boolean(nextFollowup && nextFollowup.getTime() < now.getTime());
  const staleDays = lastContact ? daysBetween(lastContact, now) : daysSinceWon;
  const value = Number(contact.pipeline_value || contact.sale_price || 0);

  let score = 20;
  score += Math.min(35, dueActions.length * 9);
  if (isOverdue) score += 24;
  if (!nextFollowup) score += 8;
  if (staleDays >= 180) score += 20;
  else if (staleDays >= 90) score += 15;
  else if (staleDays >= 30) score += 10;
  if (value >= 750_000) score += 12;
  else if (value >= 500_000) score += 8;
  else if (value >= 250_000) score += 5;
  if (!contact.email && !contact.phone) score += 8;
  score = Math.max(0, Math.min(100, score));

  const priority: AfterSalesPriority = score >= 70 ? "HIGH" : score >= 45 ? "MEDIUM" : "LOW";
  const firstDue = opportunities.find((item) => item.due && !item.completed);
  const nextUpcoming = opportunities.find((item) => !item.due && !item.completed);
  let recommendedAction = firstDue?.label || nextUpcoming?.label || "Hold relasjonen varm med en personlig årlig oppfølging.";
  if (isOverdue) recommendedAction = `Oppfølgingen er forsinket. ${recommendedAction}`;
  if (!contact.email && !contact.phone) recommendedAction = "Finn en gyldig kontaktkanal før videre kundeoppfølging.";

  return {
    id: contact.id,
    name: String(contact.name || contact.email || "Ukjent kunde"),
    email: contact.email || null,
    phone: contact.phone || null,
    brandId,
    value,
    propertyInterest: contact.property_interest || null,
    phase: phaseFor(daysSinceWon),
    priority,
    score,
    wonAt: wonDate.toISOString(),
    daysSinceWon,
    lastContactAt: lastContact?.toISOString() || null,
    nextFollowupAt: nextFollowup?.toISOString() || null,
    isOverdue,
    recommendedAction,
    opportunities,
    dueActions,
    completedActions: [...completed],
    href: `/customers/${encodeURIComponent(contact.id)}`,
  };
}

export function sortAfterSalesCustomers(customers: AfterSalesCustomer[]) {
  const weight: Record<AfterSalesPriority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return [...customers].sort((a, b) => {
    const priorityDelta = weight[b.priority] - weight[a.priority];
    if (priorityDelta) return priorityDelta;
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    if (b.dueActions.length !== a.dueActions.length) return b.dueActions.length - a.dueActions.length;
    if (b.score !== a.score) return b.score - a.score;
    return b.value - a.value;
  });
}
