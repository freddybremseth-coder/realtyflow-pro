import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured" }, { status: 500 });

  const body = await request.json();
  const contactId = String(body.contactId || "");
  const redirectTo = String(body.redirectTo || "https://zenecohomes.com/auth/callback");

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

  const { data: authData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(contact.email, {
    data: {
      contact_id: contact.id,
      brand_id: contact.brand_id || "zeneco",
      name: contact.name,
      role: "customer",
    },
    redirectTo,
  });

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { data: portalUser, error: portalError } = await supabase
    .from("portal_users")
    .upsert(
      {
        contact_id: contact.id,
        auth_user_id: authData.user?.id || null,
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

  if (portalError) {
    return NextResponse.json({ error: portalError.message }, { status: 500 });
  }

  const interaction = {
    id: `portal_${Date.now()}`,
    type: "note",
    content: `Portaltilgang sendt til ${contact.email}`,
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

  return NextResponse.json({ success: true, portalUser });
}
