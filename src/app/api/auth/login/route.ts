import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminSession, isAdminEmail } from "@/lib/admin-auth";
import { findAccessProfile } from "@/lib/access-control-server";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 500 });
  }

  const supabase = createClient(url, anonKey);
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    return NextResponse.json({ error: "Feil e-post eller passord." }, { status: 401 });
  }

  let role = "OWNER";
  if (!isAdminEmail(normalizedEmail)) {
    const resolved = await findAccessProfile(normalizedEmail);
    if (resolved.error) {
      return NextResponse.json({ error: "Tilgangsprofilen kunne ikke kontrolleres." }, { status: 503 });
    }
    if (!resolved.profile || !resolved.profile.active) {
      return NextResponse.json({ error: "Denne e-posten har ikke aktiv tilgang til RealtyFlow." }, { status: 403 });
    }
    role = resolved.profile.role;
  }

  const token = await createAdminSession(normalizedEmail, role);
  const res = NextResponse.json({ success: true, role });
  res.cookies.set("realtyflow_admin", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
