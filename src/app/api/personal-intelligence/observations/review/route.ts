import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function ownerSubject(request: NextRequest) {
  const access = await getRequestAccessContext(request);
  if (!access || access.role !== "OWNER") return { error: NextResponse.json({ error: "Owner session required" }, { status: 401 }) };
  const supabase = getPersonalIntelligenceSupabase();
  const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
  const { data: subject } = await supabase.schema("personal_core").from("entities")
    .select("id").eq("owner_user_id", ownerUserId).eq("entity_type", "person")
    .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME).single();
  if (!subject?.id) return { error: NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 }) };
  return { supabase, ownerUserId, subjectEntityId: String(subject.id) };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await ownerSubject(request);
    if ("error" in ctx) return ctx.error;
    const { data, error } = await ctx.supabase.schema("mentor").from("observations")
      .select("id,observation,category,evidence_json,confidence,status,requires_confirmation,privacy_level,session_id,created_at,updated_at")
      .eq("owner_user_id", ctx.ownerUserId).eq("subject_entity_id", ctx.subjectEntityId)
      .order("updated_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, observations: data || [], writesPerformed: 0, semantics: { observationsAreNotFacts: true, promotionAvailable: false } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Observation review failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await ownerSubject(request);
    if ("error" in ctx) return ctx.error;
    const body = await request.json().catch(() => ({}));
    const observationId = String(body?.observationId || "").trim();
    const nextStatus = body?.status === "validated" ? "validated" : body?.status === "rejected" ? "rejected" : null;
    if (!observationId || !nextStatus) return NextResponse.json({ error: "observationId and status=validated|rejected are required" }, { status: 400 });

    const { data: current, error: currentError } = await ctx.supabase.schema("mentor").from("observations")
      .select("id,status,observation,session_id").eq("id", observationId)
      .eq("owner_user_id", ctx.ownerUserId).eq("subject_entity_id", ctx.subjectEntityId).single();
    if (currentError || !current) return NextResponse.json({ error: "Observation not found" }, { status: 404 });
    if (current.status !== "candidate") return NextResponse.json({ error: "Only candidate observations can be reviewed" }, { status: 409 });

    const { error: updateError } = await ctx.supabase.schema("mentor").from("observations")
      .update({ status: nextStatus, requires_confirmation: false }).eq("id", observationId)
      .eq("owner_user_id", ctx.ownerUserId).eq("subject_entity_id", ctx.subjectEntityId).eq("status", "candidate");
    if (updateError) throw new Error(updateError.message);

    const { error: auditError } = await ctx.supabase.schema("mentor").from("audit_events").insert({
      owner_user_id: ctx.ownerUserId,
      session_id: current.session_id || null,
      event_type: "observation_reviewed",
      resource_schema: "mentor",
      resource_type: "observation",
      resource_id: observationId,
      details: { prior_status: "candidate", new_status: nextStatus, promotion_to_claim: false },
    });
    if (auditError) {
      await ctx.supabase.schema("mentor").from("observations")
        .update({ status: "candidate" }).eq("id", observationId).eq("owner_user_id", ctx.ownerUserId).eq("subject_entity_id", ctx.subjectEntityId);
      throw new Error(`Observation audit failed: ${auditError.message}`);
    }

    return NextResponse.json({ ok: true, observationId, status: nextStatus, promotedToClaim: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Observation review failed" }, { status: 500 });
  }
}
