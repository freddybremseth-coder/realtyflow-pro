import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getDecryptedTokens } from "@/lib/oauth/channels";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HealthStatus = "ok" | "warning" | "error";

interface IntegrationCheck {
  kind: "social" | "youtube";
  brand: string;
  platform: string;
  accountName: string;
  accountId?: string | null;
  status: HealthStatus;
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

async function validateChannel(channel: {
  id: string;
  brand_id: string;
  platform: string;
  external_id: string;
  display_name: string;
  is_active: boolean;
}): Promise<IntegrationCheck> {
  const base = {
    kind: channel.platform === "youtube" ? "youtube" as const : "social" as const,
    brand: channel.brand_id,
    platform: channel.platform,
    accountName: channel.display_name,
    accountId: channel.external_id,
  };

  if (!channel.is_active) return { ...base, status: "warning", message: "Kanalen er deaktivert i RealtyFlow." };

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

    if (channel.platform === "youtube") {
      const res = await fetchWithTimeout("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.error) return { ...base, status: "error", message: body?.error?.message || `YouTube svarte ${res.status}. Koble kanalen på nytt.` };
      const matched = body.items?.find((item: any) => String(item.id) === String(channel.external_id)) || body.items?.[0];
      if (!matched) return { ...base, status: "warning", message: "OAuth-token virker, men YouTube returnerte ingen kanal. Kontroller kanalvalget i Connections." };
      return { ...base, status: "ok", message: `Canonical YouTube-token er gyldig for ${matched.snippet?.title || channel.display_name}.` };
    }

    return { ...base, status: "warning", message: "Canonical token finnes, men plattformen har ingen dyp validering ennå." };
  } catch {
    return { ...base, status: "warning", message: "Kunne ikke validere provider akkurat nå." };
  }
}

export async function GET() {
  const supabase = createServerClient();
  const { data: channels, error } = await supabase
    .from("social_channels")
    .select("id,brand_id,platform,external_id,display_name,is_active")
    .eq("is_active", true)
    .order("brand_id")
    .order("platform");

  const checks = error ? [] : await Promise.all((channels ?? []).map(validateChannel));
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
    tableErrors: { social_channels: error?.message || null },
  });
}
