export const ACCESS_ROLES = ["OWNER", "SALES", "CLOSING", "FINANCE", "MARKETING", "KEYHOLDING", "VIEWER"] as const;
export type AccessRole = (typeof ACCESS_ROLES)[number];

export const ACCESS_ROLE_LABELS: Record<AccessRole, string> = {
  OWNER: "Owner",
  SALES: "Sales",
  CLOSING: "Closing",
  FINANCE: "Finance",
  MARKETING: "Marketing",
  KEYHOLDING: "Keyholding",
  VIEWER: "Read-only",
};

export const ACCESS_PERMISSIONS = [
  "revenue.read",
  "customers.read",
  "customers.write",
  "sales.write",
  "closing.read",
  "closing.write",
  "documents.write",
  "finance.read",
  "finance.write",
  "marketing.read",
  "marketing.write",
  "keyholding.read",
  "keyholding.write",
  "communications.read",
  "communications.write",
  "execution.read",
  "execution.write",
  "data.manage",
  "audit.read",
  "access.manage",
] as const;
export type AccessPermission = (typeof ACCESS_PERMISSIONS)[number];

const READ_PERMISSIONS: AccessPermission[] = [
  "revenue.read",
  "customers.read",
  "closing.read",
  "finance.read",
  "marketing.read",
  "keyholding.read",
  "communications.read",
  "execution.read",
  "audit.read",
];

export const ROLE_PERMISSIONS: Record<AccessRole, AccessPermission[]> = {
  OWNER: [...ACCESS_PERMISSIONS],
  SALES: [
    "revenue.read", "customers.read", "customers.write", "sales.write", "closing.read",
    "communications.read", "communications.write", "execution.read", "execution.write",
    "marketing.read", "keyholding.read",
  ],
  CLOSING: [
    "revenue.read", "customers.read", "closing.read", "closing.write", "documents.write",
    "communications.read", "execution.read", "execution.write", "finance.read",
  ],
  FINANCE: [
    "revenue.read", "customers.read", "finance.read", "finance.write", "closing.read", "audit.read",
  ],
  MARKETING: [
    "revenue.read", "customers.read", "marketing.read", "marketing.write", "communications.read", "audit.read",
  ],
  KEYHOLDING: [
    "revenue.read", "customers.read", "customers.write", "keyholding.read", "keyholding.write",
    "communications.read", "communications.write", "execution.read", "execution.write",
  ],
  VIEWER: [...READ_PERMISSIONS],
};

