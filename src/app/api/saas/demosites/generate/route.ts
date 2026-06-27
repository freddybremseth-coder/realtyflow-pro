import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildDefaultTemplateFields,
  getDemoSitePackage,
  slugifyCompanyName,
} from "@/lib/demosites";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SupabaseClientLike = any;
type IdLookup = { id?: string };

const REALTYFLOW_BASE_URL = process.env.NEXT_PUBLIC_REALTYFLOW_URL || "https://realtyflow.chatgenius.pro";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function normalizePublicUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function generateOrderNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DS-DEMO-${stamp}-${random}`;
}

function plusOneMonthIso() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString();
}

function buildDemoProfile(input: {
  companyName: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  industry?: string | null;
  services?: string[];
  notes?: string | null;
}) {
  const suggestedColor = input.brandColor || "#0f9f8f";
  return {
    mode: "manual_demo_seed",
    source: input.websiteUrl ? "website_url" : input.logoUrl ? "logo_url" : "manual_input",
    website_url: input.websiteUrl || null,
    logo_url: input.logoUrl || null,
    brand_color: suggestedColor,
    color_palette: [suggestedColor, "#0f172a", "#f8fafc", "#14b8a6"],
    industry: input.industry || "lokal bedrift",
    services: input.services || [],
    notes: input.notes || null,
    next_automation_steps: [
      "Fetch public website metadata",
      "Detect logo and brand colors",
      "Extract services, opening hours and contact details",
      "Generate preview content from selected DemoSites template",
    ],
  };
}

async function ensureDemositesApp(supabase: SupabaseClientLike) {
  const existing = await supabase.from("saas_apps").select("id").eq("slug", "demosites").maybeSingle();
  const existingApp = existing.data as IdLookup | null;
  if (existingApp?.id) return existingApp.id;

  const inserted = await supabase
    .from("saas_apps")
    .insert({
      slug: "demosites",
      name: "DemoSites",
      domain: "chatgenius.pro",
      description: "Productized website packages with public landing page, internal CRM, demo generation and subscription tracking.",
      category: "marketing",
      tech_stack: ["static-site", "realtyflow", "supabase", "chatgenius"],
      status: "live",
      color: "#a855f7",
      pricing_model: "subscription",
      price_monthly: 490,
      currency: "NOK",
      repo_url: "https://github.com/freddybremseth-coder/demosites",
      live_url: "https://chatgenius.pro/demosites/",
      dev_platform: "codex",
    })
    .select("id")
    .single();

  if (inserted.error) throw inserted.error;
  const insertedApp = inserted.data as IdLookup | null;
  if (!insertedApp?.id) throw new Error("Could not create DemoSites SaaS app");
  return insertedApp.id;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const companyName = String(body.company_name || body.companyName || "").trim();
    const customerName = String(body.customer_name || body.customerName || "Demo contact").trim();
    const customerEmail = String(body.customer_email || body.customerEmail || "demo@example.com").trim();

    if (!companyName) {
      return NextResponse.json({ error: "company_name is required" }, { status: 400 });
    }

    const websiteUrl = normalizePublicUrl(body.website_url || body.websiteUrl);
    const logoUrl = normalizePublicUrl(body.logo_url || body.logoUrl);
    const packageInfo = getDemoSitePackage(body.package_id || body.packageId || "standard");
    const slug = slugifyCompanyName(companyName);
    const appId = await ensureDemositesApp(supabase);
    const services = Array.isArray(body.services)
      ? body.services.map((item: unknown) => String(item).trim()).filter(Boolean)
      : String(body.services || "")
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean);

    const demoProfile = buildDemoProfile({
      companyName,
      websiteUrl,
      logoUrl,
      brandColor: body.brand_color || body.brandColor || null,
      industry: body.industry || null,
      services,
      notes: body.notes || null,
    });

    const editableFields = buildDefaultTemplateFields({
      companyName,
      customerName,
      customerEmail,
      customerPhone: body.customer_phone || body.customerPhone || undefined,
      websiteUrl: websiteUrl || undefined,
      industry: body.industry || undefined,
      notes: body.notes || undefined,
    });

    const payload = {
      order_number: generateOrderNumber(),
      status: "preview_ready",
      billing_status: "not_invoiced",
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: body.customer_phone || body.customerPhone || null,
      company_name: companyName,
      company_org_number: body.company_org_number || body.companyOrgNumber || null,
      industry: body.industry || null,
      website_url: websiteUrl,
      source_url: websiteUrl || logoUrl,
      package_id: packageInfo.id,
      setup_fee_nok: packageInfo.setupFeeNok,
      monthly_fee_nok: packageInfo.monthlyFeeNok,
      setup_cost_nok: Number(body.setup_cost_nok || 0),
      monthly_cost_nok: Number(body.monthly_cost_nok || 0),
      currency: "NOK",
      subscription_started_at: new Date().toISOString(),
      subscription_renews_at: plusOneMonthIso(),
      template_slug: body.template_slug || body.templateSlug || "local-service",
      target_subdomain: body.target_subdomain || `${slug}.chatgenius.pro`,
      preview_url: `${REALTYFLOW_BASE_URL}/demosites?preview=${slug}`,
      production_url: null,
      deployment_target: "realtyflow.chatgenius.pro",
      app_id: appId,
      logo_url: logoUrl,
      brand_color: demoProfile.brand_color,
      extracted_profile: demoProfile,
      editable_fields: {
        ...editableFields,
        services,
        logo: logoUrl || editableFields.logo,
        brand_color: demoProfile.brand_color,
      },
      requested_changes: {},
      provisioning_log: [
        {
          at: new Date().toISOString(),
          type: "demo_generated",
          message: "Demo seed created from manual input, website URL or logo URL. Ready for review and later automation.",
        },
      ],
      notes: body.notes || "Demo created before customer presentation.",
    };

    const { data, error } = await supabase.from("demo_site_orders").insert(payload).select("*").single();
    if (error) throw error;
    const createdOrder = data as IdLookup;

    await supabase.from("demo_site_order_events").insert({
      order_id: createdOrder.id,
      event_type: "demo_generated",
      title: "Demo opprettet",
      description: `${companyName} ble klargjort som DemoSites-preview.`,
      metadata: { website_url: websiteUrl, logo_url: logoUrl, package_id: packageInfo.id },
    });

    return NextResponse.json({ order: data, profile: demoProfile }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate DemoSites demo" },
      { status: 500 },
    );
  }
}
