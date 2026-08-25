import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

type SourceRow = {
  id: string;
  brand_id: string;
  source_type: string;
  source_id: string;
  source_url: string | null;
  title: string;
  priority: number | null;
  recommended_channels: string[] | null;
  payload: Record<string, unknown> | null;
  status: string;
  blocked_reason: string | null;
  last_planned_at: string | null;
  created_at: string;
};

type Publication = {
  brand_id: string;
  source_type: string | null;
  source_id: string | null;
  channel: string;
  state: string;
  created_at: string;
  updated_at: string;
};

const DAY = 86_400_000;

function daysSince(value: string | null | undefined) {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  return Number.isFinite(ms) ? Math.max(0, ms / DAY) : null;
}

function channelKey(brand: string, platform: string) {
  return `${brand}:${platform}`;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const limit = Math.max(1, Math.min(20, Number(request.nextUrl.searchParams.get("limit") || 10)));

  const [{ data: sources, error: sourceError }, { data: channels }, { data: publications }, { data: plans }] = await Promise.all([
    supabase.from("marketing_source_queue").select("id,brand_id,source_type,source_id,source_url,title,priority,recommended_channels,payload,status,blocked_reason,last_planned_at,created_at").eq("status", "ready").limit(5000),
    supabase.from("social_channels").select("brand_id,platform,is_active").eq("is_active", true),
    supabase.from("marketing_publications").select("brand_id,source_type,source_id,channel,state,created_at,updated_at").order("created_at", { ascending: false }).limit(5000),
    supabase.from("marketing_brand_growth_plans").select("brand_id,status,planned_channels,autonomy_mode"),
  ]);
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });

  const connected = new Set((channels ?? []).map((c: any) => channelKey(String(c.brand_id), String(c.platform))));
  const planByBrand = new Map((plans ?? []).map((p: any) => [String(p.brand_id), p]));
  const lastPublication = new Map<string, Publication>();
  for (const row of (publications ?? []) as Publication[]) {
    if (!row.source_type || !row.source_id) continue;
    const key = `${row.brand_id}:${row.source_type}:${row.source_id}`;
    if (!lastPublication.has(key)) lastPublication.set(key, row);
  }

  const scored = ((sources ?? []) as SourceRow[]).map((source) => {
    const plan: any = planByBrand.get(source.brand_id);
    const requestedChannels = (source.recommended_channels ?? []).filter(Boolean);
    const plannedChannels = Array.isArray(plan?.planned_channels) ? plan.planned_channels.map(String) : [];
    const channelCandidates = (requestedChannels.length ? requestedChannels : plannedChannels)
      .filter((c: string) => connected.has(channelKey(source.brand_id, c)));
    const uniqueChannels = Array.from(new Set(channelCandidates));
    const last = lastPublication.get(`${source.brand_id}:${source.source_type}:${source.source_id}`);
    const sincePublished = daysSince(last?.updated_at || last?.created_at);
    const sincePlanned = daysSince(source.last_planned_at);

    let score = Number(source.priority ?? 50);
    const reasons: string[] = [];
    if (uniqueChannels.length === 0) {
      score -= 1000;
      reasons.push("ingen tilkoblet anbefalt kanal");
    } else {
      score += Math.min(15, uniqueChannels.length * 5);
      reasons.push(`${uniqueChannels.length} tilkoblet kanal${uniqueChannels.length === 1 ? "" : "er"}`);
    }
    if (sincePublished == null) {
      score += 25;
      reasons.push("aldri publisert fra denne kilden");
    } else if (sincePublished < 7) {
      score -= 45;
      reasons.push(`brukt for ${sincePublished.toFixed(1)} dager siden`);
    } else if (sincePublished < 21) {
      score -= 15;
      reasons.push(`nylig brukt (${Math.round(sincePublished)} dager)`);
    } else {
      score += Math.min(20, sincePublished / 5);
      reasons.push(`${Math.round(sincePublished)} dager siden sist`);
    }
    if (sincePlanned != null && sincePlanned < 3) {
      score -= 25;
      reasons.push("nylig planlagt");
    }
    if (source.payload?.cover_url || source.payload?.image_url || source.payload?.primary_image) {
      score += 8;
      reasons.push("har visuelt asset");
    }
    if (plan?.status === "active") score += 5;

    return {
      sourceId: source.id,
      brandId: source.brand_id,
      sourceType: source.source_type,
      sourceRef: source.source_id,
      title: source.title,
      sourceUrl: source.source_url,
      score: Math.round(score * 10) / 10,
      channels: uniqueChannels,
      lastPublishedAt: last?.updated_at ?? last?.created_at ?? null,
      lastPlannedAt: source.last_planned_at,
      reasons,
      eligible: uniqueChannels.length > 0 && score > 0,
    };
  }).filter((x) => x.eligible).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  // Portfolio spread: max 2 selected sources per brand in the first pass.
  const perBrand = new Map<string, number>();
  const selected: typeof scored = [];
  for (const row of scored) {
    const used = perBrand.get(row.brandId) ?? 0;
    if (used >= 2) continue;
    selected.push(row);
    perBrand.set(row.brandId, used + 1);
    if (selected.length >= limit) break;
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    policy: {
      automaticPublishing: false,
      automaticApproval: false,
      maxSelectedPerBrand: 2,
      selectionLimit: limit,
      note: "Director velger kilder. Campaign draft/approval er fortsatt en separat handling.",
    },
    summary: {
      readySources: (sources ?? []).length,
      eligibleSources: scored.length,
      selected: selected.length,
      brandsSelected: new Set(selected.map((x) => x.brandId)).size,
    },
    selected,
  });
}
