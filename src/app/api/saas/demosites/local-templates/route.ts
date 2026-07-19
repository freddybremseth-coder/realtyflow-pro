import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getDemoSitesSupabase } from "@/lib/demosites-api-supabase";
import {
  buildLocalIndustryTemplateFields,
  getLocalIndustryTemplate,
  getLocalIndustryTemplateSummaries,
} from "@/lib/demosites-local-industries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RequestBody = Record<string, unknown>;

function text(value: unknown, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ templates: getLocalIndustryTemplateSummaries() });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const orderId = text(body.order_id ?? body.orderId, 120);
  const templateSlug = text(body.template_slug ?? body.templateSlug, 100);
  const replaceContent = body.replace_content !== false && body.replaceContent !== false;
  if (!orderId) return NextResponse.json({ error: "order_id is required" }, { status: 400 });

  const template = getLocalIndustryTemplate(templateSlug);
  if (!template) return NextResponse.json({ error: "Unknown local industry template" }, { status: 400 });

  const supabase = getDemoSitesSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  const { data: order, error: loadError } = await supabase
    .from("demo_site_orders")
    .select("id, company_name, editable_fields, extracted_profile")
    .eq("id", orderId)
    .single();
  if (loadError || !order?.id) return NextResponse.json({ error: loadError?.message || "Order not found" }, { status: 404 });

  const currentFields = isRecord(order.editable_fields) ? order.editable_fields : {};
  const preserved = {
    logo_url: currentFields.logo_url,
    gallery_images: currentFields.gallery_images,
    contact_info: currentFields.contact_info,
    address: currentFields.address,
    opening_hours: currentFields.opening_hours,
    employees: currentFields.employees,
    layout_variant: currentFields.layout_variant,
    style_preset: currentFields.style_preset,
  };
  const templateFields = buildLocalIndustryTemplateFields(template, String(order.company_name || "Bedriften"));
  const nextFields = replaceContent
    ? { ...currentFields, ...templateFields, ...Object.fromEntries(Object.entries(preserved).filter(([, value]) => value !== undefined)) }
    : { ...templateFields, ...currentFields, template_slug: template.slug, template_name: template.name };
  const currentProfile = isRecord(order.extracted_profile) ? order.extracted_profile : {};
  const nextProfile = {
    ...currentProfile,
    detected_industry: template.name,
    recommended_template_slug: template.slug,
    template_detection: {
      selected_template_slug: template.slug,
      confidence_level: "high",
      reason: "Valgt manuelt i DemoSites lokale bransjemaler.",
      matched_keywords: [],
      score: 100,
      fallback_used: false,
      considered_templates: [{ template_slug: template.slug, score: 100, matched_keywords: [], accepted: true }],
      analysis_version: "manual-local-template-v2",
    },
  };

  const basePatch = {
    editable_fields: nextFields,
    extracted_profile: nextProfile,
    status: "in_setup",
    updated_at: new Date().toISOString(),
  };
  const enhancedPatch = { ...basePatch, recommended_template_slug: template.slug };
  let update = await supabase.from("demo_site_orders").update(enhancedPatch).eq("id", orderId).select("*").single();
  if (update.error && `${update.error.message || ""}`.toLowerCase().includes("recommended_template_slug")) {
    update = await supabase.from("demo_site_orders").update(basePatch).eq("id", orderId).select("*").single();
  }
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });

  await supabase.from("demo_site_order_events").insert({
    order_id: orderId,
    event_type: "local_template_selected",
    title: `Bransjemal valgt: ${template.name}`,
    description: replaceContent ? "Bransjeinnhold og CTA-er ble oppdatert. Logo, bilder og kontaktinformasjon ble beholdt." : "Bransjemalen ble valgt uten å erstatte eksisterende innhold.",
    metadata: { template_slug: template.slug, replace_content: replaceContent },
  }).catch(() => null);

  return NextResponse.json({ order: update.data, template: { slug: template.slug, name: template.name } });
}
