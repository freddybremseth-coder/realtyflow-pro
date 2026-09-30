import { NextRequest, NextResponse } from "next/server";
import { buildRevenueEventDedupeKey, insertRevenueEvent } from "@/lib/revenue/events";
import { decidePortalIntent } from "@/lib/nexus/portal-intent-policy";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { checkCrmEmailSuppression } from "@/services/email/email-suppression";

export const dynamic = "force-dynamic";

async function context(request: NextRequest) {
  const supabase = getServiceSupabase();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 500 }) };

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: NextResponse.json({ error: "Missing portal session" }, { status: 401 }) };

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  const email = user?.email?.trim().toLowerCase();
  if (userError || !user || !email) return { error: NextResponse.json({ error: "Invalid portal session" }, { status: 401 }) };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,email_suppressed,do_not_contact")
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contactError) return { error: NextResponse.json({ error: contactError.message }, { status: 500 }) };
  if (!contact) return { error: NextResponse.json({ error: "Portal contact not found" }, { status: 404 }) };

  const { data: brand, error: brandError } = await supabase
    .schema("core")
    .from("brands")
    .select("id,brand_key")
    .eq("brand_key", "zeneco")
    .maybeSingle();

  if (brandError || !brand?.id) {
    return { error: NextResponse.json({ error: brandError?.message || "Zen Eco Homes brand not found" }, { status: 500 }) };
  }

  return { supabase, user, email, contact, brand };
}

export async function GET(request: NextRequest) {
  const ctx = await context(request);
  if ("error" in ctx) return ctx.error;

  const { data, error } = await ctx.supabase
    .schema("core")
    .from("workspace_newsletter_subscribers")
    .select("status,consent_at,unsubscribed_at")
    .eq("brand_id", ctx.brand.id)
    .eq("email", ctx.email)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    subscribed: data?.status === "active",
    status: data?.status || "none",
    consentAt: data?.consent_at || null,
  }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const ctx = await context(request);
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => ({}));
  if (body?.consent !== true) {
    return NextResponse.json({ error: "Explicit newsletter consent is required" }, { status: 400 });
  }

  const suppression = await checkCrmEmailSuppression(ctx.supabase, [ctx.email]);
  if (suppression.error) return NextResponse.json({ error: suppression.error }, { status: 503 });
  if (suppression.blocked) {
    return NextResponse.json({ error: "Denne e-postadressen er avmeldt eller sperret for markedsføring." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data, error } = await ctx.supabase
    .schema("core")
    .from("workspace_newsletter_subscribers")
    .upsert({
      brand_id: ctx.brand.id,
      email: ctx.email,
      name: ctx.contact.name || null,
      status: "active",
      consent_source: "zenecohomes_min_side",
      consent_note: "Kunden meldte seg eksplisitt på Zen Eco Homes-nyhetsbrevet fra Min side.",
      consent_at: now,
      unsubscribed_at: null,
      created_by_user_id: ctx.user.id,
      created_by_email: ctx.email,
      updated_at: now,
      segments: ["min-side", "buyer"],
    }, { onConflict: "brand_id,email" })
    .select("status,consent_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const decision = decidePortalIntent("newsletter_subscribed");
  await insertRevenueEvent(ctx.supabase, {
    eventType: "note",
    title: "Kunden meldte seg på nyhetsbrev fra Min side",
    description: "Eksplisitt samtykke til Zen Eco Homes-nyhetsbrev.",
    contactId: ctx.contact.id,
    brandId: "zeneco",
    sourceSystem: "portal",
    sourceType: "newsletter_subscribed",
    sourceId: ctx.contact.id,
    actorType: "customer",
    confidenceScore: decision.aiScore,
    occurredAt: now,
    dedupeKey: buildRevenueEventDedupeKey(["portal", "newsletter_subscribed", ctx.contact.id]),
    metadata: {
      portal_signal: "newsletter_subscribed",
      consent_source: "zenecohomes_min_side",
    },
    createdBy: "api/portal/newsletter",
  });

  return NextResponse.json({ success: true, subscribed: true, ...data });
}

export async function DELETE(request: NextRequest) {
  const ctx = await context(request);
  if ("error" in ctx) return ctx.error;

  const now = new Date().toISOString();
  const { error } = await ctx.supabase
    .schema("core")
    .from("workspace_newsletter_subscribers")
    .update({
      status: "unsubscribed",
      unsubscribed_at: now,
      updated_at: now,
    })
    .eq("brand_id", ctx.brand.id)
    .eq("email", ctx.email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, subscribed: false });
}
