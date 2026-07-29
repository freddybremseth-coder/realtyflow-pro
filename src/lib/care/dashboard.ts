export type CareView = "overview" | "customers" | "reports" | "invoices" | "keys";

export type CareReadinessStatus = "ok" | "warning" | "empty";

export interface CareSummary {
  orgs: number;
  customers: number;
  properties: number;
  activeContracts: number;
  plans: number;
  checklistItems: number;
  inspections: number;
  openInspections: number;
  photos: number;
  draftReports: number;
  sentReports: number;
  openIssues: number;
  openWorkOrders: number;
  keys: number;
  upcomingEvents: number;
  openCharges: number;
  draftInvoices: number;
  invoiceTotalCents: number;
  monthlyRecurringRevenueCents: number;
}

export interface CareReadinessItem {
  id: string;
  label: string;
  status: CareReadinessStatus;
  detail: string;
}

export interface CarePlan {
  id: string;
  code: string;
  name: string;
  visitsPerMonth: number;
  priceCents: number;
  currency: string;
  active: boolean;
  includedServices: string[];
}

export interface CareProperty {
  id: string;
  reference: string;
  name: string;
  type: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  address: string;
  municipality: string;
  status: string;
  hasPool: boolean;
  hasGarden: boolean;
  lat: number | null;
  lng: number | null;
  planName: string | null;
  contractStatus: string | null;
  monthlyPriceCents: number;
  openIssues: number;
  openWorkOrders: number;
  keyCount: number;
  documentCount: number;
  lastInspectionAt: string | null;
  nextEventAt: string | null;
}

export interface CareInspection {
  id: string;
  propertyId: string;
  propertyLabel: string;
  kind: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  photoCount: number;
  issueCount: number;
}

export interface CareReport {
  id: string;
  propertyId: string;
  propertyLabel: string;
  reference: string;
  status: string;
  locale: string;
  approvedAt: string | null;
  sentAt: string | null;
  viewCount: number;
  deliveryCount: number;
  storagePath: string;
  createdAt: string | null;
}

export interface CarePhoto {
  id: string;
  inspectionId: string;
  propertyLabel: string;
  caption: string;
  storagePath: string;
  takenAt: string | null;
  width: number | null;
  height: number | null;
}

export interface CareInvoice {
  id: string;
  propertyId: string;
  propertyLabel: string;
  reference: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  issuedOn: string | null;
  totalCents: number;
  currency: string;
  lineCount: number;
}

export interface CareCharge {
  id: string;
  propertyId: string;
  propertyLabel: string;
  description: string;
  kind: string;
  status: string;
  occurredOn: string | null;
  amountCents: number;
  currency: string;
}

export interface CareKey {
  id: string;
  propertyId: string;
  propertyLabel: string;
  label: string;
  storageLocation: string | null;
  status: string;
  lastEventAt: string | null;
  lastHolder: string | null;
}

export interface CareCalendarEvent {
  id: string;
  propertyId: string;
  propertyLabel: string;
  type: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  guestName: string | null;
  billable: boolean;
}

export interface CareWorkOrder {
  id: string;
  propertyId: string;
  propertyLabel: string;
  reference: string;
  status: string;
  description: string;
  scheduledFor: string | null;
  ownerTotalCents: number;
  vendorTotalCents: number;
  currency: string;
}

export interface CareIssue {
  id: string;
  propertyId: string;
  propertyLabel: string;
  title: string;
  severity: string;
  status: string;
  openedAt: string | null;
  tradeCode: string | null;
}

export interface CareActivity {
  id: string;
  at: string | null;
  label: string;
  detail: string;
  href: string;
}

export interface CareWorkflow {
  id: CareView;
  label: string;
  href: string;
  count: number;
  status: CareReadinessStatus;
  detail: string;
}

export interface CareDashboard {
  generatedAt: string;
  schema: "care";
  summary: CareSummary;
  readiness: CareReadinessItem[];
  workflows: CareWorkflow[];
  plans: CarePlan[];
  properties: CareProperty[];
  inspections: CareInspection[];
  reports: CareReport[];
  photos: CarePhoto[];
  invoices: CareInvoice[];
  charges: CareCharge[];
  keys: CareKey[];
  calendarEvents: CareCalendarEvent[];
  workOrders: CareWorkOrder[];
  issues: CareIssue[];
  recentActivity: CareActivity[];
  warnings: string[];
}

