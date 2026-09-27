import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
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

function assessmentFromEvidence(evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return {};
  const raw = (evidence as Record<string, unknown>).corporate_assessment;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
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

function normalizedText(property: Record<string, unknown>) {
  return [
    property.title,
    property.title_no,
    property.title_en,
    property.location,
    property.town,
    property.municipality,
    property.area,
    property.region,
    property.property_type,
    property.type,
  ].filter(Boolean).join(" ").toLowerCase();
}

function scoreProperty(property: Record<string, unknown>, assessment: Record<string, unknown>) {
  let score = 0;
  const reasons: string[] = [];
  const cautions: string[] = [];

  const price = numberValue(property.price) || 0;
  const minBudget = numberValue(assessment.budget_min_eur);
  const maxBudget = numberValue(assessment.budget_max_eur);
  if (maxBudget) {
    if (price > 0 && price <= maxBudget) {
      score += 35;
      reasons.push("Innenfor maksbudsjett");
    } else if (price > maxBudget) {
      cautions.push("Over oppgitt maksbudsjett");
      score -= 35;
    } else {
      cautions.push("Pris mangler");
    }
  }
  if (minBudget && price >= minBudget) {
    score += 5;
    reasons.push("Innenfor ønsket budsjettintervall");
  }

  const bedrooms = numberValue(property.bedrooms) || 0;
  const bedroomsMin = numberValue(assessment.bedrooms_min);
  if (bedroomsMin) {
    if (bedrooms >= bedroomsMin) {
      score += 25;
      reasons.push(`${bedrooms} soverom møter minimumskravet`);
    } else {
      score -= 25;
      cautions.push(`Kun ${bedrooms || "ukjent antall"} soverom`);
    }
  }

  const haystack = normalizedText(property);
  const area = textValue(assessment.preferred_area).toLowerCase();
  if (area && !/åpen|costa blanca\s*\/\s*åpen/.test(area)) {
    const terms = area.split(/[,/;]|\seller\s|\bor\b/i).map((term) => term.trim()).filter((term) => term.length >= 3);
    if (terms.some((term) => haystack.includes(term))) {
      score += 20;
      reasons.push("Matcher ønsket område");
    } else {
      cautions.push("Områdematch ikke bekreftet");
    }
  }

  const propertyType = textValue(assessment.property_type).toLowerCase();
  if (propertyType) {
    const typeTerms = propertyType.split(/[,/]|\seller\s/i).map((term) => term.trim()).filter((term) => term.length >= 3);
    if (typeTerms.some((term) => haystack.includes(term))) {
      score += 10;
      reasons.push("Matcher ønsket boligtype");
    }
  }

  if (property.pool === true || String(property.pool || "").toLowerCase() === "true") {
    score += 3;
    reasons.push("Basseng");
  }

  const parkingText = [property.parking, property.garage, property.features, property.description_no, property.description]
    .filter(Boolean).join(" ").toLowerCase();
  if (/parking|parkering|garage|garasje/.test(parkingText)) {
    score += 2;
    reasons.push("Parkering/garasje indikert");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons, cautions };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi(request, { properties: [] });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", properties: [] }, { status: 500 });

  const { id } = await context.params;
  const { data: prospect, error: prospectError } = await supabase
    .from("corporate_prospects")
    .select("id,company_name,evidence")
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (prospectError) return NextResponse.json({ error: prospectError.message, properties: [] }, { status: 500 });
  if (!prospect) return NextResponse.json({ error: "Prospect not found", properties: [] }, { status: 404 });

  const assessment = assessmentFromEvidence(prospect.evidence);
  const maxBudget = numberValue(assessment.budget_max_eur);
  const bedroomsMin = numberValue(assessment.bedrooms_min);
  const area = textValue(assessment.preferred_area);
  const propertyType = textValue(assessment.property_type);

  if (!maxBudget || !bedroomsMin || !area || !propertyType) {
    return NextResponse.json({
      error: "Corporate Home Assessment mangler budsjett, soverom, område eller boligtype.",
      properties: [],
      ready: false,
    }, { status: 409 });
  }

  const { data: properties, error } = await supabase.from("properties").select("*").limit(1000);
  if (error) return NextResponse.json({ error: error.message, properties: [] }, { status: 500 });

  const candidates = (properties || [])
    .filter((property: any) => isVisible(property))
    .filter((property: any) => propertyMatchesBrand(property, "zeneco"))
    .map((property: any) => ({ property, match: scoreProperty(property, assessment) }))
    .filter((row) => row.match.score >= 20)
    .sort((a, b) => b.match.score - a.match.score || Number(a.property.price || 0) - Number(b.property.price || 0))
    .slice(0, 12)
    .map(({ property, match }, index) => ({
      id: property.id,
      ref: property.ref || property.external_id,
      title: property.title_no || property.title_en || property.title,
      location: property.location || property.town || property.municipality,
      price: property.price,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      built_area: property.built_area || property.area,
      property_type: property.property_type || property.type,
      pool: property.pool,
      primary_image: property.primary_image,
      rank: index + 1,
      corporate_match_score: match.score,
      corporate_match_reasons: match.reasons,
      corporate_match_cautions: match.cautions,
    }));

  return NextResponse.json({
    ready: true,
    prospect: { id: prospect.id, company_name: prospect.company_name },
    assessment,
    properties: candidates,
    generatedAt: new Date().toISOString(),
    note: "Shortlisten er et internt arbeidsgrunnlag og må kvalitetssikres før den deles med kunden.",
  });
}
