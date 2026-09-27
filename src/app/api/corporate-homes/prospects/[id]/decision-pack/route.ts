import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildCorporateDecisionPack } from "@/lib/corporate-decision-pack";

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
  const denied = await requireAdminApi(request, { decisionPack: null });
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

  let pack;
  try {
    pack = buildCorporateDecisionPack(prospect);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke bygge beslutningspakken." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const currentEvidence = prospect.evidence && typeof prospect.evidence === "object" ? prospect.evidence : {};
  const persistedPack = {
    ...pack,
    generated_at: now,
  };

  const { data: updatedProspect, error: updateError } = await supabase
    .from("corporate_prospects")
    .update({
      evidence: {
        ...currentEvidence,
        corporate_decision_pack: persistedPack,
      },
      next_action: "Kvalitetssjekk Corporate Decision Pack og avklar styre-/lederbeslutning, rådgiverbehov og eventuell visningsplan.",
      updated_at: now,
    })
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    prospect: updatedProspect,
    decisionPack: persistedPack,
    governance: {
      customer_shared: false,
      automatic_customer_contact: false,
      human_quality_check_required: true,
    },
  });
}
