import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [{ data: rules, error: rulesError }, { data: observations, error: obsError }] = await Promise.all([
    supabase.from("nexus_communication_learning_rules").select("brand_id,dimension,value,sample,avg_edit_ratio,reply_rate,qualified_lead_rate,meeting_rate,sale_rate,evidence,verdict,finding,status,updated_at").eq("status","active").order("updated_at",{ascending:false}),
    supabase.from("nexus_communication_learning_observations").select("brand_id,event_type,edit_ratio,occurred_at").gte("occurred_at",new Date(Date.now()-90*86_400_000).toISOString()).limit(15000),
  ]);
  if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 500 });
  if (obsError) return NextResponse.json({ error: obsError.message }, { status: 500 });

  const obs:any[] = observations || [];
  const byBrand:Record<string,any> = {};
  for (const row of obs) {
    const brand=String(row.brand_id||"unknown");
    byBrand[brand] ||= { drafts:0, edits:0, sent:0, replies:0, avgEditRatio:0, editRatioSum:0 };
    if (row.event_type==="draft_created") byBrand[brand].drafts++;
    if (row.event_type==="user_edit") { byBrand[brand].edits++; byBrand[brand].editRatioSum += Number(row.edit_ratio||0); }
    if (row.event_type==="sent") byBrand[brand].sent++;
    if (row.event_type==="reply_received") byBrand[brand].replies++;
  }
  for (const value of Object.values(byBrand) as any[]) {
    value.avgEditRatio = value.edits ? value.editRatioSum/value.edits : 0;
    value.replyRate = value.sent ? value.replies/value.sent : 0;
    delete value.editRatioSum;
  }

  const activeRules:any[] = rules || [];
  return NextResponse.json({
    generatedAt:new Date().toISOString(),
    windowDays:90,
    summary:{
      brands:Object.keys(byBrand).length,
      observations:obs.length,
      rules:activeRules.length,
      actionable:activeRules.filter(r=>["prefer","avoid"].includes(r.verdict) && ["moderate","strong"].includes(r.evidence)).length,
      strong:activeRules.filter(r=>r.evidence==="strong").length,
    },
    byBrand,
    rules:activeRules,
    policy:{
      minimumForLimited:5,
      minimumForModerate:10,
      minimumForStrong:25,
      note:"Prefer/avoid påvirker ikke sending alene. Regler må ha moderate/strong evidence før de kan brukes som aktive draft-signaler."
    }
  });
}
