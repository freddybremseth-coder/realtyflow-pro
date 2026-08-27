import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdminApi } from "@/lib/api-admin";
import { buildBuyerLifestyleProfile } from "@/lib/nexus-buyer-lifestyle";
import { rankAreasByLifestyle } from "@/lib/nexus-area-lifestyle-match";

export const runtime = "nodejs";

const QuerySchema = z.object({
  contactId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdminApi(req);
  if (unauthorized) return unauthorized;

  const parsed = QuerySchema.safeParse({
    contactId: req.nextUrl.searchParams.get("contactId"),
    limit: req.nextUrl.searchParams.get("limit") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Valid contactId is required" }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: profiles, error: profileError } = await supabase
    .from("buyer_profiles")
    .select("id, brand, contact_id, version, status, approved_at, updated_at")
    .eq("contact_id", parsed.data.contactId)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .order("approved_at", { ascending: false })
    .limit(1);

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  const profile = profiles?.[0];
  if (!profile) {
    return NextResponse.json({
      contactId: parsed.data.contactId,
      buyerProfile: null,
      lifestyle: { preferences: [], confirmed: 0, inferred: 0 },
      areas: [],
      reason: "No approved Buyer Profile exists for this contact.",
    });
  }

  const [{ data: criteria, error: criteriaError }, { data: areas, error: areasError }] = await Promise.all([
    supabase
      .from("buyer_profile_criteria")
      .select("key, other_key, criterion_type, value, weight, source, source_text, confidence, customer_confirmed, approval_status, active")
      .eq("buyer_profile_id", profile.id)
      .eq("active", true)
      .eq("approval_status", "approved"),
    supabase
      .from("area_profiles")
      .select("id, name, slug, hero_blurb, description, highlights, lifestyle, climate, brand_id")
      .eq("brand_id", profile.brand),
  ]);

  if (criteriaError) return NextResponse.json({ error: criteriaError.message }, { status: 500 });
  if (areasError) return NextResponse.json({ error: areasError.message }, { status: 500 });

  const lifestyle = buildBuyerLifestyleProfile(criteria || []);
  const ranked = rankAreasByLifestyle(areas || [], lifestyle.preferences)
    .slice(0, parsed.data.limit);

  return NextResponse.json({
    contactId: parsed.data.contactId,
    buyerProfile: {
      id: profile.id,
      brand: profile.brand,
      version: profile.version,
      approvedAt: profile.approved_at,
    },
    lifestyle: {
      preferences: lifestyle.preferences,
      confirmed: lifestyle.confirmed.length,
      inferred: lifestyle.inferred.length,
      strong: lifestyle.strong.length,
      hasVerifiedLifestyleEvidence: lifestyle.hasVerifiedLifestyleEvidence,
    },
    areas: ranked,
    meta: {
      areaCount: (areas || []).length,
      scoredAreaCount: ranked.length,
      readOnly: true,
    },
  });
}
