import { NextRequest, NextResponse } from "next/server";
import {
  createWorkspacePreviewSession,
  verifyAdminSession,
  WORKSPACE_PREVIEW_COOKIE,
  isAdminEmail,
} from "@/lib/admin-auth";
import { verifyWorkspaceDirectorySession } from "@/lib/workspaces/user-directory";
import { admitWorkspaceMemberLogin } from "@/lib/workspaces/login-admission";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

function clearPreview(response: NextResponse) {
  response.cookies.set(WORKSPACE_PREVIEW_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function POST(request: NextRequest) {
  if (!safeWrite(request)) return reply({ error: "INVALID_REQUEST_ORIGIN" }, 403);
  const owner = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  if (!owner || owner.role !== "OWNER" || !isAdminEmail(owner.email)) {
    return reply({ error: "OWNER_REQUIRED" }, 403);
  }
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return reply({ error: "INVALID_REQUEST" }, 400);
  }
  const body = input as Record<string, unknown>;
  const action = String(body.action || "");

  if (action === "STOP") {
    return clearPreview(reply({ ok: true, preview: null }));
  }
  if (action !== "START") return reply({ error: "INVALID_ACTION" }, 400);

  const targetEmail = String(body.targetEmail || "").trim().toLowerCase();
  if (!targetEmail || targetEmail.length > 254 || !targetEmail.includes("@")) {
    return reply({ error: "INVALID_TARGET" }, 400);
  }
  if (isAdminEmail(targetEmail)) return reply({ error: "INVALID_TARGET" }, 400);

  const verified = await verifyWorkspaceDirectorySession(targetEmail);
  if (verified.error || !verified.user || verified.user.status !== "active") {
    return reply({ error: "WORKSPACE_PREVIEW_TARGET_UNAVAILABLE" }, 409);
  }
  const admission = await admitWorkspaceMemberLogin(verified.user.email, verified.user.userId);
  if (!admission.ok) {
    return reply({
      error: "WORKSPACE_PREVIEW_TARGET_UNAVAILABLE",
      reason: admission.reason,
      message: admission.reason === "DISABLED"
        ? "Workspace-innlogging må være aktivert før visningen kan forhåndsvises."
        : "Brukeren mangler en aktiv og verifisert merkevaretilgang.",
    }, 409);
  }

  const token = await createWorkspacePreviewSession(
    owner.email,
    verified.user.email,
    verified.user.displayName,
  );
  const response = reply({
    ok: true,
    preview: {
      active: true,
      targetEmail: verified.user.email,
      targetDisplayName: verified.user.displayName,
      readOnly: true,
    },
    activeBrands: admission.activeBrands,
    homePath: "/workspace",
  });
  response.cookies.set(WORKSPACE_PREVIEW_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });
  return response;
}
