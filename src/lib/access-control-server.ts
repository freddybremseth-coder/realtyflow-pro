import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  ACCESS_ROLES,
  normalizeEmail,
  normalizeRole,
  type AccessAuditEvent,
  type AccessProfile,
  type AccessRole,
  type AccessSettings,
} from "@/lib/access-control";

export const ACCESS_SETTINGS_KEY = "access-control:profiles";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function safeDate(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function parseProfile(value: unknown): AccessProfile | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const email = normalizeEmail(row.email);
  const role = normalizeRole(row.role);
  if (!email || !email.includes("@") || !role || role === "OWNER") return null;
  return {
    email,
    displayName: String(row.displayName || row.display_name || "").trim() || null,
    role,
    active: row.active !== false,
    createdAt: safeDate(row.createdAt || row.created_at),
    updatedAt: safeDate(row.updatedAt || row.updated_at),
    updatedBy: normalizeEmail(row.updatedBy || row.updated_by) || null,
  };
}

function parseAudit(value: unknown): AccessAuditEvent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const action = String(row.action || "").trim() as AccessAuditEvent["action"];
  if (!["PROFILE_CREATED", "PROFILE_UPDATED", "PROFILE_DEACTIVATED", "PROFILE_REACTIVATED"].includes(action)) return null;
  const at = safeDate(row.at);
  const actorEmail = normalizeEmail(row.actorEmail || row.actor_email);
  const targetEmail = normalizeEmail(row.targetEmail || row.target_email);
  if (!at || !actorEmail || !targetEmail) return null;
  return {
    id: String(row.id || `${at}:${targetEmail}:${action}`),
    at,
    actorEmail,
    action,
    targetEmail,
    before: row.before && typeof row.before === "object" ? row.before as Partial<AccessProfile> : null,
    after: row.after && typeof row.after === "object" ? row.after as Partial<AccessProfile> : null,
  };
}

export function emptyAccessSettings(): AccessSettings {
  return { version: 1, profiles: [], audit: [], updatedAt: null };
}

export function parseAccessSettings(value: unknown): AccessSettings {
  if (!value || typeof value !== "object") return emptyAccessSettings();
  const row = value as Record<string, unknown>;
  const profiles = (Array.isArray(row.profiles) ? row.profiles : []).map(parseProfile).filter(Boolean) as AccessProfile[];
  const audit = (Array.isArray(row.audit) ? row.audit : []).map(parseAudit).filter(Boolean) as AccessAuditEvent[];
  return {
    version: 1,
    profiles: profiles.sort((a, b) => a.email.localeCompare(b.email)),
    audit: audit.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 500),
    updatedAt: safeDate(row.updatedAt || row.updated_at),
  };
}

export async function loadAccessSettings() {
  const supabase = getSupabase();
  if (!supabase) return { settings: emptyAccessSettings(), error: "Supabase not configured" };
  const { data, error } = await supabase
    .from("brand_settings")
    .select("settings,updated_at")
    .eq("brand_id", ACCESS_SETTINGS_KEY)
    .maybeSingle();
  if (error) return { settings: emptyAccessSettings(), error: error.message };
  const settings = parseAccessSettings(data?.settings);
  settings.updatedAt = settings.updatedAt || safeDate(data?.updated_at);
  return { settings, error: null as string | null };
}

export async function findAccessProfile(email: string) {
  const normalized = normalizeEmail(email);
  const result = await loadAccessSettings();
  return {
    profile: result.settings.profiles.find((profile) => profile.email === normalized) || null,
    error: result.error,
  };
}

async function authUserExists(email: string) {
  const supabase = getSupabase();
  if (!supabase) return { exists: false, error: "Supabase not configured" };
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return { exists: false, error: error.message };
  return {
    exists: (data.users || []).some((user) => normalizeEmail(user.email) === normalizeEmail(email)),
    error: null as string | null,
  };
}

export async function saveAccessProfile(params: {
  actorEmail: string;
  email: string;
  displayName?: string | null;
  role: AccessRole;
  active: boolean;
}) {
  const actorEmail = normalizeEmail(params.actorEmail);
  const email = normalizeEmail(params.email);
  const role = normalizeRole(params.role);
  if (!actorEmail || !email || !email.includes("@")) return { error: "Gyldig e-post mangler.", settings: null };
  if (!role || role === "OWNER" || !ACCESS_ROLES.includes(role)) return { error: "Owner kan ikke tildeles gjennom denne arbeidsflaten.", settings: null };
  const displayName = String(params.displayName || "").trim().slice(0, 120) || null;
  const current = await loadAccessSettings();
  if (current.error) return { error: current.error, settings: null };
  const existing = current.settings.profiles.find((profile) => profile.email === email) || null;
  if (!existing) {
    const authCheck = await authUserExists(email);
    if (authCheck.error) return { error: `Kunne ikke kontrollere Supabase-bruker: ${authCheck.error}`, settings: null };
    if (!authCheck.exists) return { error: "Brukeren må opprettes i Supabase Auth før en rolle kan tildeles.", settings: null };
  }

  const now = new Date().toISOString();
  const next: AccessProfile = {
    email,
    displayName,
    role,
    active: Boolean(params.active),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    updatedBy: actorEmail,
  };
  const profiles = current.settings.profiles.filter((profile) => profile.email !== email);
  profiles.push(next);
  profiles.sort((a, b) => a.email.localeCompare(b.email));
  let action: AccessAuditEvent["action"] = "PROFILE_CREATED";
  if (existing && existing.active && !next.active) action = "PROFILE_DEACTIVATED";
  else if (existing && !existing.active && next.active) action = "PROFILE_REACTIVATED";
  else if (existing) action = "PROFILE_UPDATED";
  const auditEvent: AccessAuditEvent = {
    id: crypto.randomUUID(),
    at: now,
    actorEmail,
    action,
    targetEmail: email,
    before: existing,
    after: next,
  };
  const settings: AccessSettings = {
    version: 1,
    profiles,
    audit: [auditEvent, ...current.settings.audit].slice(0, 500),
    updatedAt: now,
  };
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not configured", settings: null };
  const { error } = await supabase
    .from("brand_settings")
    .upsert({ brand_id: ACCESS_SETTINGS_KEY, settings, updated_at: now }, { onConflict: "brand_id" });
  if (error) return { error: error.message, settings: null };
  return { error: null as string | null, settings, profile: next, auditEvent };
}
