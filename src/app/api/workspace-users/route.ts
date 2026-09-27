import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import {
  WORKSPACE_PERMISSIONS, isCanonicalBrandKey, type WorkspacePermission,
} from "@/lib/workspaces/brand-policy";
import {
  getWorkspaceRuntimeState,
  setWorkspaceRuntimeEnabled,
} from "@/lib/workspaces/runtime-control";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type BrandAccess = { brandKey: string; permissions: WorkspacePermission[] };

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}
function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}
function strongPassword(value: unknown) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) return false;
  const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(pattern => pattern.test(value)).length;
  return groups >= 3 && !/[\r\n\0]/.test(value);
}
function validBrandAccess(value: unknown): BrandAccess[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const seen = new Set<string>();
  const result: BrandAccess[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    const brandKey = String(row.brandKey || "");
    const permissions = Array.isArray(row.permissions) ? row.permissions : null;
    if (!isCanonicalBrandKey(brandKey) || seen.has(brandKey) ||
        !permissions || permissions.length < 1 || permissions.length > WORKSPACE_PERMISSIONS.length ||
        new Set(permissions).size !== permissions.length ||
        !permissions.every(permission =>
          typeof permission === "string" &&
          WORKSPACE_PERMISSIONS.includes(permission as WorkspacePermission))) return null;
    const typed = permissions as WorkspacePermission[];
    if (typed.includes("marketing.publish")) return null;
    if (typed.includes("marketing.draft") && !typed.includes("marketing.read")) return null;
    if (brandKey === "zeneco") {
      if (typed.some(permission => permission === "crm.read" || permission === "crm.write") ||
          (typed.includes("crm.joint.write") && !typed.includes("crm.joint.read")) ||
          (typed.some(permission => permission === "tasks.joint.read" || permission === "tasks.joint.write") &&
            !typed.includes("crm.joint.read")) ||
          (typed.includes("tasks.joint.write") && !typed.includes("tasks.joint.read"))) return null;
    } else if (typed.some(permission =>
      ["crm.joint.read", "crm.joint.write", "tasks.joint.read", "tasks.joint.write"].includes(permission))) {
      return null;
    }
    seen.add(brandKey);
    result.push({ brandKey, permissions: typed });
  }
  return result;
}

function safeSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.users) || !Array.isArray(root.brands)) return null;
  const brands = root.brands.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.brand_key !== "string" ||
        !isCanonicalBrandKey(row.brand_key)) return null;
    return {
      id: row.id, brandKey: row.brand_key,
      name: typeof row.display_name === "string" ? row.display_name : row.brand_key,
    };
  }).filter(Boolean);
  const users = root.users.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.user_id !== "string" || !uuid.test(row.user_id) ||
        typeof row.username !== "string" || !usernamePattern.test(row.username) ||
        typeof row.email !== "string" || !emailPattern.test(row.email) ||
        typeof row.display_name !== "string" ||
        !["active", "disabled"].includes(String(row.status)) ||
        !Array.isArray(row.memberships)) return null;
    const memberships = row.memberships.map(membership => {
      if (!membership || typeof membership !== "object" || Array.isArray(membership)) return null;
      const m = membership as Record<string, unknown>;
      if (typeof m.brand_key !== "string" || !isCanonicalBrandKey(m.brand_key) ||
          !Array.isArray(m.permissions) ||
          !m.permissions.every(permission =>
            typeof permission === "string" &&
            WORKSPACE_PERMISSIONS.includes(permission as WorkspacePermission))) return null;
      return {
        brandId: typeof m.brand_id === "string" ? m.brand_id : "",
        brandKey: m.brand_key,
        brandName: typeof m.brand_name === "string" ? m.brand_name : m.brand_key,
        status: m.status === "active" ? "active" : m.status === "revoked" ? "revoked" : "disabled",
        permissions: m.permissions as WorkspacePermission[],
        updatedAt: typeof m.updated_at === "string" ? m.updated_at : null,
      };
    }).filter(Boolean);
    return {
      userId: row.user_id, username: row.username, email: row.email,
      displayName: row.display_name, status: row.status,
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
      memberships,
    };
  }).filter(Boolean);
  return { users, brands };
}

async function ownerContext(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  if (!context) return { context: null, response: reply({ error: "AUTH_REQUIRED" }, 401) };
  if (context.role !== "OWNER" || context.source !== "owner-session") {
    return { context: null, response: reply({ error: "OWNER_REQUIRED" }, 403) };
  }
  return { context, response: null };
}

async function loadSnapshot(supabase: NonNullable<ReturnType<typeof getPlatformSupabase>>) {
  const { data, error } = await supabase.rpc("workspace_user_admin_snapshot");
  if (error) return { snapshot: null, error: error.message || "WORKSPACE_USERS_UNAVAILABLE" };
  const snapshot = safeSnapshot(data);
  return snapshot ? { snapshot, error: null } : { snapshot: null, error: "INVALID_WORKSPACE_USER_SNAPSHOT" };
}

