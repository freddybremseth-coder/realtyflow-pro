import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminSession, isAdminEmail } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!isAdminEmail(normalizedEmail)) {
    return NextResponse.json({ error: "Denne e-posten har ikke tilgang til RealtyFlow." }, { status: 403 });
  }

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

  const token = await createAdminSession(normalizedEmail);
  const res = NextResponse.json({ success: true });
  res.cookies.set("realtyflow_admin", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
