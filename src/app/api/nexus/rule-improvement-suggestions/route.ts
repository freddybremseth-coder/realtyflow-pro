import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

const MIN_SAMPLES = 5;
const LOW_HIT_RATE = 35;
const STRONG_HIT_RATE = 70;
const SLOW_HOURS = 72;

function ms(value: unknown) {
  const parsed = new Date(String(value || "")).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const outcomeWindowMs = 14 * 86_400_000;
  const [recommendationsR, transitionsR] = await Promise.all([
    supabase.from("revenue_events")
      .select("id,contact_id,occurred_at,created_at,metadata")
      .eq("event_type", "automation_recommended")
      .eq("source_system", "nexus_movement")
      .eq("source_type", "pipeline_movement_recommendation")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .limit(10000),
    supabase.from("revenue_events")
      .select("id,contact_id,occurred_at,created_at,metadata")
      .eq("event_type", "contact_updated")
      .eq("source_system", "crm_pipeline")
      .eq("source_type", "pipeline_stage_changed")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .limit(10000),
  ]);
  if (recommendationsR.error) return NextResponse.json({ error: recommendationsR.error.message }, { status: 500 });
  if (transitionsR.error) return NextResponse.json({ error: transitionsR.error.message }, { status: 500 });

  const transitionsByContact = new Map<string, any[]>();
  for (const transition of transitionsR.data || []) {
    const contactId = String((transition as any).contact_id || "");
    if (!contactId) continue;
    const bucket = transitionsByContact.get(contactId) || [];
    bucket.push(transition);
    transitionsByContact.set(contactId, bucket);
  }

  const grouped = new Map<string, { cause:string; action:string; targetStage:string; samples:number; hits:number; totalHours:number }>();
  for (const recommendation of recommendationsR.data || []) {
    const metadata = (recommendation as any)?.metadata && typeof (recommendation as any).metadata === "object" ? (recommendation as any).metadata : {};
    const targetStage = String(metadata.target_stage || "").toUpperCase();
    if (!targetStage) continue;
    const cause = String(metadata.cause || "unknown");
    const action = String(metadata.action || "Ukjent anbefaling");
    const recommendationAt = ms((recommendation as any).occurred_at || (recommendation as any).created_at);
    if (recommendationAt == null) continue;
    const later = (transitionsByContact.get(String((recommendation as any).contact_id || "")) || []).filter((transition) => {
      const at = ms(transition.occurred_at || transition.created_at);
      return at != null && at > recommendationAt && at <= recommendationAt + outcomeWindowMs;
    });
    const hitTransition = later.find((transition) => String(transition?.metadata?.next_status || "").toUpperCase() === targetStage);
    const key = `${cause}|${action}|${targetStage}`;
    const group = grouped.get(key) || { cause, action, targetStage, samples:0, hits:0, totalHours:0 };
    group.samples += 1;
    if (hitTransition) {
      group.hits += 1;
      const hitAt = ms(hitTransition.occurred_at || hitTransition.created_at);
      if (hitAt != null) group.totalHours += Math.max(0, (hitAt - recommendationAt) / 3_600_000);
    }
    grouped.set(key, group);
  }

  const suggestions = Array.from(grouped.values()).filter((group) => group.samples >= MIN_SAMPLES).map((group) => {
    const hitRate = Math.round((group.hits / group.samples) * 1000) / 10;
    const avgHoursToTarget = group.hits ? Math.round((group.totalHours / group.hits) * 10) / 10 : null;
    let severity: "HIGH" | "MEDIUM" | "POSITIVE" = "POSITIVE";
    let recommendation = "Behold regelen foreløpig og fortsett å samle data.";
    let rationale = `Treffrate ${hitRate}% på ${group.samples} observasjoner.`;

    if (hitRate < LOW_HIT_RATE) {
      severity = "HIGH";
      recommendation = "Vurder å endre anbefalingstekst, trigger eller målstadium før denne regelen får større vekt.";
      rationale = `Lav treffrate (${hitRate}%) på ${group.samples} observasjoner tyder på at anbefalingen ofte ikke gir ønsket pipeline-bevegelse.`;
    } else if (avgHoursToTarget != null && avgHoursToTarget > SLOW_HOURS) {
      severity = "MEDIUM";
      recommendation = "Behold retningen, men vurder sterkere timing, tydeligere call-to-action eller tidligere oppfølging.";
      rationale = `Treff forekommer, men gjennomsnittlig tid til ${group.targetStage} er ${avgHoursToTarget} timer.`;
    } else if (hitRate >= STRONG_HIT_RATE) {
      severity = "POSITIVE";
      recommendation = "Sterkt signal. Behold regelen og vurder senere kontrollert vekting hvis sample-størrelsen fortsetter å vokse.";
      rationale = `Høy treffrate (${hitRate}%) på ${group.samples} observasjoner.`;
    }

    return { ...group, hitRate, avgHoursToTarget, severity, recommendation, rationale };
  }).sort((a,b) => {
    const rank = { HIGH:3, MEDIUM:2, POSITIVE:1 } as const;
    return rank[b.severity] - rank[a.severity] || b.samples - a.samples;
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    thresholds: { minimumSamples: MIN_SAMPLES, lowHitRate: LOW_HIT_RATE, strongHitRate: STRONG_HIT_RATE, slowHours: SLOW_HOURS },
    suggestions,
    note: "Dette er beslutningsstøtte. Ingen Movement-regel, score, pipeline-status eller kundekommunikasjon endres automatisk.",
  });
}
