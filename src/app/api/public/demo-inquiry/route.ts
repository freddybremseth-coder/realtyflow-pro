import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendBrandEmail } from "@/services/email/send-brand-email";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/public/demo-inquiry — the working contact form on public demo
 * previews. This is the "living demo" conversion trick: a visitor inquiry
 * during the trial period lands as a REAL lead in the demo owner's inbox,
 * which is the strongest possible argument for buying the site.
 *
 * Stored as a `demo_inquiry` event on the order (no new tables), and
 * forwarded by e-mail to the demo customer best-effort.
 */

const EMAIL_BRAND_ID = process.env.DEMOSITES_EMAIL_BRAND_ID || "chatgenius";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function clean(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function isInternalImportEmail(value: string) {
  return /^demosites-import\+[^@\s]+@chatgenius\.pro$/i.test(value.trim());
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const token = clean(body.token, 80);
    const name = clean(body.name, 120);
    const email = clean(body.email, 160);
    const phone = clean(body.phone, 40);
    const message = clean(body.message, 2000);

    if (!token) return NextResponse.json({ error: "Ugyldig demo." }, { status: 400 });
    if (!name || (!email && !phone)) {
      return NextResponse.json({ error: "Fyll inn navn og e-post eller telefon." }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "Tjenesten er ikke tilgjengelig." }, { status: 503 });

    const { data: order } = await supabase
      .from("demo_site_orders")
      .select("id, company_name, customer_email")
      .eq("claim_token", token)
      .maybeSingle();

    if (!order) return NextResponse.json({ error: "Fant ikke demoen." }, { status: 404 });

    const { error: insertError } = await supabase.from("demo_site_order_events").insert({
      order_id: order.id,
      event_type: "demo_inquiry",
      title: `Henvendelse fra ${name}`,
      description: message || "(ingen melding)",
      metadata: { name, email, phone, message, via: "demo-preview-form" },
    });
    if (insertError) {
      return NextResponse.json({ error: "Kunne ikke lagre henvendelsen. Prøv igjen." }, { status: 500 });
    }

    // Forward to the demo owner — a real lead in their inbox sells the site.
    const ownerEmail = String(order.customer_email || "");
    if (ownerEmail && !isInternalImportEmail(ownerEmail)) {
      await sendBrandEmail(supabase as never, {
        brandId: EMAIL_BRAND_ID,
        to: [ownerEmail],
        subject: `Ny henvendelse via demosiden til ${order.company_name}`,
        bodyText: `Hei,

Demosiden deres virker allerede — dere har fått en henvendelse:

Navn: ${name}
${email ? `E-post: ${email}\n` : ""}${phone ? `Telefon: ${phone}\n` : ""}${message ? `\nMelding:\n${message}\n` : ""}
Dette er en ekte kunde som fant dere via den nye demosiden. Følg gjerne opp direkte.

Vennlig hilsen
ChatGenius DemoSites`,
      }).catch((err) => {
        console.warn("[Demo Inquiry] Forward email failed:", err instanceof Error ? err.message : err);
        return { success: false as const };
      });
    }

    // Alert the sales team too — a visitor inquiry means the lead is HOT.
    const salesEmail = process.env.DEMOSITES_SALES_EMAIL || "post@chatgenius.pro";
    await sendBrandEmail(supabase as never, {
      brandId: EMAIL_BRAND_ID,
      to: [salesEmail],
      subject: `🔥 Varm lead: henvendelse på prøvesiden til ${order.company_name}`,
      bodyText: `Prøvesiden til ${order.company_name} fikk nettopp en henvendelse fra ${name}${phone ? ` (${phone})` : ""}${email ? ` <${email}>` : ""}.

${message ? `Melding:
${message}

` : ""}Dette er et godt tidspunkt å ringe kunden på — demoen deres skaper allerede verdi.`,
    }).catch(() => ({ success: false as const }));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Demo Inquiry] Error:", error);
    return NextResponse.json({ error: "Noe gikk galt. Prøv igjen." }, { status: 500 });
  }
}
