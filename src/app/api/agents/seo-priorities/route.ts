export const dynamic = "force-dynamic";
export const maxDuration = 90;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { SEO_AUDIT_TARGETS } from "@/services/agents/seo-audit";
import { getGSCConnectionStatus, readGSCAllBrands, type GSCBrandSnapshot } from "@/services/agents/seo-search-console";
import { planGSCOpportunities } from "@/services/agents/seo-priorities";

type StoredSearchConsole = { brandId: string; status: string; result: GSCBrandSnapshot | null; error?: string };
const ACTIVE = ["TO_DO", "IN_PROGRESS", "REVIEW"];

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const [connections, saved, tasks, oauthResults, storedChannels] = await Promise.all([
      getGSCConnectionStatus(),
      supabase.from("automation_logs").select("created_at,details")
        .eq("action", "seo_portfolio_growth_review")
        .in("status", ["success", "partial"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("work_items").select("id,brand_id,title,description,next_action,priority,status,source_id,updated_at,metadata")
        .eq("assigned_agent", "seo").in("status", ACTIVE)
        .order("updated_at", { ascending: false }).limit(60),
      supabase.from("automation_logs").select("created_at,status,details")
        .eq("action", "gsc_oauth_connection")
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("social_channels").select("id,brand_id,external_id")
        .eq("platform", "google_search_console").eq("is_active", true),
    ]);
    if (saved.error) throw new Error("SEO review lookup: " + saved.error.message);
    if (tasks.error) throw new Error("SEO task lookup: " + tasks.error.message);
    if (oauthResults.error) throw new Error("Google connection diagnostic lookup: " + oauthResults.error.message);
    if (storedChannels.error) throw new Error("Google connection storage lookup: " + storedChannels.error.message);
    const channelIds = (storedChannels.data || []).map(row => row.id);
    const savedTokens = channelIds.length
      ? await supabase.from("oauth_tokens").select("social_channel_id,scopes,expires_at").in("social_channel_id", channelIds)
      : { data: [], error: null };
    if (savedTokens.error) throw new Error("Google token storage lookup: " + savedTokens.error.message);
    const registered = new Map<string, { property: string; expiresAt: string | null }>();
    for (const channel of storedChannels.data || []) {
      const token = (savedTokens.data || []).find(row => row.social_channel_id === channel.id);
      if (!token || !(token.scopes || []).includes("https://www.googleapis.com/auth/webmasters.readonly")) continue;
      if (!SEO_AUDIT_TARGETS.some(target => target.brandId === channel.brand_id)) continue;
      registered.set(channel.brand_id, { property: channel.external_id, expiresAt: token.expires_at });
    }
    // A stored Google consent and a working decrypted token are two different
    // states. Report both instead of hiding an internal read failure as 0/7.

    const recentOAuth = new Map<string, { code: string; at: string }>();
    for (const log of oauthResults.data || []) {
      const details = log.details as { brand_id?: string; reason_code?: string } | null;
      if (!details?.brand_id || recentOAuth.has(details.brand_id)) continue;
      if (log.status === "error" && details.reason_code) {
        recentOAuth.set(details.brand_id, { code: details.reason_code, at: log.created_at });
      } else {
        recentOAuth.set(details.brand_id, { code: "gsc_connected", at: log.created_at });
      }
    }
    const stored = saved.data?.details as { google_search_console?: StoredSearchConsole[] } | null;
    // An explicit refresh reads live Google data; the routine dashboard remains fast
    // and reuses the last documented weekly review, with its original collection date.
    const readings: StoredSearchConsole[] = request.nextUrl.searchParams.get("live") === "1"
      ? await readGSCAllBrands()
      : (Array.isArray(stored?.google_search_console) ? stored.google_search_console : []);
    const known = new Set<string>(connections.filter(item => item.connected).map(item => item.brandId));
    const snapshots = readings.filter((item): item is StoredSearchConsole & { result: GSCBrandSnapshot } =>
      item.status === "connected" && item.result !== null && known.has(item.brandId))
      .map(item => item.result);
    const computed = planGSCOpportunities(snapshots).map(item => ({
      id: "gsc:" + item.issueId, brandId: item.brandId, title: item.title,
      description: item.description, nextAction: item.nextAction, priority: item.priority,
      evidence: item.evidence, status: "FOR_REVIEW" as const, source: "Google Search Console",
      requiresApproval: true,
    }));
    const work = (tasks.data || []).map(item => ({
      id: item.id as string, brandId: item.brand_id as string | null,
      title: item.title as string, description: (item.description || "") as string,
      nextAction: (item.next_action || "") as string, priority: item.priority as string,
      evidence: String((item.metadata as { evidence?: string } | null)?.evidence || "SEO work_items"),
      status: item.status as string, source: "Sam SEO · oppgave",
      requiresApproval: true,
    }));
    const order = (priority: string) => priority === "CRITICAL" ? 0 : priority === "HIGH" ? 1 : 2;
    const seen = new Set<string>();
    const actions = [...work, ...computed].sort((a, b) => order(a.priority) - order(b.priority))
      .filter(item => { const key = item.title + "|" + item.brandId; if (seen.has(key)) return false; seen.add(key); return true; })
      .slice(0, 12);
    const connected = connections.map(item => ({
      ...item, target: SEO_AUDIT_TARGETS.find(target => target.brandId === item.brandId)?.base || "",
      registered: registered.has(item.brandId),
      savedProperty: registered.get(item.brandId)?.property || null,
      lastFailure: !item.connected && recentOAuth.get(item.brandId)?.code !== "gsc_connected"
        ? recentOAuth.get(item.brandId) || null : null,
      error: item.error || (registered.has(item.brandId) && !item.connected
        ? "Google-tillatelsen er lagret, men RealtyFlow kan ikke kontrollere lesetilgangen. Dette er en intern tilkoblingsfeil."
        : null),
    }));
    const metrics = snapshots.map(item => ({
      brandId: item.brandId, property: item.property, collectedAt: item.collectedAt,
      period: item.period, totals: item.totals, quality: item.dataQuality.note,
    }));
    return NextResponse.json({
      actions, connections: connected, metrics, latestReviewAt: saved.data?.created_at || null,
      connectionSummary: {
        registered: connected.filter(item => item.registered).length,
        readable: connected.filter(item => item.connected).length,
        measured: metrics.length,
      },
      readingMode: request.nextUrl.searchParams.get("live") === "1" ? "live" : "last_review",
      readErrors: readings.filter(item => item.status === "error").map(item => ({
        brandId: item.brandId, error: item.error || "Search Console not available",
      })),
      notes: "Search Console measures website search performance; YouTube and Instagram reach require their own channel analytics. Recommendations are proposals, not published website changes.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message.slice(0, 250) : "SEO recommendations unavailable",
    }, { status: 503 });
  }
}
