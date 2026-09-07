import { NextRequest, NextResponse } from "next/server";
import { buildRevenueEventDedupeKey, insertRevenueEvent } from "@/lib/revenue/events";
import { propertyMatchesBrand } from "@/lib/realty/brand-rules";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

type FeedbackAction = "interested" | "not_for_me";
const ALLOWED_ACTIONS = new Set<FeedbackAction>(["interested", "not_for_me"]);

function normalizeBrandId(value: unknown) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["zeneco", "zenecohomes"].includes(normalized)) return "zeneco";
  if (["pinoso", "pinosoecolife"].includes(normalized)) return "pinosoecolife";
  return String(value || "zeneco");
}

function missingFeedbackTable(error: any) {
  return Boolean(error && /relation .*property_feedback_events.* does not exist|schema cache/i.test(String(error.message || "")));
}

export async function POST(request: NextRequest) {
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing portal session" }, { status: 401 });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user?.email) return NextResponse.json({ error: "Invalid portal session" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || "").trim();
  const action = String(body.action || "").trim() as FeedbackAction;
  if (!propertyId || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "propertyId and a valid action are required" }, { status: 400 });
  }

  const email = user.email.trim().toLowerCase();
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,email_suppressed,do_not_contact")
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Portal contact not found" }, { status: 404 });
  if (String(contact.pipeline_status || "").toUpperCase() === "LOST" || contact.email_suppressed || contact.do_not_contact) {
    return NextResponse.json({ error: "Portal access is not active for this contact" }, { status: 403 });
  }

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id,ref,title,title_no,title_en,location,town,price,brand_id,brand")
    .eq("id", propertyId)
    .maybeSingle();
  if (propertyError) return NextResponse.json({ error: propertyError.message }, { status: 500 });
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const brandId = normalizeBrandId(contact.brand_id || contact.brand || user.user_metadata?.brand_id || "zeneco");
  if (!propertyMatchesBrand(property as Record<string, unknown>, brandId)) {
    return NextResponse.json({ error: "Property is not available for this portal brand" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const insert = await supabase.from("property_feedback_events").insert({
    contact_id: contact.id,
    property_id: propertyId,
    brand_id: brandId,
    action,
    source: "customer_portal",
    campaign_id: null,
    created_at: now,
  });
  const feedbackTableMissing = missingFeedbackTable(insert.error);
  if (insert.error && !feedbackTableMissing) return NextResponse.json({ error: insert.error.message }, { status: 500 });

  const eventType = action === "interested" ? "property_interested" : "property_not_for_me";
  const title = action === "interested" ? "Bolig markert interessant på Min side" : "Bolig markert ikke for meg på Min side";
  const revenue = await insertRevenueEvent(supabase, {
    eventType,
    title,
    description: `${property.ref || property.title_no || property.title || propertyId} · Min side`,
    contactId: contact.id,
    brandId,
    sourceSystem: "portal",
    sourceType: "property_feedback",
    sourceId: propertyId,
    actorType: "customer",
    confidenceScore: 100,
    occurredAt: now,
    dedupeKey: buildRevenueEventDedupeKey(["portal_property_feedback", contact.id, propertyId, action, now.slice(0, 16)]),
    metadata: { property_id: propertyId, action, channel: "portal", property_ref: property.ref || null },
    createdBy: "api/portal/property-feedback",
  });
  if (!revenue.ok && !revenue.tableNotReady) console.warn("[portal/property-feedback] revenue event failed", revenue.error);

  const contactUpdate: Record<string, unknown> = { updated_at: now };
  if (action === "interested") contactUpdate.next_followup = now;
  await supabase.from("contacts").update(contactUpdate).eq("id", contact.id);

  if (action === "interested") {
    const sourceId = `portal:${contact.id}:${propertyId}`;
    const { data: existingWorkItem } = await supabase
      .from("work_items")
      .select("id")
      .eq("source_type", "portal_property_interest")
      .eq("source_id", sourceId)
      .in("status", ["TO_DO", "IN_PROGRESS", "REVIEW"])
      .limit(1)
      .maybeSingle();

    const workItem = {
      title: `Kunde interessert i bolig: ${contact.name || email}`,
      description: `${property.ref || property.title_no || property.title || propertyId} · ${property.location || property.town || ""}`,
      priority: "HIGH",
      due_date: now.slice(0, 10),
      brand_id: brandId,
      source_type: "portal_property_interest",
      source_id: sourceId,
      assigned_agent: "sales",
      next_action: "Kunden er aktiv på Min side og markerte boligen som interessant. Svar raskt med detaljer, relevante spørsmål og forslag til neste steg.",
      ai_score: 96,
      metadata: { contact_id: contact.id, property_id: propertyId, property_ref: property.ref || null, portal_signal: true },
      updated_at: now,
    };
    if (existingWorkItem?.id) await supabase.from("work_items").update(workItem).eq("id", existingWorkItem.id);
    else await supabase.from("work_items").insert({ ...workItem, status: "TO_DO", created_at: now });
  }

  return NextResponse.json({
    success: true,
    action,
    propertyId,
    contactId: contact.id,
    feedbackAvailable: !feedbackTableMissing,
    highPriorityFollowup: action === "interested",
  }, { headers: { "cache-control": "private, no-store" } });
}
