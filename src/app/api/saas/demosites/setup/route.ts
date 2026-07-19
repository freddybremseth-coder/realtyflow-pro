import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getDemoSitesSupabase } from "@/lib/demosites-api-supabase";
import {
  DEMO_SITE_TEMPLATE_SEEDS,
  buildDefaultTemplateFields,
} from "@/lib/demosites";
import {
  isDemoSiteLayout,
  isDemoSiteStyle,
  type DemoSiteLayout,
  type DemoSiteStyleId,
} from "@/lib/demosites-design";

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
  trust_points?: string[];
  faq?: unknown[];
  call_to_action?: string | null;
  contact_text?: string | null;
  logo_url?: string | null;
  brand_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  gallery_images?: string[];
  suggested_sections?: string[];
  layout_variant?: DemoSiteLayout | null;
  style_preset?: DemoSiteStyleId | null;
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

const REALTYFLOW_BASE_URL =
  process.env.NEXT_PUBLIC_REALTYFLOW_URL || "https://realtyflow.chatgenius.pro";
const DEFAULT_TEMPLATE_SLUG = DEMO_SITE_TEMPLATE_SEEDS[0]?.slug || "elektro";
const DEFAULT_EXPIRY_DAYS = 7;

function getSupabase() {
  return getDemoSitesSupabase();
}

function text(value: unknown, maxLength = 4000) {
  const output = String(value || "").trim();
  return output ? output.slice(0, maxLength) : null;
}

function textList(value: unknown, maxItems = 12) {
  if (Array.isArray(value)) {
    return value
      .map((item) => text(item, 500))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  return String(value || "")
    .split("\n")
    .map((item) => text(item, 500))
    .filter(Boolean)
    .slice(0, maxItems);
}

function faqList(value: unknown, maxItems = 8) {
  if (!Array.isArray(value)) return undefined;

  return value
    .map((item) => {
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const question = text(record.question, 240);
        const answer = text(record.answer, 800);
        return question && answer ? { question, answer } : null;
      }

      const line = text(item, 800);
      if (!line) return null;
      const [question, ...answerParts] = line.split("::");
      const answer = answerParts.join("::").trim();
      return answer ? { question: question.trim(), answer } : null;
    })
    .filter(Boolean)
    .slice(0, maxItems);
}

