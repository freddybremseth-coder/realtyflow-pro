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

type OwnerFocus = {
  id: string;
  brand_id: string;
  focus_key: string;
  title: string;
  notes: string | null;
  intensity: number;
  success_definition: string | null;
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

function focusMatchesSource(focus: OwnerFocus, source: SourceRow) {
  const haystack = [
    source.source_type,
    source.title,
    source.source_id,
    JSON.stringify(source.payload ?? {}),
  ].join(" ").toLowerCase();
  const tokens = `${focus.focus_key} ${focus.title}`
    .toLowerCase()
    .split(/[^a-z0-9æøå]+/i)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3);
  return tokens.some((token) => haystack.includes(token));
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const limit = Math.max(1, Math.min(30, Number(request.nextUrl.searchParams.get("limit") || 10)));

  const [{ data: sources, error: sourceError }, { data: channels }, { data: publications }, { data: plans }, { data: focusRows }] = await Promise.all([
    supabase.from("marketing_source_queue").select("id,brand_id,source_type,source_id,source_url,title,priority,recommended_channels,payload,status,blocked_reason,last_planned_at,created_at").eq("status", "ready").limit(5000),
    supabase.from("social_channels").select("brand_id,platform,is_active").eq("is_active", true),
    supabase.from("marketing_publications").select("brand_id,source_type,source_id,channel,state,created_at,updated_at").order("created_at", { ascending: false }).limit(5000),
    supabase.from("marketing_brand_growth_plans").select("brand_id,status,planned_channels,autonomy_mode"),
    supabase.from("nexus_owner_focus").select("id,brand_id,focus_key,title,notes,intensity,success_definition").eq("status", "active").order("intensity", { ascending: false }),
  ]);
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });

  const activeFocus = (focusRows ?? []) as OwnerFocus[];
  const focusByBrand = new Map<string, OwnerFocus[]>();
  for (const focus of activeFocus) focusByBrand.set(focus.brand_id, [...(focusByBrand.get(focus.brand_id) ?? []), focus]);

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
    const matchingFocus: OwnerFocus[] = [];
    const brandFocus = focusByBrand.get(source.brand_id) ?? [];

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
    if (source.payload?.cover_url || source.payload?.cover_image_url || source.payload?.image_url || source.payload?.primary_image) {
      score += 8;
      reasons.push("har visuelt asset");
    }
    if (plan?.status === "active") score += 5;

    // Owner Focus is a deliberate priority override. Brand-level focus creates
    // a strong boost; direct topic/source matches receive an additional boost.
    // This changes ranking and work allocation, but never bypasses channel,
    // autonomy, legal or approval gates.
    for (const focus of brandFocus) {
      const intensity = Math.max(1, Math.min(10, Number(focus.intensity) || 1));
      score += intensity * 8;
      reasons.push(`OWNER FOCUS: ${focus.title} (${intensity}/10)`);
      if (focusMatchesSource(focus, source)) {
        score += intensity * 12;
        matchingFocus.push(focus);
        reasons.push(`direkte match på flagget fokusområde: ${focus.focus_key}`);
      }
    }

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
      ownerFocus: matchingFocus.map((f) => ({ id: f.id, title: f.title, focusKey: f.focus_key, intensity: f.intensity, successDefinition: f.success_definition })),
      ownerFocusedBrand: brandFocus.length > 0,
      eligible: uniqueChannels.length > 0 && score > 0,
    };
  }).filter((x) => x.eligible).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  // Normal portfolio spread is max 2 per brand. A brand explicitly flagged by
  // the owner may consume up to 5 slots so Nexus can make an intensive pass.
  const focusedBrands = new Set(activeFocus.map((f) => f.brand_id));
  const perBrand = new Map<string, number>();
  const selected: typeof scored = [];
  for (const row of scored) {
    const used = perBrand.get(row.brandId) ?? 0;
    const brandCap = focusedBrands.has(row.brandId) ? 5 : 2;
    if (used >= brandCap) continue;
    selected.push(row);
    perBrand.set(row.brandId, used + 1);
    if (selected.length >= limit) break;
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    policy: {
      automaticPublishing: false,
      automaticApproval: false,
      normalMaxSelectedPerBrand: 2,
      ownerFocusedMaxSelectedPerBrand: 5,
      selectionLimit: limit,
      note: "Owner Focus overstyrer prioritet og arbeidsmengde, men aldri sikkerhets-, kanal- eller approval-gates.",
    },
    ownerFocus: activeFocus,
    summary: {
      readySources: (sources ?? []).length,
      eligibleSources: scored.length,
      selected: selected.length,
      brandsSelected: new Set(selected.map((x) => x.brandId)).size,
      activeOwnerFocus: activeFocus.length,
    },
    selected,
  });
}
