import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  CORPORATE_DECISION_NOTE_TEMPLATE_KEY,
  DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE,
  buildCorporateDecisionNoteReport,
  normalizeCorporateDecisionNoteTemplate,
} from "@/lib/corporate-decision-note";
import { renderCorporateDecisionNotePdf } from "@/services/pdf/corporate-decision-note";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

async function savedTemplate() {
  const supabase = getSupabase();
  if (!supabase) return DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE;
  const { data } = await supabase
    .from("brand_settings")
    .select("settings,updated_at")
    .eq("brand_id", CORPORATE_DECISION_NOTE_TEMPLATE_KEY)
    .maybeSingle();
  return normalizeCorporateDecisionNoteTemplate({
    ...(data?.settings && typeof data.settings === "object" ? data.settings : {}),
    updated_at: data?.updated_at || null,
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request, { error: "Unauthorized" });
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const template = body?.template
    ? normalizeCorporateDecisionNoteTemplate(body.template)
    : await savedTemplate();

  const sample = body?.sample && typeof body.sample === "object" && !Array.isArray(body.sample)
    ? body.sample
    : {};

  const propertyPrice = Number(sample.propertyPrice || 650000);
  const users = Number(sample.users || 80);
  const employeeWeeks = Number(sample.employeeWeeks || 18);
  const annualOperating = Number(sample.annualOperating || 16000);
  const acquisitionPct = Number(sample.acquisitionPct || 12);
  const capitalPct = Number(sample.capitalPct || 4);
  const valuePct = Number(sample.valuePct || 3);
  const holdingYears = Number(sample.holdingYears || 10);

  const report = buildCorporateDecisionNoteReport({
    companyName: String(sample.companyName || "Nordic Example AS"),
    contactName: String(sample.contactName || "Kari Nordmann"),
    contactRole: String(sample.contactRole || "Daglig leder"),
    organizationType: "Bedrift",
    model: "Ansattbolig / bedriftshytte",
    budgetLabel: "€500 000–€750 000",
    timeline: "3–12 måneder",
    needs: String(sample.needs || "Vi ønsker en bolig som kan brukes til ledersamlinger, mindre teamsamlinger og som ansattgode gjennom året."),
    template,
    calculatorContext: {
      propertyPrice,
      users,
      employeeWeeks,
      annualOperating,
      acquisitionPct,
      capitalPct,
      valuePct,
      holdingYears,
      stays: [
        { name: "Ledersamling", eventsPerYear: 2, people: 8, nights: 4, pricePerPersonNight: 180 },
        { name: "Team-/kundesamling", eventsPerYear: 3, people: 12, nights: 3, pricePerPersonNight: 160 },
      ],
    },
  });

  const pdf = await renderCorporateDecisionNotePdf(report);
  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="corporate-decision-note-test.pdf"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