function url(value: unknown) {
  const output = text(value, 1200);
  if (!output) return null;

  try {
    const parsed = new URL(output);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.toString()
      : null;
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
  return /^[a-z0-9æøåé-]+$/iu.test(output) ? output.toLowerCase() : null;
}

function layoutVariant(value: unknown): DemoSiteLayout | null {
  const output = text(value, 40);
  return isDemoSiteLayout(output) ? output : null;
}

function stylePreset(value: unknown): DemoSiteStyleId | null {
  const output = text(value, 40);
  return isDemoSiteStyle(output) ? output : null;
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

async function repairOrderLinks(
  supabase: SupabaseClientLike,
  order: SetupOrder,
) {
  const token = order.claim_token || generateClaimToken();
  const patch: Record<string, unknown> = {};

  if (!order.claim_token) patch.claim_token = token;
  if (!hasClaimUrl(order.claim_url)) patch.claim_url = buildClaimUrl(token);
  if (!hasCustomerPreviewUrl(order.preview_url))
    patch.preview_url = buildPreviewUrl(token);
  if (!order.expires_at) patch.expires_at = daysFromNow(DEFAULT_EXPIRY_DAYS);
  if (!order.template_slug) patch.template_slug = DEFAULT_TEMPLATE_SLUG;

  if (Object.keys(patch).length === 0) return order;

  const { data, error } = await supabase
    .from("demo_site_orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .select(
      "id, company_name, status, template_slug, preview_url, claim_token, claim_url, production_url, expires_at, logo_url, editable_fields, notes",
    )
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
    trust_points: textList(
      body.trust_points ?? body.trustPoints,
      12,
    ) as string[],
    faq: faqList(body.faq),
    call_to_action: text(body.call_to_action ?? body.callToAction, 160),
    contact_text: text(body.contact_text ?? body.contactText, 800),
    logo_url: url(body.logo_url ?? body.logoUrl),
    brand_color: color(body.brand_color ?? body.brandColor),
    secondary_color: color(body.secondary_color ?? body.secondaryColor),
    accent_color: color(body.accent_color ?? body.accentColor),
    gallery_images: galleryImages,
    suggested_sections: textList(
      body.suggested_sections ?? body.suggestedSections,
      16,
    ) as string[],
    layout_variant: layoutVariant(body.layout_variant ?? body.layoutVariant),
    style_preset: stylePreset(body.style_preset ?? body.stylePreset),
  };
}

function getSetupContentDefaults(
  order: Pick<SetupOrder, "company_name" | "template_slug" | "notes">,
) {
  return buildDefaultTemplateFields({
    companyName: order.company_name,
    notes: order.notes || undefined,
    templateSlug: order.template_slug || DEFAULT_TEMPLATE_SLUG,
  });
}

function mergeSetupContentDefaults(order: SetupOrder) {
  const currentFields =
    order.editable_fields && typeof order.editable_fields === "object"
      ? order.editable_fields
      : {};
  return {
    ...getSetupContentDefaults(order),
    ...currentFields,
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase)
    return NextResponse.json(
      { error: "Supabase server key is not configured" },
      { status: 503 },
    );

  const orderId =
    request.nextUrl.searchParams.get("order_id") ||
    request.nextUrl.searchParams.get("id");
  if (!orderId)
    return NextResponse.json(
      { error: "order_id is required" },
      { status: 400 },
    );

  const { data, error } = await supabase
    .from("demo_site_orders")
    .select(
      "id, company_name, status, template_slug, preview_url, claim_token, claim_url, production_url, expires_at, logo_url, editable_fields, notes",
    )
    .eq("id", orderId)
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const order = await repairOrderLinks(supabase, data as SetupOrder);
  return NextResponse.json({
    order,
    setup_content: mergeSetupContentDefaults(order),
  });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase)
    return NextResponse.json(
      { error: "Supabase server key is not configured" },
      { status: 503 },
    );

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const orderId = text(body.order_id ?? body.orderId ?? body.id, 80);
    if (!orderId)
      return NextResponse.json(
        { error: "order_id is required" },
        { status: 400 },
      );

    const { data: existing, error: existingError } = await supabase
      .from("demo_site_orders")
      .select(
        "id, company_name, editable_fields, template_slug, preview_url, claim_token, claim_url, production_url, expires_at, notes",
      )
      .eq("id", orderId)
      .single();

    if (existingError) throw existingError;

    const setupContent = buildSetupContent(body);
    const selectedTemplateSlug = templateSlug(
      body.template_slug ?? body.templateSlug,
    );
    const currentTemplateSlug =
      selectedTemplateSlug || existing?.template_slug || DEFAULT_TEMPLATE_SLUG;
    const existingOrderForDefaults = {
      ...(existing as SetupOrder),
      template_slug: currentTemplateSlug,
    };
    const currentFields = mergeSetupContentDefaults(existingOrderForDefaults);
    const editableFields = {
      ...currentFields,
      ...setupContent,
      template_slug: currentTemplateSlug,
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
      .select(
        "id, company_name, status, template_slug, preview_url, claim_token, claim_url, production_url, expires_at, logo_url, editable_fields",
      )
      .single();

    if (error) throw error;

    const repairedOrder = await repairOrderLinks(supabase, data as SetupOrder);

    await supabase.from("demo_site_order_events").insert({
      order_id: orderId,
      event_type: "setup_content_updated",
      title: "Oppsettinnhold og design oppdatert",
      description:
        "Logo, tekst, farger, innhold, bransjemal eller designkonsept ble lagret i DemoSites-oppsettet.",
      metadata: {
        fields: Object.keys(setupContent).filter(
          (key) => setupContent[key as keyof SetupContent],
        ),
        template_slug: selectedTemplateSlug,
        layout_variant: setupContent.layout_variant,
        style_preset: setupContent.style_preset,
      },
    });

    return NextResponse.json({
      order: repairedOrder,
      setup_content: repairedOrder.editable_fields,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save setup content",
      },
      { status: 500 },
    );
  }
}