export interface CareDashboardInput {
  generatedAt?: Date;
  orgs?: Array<Record<string, unknown>>;
  orgMembers?: Array<Record<string, unknown>>;
  plans?: Array<Record<string, unknown>>;
  checklistItems?: Array<Record<string, unknown>>;
  properties?: Array<Record<string, unknown>>;
  ownerContacts?: Array<Record<string, unknown>>;
  contracts?: Array<Record<string, unknown>>;
  inspections?: Array<Record<string, unknown>>;
  reports?: Array<Record<string, unknown>>;
  reportDeliveries?: Array<Record<string, unknown>>;
  photos?: Array<Record<string, unknown>>;
  documents?: Array<Record<string, unknown>>;
  invoices?: Array<Record<string, unknown>>;
  invoiceLines?: Array<Record<string, unknown>>;
  charges?: Array<Record<string, unknown>>;
  keys?: Array<Record<string, unknown>>;
  keyEvents?: Array<Record<string, unknown>>;
  calendarEvents?: Array<Record<string, unknown>>;
  issues?: Array<Record<string, unknown>>;
  workOrders?: Array<Record<string, unknown>>;
  warnings?: string[];
}

const CLOSED_STATUSES = new Set(["closed", "completed", "cancelled", "canceled", "paid", "void", "archived"]);
const ACTIVE_CONTRACT_STATUSES = new Set(["active", "renewal_due"]);
const DRAFT_REPORT_STATUSES = new Set(["draft", "pending", "approved"]);
const DRAFT_INVOICE_STATUSES = new Set(["draft", "approved", "issued", "sent", "overdue"]);

function text(row: Record<string, unknown> | null | undefined, key: string, fallback = "") {
  const value = row?.[key];
  if (value === null || value === undefined) return fallback;
  const result = String(value).trim();
  return result || fallback;
}

function optionalText(row: Record<string, unknown> | null | undefined, key: string) {
  const value = text(row, key);
  return value || null;
}