export async function GET(request: NextRequest) {
  const owner = await ownerContext(request);
  if (!owner.context) return owner.response;
  const supabase = getPlatformSupabase();
  if (!supabase) return reply({ error: "WORKSPACE_USERS_UNAVAILABLE" }, 503);
  const { snapshot, error } = await loadSnapshot(supabase);
  if (error || !snapshot) return reply({ error: "WORKSPACE_USERS_UNAVAILABLE" }, 503);
  const runtime = await getWorkspaceRuntimeState(supabase);
  return reply({
    ok: true, ...snapshot,
    featureEnabled: runtime.enabled,
    featureStatus: runtime.error ? "unavailable" : "ready",
    passwordStorage: "supabase-auth-only",
  });
}

export async function POST(request: NextRequest) {
  const owner = await ownerContext(request);
  if (!owner.context) return owner.response;
  if (!safeWrite(request)) return reply({ error: "INVALID_REQUEST_ORIGIN" }, 403);
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input))
    return reply({ error: "INVALID_REQUEST" }, 400);
  const body = input as Record<string, unknown>;
  const action = String(body.action || "");
  const supabase = getPlatformSupabase();
  if (!supabase) return reply({ error: "WORKSPACE_USERS_UNAVAILABLE" }, 503);

  if (action === "SET_LOGIN_ENABLED") {
    if (typeof body.enabled !== "boolean") {
      return reply({ error: "INVALID_RUNTIME_CONFIGURATION" }, 400);
    }
    const runtime = await setWorkspaceRuntimeEnabled({
      client: supabase,
      enabled: body.enabled,
      actor: owner.context.email,
    });
    if (!runtime.ok) {
      return reply({
        error: runtime.error,
        message: runtime.error === "WORKSPACE_SECURITY_PREFLIGHT_FAILED"
          ? "Sikkerhetskontrollen er ikke grønn, så medarbeiderinnlogging kan ikke aktiveres."
          : "Kunne ikke oppdatere medarbeiderinnloggingen.",
      }, runtime.error === "WORKSPACE_SECURITY_PREFLIGHT_FAILED" ? 409 : 503);
    }
    return reply({ ok: true, featureEnabled: runtime.enabled });
  }

  if (action === "CREATE_USER") {
    const username = String(body.username || "").trim().toLowerCase();
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.displayName || "").trim();
    const password = body.password;
    const brandAccess = validBrandAccess(body.brandAccess);
    if (!usernamePattern.test(username)) {
      return reply({
        error: "INVALID_USERNAME",
        field: "username",
        message: "Brukernavn må være 3–32 tegn og kan bare inneholde a–z, 0–9, punktum, bindestrek eller understrek.",
      }, 400);
    }
    if (!emailPattern.test(email) || email.length > 254) {
      return reply({ error: "INVALID_EMAIL", field: "email", message: "Oppgi en gyldig e-postadresse." }, 400);
    }
    if (!displayName || displayName.length > 120) {
      return reply({ error: "INVALID_DISPLAY_NAME", field: "displayName", message: "Navn må være mellom 1 og 120 tegn." }, 400);
    }
    if (!strongPassword(password)) {
      return reply({
        error: "WEAK_PASSWORD",
        field: "password",
        message: "Passordet må være 12–128 tegn og inneholde minst tre av: små bokstaver, store bokstaver, tall og symbol.",
      }, 400);
    }
    if (!brandAccess) {
      return reply({
        error: "INVALID_BRAND_ACCESS",
        field: "brandAccess",
        message: "Velg minst én gyldig merkevare og minst ett tillatt program for hver valgt merkevare.",
      }, 400);
    }

    const { snapshot: beforeCreate, error: beforeCreateError } = await loadSnapshot(supabase);
    if (beforeCreateError || !beforeCreate) return reply({ error: "WORKSPACE_USERS_UNAVAILABLE" }, 503);
    if (beforeCreate.users.some((user: any) =>
      user.username === username || user.email === email)) {
      return reply({ error: "WORKSPACE_USER_ALREADY_EXISTS" }, 409);
    }
    const knownBrands = new Set(beforeCreate.brands.map((brand: any) => brand.brandKey));
    if (brandAccess.some(item => !knownBrands.has(item.brandKey))) {
      return reply({ error: "UNKNOWN_BRAND" }, 400);
    }

    const { data: created, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: password as string,
      email_confirm: true,
      user_metadata: { username, display_name: displayName, account_type: "realtyflow_workspace" },
    });
    if (authError || !created.user?.id) {
      return reply({ error: "AUTH_USER_CREATE_FAILED" }, authError?.status === 422 ? 409 : 503);
    }

    const { data: configured, error: configureError } = await supabase.rpc("workspace_user_configure", {
      p_user_id: created.user.id,
      p_username: username,
      p_email: email,
      p_display_name: displayName,
      p_brand_access: brandAccess.map(item => ({
        brandKey: item.brandKey, permissions: item.permissions,
      })),
      p_actor: owner.context.email,
    });
    if (configureError || configured !== true) {
      const rollback = await supabase.auth.admin.deleteUser(created.user.id).catch(() => ({ error: new Error("rollback failed") } as any));
      if (rollback?.error) {
        return reply({ error: "WORKSPACE_USER_CONFIGURE_FAILED_ROLLBACK_REQUIRED" }, 500);
      }
      return reply({ error: "WORKSPACE_USER_CONFIGURE_FAILED" }, configureError ? 503 : 409);
    }
    const runtime = await getWorkspaceRuntimeState(supabase);
    return reply({
      ok: true,
      user: { userId: created.user.id, username, email, displayName, status: "active" },
      passwordStoredInRealtyFlow: false,
      loginEnabled: runtime.enabled,
    }, 201);
  }

  const userId = String(body.userId || "");
  if (!uuid.test(userId)) return reply({ error: "INVALID_USER_ID" }, 400);
  const { snapshot, error: snapshotError } = await loadSnapshot(supabase);
  if (snapshotError || !snapshot) return reply({ error: "WORKSPACE_USERS_UNAVAILABLE" }, 503);
  const existing = snapshot.users.find((user: any) => user.userId === userId);
  if (!existing) return reply({ error: "WORKSPACE_USER_NOT_FOUND" }, 404);

  if (action === "UPDATE_ACCESS") {
    const username = String(body.username || existing.username).trim().toLowerCase();
    const displayName = String(body.displayName || existing.displayName).trim();
    const brandAccess = validBrandAccess(body.brandAccess);
    if (!usernamePattern.test(username)) {
      return reply({
        error: "INVALID_USERNAME",
        field: "username",
        message: "Brukernavn må være 3–32 tegn og kan bare inneholde a–z, 0–9, punktum, bindestrek eller understrek.",
      }, 400);
    }
    if (!displayName || displayName.length > 120) {
      return reply({ error: "INVALID_DISPLAY_NAME", field: "displayName", message: "Navn må være mellom 1 og 120 tegn." }, 400);
    }
    if (!brandAccess) {
      return reply({
        error: "INVALID_BRAND_ACCESS",
        field: "brandAccess",
        message: "Velg minst én gyldig merkevare og minst ett tillatt program for hver valgt merkevare.",
      }, 400);
    }
    const knownBrands = new Set(snapshot.brands.map((brand: any) => brand.brandKey));
    if (brandAccess.some(item => !knownBrands.has(item.brandKey))) {
      return reply({ error: "UNKNOWN_BRAND" }, 400);
    }
    if (snapshot.users.some((user: any) =>
      user.userId !== userId && user.username === username)) {
      return reply({ error: "USERNAME_ALREADY_EXISTS" }, 409);
    }
    const { data: authResult, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError || !authResult.user ||
        authResult.user.email?.trim().toLowerCase() !== existing.email) {
      return reply({ error: "AUTH_IDENTITY_MISMATCH" }, 409);
    }
    const { data, error } = await supabase.rpc("workspace_user_configure", {
      p_user_id: userId,
      p_username: username,
      p_email: existing.email,
      p_display_name: displayName,
      p_brand_access: brandAccess.map(item => ({
        brandKey: item.brandKey, permissions: item.permissions,
      })),
      p_actor: owner.context.email,
    });
    if (error || data !== true) return reply({ error: "WORKSPACE_USER_CONFIGURE_FAILED" }, error ? 503 : 409);
    return reply({ ok: true, userId, username, displayName });
  }

  if (action === "SET_PASSWORD") {
    if (!strongPassword(body.password)) return reply({ error: "WEAK_PASSWORD" }, 400);
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: body.password as string,
    });
    if (error) return reply({ error: "PASSWORD_UPDATE_FAILED" }, 503);
    return reply({ ok: true, userId, passwordStoredInRealtyFlow: false });
  }

  if (action === "DISABLE_USER") {
    const { data, error } = await supabase.rpc("workspace_user_disable", {
      p_user_id: userId, p_actor: owner.context.email,
    });
    if (error || data !== true) return reply({ error: "WORKSPACE_USER_DISABLE_FAILED" }, error ? 503 : 409);
    return reply({ ok: true, userId, status: "disabled" });
  }

  return reply({ error: "INVALID_ACTION" }, 400);
}
