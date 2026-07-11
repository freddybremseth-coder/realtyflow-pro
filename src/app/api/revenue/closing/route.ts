import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildClosingOpportunity, sortClosingOpportunities } from "@/lib/revenue/closing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { opportunities: [], summary: null });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", opportunities: [] }, { status: 500 });

  const { data, error } = await supabase
    .from("contacts")
    .select("id,name,email,phone,pipeline_status,pipeline_value,property_interest,notes,interactions,brand_id,brand,last_contact,next_followup,updated_at")
    .in("pipeline_status", ["QUALIFIED", "VIEWING", "NEGOTIATION"])
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) return NextResponse.json({ error: error.message, opportunities: [] }, { status: 500 });

  const opportunities = sortClosingOpportunities(
    (data || []).map((contact) => buildClosingOpportunity(contact)).filter(Boolean) as NonNullable<ReturnType<typeof buildClosingOpportunity>>[],
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      activeDeals: opportunities.length,
      highRisk: opportunities.filter((item) => item.risk === "HIGH").length,
      viewings: opportunities.filter((item) => item.stage === "VIEWING").length,
      negotiations: opportunities.filter((item) => item.stage === "NEGOTIATION").length,
      blockedDeals: opportunities.filter((item) => item.blockers.length > 0).length,
      pipelineValue: opportunities.reduce((sum, item) => sum + item.value, 0),
    },
    opportunities,
  });
}
