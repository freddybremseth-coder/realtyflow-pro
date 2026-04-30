import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HealthStatus = "ok" | "warning" | "error";

interface IntegrationCheck {
  kind: "social" | "youtube";
  brand: string;
  platform: string;
  accountName: string;
  accountId?: string | null;
  ownerHint?: string | null;
  status: HealthStatus;
  message: string;
}

function sanitizeToken(token?: string | null) {
  return (token || "").trim().replace(/^"+|"+$/g, "");
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

async function checkFacebookLikeToken(account: {
  platform?: string;
  account_id?: string | null;
  account_name?: string | null;
  access_token?: string | null;
  brand?: string | null;
  is_active?: boolean | null;
}): Promise<IntegrationCheck> {
  const token = sanitizeToken(account.access_token);
  const base = {
    kind: "social" as const,
    brand: account.brand || "ukjent",
    platform: account.platform || "unknown",
    accountName: account.account_name || "Uten navn",
    accountId: account.account_id,
    ownerHint: account.account_name?.toLowerCase().includes("freddy") ? "Freddy Bremseth" : null,
  };

  if (!account.is_active) {
    return { ...base, status: "warning", message: "Kontoen er deaktivert i RealtyFlow." };
  }
  if (!token) {
    return { ...base, status: "error", message: "Mangler access token." };
  }

  const id = account.account_id || "me";
  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(id)}?fields=id,name&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetchWithTimeout(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      return {
        ...base,
        status: "error",
        message: body?.error?.message || `Meta svarte ${res.status}. Koble til kontoen på nytt.`,
      };
    }
    return { ...base, status: "ok", message: `Token er gyldig for ${body.name || account.account_name || "kontoen"}.` };
  } catch {
    return { ...base, status: "warning", message: "Kunne ikke validere mot Meta akkurat nå." };
  }
}

async function checkLinkedInToken(account: {
  platform?: string;
  account_id?: string | null;
  account_name?: string | null;
  access_token?: string | null;
  brand?: string | null;
  is_active?: boolean | null;
}): Promise<IntegrationCheck> {
  const token = sanitizeToken(account.access_token);
  const base = {
    kind: "social" as const,
    brand: account.brand || "ukjent",
    platform: account.platform || "linkedin",
    accountName: account.account_name || "Uten navn",
    accountId: account.account_id,
    ownerHint: account.account_name?.toLowerCase().includes("freddy") ? "Freddy Bremseth" : null,
  };

  if (!account.is_active) {
    return { ...base, status: "warning", message: "Kontoen er deaktivert i RealtyFlow." };
  }
  if (!token) {
    return { ...base, status: "error", message: "Mangler access token." };
  }

  try {
    const res = await fetchWithTimeout("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { ...base, status: "error", message: `LinkedIn svarte ${res.status}. Koble til kontoen på nytt.` };
    }
    return { ...base, status: "ok", message: "Token er gyldig hos LinkedIn." };
  } catch {
    return { ...base, status: "warning", message: "Kunne ikke validere mot LinkedIn akkurat nå." };
  }
}

async function checkYoutubeApiKey(channel: {
  name?: string | null;
  channel_id?: string | null;
  api_key?: string | null;
  brand?: string | null;
  is_active?: boolean | null;
}): Promise<IntegrationCheck> {
  const apiKey = sanitizeToken(channel.api_key);
  const base = {
    kind: "youtube" as const,
    brand: channel.brand || "ukjent",
    platform: "youtube",
    accountName: channel.name || "YouTube-kanal",
    accountId: channel.channel_id,
    ownerHint: channel.name?.toLowerCase().includes("freddy") ? "Freddy Bremseth" : null,
  };

  if (!channel.is_active) {
    return { ...base, status: "warning", message: "Kanalen er deaktivert i RealtyFlow." };
  }
  if (!channel.channel_id) {
    return { ...base, status: "error", message: "Mangler channel_id." };
  }
  if (!apiKey) {
    return { ...base, status: "warning", message: "Mangler API-nøkkel. OAuth kan likevel finnes under brand settings." };
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(channel.channel_id)}&key=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      return {
        ...base,
        status: "error",
        message: body?.error?.message || `YouTube svarte ${res.status}. Sjekk API-nøkkel/kanal.`,
      };
    }
    if (!body.items?.length) {
      return { ...base, status: "error", message: "YouTube fant ikke channel_id med denne API-nøkkelen." };
    }
    return { ...base, status: "ok", message: `API-nøkkel virker for ${body.items[0]?.snippet?.title || channel.name}.` };
  } catch {
    return { ...base, status: "warning", message: "Kunne ikke validere mot YouTube akkurat nå." };
  }
}

export async function GET() {
  const supabase = createServerClient();

  const [socialResult, youtubeResult, brandSettingsResult] = await Promise.all([
    supabase.from("social_accounts").select("platform, account_name, account_id, access_token, brand, is_active"),
    supabase.from("youtube_channels").select("name, channel_id, api_key, brand, is_active"),
    supabase.from("brand_settings").select("brand_id, settings"),
  ]);

  const socialRows = socialResult.data || [];
  const youtubeRows = youtubeResult.data || [];
  const brandSettings = brandSettingsResult.data || [];

  const socialChecks = await Promise.all(
    socialRows.map((account) => {
      const platform = (account.platform || "").toLowerCase();
      if (platform === "facebook" || platform === "instagram") return checkFacebookLikeToken(account);
      if (platform === "linkedin") return checkLinkedInToken(account);
      const hasToken = Boolean(sanitizeToken(account.access_token));
      return Promise.resolve({
        kind: "social" as const,
        brand: account.brand || "ukjent",
        platform: account.platform || "unknown",
        accountName: account.account_name || "Uten navn",
        accountId: account.account_id,
        ownerHint: account.account_name?.toLowerCase().includes("freddy") ? "Freddy Bremseth" : null,
        status: hasToken ? "warning" as const : "error" as const,
        message: hasToken ? "Token finnes, men plattformen har ingen automatisk validering ennå." : "Mangler access token.",
      });
    })
  );

  const youtubeChecks = await Promise.all(youtubeRows.map(checkYoutubeApiKey));
  const youtubeOauthChecks: IntegrationCheck[] = brandSettings
    .filter((row) => sanitizeToken(row.settings?.youtube_refresh_token))
    .map((row) => ({
      kind: "youtube",
      brand: row.brand_id,
      platform: "youtube-oauth",
      accountName: row.brand_id,
      status: "warning",
      message: "YouTube OAuth refresh token finnes i brand settings. Bruk /api/oauth/google/diagnose for dyp kanalvalidering.",
    }));

  const checks = [...socialChecks, ...youtubeChecks, ...youtubeOauthChecks];
  const summary = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { ok: 0, warning: 0, error: 0 }
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    env: {
      facebookApp: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
      googleOauth: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET),
      linkedinOauth: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
    },
    summary,
    checks,
    tableErrors: {
      social_accounts: socialResult.error?.message || null,
      youtube_channels: youtubeResult.error?.message || null,
      brand_settings: brandSettingsResult.error?.message || null,
    },
  });
}
