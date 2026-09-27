import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminSession, isAdminEmail } from "@/lib/admin-auth";
import { findAccessProfile } from "@/lib/access-control-server";
import { admitWorkspaceMemberLogin } from "@/lib/workspaces/login-admission";
import { resolveWorkspaceLogin } from "@/lib/workspaces/user-directory";

const HOME_BY_ROLE: Record<string, string> = {
  OWNER: "/",
  SALES: "/today",
  CLOSING: "/closing",
  FINANCE: "/monthly-close",
  MARKETING: "/attribution",
  KEYHOLDING: "/care",
  VIEWER: "/revenue-command",
  WORKSPACE_MEMBER: "/workspace",
};

export async function POST(request: NextRequest) {
  const { login, email, password } = await request.json();
  const suppliedLogin = String(login || email || "").trim().toLowerCase();
  if (!suppliedLogin || !password) {
    return NextResponse.json({ error: "Brukernavn/e-post og passord er påkrevd." }, { status: 400 });
  }

  let normalizedEmail = suppliedLogin;
  let directoryUser: Awaited<ReturnType<typeof resolveWorkspaceLogin>>["user"] = null;
  if (!suppliedLogin.includes("@")) {
    const resolvedLogin = await resolveWorkspaceLogin(suppliedLogin);
    if (resolvedLogin.error) {
      return NextResponse.json({ error: "Innloggingstjenesten kunne ikke verifiseres akkurat nå." }, { status: 503 });
    }
    if (!resolvedLogin.user || resolvedLogin.user.status !== "active") {
      return NextResponse.json({ error: "Feil brukernavn/e-post eller passord." }, { status: 401 });
    }
    directoryUser = resolvedLogin.user;
    normalizedEmail = resolvedLogin.user.email;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 500 });

  const supabase = createClient(url, anonKey);
  const { data: authData, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
  if (error || !authData.user?.id)
    return NextResponse.json({ error: "Feil brukernavn/e-post eller passord." }, { status: 401 });

  let role = "OWNER";
  if (!isAdminEmail(normalizedEmail)) {
    let directoryError: string | null = null;
    if (!directoryUser) {
      const resolvedDirectory = await resolveWorkspaceLogin(normalizedEmail);
      directoryUser = resolvedDirectory.user;
      directoryError = resolvedDirectory.error;
    }

    if (directoryUser) {
      if (directoryUser.status !== "active" ||
          directoryUser.email !== normalizedEmail ||
          directoryUser.userId !== authData.user.id) {
        return NextResponse.json({ error: "Denne kontoen har ikke aktiv tilgang til RealtyFlow." }, { status: 403 });
      }
      role = "WORKSPACE_MEMBER";
      const admission = await admitWorkspaceMemberLogin(normalizedEmail, authData.user.id);
      if (!admission.ok) {
        if (admission.reason === "UNAVAILABLE") {
          return NextResponse.json({ error: "Arbeidsområdet kunne ikke verifiseres akkurat nå." }, { status: 503 });
        }
        return NextResponse.json({
          error: admission.reason === "DISABLED"
            ? "Arbeidsområdet er ikke aktivert for medarbeidere ennå."
            : "Denne kontoen har ingen aktiv, verifisert merkevaretilgang.",
        }, { status: 403 });
      }
    } else {
      // Legacy global roles remain supported, but a managed workspace account
      // no longer depends on the old access-control profile store.
      const legacy = await findAccessProfile(normalizedEmail);
      if (legacy.error) {
        return NextResponse.json({
          error: directoryError
            ? "Tilgangstjenestene kunne ikke kontrolleres akkurat nå."
            : "Tilgangsprofilen kunne ikke kontrolleres.",
        }, { status: 503 });
      }
      if (!legacy.profile?.active || legacy.profile.role === "WORKSPACE_MEMBER") {
        return NextResponse.json({ error: "Denne kontoen har ikke aktiv tilgang til RealtyFlow." }, { status: 403 });
      }
      role = legacy.profile.role;
    }
  }

  const token = await createAdminSession(normalizedEmail, role);
  const res = NextResponse.json({ success: true, role, homePath: HOME_BY_ROLE[role] || "/revenue-command" });
  res.cookies.set("realtyflow_admin", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
