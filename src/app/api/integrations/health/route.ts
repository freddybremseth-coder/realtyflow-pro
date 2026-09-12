import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getDecryptedTokens } from "@/lib/oauth/channels";
import { checkYouTubeChannelHealth } from "@/services/integrations/youtube-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HealthStatus = "ok" | "warning" | "error";

type ChannelRow = {
  id: string;
  brand_id: string;
  platform: string;
  external_id: string;
  display_name: string;
  is_active: boolean;
};

interface IntegrationCheck {
  kind: "social" | "youtube";
  brand: string;
  platform: string;
  accountName: string;
  accountId?: string | null;
  status: HealthStatus;
  message: string;
}

interface RoutingIssue {
  code: "duplicate_brand_platform" | "shared_external_account";
  severity: "warning" | "error";
  platform: string;
  externalId: string;
  brands: string[];
  channelIds: string[];
  message: string;
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function validateChannel(channel: ChannelRow): Promise<IntegrationCheck> {
  const base = {
    kind: channel.platform === "youtube" ? "youtube" as const : "social" as const,
    brand: channel.brand_id,
    platform: channel.platform,
    accountName: channel.display_name,
    accountId: channel.external_id,
  };

  if (!channel.is_active) return { ...base, status: "warning", message: "Kanalen er deaktivert i RealtyFlow." };

  if (channel.platform === "youtube") {
    const health = await checkYouTubeChannelHealth(channel.id);
    return {
      ...base,
      status: health.connected ? "ok" : health.configured ? "error" : "warning",
      message: health.connected
        ? `Canonical YouTube-token er gyldig for ${health.channel?.title || channel.display_name}; refresh-token brukes automatisk når access-tokenet er utløpt.`
        : health.message || "YouTube-tilkoblingen kunne ikke verifiseres.",
    };
  }

  const tokens = await getDecryptedTokens(channel.id);
  const accessToken = tokens?.accessToken?.trim();
  if (!accessToken) return { ...base, status: "error", message: "Mangler canonical OAuth-token. Koble kanalen på nytt fra Nexus → Channel Connections." };

  try {
    if (channel.platform === "facebook" || channel.platform === "instagram") {
      const id = channel.external_id || "me";
      const res = await fetchWithTimeout(`https://graph.facebook.com/v25.0/${encodeURIComponent(id)}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.error) return { ...base, status: "error", message: body?.error?.message || `Meta svarte ${res.status}. Koble kanalen på nytt.` };
      return { ...base, status: "ok", message: `Canonical Meta-token er gyldig for ${body.name || channel.display_name}.` };
    }

    if (channel.platform === "linkedin") {
      const res = await fetchWithTimeout("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return { ...base, status: "error", message: `LinkedIn svarte ${res.status}. Koble kanalen på nytt.` };
      return { ...base, status: "ok", message: "Canonical LinkedIn-token er gyldig." };
    }

    return { ...base, status: "warning", message: "Canonical token finnes, men plattformen har ingen dyp validering ennå." };
  } catch {
    return { ...base, status: "warning", message: "Kunne ikke validere provider akkurat nå." };
  }
}

function routingIssuesFor(channels: ChannelRow[]): RoutingIssue[] {
  const issues: RoutingIssue[] = [];

  const byBrandPlatform = new Map<string, ChannelRow[]>();
  for (const channel of channels) {
    const key = `${channel.brand_id}:${channel.platform}`;
    const list = byBrandPlatform.get(key) ?? [];
    list.push(channel);
    byBrandPlatform.set(key, list);
  }
  for (const list of byBrandPlatform.values()) {
    if (list.length <= 1) continue;
    issues.push({
      code: "duplicate_brand_platform",
      severity: "error",
      platform: list[0].platform,
      externalId: list.map((channel) => channel.external_id).join(","),
      brands: [list[0].brand_id],
      channelIds: list.map((channel) => channel.id),
      message: `${list[0].brand_id} har ${list.length} aktive ${list[0].platform}-kanaler. Automatisk routing må ikke velge mellom dem.`,
    });
  }

  const byExternal = new Map<string, ChannelRow[]>();
  for (const channel of channels) {
    if (!channel.external_id) continue;
    const key = `${channel.platform}:${channel.external_id}`;
    const list = byExternal.get(key) ?? [];
    list.push(channel);
    byExternal.set(key, list);
  }
  for (const list of byExternal.values()) {
    const brands = [...new Set(list.map((channel) => channel.brand_id))];
    if (brands.length <= 1) continue;
    const youtube = list[0].platform === "youtube";
    issues.push({
      code: "shared_external_account",
      severity: youtube ? "error" : "warning",
      platform: list[0].platform,
      externalId: list[0].external_id,
      brands,
      channelIds: list.map((channel) => channel.id),
      message: youtube
        ? `Samme YouTube-kanal er bundet til flere brands (${brands.join(", ")}). Dette er blokkert routing til bindingene er ryddet.`
        : `Samme ${list[0].platform}-konto er bundet til flere brands (${brands.join(", ")}). Verifiser at delingen er tilsiktet.`,
    });
  }

  return issues;
}

function applyRoutingIssues(checks: IntegrationCheck[], issues: RoutingIssue[]) {
  return checks.map((check) => {
    const related = issues.filter((issue) =>
      issue.platform === check.platform &&
      issue.brands.includes(check.brand) &&
      (issue.externalId.split(",").includes(String(check.accountId || "")) || issue.code === "duplicate_brand_platform"),
    );
    if (related.length === 0) return check;
    const hard = related.some((issue) => issue.severity === "error");
    return {
      ...check,
      status: hard ? "error" as const : check.status === "ok" ? "warning" as const : check.status,
      message: `${check.message} Routing: ${related.map((issue) => issue.message).join(" ")}`,
    };
  });
}

export async function GET() {
  const supabase = createServerClient();
  const { data: channels, error } = await supabase
    .from("social_channels")
    .select("id,brand_id,platform,external_id,display_name,is_active")
    .eq("is_active", true)
    .order("brand_id")
    .order("platform");

  const activeChannels = (channels ?? []) as ChannelRow[];
  const routingIssues = routingIssuesFor(activeChannels);
  const rawChecks = error ? [] : await Promise.all(activeChannels.map(validateChannel));
  const checks = applyRoutingIssues(rawChecks, routingIssues);
  const summary = checks.reduce((acc, check) => {
    acc[check.status] += 1;
    return acc;
  }, { ok: 0, warning: 0, error: 0 });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    canonicalSource: "social_channels + oauth_tokens",
    manageAt: "/connections",
    env: {
      facebookApp: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
      googleOauth: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET),
      linkedinOauth: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
    },
    summary,
    checks,
    routingIssues,
    tableErrors: { social_channels: error?.message || null },
  });
}
