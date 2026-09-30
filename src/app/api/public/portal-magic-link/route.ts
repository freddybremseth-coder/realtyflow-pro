import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { sendBrandEmail } from "@/services/email/send-brand-email";

export const dynamic = "force-dynamic";

const PORTAL_BASE = "https://www.zenecohomes.com";

function normalizeLocale(value: unknown) {
  const locale = String(value || "no").toLowerCase();
  return ["no", "en", "de", "es"].includes(locale) ? locale : "no";
}

function portalPath(locale: string) {
  if (locale === "en") return "/en/min-side";
  if (locale === "de") return "/de/min-side";
  if (locale === "es") return "/es/mi-area";
  return "/min-side";
}

function callbackUrl(tokenHash: string, locale: string) {
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: "magiclink",
    next: portalPath(locale),
  });
  return `${PORTAL_BASE}/auth/callback?${params.toString()}`;
}

export async function POST(request: NextRequest) {
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ success: true });

  const body = await request.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  const locale = normalizeLocale(body?.locale);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ success: true });
  }

  let { data: portalUser } = await supabase
    .from("portal_users")
    .select("contact_id,email,status,brand_id")
    .ilike("email", email)
    .eq("brand_id", "zeneco")
    .in("status", ["invited", "active"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!portalUser) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id,name,email,brand_id,brand,pipeline_status,email_suppressed,do_not_contact")
      .ilike("email", email)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const contactBrand = String(contact?.brand_id || contact?.brand || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const allowedBrand = ["zeneco", "zenecohomes"].includes(contactBrand);
    const blocked = String(contact?.pipeline_status || "").toUpperCase() === "LOST" || contact?.email_suppressed || contact?.do_not_contact;

    if (!contact || !allowedBrand || blocked) {
      return NextResponse.json({ success: true });
    }

    const now = new Date().toISOString();
    const { error: portalError } = await supabase
      .from("portal_users")
      .upsert({
        contact_id: contact.id,
        email,
        name: contact.name || null,
        brand_id: "zeneco",
        role: "customer",
        status: "active",
        invited_at: now,
        updated_at: now,
      }, { onConflict: "contact_id" });

    if (portalError) {
      console.warn("[portal-magic-link] portal auto-provision failed", portalError.message);
      return NextResponse.json({ success: true });
    }

    portalUser = {
      contact_id: contact.id,
      email,
      status: "active",
      brand_id: "zeneco",
    };
  }

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      data: {
        contact_id: portalUser.contact_id,
        brand_id: "zeneco",
        role: "customer",
        portal: true,
      },
    },
  });

  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.warn("[portal-magic-link] generateLink failed", linkError?.message || "missing hashed token");
    return NextResponse.json({ success: true });
  }

  const link = callbackUrl(tokenHash, locale);
  const subject = locale === "en"
    ? "Your secure sign-in link | Zen Eco Homes"
    : locale === "de"
      ? "Ihr sicherer Login-Link | Zen Eco Homes"
      : locale === "es"
        ? "Tu enlace seguro de acceso | Zen Eco Homes"
        : "Din sikre innloggingslenke | Zen Eco Homes";

  const bodyText = locale === "en"
    ? `Use this secure link to open My account at Zen Eco Homes:\n\n${link}\n\nThe link is personal. If you did not request it, you can ignore this email.\n\nZen Eco Homes`
    : locale === "de"
      ? `Mit diesem sicheren Link öffnen Sie Ihren persönlichen Bereich bei Zen Eco Homes:\n\n${link}\n\nDer Link ist persönlich. Wenn Sie ihn nicht angefordert haben, können Sie diese E-Mail ignorieren.\n\nZen Eco Homes`
      : locale === "es"
        ? `Usa este enlace seguro para abrir tu área personal de Zen Eco Homes:\n\n${link}\n\nEl enlace es personal. Si no lo solicitaste, puedes ignorar este correo.\n\nZen Eco Homes`
        : `Bruk denne sikre lenken for å åpne Min side hos Zen Eco Homes:\n\n${link}\n\nLenken er personlig. Hvis du ikke ba om den, kan du se bort fra denne e-posten.\n\nZen Eco Homes`;

  const bodyHtml = `<p>${locale === "no" ? "Bruk denne sikre lenken for å åpne Min side hos Zen Eco Homes:" : locale === "en" ? "Use this secure link to open My account at Zen Eco Homes:" : locale === "de" ? "Mit diesem sicheren Link öffnen Sie Ihren persönlichen Bereich bei Zen Eco Homes:" : "Usa este enlace seguro para abrir tu área personal de Zen Eco Homes:"}</p><p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#17232c;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">${locale === "no" ? "Åpne Min side" : locale === "en" ? "Open My account" : locale === "de" ? "Mein Bereich öffnen" : "Abrir mi área"}</a></p><p style="color:#667085;">${locale === "no" ? "Lenken er personlig. Hvis du ikke ba om den, kan du se bort fra denne e-posten." : locale === "en" ? "The link is personal. If you did not request it, you can ignore this email." : locale === "de" ? "Der Link ist persönlich. Wenn Sie ihn nicht angefordert haben, können Sie diese E-Mail ignorieren." : "El enlace es personal. Si no lo solicitaste, puedes ignorar este correo."}</p><p>Zen Eco Homes</p>`;

  const sendResult = await sendBrandEmail(supabase, {
    brandId: "zeneco",
    to: [email],
    subject,
    bodyText,
    bodyHtml,
    fromName: "Zen Eco Homes",
    allowSuppressed: true,
  });

  if (!sendResult.success) {
    console.warn("[portal-magic-link] sendBrandEmail failed", sendResult.error || "unknown");
  }

  return NextResponse.json({ success: true });
}
