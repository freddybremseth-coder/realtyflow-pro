export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendBrandEmail } from "@/services/email/send-brand-email";

/**
 * Manuell SMTP-test. Sender ÉN e-post til en valgt adresse for å bekrefte at
 * merkets SMTP-config faktisk virker – før vi rører ekte leads.
 *
 * Bruk (i nettleser, krever CRON_SECRET):
 *   /api/email/test?key=<CRON_SECRET>&brand=zeneco&to=mail@extrade.es
 *
 * Default `to` er mail@extrade.es. Sender aldri til andre uten at du oppgir det.
 */
async function handle(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") || "";
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brandId = searchParams.get("brand") || "zeneco";
  const to = searchParams.get("to") || "mail@extrade.es";

  const supabase = createServerClient();
  const stamp = new Date().toLocaleString("nb-NO");

  const result = await sendBrandEmail(supabase, {
    brandId,
    to: [to],
    subject: `RealtyFlow SMTP-test (${brandId}) – ${stamp}`,
    bodyText: `Dette er en testmelding fra RealtyFlow nurture-motoren.\n\nHvis du leser dette, virker SMTP-sending for "${brandId}".\n\nTidspunkt: ${stamp}`,
  });

  if (!result.success) {
    return NextResponse.json(
      { success: false, skipped: result.skipped, error: result.error, brandId, to },
      { status: result.skipped ? 404 : 500 }
    );
  }

  return NextResponse.json({ success: true, brandId, to, messageId: result.messageId });
}

export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}
