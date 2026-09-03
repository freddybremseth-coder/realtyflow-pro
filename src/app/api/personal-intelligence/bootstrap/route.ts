import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase } from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });

    const ownerUserId = getPersonalIntelligenceOwnerUserId();
    const supabase = getPersonalIntelligenceSupabase();
    const displayName = process.env.PERSONAL_INTELLIGENCE_OWNER_DISPLAY_NAME?.trim() || "Freddy Bremseth";

    const { data: existing, error: lookupError } = await supabase
      .schema("personal_core")
      .from("entities")
      .select("id,display_name,canonical_name,privacy_level,status")
      .eq("owner_user_id", ownerUserId)
      .eq("entity_type", "person")
      .eq("canonical_name", displayName)
      .maybeSingle();
    if (lookupError) throw new Error(`Personal Intelligence bootstrap lookup failed: ${lookupError.message}`);

    if (existing) return NextResponse.json({ ok: true, created: false, subject: existing });

    const { data: created, error: createError } = await supabase
      .schema("personal_core")
      .from("entities")
      .insert({
        owner_user_id: ownerUserId,
        entity_type: "person",
        display_name: displayName,
        canonical_name: displayName,
        description: "Canonical owner identity for the private Personal Intelligence OS alpha.",
        status: "active",
        privacy_level: "internal",
        metadata: { canonical_owner: true, private_alpha: true },
      })
      .select("id,display_name,canonical_name,privacy_level,status")
      .single();
    if (createError || !created) throw new Error(`Personal Intelligence bootstrap create failed: ${createError?.message || "missing entity"}`);

    return NextResponse.json({ ok: true, created: true, subject: created });
  } catch (error) {
    console.error("[Personal Intelligence Bootstrap]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Personal Intelligence bootstrap failed" }, { status: 500 });
  }
}
