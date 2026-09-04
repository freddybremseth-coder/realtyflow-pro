import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase, PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME } from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function bounded01(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

async function ownerContext(request: NextRequest) {
  const access = await getRequestAccessContext(request);
  if (!access || access.role !== "OWNER") return null;
  const supabase = getPersonalIntelligenceSupabase();
  const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
  const { data: subject } = await supabase.schema("personal_core").from("entities").select("id")
    .eq("owner_user_id", ownerUserId).eq("entity_type", "person")
    .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME).single();
  if (!subject?.id) throw new Error("Personal Intelligence owner is not bootstrapped");
  return { supabase, ownerUserId, subjectEntityId: String(subject.id) };
}

export async function GET(request: NextRequest) {
  try {
    const context = await ownerContext(request);
    if (!context) return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const { supabase, ownerUserId, subjectEntityId } = context;
    const { data, error } = await supabase.schema("beliefs").from("predictions")
      .select("id,statement,probability,deadline,domain,status,outcome,calibration_score,created_at,resolved_at")
      .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, predictions: data || [], writesPerformed: 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Prediction read failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await ownerContext(request);
    if (!context) return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const { supabase, ownerUserId, subjectEntityId } = context;
    const body = await request.json() as Record<string, unknown>;
    const statement = typeof body.statement === "string" ? body.statement.trim() : "";
    const probability = bounded01(body.probability);
    if (statement.length < 4 || probability == null) return NextResponse.json({ error: "Statement and probability 0-1 are required" }, { status: 400 });
    const { data, error } = await supabase.schema("beliefs").from("predictions").insert({
      owner_user_id: ownerUserId, subject_entity_id: subjectEntityId, statement, probability,
      deadline: typeof body.deadline === "string" && body.deadline ? body.deadline : null,
      domain: typeof body.domain === "string" ? body.domain.trim() || null : null,
      status: "open",
    }).select("id,statement,probability,deadline,domain,status,created_at").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, prediction: data, writesPerformed: 1 }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Prediction create failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await ownerContext(request);
    if (!context) return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const { supabase, ownerUserId, subjectEntityId } = context;
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const outcome = body.outcome === true ? 1 : body.outcome === false ? 0 : null;
    if (!id || outcome == null) return NextResponse.json({ error: "Prediction id and boolean outcome are required" }, { status: 400 });
    const { data: existing, error: readError } = await supabase.schema("beliefs").from("predictions")
      .select("id,probability,status").eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId).eq("id", id).single();
    if (readError || !existing) return NextResponse.json({ error: "Prediction not found" }, { status: 404 });
    if (existing.status !== "open") return NextResponse.json({ error: "Only open predictions can be resolved" }, { status: 409 });
    const p = Number(existing.probability);
    const calibrationScore = 1 - Math.pow(p - outcome, 2);
    const { data, error } = await supabase.schema("beliefs").from("predictions").update({
      status: "resolved", outcome: outcome === 1 ? "true" : "false", calibration_score: calibrationScore, resolved_at: new Date().toISOString(),
    }).eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId).eq("id", id)
      .select("id,statement,probability,status,outcome,calibration_score,resolved_at").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, prediction: data, writesPerformed: 1, metric: "1 - (p - outcome)^2" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Prediction resolution failed" }, { status: 500 });
  }
}
