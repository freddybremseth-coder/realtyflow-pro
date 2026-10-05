import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { scoreCorporateProperty } from "@/lib/corporate-property-match";
import { propertyMatchesBrand } from "@/lib/realty/brand-rules";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function assessmentFromEvidence(evidence: unknown) {
  return objectValue(objectValue(evidence).corporate_assessment);
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function textValue(value: unknown) {
  return String(value ?? "").trim();
}

function isVisible(property: Record<string, unknown>) {
  return property.show_on_website !== false && property.website_visible !== false;
}

function propertyWebsiteUrl(ref: unknown) {
  const value = textValue(ref);
  return value ? `https://www.zenecohomes.com/eiendommer/${encodeURIComponent(value)}` : null;
}

function propertyRealtyFlowUrl(id: unknown, ref: unknown) {
  const propertyId = textValue(id);
  if (propertyId) return `/inventory?propertyId=${encodeURIComponent(propertyId)}`;
  const propertyRef = textValue(ref);
  return propertyRef ? `/inventory?propertyRef=${encodeURIComponent(propertyRef)}` : null;
}

async function loadProspectAndMatches(supabase: ReturnType<typeof getSupabase>, id: string) {
  if (!supabase) throw new Error("Supabase not configured");

  const { data: prospect, error: prospectError } = await supabase
    .from("corporate_prospects")
    .select("id,company_name,evidence,next_action")
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (prospectError) throw prospectError;
  if (!prospect) return { status: 404 as const, error: "Prospect not found" };

  const assessment = assessmentFromEvidence(prospect.evidence);
  const maxBudget = numberValue(assessment.budget_max_eur);
  const bedroomsMin = numberValue(assessment.bedrooms_min);
  const area = textValue(assessment.preferred_area);
  const propertyType = textValue(assessment.property_type);

  if (!maxBudget || !bedroomsMin || !area || !propertyType) {
    return {
      status: 409 as const,
      error: "Corporate Home Assessment mangler budsjett, soverom, område eller boligtype.",
      prospect,
      assessment,
    };
  }

  const { data: properties, error } = await supabase
    .from("properties")
    .select("*")
    .limit(2000);
  if (error) throw error;

  const candidates = (properties || [])
    .filter((property: any) => isVisible(property))
    .filter((property: any) => propertyMatchesBrand(property, "zeneco"))
    .map((property: any) => ({ property, match: scoreCorporateProperty(property, assessment) }))
    .filter((row) => row.match.score >= 35)
    .sort((a, b) => b.match.score - a.match.score || Number(a.property.price || 0) - Number(b.property.price || 0))
    .slice(0, 12)
    .map(({ property, match }, index) => ({
      id: property.id,
      ref: property.ref || property.external_id,
      title: property.title_no || property.title || property.model_name,
      location: property.location || property.town,
      price: property.price,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      built_area: property.built_area || property.area_m2,
      plot_size: property.plot_size,
      property_type: property.property_type || property.type,
      pool: property.pool,
      garage: property.garage,
      primary_image: property.primary_image,
      website_url: propertyWebsiteUrl(property.ref || property.external_id),
      realtyflow_url: propertyRealtyFlowUrl(property.id, property.ref || property.external_id),
      rank: index + 1,
      corporate_match_score: match.score,
      corporate_model: match.model,
      corporate_use_classification: match.classification,
      corporate_match_reasons: match.reasons,
      corporate_match_cautions: match.cautions,
    }));

  return {
    status: 200 as const,
    prospect,
    assessment,
    properties: candidates,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi(request, { properties: [] });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", properties: [] }, { status: 500 });

  const { id } = await context.params;
  try {
    const result = await loadProspectAndMatches(supabase, id);
    if (result.status !== 200) {
      return NextResponse.json({
        error: result.error,
        properties: [],
        ready: result.status !== 409 ? undefined : false,
      }, { status: result.status });
    }

    return NextResponse.json({
      ready: true,
      prospect: { id: result.prospect.id, company_name: result.prospect.company_name },
      assessment: result.assessment,
      properties: result.properties,
      generatedAt: new Date().toISOString(),
      persisted: false,
      note: "Forhåndsvisning. Shortlisten må kvalitetssikres og lagres før den brukes videre.",
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Corporate property match failed",
      properties: [],
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi(request, { properties: [] });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", properties: [] }, { status: 500 });

  const { id } = await context.params;
  try {
    const result = await loadProspectAndMatches(supabase, id);
    if (result.status !== 200) {
      return NextResponse.json({
        error: result.error,
        properties: [],
        ready: result.status !== 409 ? undefined : false,
      }, { status: result.status });
    }

    const now = new Date().toISOString();
    const currentEvidence = objectValue(result.prospect.evidence);
    const persistedShortlist = result.properties.slice(0, 5).map((property) => ({
      id: property.id,
      ref: property.ref,
      title: property.title,
      location: property.location,
      price: property.price,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      property_type: property.property_type,
      website_url: property.website_url,
      realtyflow_url: property.realtyflow_url,
      corporate_match_score: property.corporate_match_score,
      corporate_use_classification: property.corporate_use_classification,
      corporate_match_reasons: property.corporate_match_reasons.slice(0, 5),
      corporate_match_cautions: property.corporate_match_cautions.slice(0, 3),
    }));

    const propertyMatchEvidence = {
      generated_at: now,
      assessment_snapshot: result.assessment,
      shortlist: persistedShortlist,
      candidate_count: result.properties.length,
      customer_shared: false,
      human_quality_check_required: true,
      note: "Intern shortlist. Ingen automatisk kundedeling eller utsendelse.",
    };

    const { error: updateError } = await supabase
      .from("corporate_prospects")
      .update({
        evidence: {
          ...currentEvidence,
          corporate_property_match: propertyMatchEvidence,
        },
        next_action: persistedShortlist.length
          ? "Kvalitetssjekk topp 5 Corporate Home-treff før eventuell kundepresentasjon eller visningsplan."
          : "Juster Corporate Home Assessment; ingen bolig traff kriteriene godt nok.",
        updated_at: now,
      })
      .eq("id", id)
      .eq("brand_id", "zeneco");

    if (updateError) throw updateError;

    return NextResponse.json({
      ready: true,
      prospect: { id: result.prospect.id, company_name: result.prospect.company_name },
      assessment: result.assessment,
      properties: result.properties,
      persistedShortlist,
      generatedAt: now,
      persisted: true,
      customerShared: false,
      note: "Topp 5 er lagret som internt arbeidsgrunnlag og må kvalitetssikres før deling.",
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Corporate property match failed",
      properties: [],
    }, { status: 500 });
  }
}