export interface AccessProfile {
  email: string;
  displayName: string | null;
  role: AccessRole;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AccessAuditEvent {
  id: string;
  at: string;
  actorEmail: string;
  action: "PROFILE_CREATED" | "PROFILE_UPDATED" | "PROFILE_DEACTIVATED" | "PROFILE_REACTIVATED";
  targetEmail: string;
  before: Partial<AccessProfile> | null;
  after: Partial<AccessProfile> | null;
}

export interface AccessSettings {
  version: 1;
  profiles: AccessProfile[];
  audit: AccessAuditEvent[];
  updatedAt: string | null;
}

export function normalizeRole(value: unknown): AccessRole | null {
  const role = String(value || "").trim().toUpperCase() as AccessRole;
  return ACCESS_ROLES.includes(role) ? role : null;
}

export function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function permissionsForRole(role: AccessRole) {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(role: AccessRole, permission: AccessPermission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export type RouteAccessRequirement = AccessPermission | "AUTHENTICATED" | "OWNER_ONLY";

function isWrite(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

/** Unknown API routes deliberately remain OWNER_ONLY. */
export function accessRequirementForApi(pathname: string, method = "GET"): RouteAccessRequirement {
  const path = pathname.replace(/\/+$/, "") || "/";
  const write = isWrite(method);

  if (path === "/api/auth/me") return "AUTHENTICATED";
  if (path.startsWith("/api/access-control")) return "OWNER_ONLY";
  if (path.startsWith("/api/platform")) return "OWNER_ONLY";
  if (path.startsWith("/api/audit-log")) return "audit.read";
  if (path.startsWith("/api/team-workload")) return write ? "access.manage" : "revenue.read";

  if (path.startsWith("/api/contacts") || path.startsWith("/api/customers")) {
    return write ? "customers.write" : "customers.read";
  }
  if (path.startsWith("/api/calendar")) return write ? "execution.write" : "execution.read";
  if (path.startsWith("/api/billing")) return write ? "finance.write" : "finance.read";
  if (path.startsWith("/api/dona-anna")) return write ? "finance.write" : "finance.read";

  if (path.startsWith("/api/revenue/commissions") || path.startsWith("/api/revenue/monthly-close") || path.startsWith("/api/revenue/goals")) {
    return write ? "finance.write" : "finance.read";
  }
  if (path.startsWith("/api/revenue/attribution")) return write ? "marketing.write" : "marketing.read";
  if (path.startsWith("/api/revenue/service-revenue")) return write ? "keyholding.write" : "keyholding.read";
  if (path.startsWith("/api/revenue/closing-pack")) return write ? "documents.write" : "closing.read";
  if (path.startsWith("/api/revenue/closing")) return write ? "closing.write" : "closing.read";
  if (path.startsWith("/api/revenue/communications")) return write ? "communications.write" : "communications.read";
  if (path.startsWith("/api/revenue/execution")) return write ? "execution.write" : "execution.read";
  if (path.startsWith("/api/revenue/data-health")) return write ? "data.manage" : "revenue.read";
  if (
    path.startsWith("/api/revenue/today") ||
    path.startsWith("/api/revenue/recovery") ||
    path.startsWith("/api/revenue/after-sales")
  ) return write ? "sales.write" : "revenue.read";
  if (
    path.startsWith("/api/revenue/forecast") ||
    path.startsWith("/api/revenue/command")
  ) return "revenue.read";

  if (path.startsWith("/api/approvals") || path.startsWith("/api/lead-intelligence")) {
    return write ? "sales.write" : "revenue.read";
  }

  return "OWNER_ONLY";
}

export function permissionForNavHref(href: string): AccessPermission | "OWNER_ONLY" | null {
  if (href === "/access-control" || href === "/platform") return "OWNER_ONLY";
  if (href === "/audit-log") return "audit.read";
  if (href === "/team-workload") return "revenue.read";
  if (href === "/customers" || href.startsWith("/customers/")) return "customers.read";
  if (["/billing", "/dona-anna", "/commissions", "/monthly-close", "/goals"].includes(href)) return "finance.read";
  if (["/attribution", "/ad-campaigns", "/analytics"].includes(href)) return "marketing.read";
  if (href === "/service-revenue") return "keyholding.read";
  if (["/closing", "/closing-pack"].includes(href)) return "closing.read";
  if (href === "/communications") return "communications.read";
  if (["/execution", "/calendar", "/booking-admin"].includes(href)) return "execution.read";
  if (["/revenue-command", "/today", "/forecast", "/recovery", "/after-sales", "/revenue-data-health", "/pipeline", "/lead-intelligence", "/approvals"].includes(href)) return "revenue.read";
  return null;
}

export function canSeeNavHref(role: AccessRole, href: string) {
  const requirement = permissionForNavHref(href);
  if (!requirement) return role === "OWNER";
  if (requirement === "OWNER_ONLY") return role === "OWNER";
  return hasPermission(role, requirement);
}

export type AuditCategory = "ACCESS" | "CUSTOMER" | "SALES" | "CLOSING" | "FINANCE" | "MARKETING" | "KEYHOLDING" | "COMMUNICATION" | "EXECUTION" | "SYSTEM";

export interface AuditTrailEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  category: AuditCategory;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  source: string;
  field: string | null;
  before: unknown;
  after: unknown;
  details: Record<string, unknown>;
  actorKnown: boolean;
}

export interface AuditTrail {
  generatedAt: string;
  summary: {
    total: number;
    last7Days: number;
    accessChanges: number;
    customerEvents: number;
    unknownActor: number;
    actorCoveragePercent: number;
  };
  events: AuditTrailEvent[];
  warnings: string[];
}

const SENSITIVE_KEY = /(password|secret|token|cookie|authorization|passport|nie|iban|account_number)/i;

function safeDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) output[key] = "[REDACTED]";
    else if (item && typeof item === "object") output[key] = Array.isArray(item) ? `[${item.length} items]` : "[object]";
    else if (typeof item === "string" && item.length > 250) output[key] = `${item.slice(0, 247)}...`;
    else output[key] = item;
  }
  return output;
}

