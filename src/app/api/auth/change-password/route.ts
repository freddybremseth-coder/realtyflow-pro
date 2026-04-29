import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const session = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  if (!session?.email) {
    return NextResponse.json({ error: "Ikke innlogget." }, { status: 401 });
  }
  const adminEmail = session.email.toLowerCase();

  const { password } = await request.json();
  const nextPassword = String(password || "");
  if (nextPassword.length < 8) {
    return NextResponse.json({ error: "Passordet må være minst 8 tegn." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey);
  const { data, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    return NextResponse.json({ error: "Kunne ikke hente admin-bruker." }, { status: 500 });
  }

  const user = data.users.find((item) => item.email?.toLowerCase() === adminEmail);
  if (!user) {
    return NextResponse.json({ error: "Fant ikke admin-brukeren i Supabase." }, { status: 404 });
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: nextPassword,
    email_confirm: true,
  });

  if (updateError) {
    return NextResponse.json({ error: "Kunne ikke oppdatere passordet." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
