import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { COMMUNICATION_LEARNING_SAFETY } from "@/lib/nexus/communication-learning";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

const TIMING_DIMENSIONS = new Set(["send_hour_utc", "weekday_utc"]);
const CONTENT_DIMENSIONS = new Set(["tone", "language", "intent", "message_length"]);

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [{ data: rules, error: rulesError }, { data: observations, error: obsError }] = await Promise.all([
    supabase.from("nexus_communication_learning_rules").select("id,brand_id,dimension,value,sample,avg_edit_ratio,reply_rate,qualified_lead_rate,meeting_rate,sale_rate,evidence,verdict,finding,status,updated_at").eq("status","active").order("updated_at",{ascending:false}),
    supabase.from("nexus_communication_learning_observations").select("brand_id,event_type,edit_ratio,metadata,occurred_at").gte("occurred_at",new Date(Date.now()-90*86_400_000).toISOString()).limit(15000),
  ]);
  if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 500 });
  if (obsError) return NextResponse.json({ error: obsError.message }, { status: 500 });

  const obs:any[] = observations || [];
  const byBrand:Record<string,any> = {};
  const appliedRuleCounts = new Map<string,number>();
  let draftsWithLearning = 0;

  for (const row of obs) {
    const brand=String(row.brand_id||"unknown");
    byBrand[brand] ||= { drafts:0, edits:0, sent:0, replies:0, avgEditRatio:0, editRatioSum:0, draftsWithLearning:0 };
    if (row.event_type==="draft_created") {
      byBrand[brand].drafts++;
      const applied = Array.isArray(row.metadata?.learning_rules_applied) ? row.metadata.learning_rules_applied : [];
      if (applied.length) {
        byBrand[brand].draftsWithLearning++;
        draftsWithLearning++;
        for (const rule of applied) {
          const key=String(rule?.id || `${brand}:${rule?.dimension}:${rule?.value}`);
          appliedRuleCounts.set(key,(appliedRuleCounts.get(key)||0)+1);
        }
      }
    }
    if (row.event_type==="user_edit") { byBrand[brand].edits++; byBrand[brand].editRatioSum += Number(row.edit_ratio||0); }
    if (row.event_type==="sent") byBrand[brand].sent++;
    if (row.event_type==="reply_received") byBrand[brand].replies++;
  }
  for (const value of Object.values(byBrand) as any[]) {
    value.avgEditRatio = value.edits ? value.editRatioSum/value.edits : 0;
    value.replyRate = value.sent ? value.replies/value.sent : 0;
    delete value.editRatioSum;
  }

  const activeRules:any[] = (rules || []).map((rule:any)=>({
    ...rule,
    appliedDrafts: appliedRuleCounts.get(String(rule.id)) || 0,
  }));
  const actionable = activeRules.filter((r)=>["prefer","avoid"].includes(String(r.verdict)) && ["moderate","strong"].includes(String(r.evidence)) && Number(r.sample||0)>=10);
  const timingRecommendations = actionable
    .filter((r)=>TIMING_DIMENSIONS.has(String(r.dimension)))
    .sort((a,b)=>Number(b.reply_rate||0)-Number(a.reply_rate||0) || Number(b.sample||0)-Number(a.sample||0));
  const contentRecommendations = actionable
    .filter((r)=>CONTENT_DIMENSIONS.has(String(r.dimension)))
    .sort((a,b)=>Number(b.reply_rate||0)-Number(a.reply_rate||0) || Number(b.sample||0)-Number(a.sample||0));

  return NextResponse.json({
    generatedAt:new Date().toISOString(),
    windowDays:90,
    summary:{
      brands:Object.keys(byBrand).length,
      observations:obs.length,
      rules:activeRules.length,
      actionable:actionable.length,
      strong:activeRules.filter(r=>r.evidence==="strong").length,
      timingRecommendations:timingRecommendations.length,
      contentRecommendations:contentRecommendations.length,
      draftsWithLearning,
    },
    byBrand,
    rules:activeRules,
    timingRecommendations,
    contentRecommendations,
    safety:COMMUNICATION_LEARNING_SAFETY,
    policy:{
      minimumForLimited:5,
      minimumForModerate:10,
      minimumForStrong:25,
      note:"Læring er evidensstyrt og rådgivende. Timing kan anbefales, men kan ikke sende eller planlegge utsending autonomt. Brand-policy, fakta, sikkerhet og Action Policy Registry har alltid høyere prioritet."
    }
  });
}
