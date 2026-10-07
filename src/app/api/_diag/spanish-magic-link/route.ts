import { NextResponse } from "next/server";

const AUTH_URL = "https://ereapsfcsqtdmzosgnnn.supabase.co/auth/v1/otp";
const PUBLISHABLE_KEY = "sb_publishable_KTywNu5kx3HfcOLInKOUjA_5Py79jZm";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "freddy.bremseth@gmail.com",
      create_user: false,
      redirect_to: "https://spanish.chatgenius.pro",
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const body = await response.text();
  return NextResponse.json({
    ok: response.ok,
    status: response.status,
    body: body.slice(0, 500),
  }, { status: response.ok ? 200 : 502 });
}
