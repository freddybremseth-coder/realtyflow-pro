import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { sendBrandEmail } from "@/services/email/send-brand-email";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function firstText(...values: unknown[]) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function normalizeBrandId(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["zeneco", "zenecohomes"].includes(normalized)) return "zeneco";
  if (["pinoso", "pinosoecolife"].includes(normalized)) return "pinosoecolife";
  return value || "zeneco";
}

function portalUrlForBrand(brandId: string) {
  const configured = process.env.CUSTOMER_PORTAL_URL?.trim();
  if (configured) return configured;
  if (brandId === "pinosoecolife") return "https://www.pinosoecolife.com/min-side";
  return "https://www.zenecohomes.com/min-side";
}

function brandLabel(brandId: string) {
  return brandId === "pinosoecolife" ? "Pinoso Eco Life" : "Zen Eco Homes";
}

function inviteCopy(input: { name?: string | null; brandId: string; actionLink: string }) {
  const name = String(input.name || "").trim();
  const greeting = name ? `Hei ${name},` : "Hei,";
  const brand = brandLabel(input.brandId);
  return {
    subject: `Din Min side hos ${brand}`,
    bodyText: `${greeting}\n\nJeg har gjort Min side klar for deg. Der kan du samle boligene vi vurderer, markere hva som er interessant eller ikke passer, oppdatere boligønskene dine og holde dialogen samlet.\n\nÅpne Min side:\n${input.actionLink}\n\nLenken er personlig. Hvis den har utløpt når du åpner den, kan vi sende en ny.\n\nMed vennlig hilsen\nFreddy Bremseth\n${brand}`,
    bodyHtml: `<p>${greeting}</p><p>Jeg har gjort <strong>Min side</strong> klar for deg. Der kan du samle boligene vi vurderer, markere hva som er interessant eller ikke passer, oppdatere boligønskene dine og holde dialogen samlet.</p><p><a href="${input.actionLink}">Åpne Min side</a></p><p>Lenken er personlig. Hvis den har utløpt når du åpner den, kan vi sende en ny.</p><p>Med vennlig hilsen<br>Freddy Bremseth<br>${brand}</p>`,
  };
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const contactId = String(body.contactId || "").trim();
  const sendInvite = body.sendInvite !== false;
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,email_suppressed,do_not_contact,interactions")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) return NextResponse.json({ error: contactError?.message || "Contact not found" }, { status: 404 });
  if (!contact.email) return NextResponse.json({ error: "Contact needs an email address before portal access can be granted" }, { status: 400 });

  const pipelineStatus = String(contact.pipeline_status || "").toUpperCase();
  if (pipelineStatus === "LOST") return NextResponse.json({ error: "Portal invite blocked because contact is LOST" }, { status: 409 });
  if (contact.do_not_contact || contact.email_suppressed) return NextResponse.json({ error: "Portal invite blocked by CRM suppression" }, { status: 409 });

  const brandId = normalizeBrandId(firstText(contact.brand_id, contact.brand, "zeneco"));
  const redirectTo = portalUrlForBrand(brandId);
  const now = new Date().toISOString();

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: String(contact.email).trim().toLowerCase(),
    data: {
      contact_id: contact.id,
      brand_id: brandId,
      name: contact.name,
      role: "customer",
      portal: true,
    },
    redirectTo,
  });

  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });
  const actionLink = linkData?.properties?.action_link;
  const authUserId = linkData?.user?.id || null;
  if (!actionLink) return NextResponse.json({ error: "Supabase did not return a portal activation link" }, { status: 500 });

  const { data: portalUser, error: portalError } = await supabase
    .from("portal_users")
    .upsert({
      contact_id: contact.id,
      auth_user_id: authUserId,
      email: String(contact.email).trim().toLowerCase(),
      name: contact.name || null,
      brand_id: brandId,
      role: "customer",
      status: "invited",
      invited_at: now,
      updated_at: now,
    }, { onConflict: "contact_id" })
    .select("id,contact_id,email,name,brand_id,status,invited_at,last_login_at")
    .single();

  if (portalError) return NextResponse.json({ error: portalError.message }, { status: 500 });

  let emailSent = false;
  let emailError: string | null = null;
  if (sendInvite) {
    const copy = inviteCopy({ name: contact.name, brandId, actionLink });
    const sendResult = await sendBrandEmail(supabase, {
      brandId,
      to: [String(contact.email)],
      subject: copy.subject,
      bodyText: copy.bodyText,
      bodyHtml: copy.bodyHtml,
    });
    emailSent = sendResult.success;
    emailError = sendResult.success ? null : sendResult.error || "Portal invitation email failed";
  }

  const existingInteractions = Array.isArray(contact.interactions) ? contact.interactions : [];
  const interaction = {
    id: `portal_invite_${Date.now()}`,
    type: "note",
    source: "min-side",
    direction: "out",
    content: emailSent
      ? `Min side-invitasjon sendt til ${contact.email}. Personlig magic-link opprettet; ingen midlertidig passord brukes.`
      : `Min side-invitasjon opprettet for ${contact.email}, men e-post ble ikke sendt${emailError ? `: ${emailError}` : "."}`,
    date: now.split("T")[0],
  };
  await supabase.from("contacts").update({
    interactions: [interaction, ...existingInteractions],
    updated_at: now,
  }).eq("id", contact.id);

  return NextResponse.json({
    success: true,
    portalUser,
    status: portalUser?.status || "invited",
    portalUrl: redirectTo,
    emailSent,
    emailError,
    activationLinkCreated: true,
    note: "Magic-link er opprettet. Midlertidige passord returneres ikke lenger fra API-et.",
  });
}
