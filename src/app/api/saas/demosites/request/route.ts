import { NextRequest, NextResponse } from "next/server";
import { DEMO_SITE_PACKAGES, analyzeDemoSiteProfile, buildDefaultTemplateFields, getDemoSitePackage, slugifyCompanyName } from "@/lib/demosites";
import { getDemoSitesSupabase, type DemoSitesSupabaseClientLike } from "@/lib/demosites-api-supabase";
import { enrichDemoSiteOrderWithHeroAssets } from "@/lib/demosites-hero-assets";
import { portalCorsHeaders, portalPreflight } from "@/lib/demosites-portal";
import { buildSiteProfile, parseServiceList } from "@/lib/site-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const REALTYFLOW_BASE_URL = process.env.NEXT_PUBLIC_REALTYFLOW_URL || "https://realtyflow.chatgenius.pro";
const DEFAULT_EXPIRY_DAYS = 4;

type RequestBody = Record<string, unknown>;
type SupabaseClientLike = DemoSitesSupabaseClientLike;

function getSupabase() {
  return getDemoSitesSupabase();
}

function text(body: RequestBody, snakeCase: string, camelCase: string) {
  const value = body[snakeCase] ?? body[camelCase];
  const output = String(value || "").trim();
  return output || null;
}

function sanitizeHexColor(value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw;
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw}`;
  return fallback;
}

function sanitizeImageUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("data:image/") && raw.length <= 1_400_000) return raw;
  if (raw.startsWith("https://") || raw.startsWith("http://")) return raw;
  return null;
}

function getGalleryImages(body: RequestBody) {
  return [body.demo_image_1, body.demo_image_2, body.demo_image_3]
    .map((item) => sanitizeImageUrl(item))
    .filter((item): item is string => Boolean(item));
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function generateOrderNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DS-DEMO-${stamp}-${random}`;
}

function generateClaimToken() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
}

async function getDemositesAppId(supabase: SupabaseClientLike) {
  const existing = await supabase.from("saas_apps").select("id").eq("slug", "demosites").maybeSingle();
  return existing.data?.id || null;
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/saas/demosites/request",
    method: "POST",
    storesData: true,
    status: "draft_preview",
    expiresInDays: DEFAULT_EXPIRY_DAYS,
  });
}

export async function OPTIONS(request: NextRequest) {
  return portalPreflight(request);
}

export async function POST(request: NextRequest) {
  const response = await handleCreateDemoRequest(request);
  for (const [key, value] of Object.entries(portalCorsHeaders(request))) response.headers.set(key, value);
  return response;
}

