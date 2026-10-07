import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildCorporateDecisionNoteReport,
  normalizeCorporateDecisionNoteTemplate,
} from "@/lib/corporate-decision-note";
import {
  corporateDecisionEmailHtml,
  corporateDecisionEmailSubject,
  corporateDecisionEmailText,
} from "@/lib/corporate-decision-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request, { error: "Unauthorized" });
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const template = normalizeCorporateDecisionNoteTemplate(body?.template);
  const sample = body?.sample && typeof body.sample === "object" && !Array.isArray(body.sample)
    ? body.sample
    : {};

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
      propertyPrice: Number(sample.propertyPrice || 650000),
      users: Number(sample.users || 80),
      employeeWeeks: Number(sample.employeeWeeks || 18),
      annualOperating: Number(sample.annualOperating || 16000),
      acquisitionPct: Number(sample.acquisitionPct || 12),
      capitalPct: Number(sample.capitalPct || 4),
      valuePct: Number(sample.valuePct || 3),
      holdingYears: Number(sample.holdingYears || 10),
      stays: [
        { name: "Ledersamling", eventsPerYear: 2, people: 8, nights: 4, pricePerPersonNight: 180 },
        { name: "Team-/kundesamling", eventsPerYear: 3, people: 12, nights: 3, pricePerPersonNight: 160 },
      ],
    },
  });

  return NextResponse.json({
    subject: corporateDecisionEmailSubject(report, true),
    bodyText: corporateDecisionEmailText(report, true),
    bodyHtml: corporateDecisionEmailHtml(report, true),
    sent: false,
    note: "Preview only. No email is sent and no CRM/prospect data is written.",
  });
}
