import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { createConfirmedClaim } from "@/lib/personal-intelligence/claim-service";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase } from "@/lib/personal-intelligence/supabase";
import type { PersonalPrivacyLevel } from "@/lib/personal-intelligence/privacy-policy";

const ALLOWED_CLAIM_TYPES = new Set(["fact", "preference", "belief", "interest"]);
const ALLOWED_PRIVACY = new Set<PersonalPrivacyLevel>(["public", "internal", "private", "sensitive", "restricted"]);

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") {
      return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    }

    const body = await request.json();
    const observationId = String(body?.observationId || "").trim();
    const predicate = String(body?.predicate || "").trim();
    const valueText = String(body?.valueText || "").trim();
    const claimType = String(body?.claimType || "").trim();
    const privacyLevel = String(body?.privacyLevel || "internal") as PersonalPrivacyLevel;

    if (!observationId || !predicate || !valueText) {
      return NextResponse.json({ error: "observationId, predicate and valueText are required" }, { status: 400 });
    }
    if (!ALLOWED_CLAIM_TYPES.has(claimType)) {
      return NextResponse.json({ error: "claimType must be fact, preference, belief or interest" }, { status: 400 });
    }
    if (!ALLOWED_PRIVACY.has(privacyLevel)) {
      return NextResponse.json({ error: "Invalid privacy level" }, { status: 400 });
    }

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: observation, error: observationError } = await supabase.schema("mentor").from("observations")
      .select("id,subject_entity_id,session_id,observation,confidence,status,privacy_level")
      .eq("id", observationId).eq("owner_user_id", ownerUserId).single();

    if (observationError || !observation?.id) {
      return NextResponse.json({ error: "Observation not found" }, { status: 404 });
    }
    if (observation.status !== "validated") {
      return NextResponse.json({ error: "Only validated observations can be promoted" }, { status: 409 });
    }

    const { claimId, sourceId } = await createConfirmedClaim(supabase, {
      ownerUserId,
      subjectEntityId: String(observation.subject_entity_id),
      predicate,
      valueText,
      claimType,
      confidence: Math.min(0.99, Math.max(0.5, Number(observation.confidence) || 0.5)),
      privacyLevel,
      sourceExcerpt: String(observation.observation),
      sourceName: "Explicit promotion from validated mentor observation",
      sourceSystem: "personal_intelligence_observation_promotion",
    });

    const cleanupClaim = async () => {
      await supabase.schema("personal_core").from("claims").delete().eq("id", claimId).eq("owner_user_id", ownerUserId);
      await supabase.schema("personal_core").from("sources").delete().eq("id", sourceId).eq("owner_user_id", ownerUserId);
    };

    const { error: statusError } = await supabase.schema("mentor").from("observations")
      .update({ status: "promoted" }).eq("id", observationId).eq("owner_user_id", ownerUserId).eq("status", "validated");
    if (statusError) {
      await cleanupClaim();
      throw new Error(`Observation promotion status failed: ${statusError.message}`);
    }

    const { error: auditError } = await supabase.schema("mentor").from("audit_events").insert({
      owner_user_id: ownerUserId,
      session_id: observation.session_id || null,
      event_type: "observation_promoted_to_claim",
      resource_schema: "mentor",
      resource_type: "observation",
      resource_id: observationId,
      details: { claimId, sourceId, predicate, claimType, privacyLevel, explicitOwnerConfirmation: true },
    });

    if (auditError) {
      await supabase.schema("mentor").from("observations").update({ status: "validated" })
        .eq("id", observationId).eq("owner_user_id", ownerUserId).eq("status", "promoted");
      await cleanupClaim();
      throw new Error(`Observation promotion audit failed: ${auditError.message}`);
    }

    return NextResponse.json({ ok: true, observationId, claimId, sourceId, status: "promoted", explicitOwnerConfirmation: true });
  } catch (error) {
    console.error("[Personal Intelligence observation promotion]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Observation promotion failed" }, { status: 500 });
  }
}
