import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  DEMO_SITE_PACKAGES,
  DEMO_SITE_TEMPLATE_SEEDS,
  buildDefaultTemplateFields,
  getDemoSitePackage,
  slugifyCompanyName,
  type DemoSiteBillingStatus,
  type DemoSiteStatus,
} from "@/lib/demosites";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DemoSiteOrder = {
  id?: string;
  order_number?: string;
  status?: DemoSiteStatus;
  billing_status?: DemoSiteBillingStatus;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  company_name: string;
  company_org_number?: string | null;
  industry?: string | null;
  website_url?: string | null;
  source_url?: string | null;
  package_id: string;
  setup_fee_nok?: number;
  monthly_fee_nok?: number;
  setup_cost_nok?: number;
  monthly_cost_nok?: number;
  currency?: string;
  template_slug?: string | null;
  target_subdomain?: string | null;
  preview_url?: string | null;
  production_url?: string | null;
  logo_url?: string | null;
  brand_color?: string | null;
  extracted_profile?: Record<string, unknown>;
  editable_fields?: Record<string, unknown>;
  requested_changes?: Record<string, unknown>;
  notes?: string | null;
  created_at?: string;
};

type DemoSiteOrderRow = DemoSiteOrder & {
  id: string;
  status: DemoSiteStatus;
  billing_status: DemoSiteBillingStatus;
};

type DemoSiteEventRow = {
  id: string;
  order_id: string;
  event_type: string;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
};

type SupabaseClientLike = any;

type SaasAppLookup = { id?: string };

const ACTIVE_REVENUE_STATUSES = new Set(["ordered", "in_setup", "preview_ready", "approved", "deployed"]);
const ACTIVE_MRR_STATUSES = new Set(["in_setup", "preview_ready", "approved", "deployed"]);
const REALTYFLOW_BASE_URL = process.env.NEXT_PUBLIC_REALTYFLOW_URL || "https://realtyflow.chatgenius.pro";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function isMissingTable(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null;
  const message = `${candidate?.code || ""} ${candidate?.message || ""}`.toLowerCase();
  return message.includes("42p01") || message.includes("does not exist") || message.includes("schema cache");
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function plusOneMonthIso() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString();
}

function generateOrderNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DS-${stamp}-${random}`;
}

function computeSummary(orders: DemoSiteOrder[]) {
  const activeOrders = orders.filter(
    (order) => order.status && ACTIVE_REVENUE_STATUSES.has(order.status) && order.billing_status !== "cancelled",
  );
  const activeMrrOrders = orders.filter(
    (order) => order.status && ACTIVE_MRR_STATUSES.has(order.status) && order.billing_status !== "cancelled",
  );
  const paidOrders = orders.filter((order) => order.billing_status === "paid");
  const bookedSetupRevenue = activeOrders.reduce((sum, order) => sum + asNumber(order.setup_fee_nok), 0);
  const activeMrr = activeMrrOrders.reduce((sum, order) => sum + asNumber(order.monthly_fee_nok), 0);
  const paidRevenue = paidOrders.reduce(
    (sum, order) => sum + asNumber(order.setup_fee_nok) + asNumber(order.monthly_fee_nok),
    0,
  );
  const setupCosts = activeOrders.reduce((sum, order) => sum + asNumber(order.setup_cost_nok), 0);
  const monthlyCosts = activeMrrOrders.reduce((sum, order) => sum + asNumber(order.monthly_cost_nok), 0);

  return {
    totalOrders: orders.length,
    activeOrders: activeOrders.length,
    paidOrders: paidOrders.length,
    bookedSetupRevenue,
    paidRevenue,
    activeMrr,
    setupCosts,
    monthlyCosts,
    netSetup: bookedSetupRevenue - setupCosts,
    netMrr: activeMrr - monthlyCosts,
    arr: activeMrr * 12,
  };
}

async function ensureDemositesApp(supabase: SupabaseClientLike) {
  const existing = await supabase.from("saas_apps").select("id").eq("slug", "demosites").maybeSingle();
  const existingApp = existing.data as SaasAppLookup | null;

  if (existingApp?.id) {
    await supabase
      .from("saas_apps")
      .update({
        domain: "realtyflow.chatgenius.pro",
        live_url: `${REALTYFLOW_BASE_URL}/saas`,
        description:
          "Produktisert nettsidepakke med demo-maler, bestillingsskjema, CRM, preview og abonnement/MRR-oppfølging inne i RealtyFlow.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingApp.id);
    return existingApp.id;
  }

  const inserted = await supabase
    .from("saas_apps")
    .insert({
      slug: "demosites",
      name: "ChatGenius DemoSites",
      domain: "realtyflow.chatgenius.pro",
      description:
        "Produktisert nettsidepakke med demo-maler, bestillingsskjema, CRM, preview og abonnement/MRR-oppfølging inne i RealtyFlow.",
      category: "marketing",
      tech_stack: ["next.js", "supabase", "chatgenius", "demosites"],
      status: "live",
      color: "#8b5cf6",
      pricing_model: "subscription",
      price_monthly: 490,
      currency: "NOK",
      repo_url: "https://github.com/freddybremseth-coder/demosites",
      live_url: `${REALTYFLOW_BASE_URL}/saas`,
      dev_platform: "codex",
    })
    .select("id")
    .single();

  if (inserted.error) throw inserted.error;
  const insertedApp = inserted.data as SaasAppLookup | null;
  if (!insertedApp?.id) throw new Error("Could not create DemoSites SaaS app");
  return insertedApp.id;
}

async function syncSaasMetrics(supabase: SupabaseClientLike, orders: DemoSiteOrder[]) {
  const summary = computeSummary(orders);
  const appId = await ensureDemositesApp(supabase);
  await supabase
    .from("saas_apps")
    .update({
      total_users: summary.activeOrders,
      active_users_30d: summary.activeOrders,
      total_revenue: summary.bookedSetupRevenue,
      mrr: summary.activeMrr,
      arr: summary.arr,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appId);
  return { ...summary, appId };
}

async function getOrders(supabase: SupabaseClientLike) {
  const { data, error } = await supabase.from("demo_site_orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as DemoSiteOrder[];
}

async function getEvents(supabase: SupabaseClientLike) {
  const { data, error } = await supabase
    .from("demo_site_order_events")
    .select("id, order_id, event_type, title, description, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) throw error;
  return (data || []) as DemoSiteEventRow[];
}

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({
      orders: [],
      templates: DEMO_SITE_TEMPLATE_SEEDS,
      packages: DEMO_SITE_PACKAGES,
      events: [],
      summary: computeSummary([]),
      error: "Supabase server key is not configured.",
      source: "not-configured",
    });
  }

  try {
    const [ordersResult, templatesResult, eventsResult] = await Promise.allSettled([
      getOrders(supabase),
      supabase.from("demo_site_templates").select("*").order("name", { ascending: true }),
      getEvents(supabase),
    ]);

    if (ordersResult.status === "rejected" && isMissingTable(ordersResult.reason)) {
      return NextResponse.json({
        orders: [],
        templates: DEMO_SITE_TEMPLATE_SEEDS,
        packages: DEMO_SITE_PACKAGES,
        events: [],
        summary: computeSummary([]),
        error: "DemoSites-tabellene finnes ikke ennå. Kjør migrasjonen 20260627090000_demosites_crm.sql.",
        source: "missing-tables",
      });
    }

    const orders = ordersResult.status === "fulfilled" ? ordersResult.value : [];
    const templates =
      templatesResult.status === "fulfilled" && !templatesResult.value.error
        ? templatesResult.value.data || []
        : DEMO_SITE_TEMPLATE_SEEDS;
    const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
    const summary = await syncSaasMetrics(supabase, orders);

    return NextResponse.json({ orders, templates, packages: DEMO_SITE_PACKAGES, events, summary, source: "supabase" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fetch DemoSites CRM" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  try {
    const body = (await request.json()) as Partial<DemoSiteOrder>;
    const companyName = String(body.company_name || "").trim();
    const customerName = String(body.customer_name || "").trim();
    const customerEmail = String(body.customer_email || "").trim();
    if (!companyName || !customerName || !customerEmail) {
      return NextResponse.json({ error: "company_name, customer_name and customer_email are required" }, { status: 400 });
    }

    const selectedPackage = getDemoSitePackage(body.package_id);
    const slug = slugifyCompanyName(companyName);
    const targetSubdomain = body.target_subdomain || `${slug}.chatgenius.pro`;
    const internalPreviewUrl = `${REALTYFLOW_BASE_URL}/demosites?preview=${slug}`;
    const appId = await ensureDemositesApp(supabase);

    const payload = {
      order_number: generateOrderNumber(),
      status: body.status || "ordered",
      billing_status: body.billing_status || "not_invoiced",
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: body.customer_phone || null,
      company_name: companyName,
      company_org_number: body.company_org_number || null,
      industry: body.industry || null,
      website_url: body.website_url || null,
      source_url: body.source_url || body.website_url || null,
      package_id: selectedPackage.id,
      setup_fee_nok: selectedPackage.setupFeeNok,
      monthly_fee_nok: selectedPackage.monthlyFeeNok,
      setup_cost_nok: asNumber(body.setup_cost_nok),
      monthly_cost_nok: asNumber(body.monthly_cost_nok),
      currency: "NOK",
      subscription_started_at: new Date().toISOString(),
      subscription_renews_at: plusOneMonthIso(),
      template_slug: body.template_slug || "local-service",
      target_subdomain: targetSubdomain,
      preview_url: body.preview_url || internalPreviewUrl,
      production_url: body.production_url || null,
      deployment_target: "realtyflow.chatgenius.pro",
      app_id: appId,
      logo_url: body.logo_url || null,
      brand_color: body.brand_color || null,
      extracted_profile: body.extracted_profile || {},
      editable_fields:
        body.editable_fields ||
        buildDefaultTemplateFields({
          companyName,
          customerName,
          customerEmail,
          customerPhone: body.customer_phone || undefined,
          websiteUrl: body.website_url || undefined,
          industry: body.industry || undefined,
          notes: body.notes || undefined,
        }),
      requested_changes: body.requested_changes || {},
      provisioning_log: [
        {
          at: new Date().toISOString(),
          type: "order_created",
          message: "Bestilling opprettet i RealtyFlow. Klar for manuell eller senere automatisk demo-generering.",
        },
      ],
      notes: body.notes || null,
    };

    const { data, error } = await supabase.from("demo_site_orders").insert(payload).select("*").single();
    if (error) throw error;
    const createdOrder = data as DemoSiteOrderRow;

    await supabase.from("demo_site_order_events").insert({
      order_id: createdOrder.id,
      event_type: "order_created",
      title: "Bestilling opprettet",
      description: `${companyName} valgte ${selectedPackage.shortName}.`,
      metadata: { package_id: selectedPackage.id, preview_url: payload.preview_url },
    });

    const orders = await getOrders(supabase);
    const summary = await syncSaasMetrics(supabase, orders);
    return NextResponse.json({ order: createdOrder, summary }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create DemoSites order" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  try {
    const body = (await request.json()) as Partial<DemoSiteOrder> & { id?: string };
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowedKeys = [
      "status",
      "billing_status",
      "customer_name",
      "customer_email",
      "customer_phone",
      "company_name",
      "company_org_number",
      "industry",
      "website_url",
      "source_url",
      "package_id",
      "setup_fee_nok",
      "monthly_fee_nok",
      "setup_cost_nok",
      "monthly_cost_nok",
      "template_slug",
      "target_subdomain",
      "preview_url",
      "production_url",
      "logo_url",
      "brand_color",
      "extracted_profile",
      "editable_fields",
      "requested_changes",
      "notes",
    ];

    for (const key of allowedKeys) {
      const value = (body as Record<string, unknown>)[key];
      if (value !== undefined) patch[key] = value;
    }
    if (body.status === "approved") patch.approved_at = new Date().toISOString();
    if (body.status === "deployed") patch.deployed_at = new Date().toISOString();

    const { data, error } = await supabase.from("demo_site_orders").update(patch).eq("id", body.id).select("*").single();
    if (error) throw error;
    const updatedOrder = data as DemoSiteOrderRow;

    await supabase.from("demo_site_order_events").insert({
      order_id: body.id,
      event_type: "order_updated",
      title: "Bestilling oppdatert",
      description: `Status: ${updatedOrder.status}. Betaling: ${updatedOrder.billing_status}.`,
      metadata: patch,
    });

    const orders = await getOrders(supabase);
    const summary = await syncSaasMetrics(supabase, orders);
    return NextResponse.json({ order: updatedOrder, summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update DemoSites order" },
      { status: 500 },
    );
  }
}