function categoryFor(action: string, source: string): AuditCategory {
  const value = `${action} ${source}`.toLowerCase();
  if (/access|profile|role|permission/.test(value)) return "ACCESS";
  if (/commission|invoice|payment|goal|monthly-close/.test(value)) return "FINANCE";
  if (/closing|document|reservation|handover|notary/.test(value)) return "CLOSING";
  if (/keyholding|service-revenue/.test(value)) return "KEYHOLDING";
  if (/message|communication|email|whatsapp/.test(value)) return "COMMUNICATION";
  if (/calendar|execution|task|followup/.test(value)) return "EXECUTION";
  if (/attribution|campaign|marketing|source/.test(value)) return "MARKETING";
  if (/recovery|after-sales|pipeline|lead|sales/.test(value)) return "SALES";
  if (/contact|customer|profile/.test(value)) return "CUSTOMER";
  return "SYSTEM";
}

function interactionEvent(contact: Record<string, unknown>, item: unknown, index: number): AuditTrailEvent | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const metadata = cleanRecord(row.metadata);
  const at = safeDate(row.date || row.created_at || row.timestamp || metadata.at || metadata.date);
  if (!at) return null;
  const action = String(row.action || metadata.action || row.type || "activity").trim() || "activity";
  const source = String(metadata.source || row.source || "contact-interaction").trim() || "contact-interaction";
  const actor = String(metadata.performed_by || metadata.actor_email || metadata.updated_by || row.performed_by || row.created_by || "").trim();
  const field = String(metadata.field || metadata.field_name || "").trim() || null;
  return {
    id: String(row.id || `${contact.id || "contact"}:${at.toISOString()}:${index}`),
    at: at.toISOString(),
    actor: actor || "Ukjent / eldre hendelse",
    action,
    category: categoryFor(action, source),
    resourceType: "contact",
    resourceId: String(contact.id || "").trim() || null,
    resourceName: String(contact.name || contact.email || "Ukjent kunde"),
    source,
    field,
    before: metadata.before ?? metadata.old_value ?? null,
    after: metadata.after ?? metadata.new_value ?? metadata.value ?? null,
    details: metadata,
    actorKnown: Boolean(actor),
  };
}

function accessEvent(item: AccessAuditEvent): AuditTrailEvent | null {
  const at = safeDate(item.at);
  if (!at) return null;
  return {
    id: item.id,
    at: at.toISOString(),
    actor: item.actorEmail || "Ukjent",
    action: item.action,
    category: "ACCESS",
    resourceType: "access-profile",
    resourceId: item.targetEmail,
    resourceName: item.targetEmail,
    source: "access-control",
    field: "role/profile",
    before: item.before,
    after: item.after,
    details: {},
    actorKnown: Boolean(item.actorEmail),
  };
}

export function buildAuditTrail(params: {
  contacts?: Array<Record<string, unknown>>;
  accessAudit?: AccessAuditEvent[];
  now?: Date;
  warnings?: string[];
  limit?: number;
}): AuditTrail {
  const now = params.now || new Date();
  const events: AuditTrailEvent[] = [];
  for (const contact of params.contacts || []) {
    const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
    interactions.forEach((item, index) => {
      const event = interactionEvent(contact, item, index);
      if (event) events.push(event);
    });
  }
  for (const item of params.accessAudit || []) {
    const event = accessEvent(item);
    if (event) events.push(event);
  }
  events.sort((a, b) => b.at.localeCompare(a.at));
  const limited = events.slice(0, Math.max(1, Math.min(params.limit || 500, 2000)));
  const sevenDaysAgo = now.getTime() - 7 * 86_400_000;
  const unknownActor = limited.filter((event) => !event.actorKnown).length;
  const warnings = [...(params.warnings || [])];
  if (unknownActor > 0) warnings.push(`${unknownActor} hendelser mangler aktør. Dette gjelder normalt eldre historikk før sentral audit-kontroll.`);
  if (events.length > limited.length) warnings.push(`Visningen er begrenset til de ${limited.length} nyeste av ${events.length} hendelser.`);
  return {
    generatedAt: now.toISOString(),
    summary: {
      total: limited.length,
      last7Days: limited.filter((event) => new Date(event.at).getTime() >= sevenDaysAgo).length,
      accessChanges: limited.filter((event) => event.category === "ACCESS").length,
      customerEvents: limited.filter((event) => event.resourceType === "contact").length,
      unknownActor,
      actorCoveragePercent: limited.length ? Math.round(((limited.length - unknownActor) / limited.length) * 100) : 100,
    },
    events: limited,
    warnings,
  };
}
