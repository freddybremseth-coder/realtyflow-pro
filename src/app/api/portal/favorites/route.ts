import { NextRequest, NextResponse } from "next/server";
import { buildRevenueEventDedupeKey, insertRevenueEvent } from "@/lib/revenue/events";
import { decidePortalIntent, portalResponseDueAt, portalWorkItemMetadata, type PortalIntentSignal } from "@/lib/nexus/portal-intent-policy";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

async function portalContact(request: NextRequest) {
  const supabase = getServiceSupabase();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 500 }) };

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: NextResponse.json({ error: "Missing portal session" }, { status: 401 }) };

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const email = userData.user?.email?.trim().toLowerCase();
  if (userError || !email) return { error: NextResponse.json({ error: "Invalid portal session" }, { status: 401 }) };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,email_suppressed,do_not_contact")
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contactError) return { error: NextResponse.json({ error: contactError.message }, { status: 500 }) };
  if (!contact) return { error: NextResponse.json({ error: "Portal contact not found" }, { status: 404 }) };
  if (String(contact.pipeline_status || "").toUpperCase() === "LOST" || contact.email_suppressed || contact.do_not_contact) {
    return { error: NextResponse.json({ error: "Portal access is not active" }, { status: 403 }) };
  }

  return { supabase, contact, email };
}

async function recordFavoriteSignal(
  supabase: any,
  contact: any,
  signal: Extract<PortalIntentSignal, "favorite_saved" | "favorite_removed">,
  property: { id: string; ref?: string | null; title?: string | null; title_no?: string | null },
) {
  const now = new Date().toISOString();
  const decision = decidePortalIntent(signal);
  const propertyLabel = String(property.title_no || property.title || property.ref || property.id);
  const actionLabel = signal === "favorite_saved" ? "lagret som favoritt" : "fjernet fra favoritter";
  const sourceId = `portal_change:${contact.id}:${property.id}`;

  await insertRevenueEvent(supabase, {
    eventType: "note",
    title: `Kunden ${actionLabel}: ${propertyLabel}`,
    description: `Min side: ${propertyLabel}`,
    contactId: contact.id,
    brandId: String(contact.brand_id || contact.brand || "zeneco"),
    sourceSystem: "portal",
    sourceType: signal,
    sourceId: property.id,
    actorType: "customer",
    confidenceScore: decision.aiScore,
    occurredAt: now,
    dedupeKey: buildRevenueEventDedupeKey(["portal", signal, contact.id, property.id, now.slice(0, 13)]),
    metadata: {
      portal_signal: signal,
      property_id: property.id,
      property_ref: property.ref || null,
      property_label: propertyLabel,
      hot_lead: decision.hotLead,
      response_sla_minutes: decision.responseMinutes,
      operational_target: decision.operationalTarget,
    },
    createdBy: "api/portal/favorites",
  });

  if (!decision.createWorkItem) return;

  const dueAt = portalResponseDueAt(now, decision.responseMinutes) || now;
  const workItem = {
    title: signal === "favorite_saved"
      ? `Min side: kunde lagret bolig – ${contact.name || contact.email}`
      : `Min side: kunde fjernet favoritt – ${contact.name || contact.email}`,
    description: `${propertyLabel}${property.ref ? ` · ${property.ref}` : ""}`,
    priority: decision.priority,
    due_date: dueAt.slice(0, 10),
    brand_id: String(contact.brand_id || contact.brand || "zeneco"),
    source_type: "portal_change",
    source_id: sourceId,
    assigned_agent: "sales",
    next_action: signal === "favorite_saved"
      ? "Vurder om favoritten er et tydelig kjøpssignal. Se kundens kriterier og aktivitet, og ta kontakt hvis boligen eller timingen tilsier det."
      : "Se om kunden har fjernet flere boliger eller endret kriterier. Vurder om utvalget bør justeres før neste oppfølging.",
    ai_score: decision.aiScore,
    metadata: {
      ...portalWorkItemMetadata(signal, now),
      contact_id: contact.id,
      property_id: property.id,
      property_ref: property.ref || null,
      property_label: propertyLabel,
      portal_change: true,
    },
    updated_at: now,
  };

  const { data: existing } = await supabase
    .from("work_items")
    .select("id")
    .eq("source_type", "portal_change")
    .eq("source_id", sourceId)
    .in("status", ["TO_DO", "IN_PROGRESS", "REVIEW"])
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("work_items").update(workItem).eq("id", existing.id);
  } else {
    await supabase.from("work_items").insert({ ...workItem, status: "TO_DO", created_at: now });
  }
}

