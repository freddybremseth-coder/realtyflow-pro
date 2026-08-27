import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { buildImportedLeadIntelligence, type ImportedLeadLike } from "@/lib/nexus-imported-lead-intelligence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeLead(value: unknown): ImportedLeadLike | null {
  if (!isRecord(value)) return null;
  const preferences = isRecord(value.preferences) ? value.preferences : null;
  return {
    type: typeof value.type === "string" ? value.type.slice(0, 80) : null,
    property_interest: typeof value.property_interest === "string" ? value.property_interest.slice(0, 2000) : null,
    notes: typeof value.notes === "string" ? value.notes.slice(0, 5000) : null,
    preferences: preferences
      ? {
          property_type: typeof preferences.property_type === "string" ? preferences.property_type.slice(0, 120) : null,
          location: typeof preferences.location === "string" ? preferences.location.slice(0, 500) : null,
          features: Array.isArray(preferences.features) ? preferences.features.slice(0, 50).map(String) : [],
          other: Array.isArray(preferences.other) ? preferences.other.slice(0, 50).map(String) : [],
        }
      : null,
  };
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const lead = sanitizeLead(body?.lead);
  if (!lead) return NextResponse.json({ error: "lead object required" }, { status: 400 });

  const buyerIntelligence = buildImportedLeadIntelligence(lead);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    buyerIntelligence,
    safety: {
      readOnly: true,
      crmUpdated: false,
      buyerProfileUpdated: false,
      persistenceRecommended: false,
      note: "Review persona/lifestyle candidates before linking them to a new or existing lead.",
    },
  });
}
