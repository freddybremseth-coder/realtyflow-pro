import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "private, no-store" };

function fail(status: number, code: string) {
  return NextResponse.json({ ok: false, error: { code } }, { status, headers: noStore });
}

function countBy(rows: Array<Record<string, unknown>>, key: string) {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const value = typeof row[key] === "string" && String(row[key]).trim()
      ? String(row[key]).trim()
      : "unknown";
    result[value] = (result[value] || 0) + 1;
  }
  return result;
}

function safeStringArray(value: unknown, max = 20) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map(item => item.trim()).slice(0, max);
}

function safeNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const access = await requireBrandWorkspace(request, params.brandKey, "nexus.read");
  if (!access.value) return access.response;

  const supabase = access.value.supabase;
  const brandKey = params.brandKey;

  const [sourcesR, learningR, planR, focusR] = await Promise.all([
    supabase.from("marketing_source_queue")
      .select("source_type,title,priority,recommended_channels,status,blocked_reason,updated_at")
      .eq("brand_id", brandKey)
      .order("priority", { ascending: false })
      .limit(500),
    supabase.from("marketing_learning_rules")
      .select("scope,dimension,value,sample,avg_qualified_lead_rate,lift,verdict,finding,updated_at")
      .like("scope", `${brandKey}:%`)
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase.from("marketing_brand_growth_plans")
      .select("status,source_types,planned_channels,conversion_goals,primary_ctas,updated_at")
      .eq("brand_id", brandKey)
      .maybeSingle(),
    supabase.from("nexus_owner_focus")
      .select("focus_key,title,notes,intensity,success_definition,review_due_at,updated_at")
      .eq("brand_id", brandKey)
      .eq("status", "active")
      .order("intensity", { ascending: false })
      .limit(12),
  ]);

  const failures = [sourcesR.error, learningR.error, planR.error, focusR.error].filter(Boolean);
  if (failures.length === 4) return fail(503, "NEXUS_INSIGHTS_UNAVAILABLE");

  const sources = (sourcesR.data || []) as Array<Record<string, unknown>>;
  const learning = (learningR.data || []) as Array<Record<string, unknown>>;
  const sourceByStatus = countBy(sources, "status");
  const sourceByType = countBy(sources, "source_type");

  const topSources = sources.slice(0, 12).map(row => ({
    type: typeof row.source_type === "string" ? row.source_type : "unknown",
    title: typeof row.title === "string" ? row.title.slice(0, 220) : "Uten tittel",
    priority: safeNumber(row.priority),
    channels: safeStringArray(row.recommended_channels, 8),
    status: typeof row.status === "string" ? row.status : "unknown",
    blockedReason: typeof row.blocked_reason === "string" ? row.blocked_reason.slice(0, 240) : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  }));

  const learningRules = learning.slice(0, 12).map(row => ({
    channel: typeof row.scope === "string" && row.scope.startsWith(`${brandKey}:`)
      ? row.scope.slice(brandKey.length + 1)
      : null,
    dimension: typeof row.dimension === "string" ? row.dimension : "signal",
    value: typeof row.value === "string" ? row.value.slice(0, 180) : "",
    sample: safeNumber(row.sample),
    qualifiedLeadRate: safeNumber(row.avg_qualified_lead_rate),
    lift: safeNumber(row.lift),
    verdict: typeof row.verdict === "string" ? row.verdict.slice(0, 100) : null,
    finding: typeof row.finding === "string" ? row.finding.slice(0, 360) : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  }));

  const rawPlan = planR.data as Record<string, unknown> | null;
  const plan = rawPlan ? {
    status: typeof rawPlan.status === "string" ? rawPlan.status : "unknown",
    sourceTypes: safeStringArray(rawPlan.source_types),
    plannedChannels: safeStringArray(rawPlan.planned_channels),
    conversionGoals: safeStringArray(rawPlan.conversion_goals),
    primaryCtas: safeStringArray(rawPlan.primary_ctas),
    updatedAt: typeof rawPlan.updated_at === "string" ? rawPlan.updated_at : null,
  } : null;

  const focus = ((focusR.data || []) as Array<Record<string, unknown>>).map(row => ({
    key: typeof row.focus_key === "string" ? row.focus_key : "focus",
    title: typeof row.title === "string" ? row.title.slice(0, 220) : "Prioritet",
    notes: typeof row.notes === "string" ? row.notes.slice(0, 600) : null,
    intensity: Math.max(0, Math.min(100, safeNumber(row.intensity))),
    successDefinition: typeof row.success_definition === "string"
      ? row.success_definition.slice(0, 500) : null,
    reviewDueAt: typeof row.review_due_at === "string" ? row.review_due_at : null,
  }));

  const attention: Array<{ level: "info" | "watch" | "action"; title: string; detail: string }> = [];
  const ready = sourceByStatus.ready || 0;
  const blocked = sourceByStatus.blocked || 0;
  const pending = sourceByStatus.pending || 0;
  if (blocked > 0) attention.push({
    level: "action",
    title: `${blocked} kilder er blokkert`,
    detail: "Se årsaken før du bruker mer tid på disse kildene. Nexus kjører ingen handling fra denne visningen.",
  });
  if (ready > 0) attention.push({
    level: "info",
    title: `${ready} kilder er klare for innholdsarbeid`,
    detail: "Bruk Content Studio eller markedsføringsverktøyet når du vil gjøre signalene om til utkast.",
  });
  if (pending > 0) attention.push({
    level: "watch",
    title: `${pending} kilder venter på videre behandling`,
    detail: "Dette er systemstatus, ikke en oppgave du må kjøre manuelt med mindre en egen arbeidsflate ber deg om det.",
  });
  if (learningRules.length === 0) attention.push({
    level: "watch",
    title: "Ingen brand-spesifikke læringsregler ennå",
    detail: "Nexus har foreløpig ikke nok målt signal til å vise sikre læringsregler for denne merkevaren.",
  });
  if (!plan) attention.push({
    level: "watch",
    title: "Ingen aktiv vekstplan funnet",
    detail: "Nexus Innsikt viser bare eksisterende planstatus og oppretter ikke en ny plan automatisk.",
  });
  for (const item of focus.slice(0, 3)) {
    attention.push({
      level: "action",
      title: `Eierfokus: ${item.title}`,
      detail: item.successDefinition || item.notes || "Dette er en eksplisitt prioritet for merkevaren.",
    });
  }

  return NextResponse.json({
    ok: true,
    brand: brandKey,
    readOnly: true,
    generatedAt: new Date().toISOString(),
    sourceSummary: {
      total: sources.length,
      byStatus: sourceByStatus,
      byType: sourceByType,
      ready,
      drafted: sourceByStatus.drafted || 0,
      blocked,
      pending,
    },
    topSources,
    learningSummary: {
      total: learning.length,
      rules: learningRules,
    },
    growthPlan: plan,
    ownerFocus: focus,
    attention: attention.slice(0, 10),
    warnings: [
      sourcesR.error ? "Kildekøen kunne ikke leses komplett." : null,
      learningR.error ? "Læringsreglene kunne ikke leses komplett." : null,
      planR.error ? "Vekstplanen kunne ikke leses." : null,
      focusR.error ? "Eierfokus kunne ikke leses." : null,
    ].filter(Boolean),
    excluded: [
      "runtime_controls",
      "autonomy_policies",
      "agentic_approvals",
      "customer_identity",
      "commission_and_revenue_truth",
      "execution_actions",
    ],
  }, { headers: noStore });
}
