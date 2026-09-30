import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function secret() {
  return process.env.PORTAL_OPT_IN_SECRET
    || process.env.ZENECO_API_KEY
    || process.env.REALTYFLOW_PUBLIC_LEAD_KEY
    || "";
}

function verifyToken(token: string) {
  const [payload, signature] = token.split(".");
  const key = secret();
  if (!payload || !signature || !key) return null;

  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      contactId?: string;
      email?: string;
      exp?: number;
    };
    if (!parsed.contactId || !parsed.email || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const verified = verifyToken(token);
  if (!verified) {
    return NextResponse.redirect(new URL("/min-side?activation=invalid", "https://www.zenecohomes.com"));
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.redirect(new URL("/min-side?activation=unavailable", "https://www.zenecohomes.com"));
  }

  const email = verified.email.trim().toLowerCase();
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status")
    .eq("id", verified.contactId)
    .ilike("email", email)
    .maybeSingle();

  if (contactError || !contact || String(contact.brand_id || contact.brand || "zeneco") !== "zeneco") {
    return NextResponse.redirect(new URL("/min-side?activation=invalid", "https://www.zenecohomes.com"));
  }

  const pipelineStatus = String(contact.pipeline_status || "").toUpperCase();
  if (pipelineStatus === "LOST") {
    return NextResponse.redirect(new URL("/min-side?activation=unavailable", "https://www.zenecohomes.com"));
  }

  const redirectTo = process.env.CUSTOMER_PORTAL_URL_ZENECO?.trim() || "https://www.zenecohomes.com/min-side";
  const now = new Date().toISOString();

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      data: {
        contact_id: contact.id,
        brand_id: "zeneco",
        name: contact.name,
        role: "customer",
        portal: true,
      },
      redirectTo,
    },
  });

  const actionLink = linkData?.properties?.action_link;
  if (linkError || !actionLink) {
    return NextResponse.redirect(new URL("/min-side?activation=unavailable", "https://www.zenecohomes.com"));
  }

  const { error: portalError } = await supabase
    .from("portal_users")
    .upsert({
      contact_id: contact.id,
      auth_user_id: linkData?.user?.id || null,
      email,
      name: contact.name || null,
      brand_id: "zeneco",
      role: "customer",
      status: "invited",
      invited_at: now,
      updated_at: now,
    }, { onConflict: "contact_id" });

  if (portalError) {
    return NextResponse.redirect(new URL("/min-side?activation=unavailable", "https://www.zenecohomes.com"));
  }

  return NextResponse.redirect(actionLink);
}
