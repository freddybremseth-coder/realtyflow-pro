import { NextRequest, NextResponse } from "next/server";
import { getAdminEmails } from "@/lib/admin-auth";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import {
  ACCESS_ROLES,
  ACCESS_ROLE_LABELS,
  ROLE_PERMISSIONS,
  normalizeEmail,
  normalizeRole,
} from "@/lib/access-control";
import { loadAccessSettings, saveAccessProfile } from "@/lib/access-control-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { settings: null });
  if (denied) return denied;
  const result = await loadAccessSettings();
  if (result.error) return NextResponse.json({ error: result.error, settings: null }, { status: 500 });
  return NextResponse.json({
    settings: result.settings,
    owners: getAdminEmails().map((email) => ({ email, role: "OWNER", active: true })),
    roles: ACCESS_ROLES.map((role) => ({
      id: role,
      label: ACCESS_ROLE_LABELS[role],
      permissions: ROLE_PERMISSIONS[role],
      assignable: role !== "OWNER",
    })),
    safety: {
      ownerOnlyChanges: true,
      existingSupabaseUserRequired: true,
      automaticInvites: false,
      automaticEmail: false,
    },
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const context = await getRequestAccessContext(request);
  if (!context || context.role !== "OWNER") return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "UPSERT_PROFILE").trim().toUpperCase();
  if (action !== "UPSERT_PROFILE") return NextResponse.json({ error: "Unsupported access-control action" }, { status: 400 });
  const email = normalizeEmail(body.email);
  const role = normalizeRole(body.role);
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Gyldig e-post mangler." }, { status: 400 });
  if (getAdminEmails().includes(email)) return NextResponse.json({ error: "Owner-profiler styres av REALTYFLOW_ADMIN_EMAILS og kan ikke endres her." }, { status: 400 });
  if (!role || role === "OWNER") return NextResponse.json({ error: "Velg en tillatt rolle." }, { status: 400 });

  const result = await saveAccessProfile({
    actorEmail: context.email,
    email,
    displayName: body.displayName,
    role,
    active: body.active !== false,
  });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, profile: result.profile, auditEvent: result.auditEvent, settings: result.settings });
}
