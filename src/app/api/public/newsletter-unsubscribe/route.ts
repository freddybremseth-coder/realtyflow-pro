import { NextRequest, NextResponse } from "next/server";
import { getPlatformSupabase } from "@/lib/platform/supabase";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const token = String(request.nextUrl.searchParams.get("token") || "").trim();
  if (!uuid.test(token)) return new NextResponse("Ugyldig avmeldingslenke.", { status: 400 });
  const supabase = getPlatformSupabase();
  if (!supabase) return new NextResponse("Tjenesten er midlertidig utilgjengelig.", { status: 503 });
  const now = new Date().toISOString();
  const { data, error } = await supabase.schema("core").from("workspace_newsletter_subscribers")
    .update({ status: "unsubscribed", unsubscribed_at: now, updated_at: now })
    .eq("unsubscribe_token", token).select("id").maybeSingle();
  if (error) return new NextResponse("Avmelding kunne ikke registreres.", { status: 503 });
  return new NextResponse(data
    ? "Du er nå avmeldt nyhetsbrevet."
    : "Denne avmeldingslenken er allerede brukt eller finnes ikke.", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
}
