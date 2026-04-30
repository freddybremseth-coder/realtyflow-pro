import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function createTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const random = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((value) => alphabet[value % alphabet.length])
    .join("");
  return `Zeneco-${random}!1`;
}

async function findAuthUserByEmail(supabase: any, email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return null;
    const user = data.users.find((item: { email?: string }) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 100) return null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured" }, { status: 500 });

  const body = await request.json();
  const contactId = String(body.contactId || "");

  if (!contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,name,email,phone,brand_id,source,pipeline_status")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return NextResponse.json({ error: contactError?.message || "Contact not found" }, { status: 404 });
  }

  if (!contact.email) {
    return NextResponse.json({ error: "Contact needs an email address before portal access can be granted" }, { status: 400 });
  }

  const temporaryPassword = createTemporaryPassword();
  const userMetadata = {
      contact_id: contact.id,
      brand_id: contact.brand_id || "zeneco",
      name: contact.name,
      role: "customer",
      must_change_password: true,
  };

  const existingUser = await findAuthUserByEmail(supabase, contact.email);
  const authResult = existingUser
    ? await supabase.auth.admin.updateUserById(existingUser.id, {
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { ...(existingUser.user_metadata || {}), ...userMetadata },
      })
    : await supabase.auth.admin.createUser({
        email: contact.email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: userMetadata,
      });

  if (authResult.error) {
    return NextResponse.json({ error: authResult.error.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { data: portalUser, error: portalError } = await supabase
    .from("portal_users")
    .upsert(
      {
        contact_id: contact.id,
        auth_user_id: authResult.data.user?.id || existingUser?.id || null,
        email: contact.email,
        name: contact.name || null,
        brand_id: contact.brand_id || "zeneco",
        role: "customer",
        status: "invited",
        invited_at: now,
        updated_at: now,
      },
      { onConflict: "contact_id" },
    )
    .select()
    .single();

  const portalWarning =
    portalError && /portal_users|schema cache|does not exist|not find the table/i.test(portalError.message)
      ? "portal_users table is not available; invite was sent and contact activity was logged instead."
      : null;

  if (portalError && !portalWarning) {
    return NextResponse.json({ error: portalError.message }, { status: 500 });
  }

  const interaction = {
    id: `portal_${Date.now()}`,
    type: "note",
    content: `Portaltilgang opprettet for ${contact.email}. Midlertidig passord ble generert.${portalWarning ? " (portal_users mangler i Supabase)" : ""}`,
    date: now.split("T")[0],
  };

  const { data: freshContact } = await supabase
    .from("contacts")
    .select("interactions,notes")
    .eq("id", contact.id)
    .single();

  const interactions = Array.isArray(freshContact?.interactions) ? freshContact.interactions : [];
  await supabase
    .from("contacts")
    .update({
      interactions: [interaction, ...interactions],
      updated_at: now,
    })
    .eq("id", contact.id);

  return NextResponse.json({
    success: true,
    portalUser: portalUser || null,
    temporaryPassword,
    warning: portalWarning,
  });
}
