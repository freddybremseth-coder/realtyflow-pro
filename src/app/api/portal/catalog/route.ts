import { NextRequest, NextResponse } from "next/server";
import { propertyMatchesBrand } from "@/lib/realty/brand-rules";
import { scorePropertyV2 } from "@/lib/nexus-property-match-v2";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function isWebsiteVisible(property: Record<string, unknown>) {
  return property.show_on_website !== false && property.website_visible !== false;
}

function normalizeBrandId(value: unknown) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["zeneco", "zenecohomes"].includes(normalized)) return "zeneco";
  if (["pinoso", "pinosoecolife"].includes(normalized)) return "pinosoecolife";
  return String(value || "zeneco");
}

function flattenInteractionText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .slice(0, 20)
    .map((item) => typeof item === "string" ? item : String((item as any)?.content || ""))
    .filter(Boolean)
    .join(" ");
}

function isMissingFeedbackTable(error: any) {
  return Boolean(error && /relation .*property_feedback_events.* does not exist|schema cache/i.test(String(error.message || "")));
}

export async function GET(request: NextRequest) {
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing portal session" }, { status: 401 });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user?.email) return NextResponse.json({ error: "Invalid portal session" }, { status: 401 });

  const email = user.email.trim().toLowerCase();
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,notes,interactions,pipeline_status,email_suppressed,do_not_contact")
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Portal contact not found" }, { status: 404 });
  if (String(contact.pipeline_status || "").toUpperCase() === "LOST" || contact.email_suppressed || contact.do_not_contact) {
    return NextResponse.json({ error: "Portal access is not active for this contact" }, { status: 403 });
  }

  const brandId = normalizeBrandId(contact.brand_id || contact.brand || user.user_metadata?.brand_id || "zeneco");
  const [{ data: properties, error: propertiesError }, feedbackResult] = await Promise.all([
    supabase.from("properties").select("*").limit(500),
    supabase
      .from("property_feedback_events")
      .select("contact_id,property_id,brand_id,action,source,created_at")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  if (propertiesError) return NextResponse.json({ error: propertiesError.message }, { status: 500 });
  const feedbackTableMissing = isMissingFeedbackTable(feedbackResult.error);
  if (feedbackResult.error && !feedbackTableMissing) return NextResponse.json({ error: feedbackResult.error.message }, { status: 500 });
  const feedback = feedbackTableMissing ? [] : feedbackResult.data || [];

  const candidates = (properties || [])
    .filter((property: any) => isWebsiteVisible(property))
    .filter((property: any) => propertyMatchesBrand(property, brandId));
  const propertyById = new Map(candidates.map((property: any) => [String(property.id), property]));
  const conversationText = [String(contact.notes || ""), flattenInteractionText(contact.interactions)].filter(Boolean).join(" ");

  const latestFeedbackByProperty = new Map<string, string>();
  for (const row of feedback as any[]) {
    const id = String(row.property_id || "");
    if (id && !latestFeedbackByProperty.has(id)) latestFeedbackByProperty.set(id, String(row.action || ""));
  }

  const scored = candidates
    .map((property: any) => ({
      property,
      match: scorePropertyV2({ property, feedback: feedback as any[], propertiesById: propertyById, conversationText, aiMatched: false }),
      feedbackAction: latestFeedbackByProperty.get(String(property.id)) || null,
    }))
    .filter((row) => row.feedbackAction !== "not_for_me")
    .sort((a, b) => b.match.score - a.match.score || Number(b.property.price || 0) - Number(a.property.price || 0))
    .slice(0, 40)
    .map(({ property, match, feedbackAction }, index) => ({
      id: property.id,
      ref: property.ref,
      external_id: property.external_id,
      title: property.title_no || property.title_en || property.title_es || property.title,
      title_no: property.title_no,
      location: property.location || property.town || property.municipality,
      town: property.town,
      price: property.price,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      built_area: property.built_area,
      area: property.area,
      property_type: property.property_type || property.type,
      pool: property.pool,
      primary_image: property.primary_image,
      portal_rank: index + 1,
      nexus_match_score: match.score,
      nexus_match_label: match.label,
      nexus_match_reasons: match.reasons,
      nexus_match_cautions: match.cautions,
      learning_confidence: match.profile.confidence,
      feedback_action: feedbackAction,
    }));

  const now = new Date().toISOString();
  await supabase.from("portal_users").update({ status: "active", last_login_at: now, updated_at: now }).eq("contact_id", contact.id).then(() => {}).then(undefined, () => {});

  return NextResponse.json({
    contact: { id: contact.id, name: contact.name, brandId },
    personalized: scored.some((property) => Number(property.nexus_match_score || 0) > 20),
    properties: scored,
    plots: [],
    feedbackAvailable: !feedbackTableMissing,
    generatedAt: now,
  }, { headers: { "cache-control": "private, no-store" } });
}
