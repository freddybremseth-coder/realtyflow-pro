import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildCorporateExecutionPlan } from "@/lib/corporate-execution-plan";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi(request, { executionPlan: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { id } = await context.params;
  const { data: prospect, error: prospectError } = await supabase
    .from("corporate_prospects")
    .select("*")
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (prospectError) return NextResponse.json({ error: prospectError.message }, { status: 500 });
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  let plan;
  try {
    plan = buildCorporateExecutionPlan({
      status: prospect.status,
      evidence: prospect.evidence,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke bygge gjennomføringsplan." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const currentEvidence = prospect.evidence && typeof prospect.evidence === "object" ? prospect.evidence : {};
  const persistedPlan = { ...plan, created_at: now };

  const { data: updatedProspect, error: updateError } = await supabase
    .from("corporate_prospects")
    .update({
      evidence: {
        ...currentEvidence,
        corporate_execution_plan: persistedPlan,
      },
      next_action: plan.next_action,
      updated_at: now,
    })
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { data: existingWorkItem } = await supabase
    .from("work_items")
    .select("id")
    .eq("brand_id", "zeneco")
    .eq("source_type", "corporate_execution_plan")
    .eq("source_id", id)
    .maybeSingle();

  const workItem = {
    title: `${plan.kind === "VIEWING_PLAN" ? "Corporate visningsplan" : "Corporate tilbudspreflight"} · ${String(prospect.company_name || "Selskap")}`,
    description: plan.kind === "VIEWING_PLAN"
      ? "Intern plan for å kontrollere og koordinere godkjente visningskandidater."
      : "Intern preflight før et konkret tilbud eller reservasjon kan diskuteres.",
    status: "TO_DO",
    priority: "HIGH",
    brand_id: "zeneco",
    source_type: "corporate_execution_plan",
    source_id: id,
    assigned_agent: "sales",
    next_action: plan.next_action,
    ai_score: Math.max(88, Number(prospect.fit_score || 0)),
    metadata: {
      segment: "corporate_homes",
      prospect_id: id,
      plan_kind: plan.kind,
      external_execution: false,
      customer_message_sent: false,
      offer_sent: false,
      reservation_created: false,
    },
    updated_at: now,
  };

  if (existingWorkItem?.id) {
    await supabase.from("work_items").update(workItem).eq("id", existingWorkItem.id);
  } else {
    await supabase.from("work_items").insert({ ...workItem, created_at: now });
  }

  return NextResponse.json({
    prospect: updatedProspect,
    executionPlan: persistedPlan,
    automation: {
      external_execution: false,
      customer_message_sent: false,
      calendar_action_created: false,
      offer_sent: false,
      reservation_created: false,
    },
  });
}