export async function GET(request: NextRequest) {
  const context = await portalContact(request);
  if ("error" in context) return context.error;
  const { supabase, contact } = context;

  const { data: rows, error } = await supabase
    .from("portal_favorites")
    .select("property_id,created_at")
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (rows || []).map((row) => row.property_id).filter(Boolean);
  if (!ids.length) return NextResponse.json({ favorites: [] }, { headers: { "cache-control": "private, no-store" } });

  const { data: properties, error: propertyError } = await supabase
    .from("properties")
    .select("id,ref,title,title_no,location,town,price,bedrooms,bathrooms,built_area,primary_image,property_type,type")
    .in("id", ids);

  if (propertyError) return NextResponse.json({ error: propertyError.message }, { status: 500 });
  const propertyMap = new Map((properties || []).map((property) => [String(property.id), property]));
  const favorites = (rows || []).map((row) => {
    const property = propertyMap.get(String(row.property_id));
    if (!property) return null;
    return {
      id: property.id,
      ref: property.ref,
      title: property.title_no || property.title || property.ref,
      location: property.location || property.town || "",
      price: property.price,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      builtArea: property.built_area,
      image: property.primary_image,
      propertyType: property.property_type || property.type,
      savedAt: row.created_at,
    };
  }).filter(Boolean);

  return NextResponse.json({ favorites }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const context = await portalContact(request);
  if ("error" in context) return context.error;
  const { supabase, contact } = context;

  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || "").trim();
  const ref = String(body.ref || "").trim();

  let query = supabase.from("properties").select("id,ref,title,title_no").limit(1);
  if (propertyId) query = query.eq("id", propertyId);
  else if (ref) query = query.eq("ref", ref);
  else return NextResponse.json({ error: "propertyId or ref is required" }, { status: 400 });

  const { data: property, error: propertyError } = await query.maybeSingle();
  if (propertyError) return NextResponse.json({ error: propertyError.message }, { status: 500 });
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const now = new Date().toISOString();
  const { error } = await supabase.from("portal_favorites").upsert({
    contact_id: contact.id,
    property_id: property.id,
    brand_id: "zeneco",
    source: String(body.source || "website"),
    updated_at: now,
  }, { onConflict: "contact_id,property_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordFavoriteSignal(supabase, contact, "favorite_saved", property);
  return NextResponse.json({ success: true, propertyId: property.id, ref: property.ref });
}

export async function DELETE(request: NextRequest) {
  const context = await portalContact(request);
  if ("error" in context) return context.error;
  const { supabase, contact } = context;

  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || "").trim();
  const ref = String(body.ref || "").trim();

  let property: { id: string; ref?: string | null; title?: string | null; title_no?: string | null } | null = null;
  if (propertyId) {
    const { data } = await supabase
      .from("properties")
      .select("id,ref,title,title_no")
      .eq("id", propertyId)
      .limit(1)
      .maybeSingle();
    property = data;
  } else if (ref) {
    const { data } = await supabase
      .from("properties")
      .select("id,ref,title,title_no")
      .eq("ref", ref)
      .limit(1)
      .maybeSingle();
    property = data;
  }
  if (!property?.id) return NextResponse.json({ success: true });

  const { error } = await supabase
    .from("portal_favorites")
    .delete()
    .eq("contact_id", contact.id)
    .eq("property_id", property.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordFavoriteSignal(supabase, contact, "favorite_removed", property);
  return NextResponse.json({ success: true });
}
