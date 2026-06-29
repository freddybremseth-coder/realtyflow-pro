import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEMO_SITE_TEMPLATE_SEEDS } from "@/lib/demosites";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RequestBody = Record<string, unknown>;

type SetupContent = {
  hero_title?: string | null;
  hero_subtitle?: string | null;
  intro_text?: string | null;
  services?: string[];
  products?: string[];
  prices?: string[];
  contact_text?: string | null;
  logo_url?: string | null;
  brand_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  gallery_images?: string[];
};

type SetupOrder = {
  id: string;
  company_name: string;
  status: string;
  template_slug?: string | null;
  preview_url?: string | null;
  claim_token?: string | null;
  claim_url?: string | null;
  production_url?: string | null;
  expires_at?: string | null;
  logo_url?: string | null;
  editable_fields?: Record<string, unknown> | null;
  notes?: string | null;
};

type SupabaseClientLike = any;

const REALTYFLOW_BASE_URL = process.env.NEXT_PUBLIC_REALTYFLOW_URL || "https://realtyflow.chatgenius.pro";
const DEFAULT_TEMPLATE_SLUG = DEMO_SITE_TEMPLATE_SEEDS[0]?.slug || "elektro";
const DEFAULT_EXPIRY_DAYS = 7;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function text(value: unknown, maxLength = 4000) {
  const output = String(value || "").trim();
  return output ? output.slice(0, maxLength) : null;
}

function textList(value: unknown, maxItems = 12) {
  if (Array.isArray(value)) {
    return value.map((item) => text(item, 500)).filter(Boolean).slice(0, maxItems);
  }

  return String(value || "")
    .split("\n")
    .map((item) => text(item, 500))
    .filter(Boolean)
    .slice(0, maxItems);
}

function url(value: unknown) {
  const output = text(value, 1200);
  if (!output) return null;

  try {
    const parsed = new URL(output);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function color(value: unknown) {
  const output = text(value, 32);
  if (!output) return null;
  return /^#[0-9a-f]{6}$/i.test(output) ? output : null;
}

function templateSlug(value: unknown) {
  const output = text(value, 80);
  if (!output) return null;
  return /^[a-z0-9-]+$/i.test(output) ? output : null;
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function generateClaimToken() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
}

function buildClaimUrl(token: string) {
  return `${REALTYFLOW_BASE_URL}/demosites/claim/${token}`;
}

function buildPreviewUrl(token: string) {
  return `${REALTYFLOW_BASE_URL}/demosites/preview/${token}`;
}

function hasCustomerPreviewUrl(value?: string | null) {
  return Boolean(value && value.includes("/demosites/preview/"));
}

function hasClaimUrl(value?: string | null) {
  return Boolean(value && value.includes("/demosites/claim/"));
}

async function repairOrderLinks(supabase: SupabaseClientLike, order: SetupOrder) {
  const token = order.claim_token || generateClaimToken();
  const patch: Record<string, unknown> = {};

  if (!order.claim_token) patch.claim_token = token;
  if (!hasClaimUrl(order.claim_url)) patch.claim_url = buildClaimUrl(token);
  if (!hasCustomerPreviewUrl(order.preview_url)) patch.preview_url = buildPreviewUrl(token);
  if (!order.expires_at) patch.expires_at = daysFromNow(DEFAULT_EXPIRY_DAYS);
  if (!order.template_slug || order.template_slug === "local-service") patch.template_slug = DEFAULT_TEMPLATE_SLUG;

  if (Object.keys(patch).length === 0) return order;

  const { data, error } = await supabase
    .from("demo_site_orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .select("id, company_name, status, template_slug, preview_url, claim_token, claim_url, production_url, expires_at, logo_url, editable_fields, notes")
    .single();

  if (error) return { ...order, ...patch } as SetupOrder;
  return data as SetupOrder;
}

function buildSetupContent(body: RequestBody): SetupContent {
  const galleryImages = textList(body.gallery_images ?? body.galleryImages, 6)
    .map((item) => url(item))
    .filter(Boolean) as string[];

  return {
    hero_title: text(body.hero_title ?? body.heroTitle, 160),
    hero_subtitle: text(body.hero_subtitle ?? body.heroSubtitle, 260),
    intro_text: text(body.intro_text ?? body.introText, 1200),
    services: textList(body.services, 12) as string[],
    products: textList(body.products, 12) as string[],
    prices: textList(body.prices, 12) as string[],
    contact_text: text(body.contact_text ?? body.contactText, 800),
    logo_url: url(body.logo_url ?? body.logoUrl),
    brand_color: color(body.brand_color ?? body.brandColor),
    secondary_color: color(body.secondary_color ?? body.secondaryColor),
    accent_color: color(body.accent_color ?? body.accentColor),
    gallery_images: galleryImages,
  };
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  const orderId = request.nextUrl.searchParams.get("order_id") || request.nextUrl.searchParams.get("id");
  if (!orderId) return NextResponse.json({ error: "order_id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("demo_site_orders")
    .select("id, company_name, status, template_slug, preview_url, claim_token, claim_url, production_url, expires_at, logo_url, editable_fields, notes")
    .eq("id", orderId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const order = await repairOrderLinks(supabase, data as SetupOrder);
  return NextResponse.json({ order, setup_content: order?.editable_fields || {} });
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const orderId = text(body.order_id ?? body.orderId ?? body.id, 80);
    if (!orderId) return NextResponse.json({ error: "order_id is required" }, { status: 400 });

    const { data: existing, error: existingError } = await supabase
      .from("demo_site_orders")
      .select("id, editable_fields, template_slug, preview_url, claim_token, claim_url, production_url, expires_at")
      .eq("id", orderId)
      .single();

    if (existingError) throw existingError;

    const currentFields = existing?.editable_fields && typeof existing.editable_fields === "object" ? existing.editable_fields : {};
    const setupContent = buildSetupContent(body);
    const selectedTemplateSlug = templateSlug(body.template_slug ?? body.templateSlug);
    const editableFields = {
      ...currentFields,
      ...setupContent,
      setup_updated_at: new Date().toISOString(),
    };
    const patch: Record<string, unknown> = {
      editable_fields: editableFields,
      status: "in_setup",
    };

    if (setupContent.logo_url) patch.logo_url = setupContent.logo_url;
    if (selectedTemplateSlug) patch.template_slug = selectedTemplateSlug;

    const { data, error } = await supabase
      .from("demo_site_orders")
      .update(patch)
      .eq("id", orderId)
      .select("id, company_name, status, template_slug, preview_url, claim_token, claim_url, production_url, expires_at, logo_url, editable_fields")
      .single();

    if (error) throw error;

    const repairedOrder = await repairOrderLinks(supabase, data as SetupOrder);

    await supabase.from("demo_site_events").insert({
      order_id: orderId,
      event_type: "setup_content_updated",
      title: "Oppsettinnhold oppdatert",
      description: "Logo, tekst, farger, innhold eller malvalg ble lagret i DemoSites-oppsettet.",
      metadata: {
        fields: Object.keys(setupContent).filter((key) => setupContent[key as keyof SetupContent]),
        template_slug: selectedTemplateSlug,
      },
    });

    return NextResponse.json({ order: repairedOrder, setup_content: repairedOrder.editable_fields });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save setup content" }, { status: 500 });
  }
}
