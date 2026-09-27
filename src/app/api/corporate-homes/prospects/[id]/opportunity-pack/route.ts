import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildCorporateOpportunityPack,
  opportunityPackToText,
} from "@/lib/corporate-opportunity-pack";

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
  const denied = await requireAdminApi(request, { prospect: null, pack: null });
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
    pack = buildCorporateOpportunityPack(prospect);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke bygge Opportunity Pack." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const currentEvidence = prospect.evidence && typeof prospect.evidence === "object" ? prospect.evidence : {};
  const { data: updatedProspect, error: updateError } = await supabase
    .from("corporate_prospects")
    .update({
      evidence: {
        ...currentEvidence,
        corporate_opportunity_pack: pack,
      },
      next_action: pack.recommended_next_step,
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
    .eq("source_type", "corporate_opportunity")
    .eq("source_id", id)
    .maybeSingle();

  if (existingWorkItem?.id) {
    await supabase.from("work_items").update({
      next_action: pack.recommended_next_step,
      description: "Opportunity Pack er bygget internt. Kvalitetssjekk topp 3 og velg kandidat(er) for neste beslutningsrunde.",
      metadata: {
        segment: "corporate_homes",
        prospect_id: id,
        opportunity_pack_generated_at: pack.generated_at,
        shortlist_count: pack.shortlist.length,
        customer_shared: false,
        automatic_customer_contact: false,
      },
      updated_at: now,
    }).eq("id", existingWorkItem.id);
  }

  return NextResponse.json({
    prospect: updatedProspect,
    pack,
    text: opportunityPackToText(pack),
    automation: {
      customer_shared: false,
      customer_message_sent: false,
      personal_enrichment: false,
      note: "Opportunity Pack ble bare lagret internt.",
    },
  });
}