async function handleCreateDemoRequest(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const companyName = text(body, "company_name", "companyName");
    const customerName = text(body, "customer_name", "customerName") || companyName;
    const customerEmail = text(body, "customer_email", "customerEmail");
    if (!companyName || !customerEmail) {
      return NextResponse.json({ error: "companyName and customerEmail are required" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

    const services = parseServiceList(body.services);
    const selectedPackage = getDemoSitePackage(String(body.package_id || body.packageId || "standard"));
    const websiteUrl = text(body, "website_url", "websiteUrl");
    const logoUrl = text(body, "logo_url", "logoUrl");
    const logoDataUrl = sanitizeImageUrl(body.logo_data_url || body.logoDataUrl);
    const brandColor = sanitizeHexColor(body.brand_color || body.brandColor, "#059669");
    const secondaryColor = sanitizeHexColor(body.secondary_color || body.secondaryColor, "#0f172a");
    const accentColor = sanitizeHexColor(body.accent_color || body.accentColor, "#f59e0b");
    const industry = text(body, "industry", "industry");
    const notes = text(body, "notes", "notes");
    const profile = buildSiteProfile({ companyName, websiteUrl, logoUrl, brandColor, industry, services, notes });
    const analysis = analyzeDemoSiteProfile({
      companyName,
      websiteUrl: profile.websiteUrl,
      industry: profile.industry,
      notes,
      requestedPackageId: selectedPackage.id,
    });
    const selectedTemplateSlug = text(body, "template_slug", "templateSlug") || analysis.templateSlug;
    const galleryImages = getGalleryImages(body);
    const logoAsset = logoDataUrl || profile.logoUrl;
    const slug = slugifyCompanyName(companyName);
    const claimToken = generateClaimToken();
    const claimUrl = `${REALTYFLOW_BASE_URL}/demosites/claim/${claimToken}`;
    const previewUrl = `${REALTYFLOW_BASE_URL}/demosites/preview/${claimToken}`;
    const expiresAt = daysFromNow(DEFAULT_EXPIRY_DAYS);
    const appId = await getDemositesAppId(supabase);
    const defaultFields = buildDefaultTemplateFields({
      companyName,
      customerName: customerName || companyName,
      customerEmail,
      customerPhone: text(body, "customer_phone", "customerPhone") || undefined,
      websiteUrl: profile.websiteUrl || undefined,
      industry: profile.industry,
      notes: notes || undefined,
      templateSlug: selectedTemplateSlug,
    });
    const editableFields = {
      ...defaultFields,
      logo_url: logoAsset,
      brand_color: brandColor,
      secondary_color: secondaryColor,
      accent_color: accentColor,
      brand_colors: { primary: brandColor, secondary: secondaryColor, accent: accentColor },
      gallery_images: galleryImages,
    };

    const payload = {
      order_number: generateOrderNumber(),
      status: "draft_preview",
      billing_status: "not_invoiced",
      customer_name: customerName || companyName,
      customer_email: customerEmail,
      customer_phone: text(body, "customer_phone", "customerPhone"),
      company_name: companyName,
      company_org_number: text(body, "company_org_number", "companyOrgNumber"),
      industry: profile.industry,
      website_url: profile.websiteUrl,
      source_url: profile.websiteUrl,
      package_id: selectedPackage.id,
      setup_fee_nok: selectedPackage.setupFeeNok,
      monthly_fee_nok: selectedPackage.monthlyFeeNok,
      setup_cost_nok: 0,
      monthly_cost_nok: 0,
      currency: "NOK",
      template_slug: selectedTemplateSlug,
      target_subdomain: `${slug}.chatgenius.pro`,
      preview_url: previewUrl,
      production_url: null,
      deployment_target: "realtyflow.chatgenius.pro",
      app_id: appId,
      logo_url: logoAsset,
      brand_color: brandColor,
      extracted_profile: {
        ...profile,
        logoUrl: logoAsset,
        colorPalette: [brandColor, secondaryColor, accentColor, "#f8fafc"],
        galleryImages,
      },
      editable_fields: editableFields,
      requested_changes: {},
      provisioning_log: [{
        at: new Date().toISOString(),
        type: "demo_request_created",
        message: "Midlertidig demo-request opprettet. Kunden må kjøpe eller demoen utløper.",
      }],
      claim_token: claimToken,
      claim_url: claimUrl,
      expires_at: expiresAt,
      notes,
    };

    const { data, error } = await supabase.from("demo_site_orders").insert(payload).select("*").single();
    if (error) throw error;

    await supabase.from("demo_site_order_events").insert({
      order_id: data.id,
      event_type: "demo_request_created",
      title: "Demo-request opprettet",
      description: `${companyName} fikk en midlertidig demo som utløper om ${DEFAULT_EXPIRY_DAYS} dager.`,
      metadata: {
        claim_url: claimUrl,
        preview_url: previewUrl,
        expires_at: expiresAt,
        package_id: selectedPackage.id,
        template_slug: selectedTemplateSlug,
        has_logo: Boolean(logoAsset),
        gallery_images: galleryImages.length,
      },
    });

    let enrichment = null;
    try {
      enrichment = await enrichDemoSiteOrderWithHeroAssets(supabase, {
        id: data.id,
        company_name: companyName,
        package_id: selectedPackage.id,
        industry: profile.industry,
        website_url: profile.websiteUrl,
        template_slug: selectedTemplateSlug,
        brand_color: brandColor,
        notes,
        editable_fields: editableFields,
      });
    } catch (err) {
      console.warn("[DemoSites] Enrichment failed (demo still created):", err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      order: data,
      claimUrl,
      previewUrl,
      expiresAt,
      expiresInDays: DEFAULT_EXPIRY_DAYS,
      packages: DEMO_SITE_PACKAGES,
      enrichment,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create demo request";
    const lower = message.toLowerCase();
    if (lower.includes("claim_token") || lower.includes("expires_at") || lower.includes("status_check")) {
      return NextResponse.json(
        { error: "DemoSites claim-flow migration must be applied before creating demo requests.", details: message },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