function numberValue(row: Record<string, unknown> | null | undefined, key: string) {
  const value = Number(row?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function optionalNumber(row: Record<string, unknown> | null | undefined, key: string) {
  const value = Number(row?.[key]);
  return Number.isFinite(value) ? value : null;
}

function boolValue(row: Record<string, unknown> | null | undefined, key: string) {
  return row?.[key] === true;
}

function dateText(row: Record<string, unknown> | null | undefined, key: string) {
  const value = optionalText(row, key);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function timestamp(value: string | null) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isOpen(value: unknown) {
  const status = normalizeStatus(value);
  return Boolean(status) && !CLOSED_STATUSES.has(status);
}

function localized(value: unknown, locale = "no") {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const row = value as Record<string, unknown>;
  for (const key of [locale, "nb", "no", "en", "es"]) {
    const candidate = row[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  const first = Object.values(row).find((item) => typeof item === "string" && item.trim());
  return typeof first === "string" ? first.trim() : "";
}

function arrayText(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function compactRows<T>(rows: T[], limit = 80) {
  return rows.slice(0, limit);
}

function propertyTitle(row: Record<string, unknown> | undefined) {
  if (!row) return "Ukjent eiendom";
  return text(row, "name") || text(row, "reference") || text(row, "address_line") || "Ukjent eiendom";
}

function byId(rows: Array<Record<string, unknown>>) {
  const entries: Array<[string, Record<string, unknown>]> = [];
  for (const row of rows) {
    const id = text(row, "id");
    if (id) entries.push([id, row]);
  }
  return new Map(entries);
}

function groupBy(rows: Array<Record<string, unknown>>, key: string) {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const id = text(row, key);
    if (!id) continue;
    grouped.set(id, [...(grouped.get(id) || []), row]);
  }
  return grouped;
}

function latest(rows: Array<Record<string, unknown>>, keys: string[]) {
  return [...rows].sort((a, b) => {
    const aAt = Math.max(...keys.map((key) => timestamp(dateText(a, key))));
    const bAt = Math.max(...keys.map((key) => timestamp(dateText(b, key))));
    return bAt - aAt;
  })[0] || null;
}

function nextUpcoming(rows: Array<Record<string, unknown>>, now: Date) {
  return [...rows]
    .filter((row) => timestamp(dateText(row, "starts_at")) >= now.getTime() && isOpen(row.status))
    .sort((a, b) => timestamp(dateText(a, "starts_at")) - timestamp(dateText(b, "starts_at")))[0] || null;
}

function contractPriceCents(contract: Record<string, unknown> | null, plansById: Map<string, CarePlan>) {
  if (!contract) return 0;
  const snapshot = contract.plan_snapshot;
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const fromSnapshot = Number((snapshot as Record<string, unknown>).price_cents);
    if (Number.isFinite(fromSnapshot)) return fromSnapshot;
  }
  return plansById.get(text(contract, "plan_id"))?.priceCents || 0;
}

function planLabel(contract: Record<string, unknown> | null, plansById: Map<string, CarePlan>) {
  if (!contract) return null;
  const snapshot = contract.plan_snapshot;
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const fromSnapshot = text(snapshot as Record<string, unknown>, "name") || text(snapshot as Record<string, unknown>, "code");
    if (fromSnapshot) return fromSnapshot;
  }
  const plan = plansById.get(text(contract, "plan_id"));
  return plan?.name || plan?.code || null;
}

export function buildCareDashboard(input: CareDashboardInput = {}): CareDashboard {
  const now = input.generatedAt || new Date();
  const orgs = input.orgs || [];
  const orgMembers = input.orgMembers || [];
  const checklistItems = input.checklistItems || [];
  const rawPlans = input.plans || [];
  const rawProperties = input.properties || [];
  const rawContracts = input.contracts || [];
  const rawInspections = input.inspections || [];
  const rawReports = input.reports || [];
  const rawDeliveries = input.reportDeliveries || [];
  const rawPhotos = input.photos || [];
  const rawDocuments = input.documents || [];
  const rawInvoices = input.invoices || [];
  const rawInvoiceLines = input.invoiceLines || [];
  const rawCharges = input.charges || [];
  const rawKeys = input.keys || [];
  const rawKeyEvents = input.keyEvents || [];
  const rawEvents = input.calendarEvents || [];
  const rawIssues = input.issues || [];
  const rawWorkOrders = input.workOrders || [];
  const ownerContacts = input.ownerContacts || [];

  const propertiesById = byId(rawProperties);
  const contactsById = byId(ownerContacts);
  const contractsByProperty = groupBy(rawContracts, "property_id");
  const inspectionsByProperty = groupBy(rawInspections, "property_id");
  const reportsByInspection = groupBy(rawReports, "inspection_id");
  const deliveriesByReport = groupBy(rawDeliveries, "report_id");
  const photosByInspection = groupBy(rawPhotos, "inspection_id");
  const invoicesByProperty = groupBy(rawInvoices, "property_id");
  const linesByInvoice = groupBy(rawInvoiceLines, "invoice_id");
  const chargesByProperty = groupBy(rawCharges, "property_id");
  const keysByProperty = groupBy(rawKeys, "property_id");
  const keyEventsByKey = groupBy(rawKeyEvents, "key_id");
  const calendarByProperty = groupBy(rawEvents, "property_id");
  const issuesByProperty = groupBy(rawIssues, "property_id");
  const workOrdersByProperty = groupBy(rawWorkOrders, "property_id");

  const plans: CarePlan[] = rawPlans.map((row) => ({
    id: text(row, "id"),
    code: text(row, "code"),
    name: text(row, "name") || text(row, "code"),
    visitsPerMonth: numberValue(row, "visits_per_month"),
    priceCents: numberValue(row, "price_cents"),
    currency: text(row, "currency", "EUR"),
    active: row.is_active !== false,
    includedServices: arrayText(row.included_services),
  })).filter((plan) => plan.id);
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));

  const activeContracts = rawContracts.filter((row) => ACTIVE_CONTRACT_STATUSES.has(normalizeStatus(row.status)));
  const properties: CareProperty[] = rawProperties.map((row) => {
    const id = text(row, "id");
    const contracts = contractsByProperty.get(id) || [];
    const activeContract = contracts.find((contract) => ACTIVE_CONTRACT_STATUSES.has(normalizeStatus(contract.status))) || latest(contracts, ["created_at"]);
    const inspections = inspectionsByProperty.get(id) || [];
    const lastInspection = latest(inspections, ["completed_at", "started_at", "created_at"]);
    const nextEvent = nextUpcoming(calendarByProperty.get(id) || [], now);
    const owner = contactsById.get(text(row, "owner_id"));
    return {
      id,
      reference: text(row, "reference"),
      name: propertyTitle(row),
      type: text(row, "property_type", "property"),
      ownerId: text(row, "owner_id"),
      ownerName: text(owner, "name", text(row, "owner_id", "Ukjent eier")),
      ownerEmail: optionalText(owner, "email"),
      address: text(row, "address_line"),
      municipality: text(row, "municipality"),
      status: text(row, "status", "active"),
      hasPool: boolValue(row, "has_pool"),
      hasGarden: boolValue(row, "has_garden"),
      lat: optionalNumber(row, "lat"),
      lng: optionalNumber(row, "lng"),
      planName: planLabel(activeContract, plansById),
      contractStatus: activeContract ? text(activeContract, "status", "active") : null,
      monthlyPriceCents: contractPriceCents(activeContract, plansById),
      openIssues: (issuesByProperty.get(id) || []).filter((issue) => isOpen(issue.status)).length,
      openWorkOrders: (workOrdersByProperty.get(id) || []).filter((order) => isOpen(order.status)).length,
      keyCount: (keysByProperty.get(id) || []).length,
      documentCount: (rawDocuments || []).filter((document) => text(document, "property_id") === id).length,
      lastInspectionAt: lastInspection ? dateText(lastInspection, "completed_at") || dateText(lastInspection, "started_at") : null,
      nextEventAt: nextEvent ? dateText(nextEvent, "starts_at") : null,
    };
  }).filter((property) => property.id);

  const propertyLabel = (propertyId: string) => propertyTitle(propertiesById.get(propertyId));

  const inspections: CareInspection[] = rawInspections.map((row) => {
    const id = text(row, "id");
    return {
      id,
      propertyId: text(row, "property_id"),
      propertyLabel: propertyLabel(text(row, "property_id")),
      kind: text(row, "kind", "inspection"),
      status: text(row, "status", "draft"),
      startedAt: dateText(row, "started_at"),
      completedAt: dateText(row, "completed_at"),
      photoCount: numberValue(row, "photo_count") || (photosByInspection.get(id) || []).length,
      issueCount: rawIssues.filter((issue) => text(issue, "inspection_id") === id).length,
    };
  }).filter((item) => item.id);

  const reports: CareReport[] = rawReports.map((row) => {
    const id = text(row, "id");
    return {
      id,
      propertyId: text(row, "property_id"),
      propertyLabel: propertyLabel(text(row, "property_id")),
      reference: text(row, "reference"),
      status: text(row, "status", "draft"),
      locale: text(row, "locale", "no"),
      approvedAt: dateText(row, "approved_at"),
      sentAt: dateText(row, "sent_at"),
      viewCount: numberValue(row, "view_count"),
      deliveryCount: (deliveriesByReport.get(id) || []).length,
      storagePath: text(row, "storage_path"),
      createdAt: dateText(row, "created_at"),
    };
  }).filter((item) => item.id);

  const inspectionsById = byId(rawInspections);
  const photos: CarePhoto[] = rawPhotos.map((row) => {
    const inspection = inspectionsById.get(text(row, "inspection_id"));
    return {
      id: text(row, "id"),
      inspectionId: text(row, "inspection_id"),
      propertyLabel: propertyLabel(text(inspection, "property_id")),
      caption: localized(row.caption) || text(row, "item_code") || "Bilde",
      storagePath: text(row, "storage_path"),
      takenAt: dateText(row, "taken_at"),
      width: optionalNumber(row, "width"),
      height: optionalNumber(row, "height"),
    };
  }).filter((item) => item.id);

  const invoices: CareInvoice[] = rawInvoices.map((row) => {
    const id = text(row, "id");
    return {
      id,
      propertyId: text(row, "property_id"),
      propertyLabel: propertyLabel(text(row, "property_id")),
      reference: text(row, "reference"),
      status: text(row, "status", "draft"),
      periodStart: dateText(row, "period_start"),
      periodEnd: dateText(row, "period_end"),
      issuedOn: dateText(row, "issued_on"),
      totalCents: numberValue(row, "total_cents"),
      currency: text(row, "currency", "EUR"),
      lineCount: (linesByInvoice.get(id) || []).length,
    };
  }).filter((item) => item.id);

  const charges: CareCharge[] = rawCharges.map((row) => ({
    id: text(row, "id"),
    propertyId: text(row, "property_id"),
    propertyLabel: propertyLabel(text(row, "property_id")),
    description: text(row, "description"),
    kind: text(row, "kind", "addon"),
    status: text(row, "status", "open"),
    occurredOn: dateText(row, "occurred_on"),
    amountCents: numberValue(row, "amount_cents"),
    currency: text(row, "currency", "EUR"),
  })).filter((item) => item.id);

  const keys: CareKey[] = rawKeys.map((row) => {
    const events = keyEventsByKey.get(text(row, "id")) || [];
    const lastEvent = latest(events, ["at", "created_at"]);
    return {
      id: text(row, "id"),
      propertyId: text(row, "property_id"),
      propertyLabel: propertyLabel(text(row, "property_id")),
      label: text(row, "label", "Nøkkel"),
      storageLocation: optionalText(row, "storage_location"),
      status: text(row, "status", "in_office"),
      lastEventAt: lastEvent ? dateText(lastEvent, "at") : null,
      lastHolder: lastEvent ? optionalText(lastEvent, "holder_name") : null,
    };
  }).filter((item) => item.id);

  const calendarEvents: CareCalendarEvent[] = rawEvents.map((row) => ({
    id: text(row, "id"),
    propertyId: text(row, "property_id"),
    propertyLabel: propertyLabel(text(row, "property_id")),
    type: text(row, "event_type", "event"),
    title: text(row, "title") || text(row, "event_type", "Hendelse"),
    startsAt: dateText(row, "starts_at"),
    endsAt: dateText(row, "ends_at"),
    status: text(row, "status", "planned"),
    guestName: optionalText(row, "guest_name"),
    billable: row.is_billable !== false,
  })).filter((item) => item.id);

  const workOrders: CareWorkOrder[] = rawWorkOrders.map((row) => ({
    id: text(row, "id"),
    propertyId: text(row, "property_id"),
    propertyLabel: propertyLabel(text(row, "property_id")),
    reference: text(row, "reference"),
    status: text(row, "status", "draft"),
    description: localized(row.description) || text(row, "reference", "Arbeidsordre"),
    scheduledFor: dateText(row, "scheduled_for"),
    ownerTotalCents: numberValue(row, "owner_total_cents"),
    vendorTotalCents: numberValue(row, "vendor_total_cents"),
    currency: text(row, "currency", "EUR"),
  })).filter((item) => item.id);

  const issues: CareIssue[] = rawIssues.map((row) => ({
    id: text(row, "id"),
    propertyId: text(row, "property_id"),
    propertyLabel: propertyLabel(text(row, "property_id")),
    title: localized(row.title) || text(row, "item_code", "Avvik"),
    severity: text(row, "severity", "medium"),
    status: text(row, "status", "open"),
    openedAt: dateText(row, "opened_at"),
    tradeCode: optionalText(row, "trade_code"),
  })).filter((item) => item.id);

  const upcomingEvents = calendarEvents.filter((event) => timestamp(event.startsAt) >= now.getTime() && isOpen(event.status)).length;
  const openIssues = issues.filter((issue) => isOpen(issue.status)).length;
  const openWorkOrders = workOrders.filter((order) => isOpen(order.status)).length;
  const openCharges = charges.filter((charge) => isOpen(charge.status)).length;
  const draftReports = reports.filter((report) => DRAFT_REPORT_STATUSES.has(normalizeStatus(report.status)) && !report.sentAt).length;
  const draftInvoices = invoices.filter((invoice) => DRAFT_INVOICE_STATUSES.has(normalizeStatus(invoice.status))).length;

  const summary: CareSummary = {
    orgs: orgs.length,
    customers: new Set(rawProperties.map((row) => text(row, "owner_id")).filter(Boolean)).size,
    properties: properties.length,
    activeContracts: activeContracts.length,
    plans: plans.length,
    checklistItems: checklistItems.length,
    inspections: inspections.length,
    openInspections: inspections.filter((inspection) => isOpen(inspection.status)).length,
    photos: photos.length,
    draftReports,
    sentReports: reports.filter((report) => Boolean(report.sentAt)).length,
    openIssues,
    openWorkOrders,
    keys: keys.length,
    upcomingEvents,
    openCharges,
    draftInvoices,
    invoiceTotalCents: invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0),
    monthlyRecurringRevenueCents: activeContracts.reduce((sum, contract) => sum + contractPriceCents(contract, plansById), 0),
  };

  const readiness: CareReadinessItem[] = [
    {
      id: "schema",
      label: "Care database",
      status: summary.orgs > 0 ? "ok" : "warning",
      detail: summary.orgs > 0 ? "Care-schemaet svarer fra Realtyflow Supabase." : "Care-schemaet svarer, men organisasjon mangler.",
    },
    {
      id: "plans",
      label: "Planer og priser",
      status: summary.plans > 0 ? "ok" : "warning",
      detail: summary.plans > 0 ? `${summary.plans} aktive planrader er klare.` : "Planer må legges inn før kontrakter kan faktureres.",
    },
    {
      id: "checklist",
      label: "Inspeksjonsmal",
      status: summary.checklistItems > 0 ? "ok" : "warning",
      detail: summary.checklistItems > 0 ? `${summary.checklistItems} sjekkpunkter er klare for rapporter.` : "Sjekkliste mangler.",
    },
    {
      id: "properties",
      label: "Kunder og eiendommer",
      status: summary.properties > 0 ? "ok" : "empty",
      detail: summary.properties > 0 ? `${summary.properties} eiendommer er koblet til Care.` : "Ingen Care-eiendommer er registrert ennå.",
    },
    {
      id: "members",
      label: "Teamtilgang",
      status: orgMembers.length > 0 ? "ok" : "warning",
      detail: orgMembers.length > 0 ? `${orgMembers.length} teammedlemmer er koblet til Care.` : "Ingen egne Care-teammedlemmer er registrert i care.org_members.",
    },
  ];

  const workflows: CareWorkflow[] = [
    {
      id: "customers",
      label: "Kunder & eiendommer",
      href: "/care/customers",
      count: summary.properties,
      status: summary.properties > 0 ? "ok" : "empty",
      detail: summary.properties > 0 ? "Eier, bolig, avtale og servicebehov samlet." : "Klar for første Care-kunde.",
    },
    {
      id: "reports",
      label: "Rapporter & bilder",
      href: "/care/reports",
      count: summary.draftReports + summary.photos,
      status: summary.checklistItems > 0 ? "ok" : "warning",
      detail: summary.photos > 0 ? "Bilder og rapporter ligger klare for kundedokumentasjon." : "Sjekklisten er klar, men ingen bilder/rapporter er laget ennå.",
    },
    {
      id: "invoices",
      label: "Faktura & tillegg",
      href: "/care/invoices",
      count: summary.draftInvoices + summary.openCharges,
      status: summary.plans > 0 ? "ok" : "warning",
      detail: summary.openCharges || summary.draftInvoices ? "Åpne tillegg og fakturautkast er synlige." : "Prisplaner er klare; ingen fakturaer er opprettet ennå.",
    },
    {
      id: "keys",
      label: "Nøkler & kalender",
      href: "/care/keys",
      count: summary.keys + summary.upcomingEvents,
      status: summary.keys || summary.upcomingEvents ? "ok" : "empty",
      detail: summary.keys || summary.upcomingEvents ? "Nøkler og planlagte besøk er synlige." : "Ingen nøkler eller kalenderhendelser er registrert ennå.",
    },
  ];

  const recentActivity: CareActivity[] = [
    ...inspections.map((item) => ({
      id: `inspection:${item.id}`,
      at: item.completedAt || item.startedAt,
      label: "Inspeksjon",
      detail: `${item.propertyLabel} · ${item.status}`,
      href: "/care/reports",
    })),
    ...reports.map((item) => ({
      id: `report:${item.id}`,
      at: item.sentAt || item.approvedAt || item.createdAt,
      label: "Rapport",
      detail: `${item.reference || item.propertyLabel} · ${item.status}`,
      href: "/care/reports",
    })),
    ...invoices.map((item) => ({
      id: `invoice:${item.id}`,
      at: item.issuedOn || item.periodEnd || item.periodStart,
      label: "Faktura",
      detail: `${item.reference || item.propertyLabel} · ${item.status}`,
      href: "/care/invoices",
    })),
    ...calendarEvents.map((item) => ({
      id: `event:${item.id}`,
      at: item.startsAt,
      label: "Kalender",
      detail: `${item.propertyLabel} · ${item.title}`,
      href: "/care/keys",
    })),
  ].filter((item) => item.at).sort((a, b) => timestamp(b.at) - timestamp(a.at)).slice(0, 12);

  return {
    generatedAt: now.toISOString(),
    schema: "care",
    summary,
    readiness,
    workflows,
    plans: compactRows(plans),
    properties: compactRows(properties),
    inspections: compactRows(inspections),
    reports: compactRows(reports),
    photos: compactRows(photos),
    invoices: compactRows(invoices),
    charges: compactRows(charges),
    keys: compactRows(keys),
    calendarEvents: compactRows(calendarEvents),
    workOrders: compactRows(workOrders),
    issues: compactRows(issues),
    recentActivity,
    warnings: input.warnings || [],
  };
}
