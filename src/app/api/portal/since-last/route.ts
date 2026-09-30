import { NextRequest, NextResponse } from "next/server";
import { propertyMatchesBrand } from "@/lib/realty/brand-rules";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function normalizeBrandId(value: unknown) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["zeneco", "zenecohomes"].includes(normalized)) return "zeneco";
  return String(value || "zeneco");
}

export async function GET(request: NextRequest) {
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Missing portal session" }, { status: 401 });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const email = userData.user?.email?.trim().toLowerCase();
  if (userError || !email) return NextResponse.json({ error: "Invalid portal session" }, { status: 401 });

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,email,brand_id,brand,pipeline_status,email_suppressed,do_not_contact")
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Portal contact not found" }, { status: 404 });
  if (String(contact.pipeline_status || "").toUpperCase() === "LOST" || contact.email_suppressed || contact.do_not_contact) {
    return NextResponse.json({ error: "Portal access is not active" }, { status: 403 });
  }

  const brandId = normalizeBrandId(contact.brand_id || contact.brand || "zeneco");
  const { data: portalUser } = await supabase
    .from("portal_users")
    .select("previous_login_at,last_login_at")
    .eq("contact_id", contact.id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  const lastLoginMs = portalUser?.last_login_at ? new Date(portalUser.last_login_at).getTime() : 0;
  const recentSession = lastLoginMs > 0 && Date.now() - lastLoginMs < 30 * 60 * 1000;
  const firstVisit = !portalUser?.previous_login_at && !portalUser?.last_login_at;
  const since = recentSession
    ? (portalUser?.previous_login_at || portalUser?.last_login_at)
    : (portalUser?.last_login_at || portalUser?.previous_login_at)
      || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    propertiesResult,
    messagesResult,
    favoritesResult,
    reportsResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id,ref,title,title_no,brand_id,show_on_website,website_visible,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(250),
    supabase
      .from("portal_messages")
      .select("id,sender_type,created_at")
      .eq("contact_id", contact.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(250),
    supabase
      .from("portal_favorites")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contact.id),
    supabase
      .from("market_reports")
      .select("id,status,channel,recipients,sent_to,generated_at,created_at")
      .gte("generated_at", since)
      .order("generated_at", { ascending: false })
      .limit(100),
  ]);

  const newProperties = (propertiesResult.data || [])
    .filter((property: any) => property.show_on_website !== false && property.website_visible !== false)
    .filter((property: any) => propertyMatchesBrand(property, brandId));

  const newMessages = (messagesResult.data || [])
    .filter((message: any) => message.sender_type !== "customer");

  const newDocuments = (reportsResult.data || [])
    .filter((report: any) => !report.status || report.status === "published")
    .filter((report: any) => !report.channel || report.channel === "portal")
    .filter((report: any) => {
      const sentTo = Array.isArray(report.sent_to)
        ? report.sent_to.map((item: string) => String(item).toLowerCase())
        : [];
      return report.recipients === "portal_all" || sentTo.includes(email);
    });

  return NextResponse.json({
    firstVisit,
    since,
    counts: {
      newProperties: newProperties.length,
      newMessages: newMessages.length,
      newDocuments: newDocuments.length,
      favorites: favoritesResult.count || 0,
    },
    newestProperties: newProperties.slice(0, 3).map((property: any) => ({
      id: property.id,
      ref: property.ref,
      title: property.title_no || property.title || property.ref,
      createdAt: property.created_at,
    })),
  }, { headers: { "cache-control": "private, no-store" } });
}
