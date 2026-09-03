import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { correctClaim } from "@/lib/personal-intelligence/claim-service";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase } from "@/lib/personal-intelligence/supabase";
import type { PersonalPrivacyLevel } from "@/lib/personal-intelligence/privacy-policy";

const PRIVACY_LEVELS = new Set<PersonalPrivacyLevel>(["public", "internal", "private", "sensitive", "restricted"]);

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const claimId = typeof body.claimId === "string" ? body.claimId.trim() : "";
    const statement = typeof body.statement === "string" ? body.statement.trim() : "";
    const privacyLevel = body.privacyLevel == null ? null : String(body.privacyLevel) as PersonalPrivacyLevel;

    if (!claimId || !statement) return NextResponse.json({ error: "claimId and statement are required" }, { status: 400 });
    if (privacyLevel && !PRIVACY_LEVELS.has(privacyLevel)) return NextResponse.json({ error: "Invalid privacyLevel" }, { status: 400 });

    const ownerUserId = getPersonalIntelligenceOwnerUserId();
    const supabase = getPersonalIntelligenceSupabase();
    const { data: source, error: sourceError } = await supabase
      .schema("personal_core")
      .from("sources")
      .insert({
        owner_user_id: ownerUserId,
        source_type: "direct_user_statement",
        source_name: "Personal Intelligence memory correction",
        source_system: "personal_intelligence",
        reliability_class: "direct_current_user_correction",
        privacy_level: privacyLevel ?? "internal",
        source_date: new Date().toISOString(),
        metadata: { correction: true, prior_claim_id: claimId },
      })
      .select("id")
      .single();
    if (sourceError || !source?.id) throw new Error(`Failed to create correction source: ${sourceError?.message || "missing source id"}`);

    try {
      const replacementClaimId = await correctClaim(supabase, {
        ownerUserId,
        claimId,
        sourceId: String(source.id),
        valueText: statement,
        confidence: typeof body.confidence === "number" ? body.confidence : 0.99,
        privacyLevel,
      });
      return NextResponse.json({ ok: true, replacementClaimId, sourceId: String(source.id) });
    } catch (error) {
      await supabase.schema("personal_core").from("sources").delete().eq("id", source.id).eq("owner_user_id", ownerUserId);
      throw error;
    }
  } catch (error) {
    console.error("[Personal Intelligence Memory Correct]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Memory correction failed" }, { status: 500 });
  }
}
