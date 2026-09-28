import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin-auth";
import { findAccessProfile } from "@/lib/access-control-server";
import { resolveWorkspaceLogin } from "@/lib/workspaces/user-directory";

export async function POST(request: NextRequest) {
  const { email } = await request.json();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  let allowed = isAdminEmail(normalizedEmail);
  if (!allowed && normalizedEmail) {
    const workspace = await resolveWorkspaceLogin(normalizedEmail);
    if (!workspace.error && workspace.user?.status === "active" && workspace.user.email === normalizedEmail) {
      allowed = true;
    } else if (!workspace.user) {
      const resolved = await findAccessProfile(normalizedEmail);
      allowed = Boolean(!resolved.error && resolved.profile?.active);
    }
  }
  // Do not reveal whether an email exists or has access.
  if (!allowed) return NextResponse.json({ success: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 500 });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "");
  const supabase = createClient(url, anonKey);
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: `${appUrl}/reset-password?workspace=1` });
  if (error) return NextResponse.json({ error: "Kunne ikke sende lenke for nytt passord." }, { status: 500 });
  return NextResponse.json({ success: true });
}
