import { NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@/lib/supabase/server";
import { encryptOptional } from "@/lib/oauth/crypto";
import { serializeEnvelope } from "@/lib/oauth/envelope";
import {
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  finalizeGoogleChannel,
  listYouTubeChannels,
  type YouTubeChannelInfo,
} from "@/lib/oauth/google";
import { buildRedirectUri, getGoogleCredentials } from "@/lib/oauth/providers";
import { consumeState, createState } from "@/lib/oauth/state";
import { checkImapConnection } from "@/services/email/imap-connection-check";
import { repairRemasterPlaylistsWithFreshAccessToken } from "@/services/integrations/remaster-youtube-oauth-repair";
import { getChannelsByBrand, setChannelActive } from "@/lib/oauth/channels";
import { GSC_READ_SCOPE, listGSCProperties, selectGSCProperty } from "@/services/agents/seo-search-console";

export const maxDuration = 60;

/**
 * GET /api/oauth/google/callback
 *
 * Verifies and consumes state, exchanges the one-time code and persists
 * encrypted provider tokens. Gmail uses the expected mailbox address carried
 * in OAuth state, tests XOAUTH2 against IMAP before enabling auto-fetch, then
 * binds the token to that exact brand_email_configs row.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const stateNonce = params.get("state");
  const oauthError = params.get("error");

  if (oauthError) {
    // A declined consent still has a valid state. Preserve the brand and show
    // the reason on the SEO board instead of silently redirecting to Settings.
    const deniedState = stateNonce ? await consumeState(stateNonce) : null;
    if (deniedState?.platform === "google_search_console") {
      await recordGSCOutcome(deniedState.brand_id, "error", "gsc_consent_declined");
      return errorRedirect(req, deniedState.brand_id, "gsc_consent_declined", "/agents");
    }
    return errorRedirect(req, "_unknown", "oauth_error:" + oauthError);
  }
  if (!code || !stateNonce) {
    return errorRedirect(req, "_unknown", "missing_code_or_state");
  }

  const state = await consumeState(stateNonce);
  if (!state) {
    return errorRedirect(req, "_unknown", "state_invalid_or_expired");
  }

  const service =
    typeof state.metadata?.service === "string"
      ? (state.metadata.service as string)
      : "youtube";

  let credentials;
  try {
    credentials = getGoogleCredentials();
  } catch (err) {
    return errorRedirect(
      req,
      state.brand_id,
      err instanceof Error ? err.message : "google_creds_missing",
      state.return_to,
    );
  }

  const redirectUri = buildRedirectUri("google", req.nextUrl.origin);

  let tokenData;
  try {
    tokenData = await exchangeCodeForTokens(
      code,
      redirectUri,
      credentials.clientId,
      credentials.clientSecret,
    );
  } catch (err) {
    console.error("[Google OAuth] Token exchange failed:", err);
    return errorRedirect(
      req,
      state.brand_id,
      err instanceof Error ? err.message : "token_exchange_failed",
      state.return_to,
    );
  }

  // Search Console may be granted a short-lived access token without a new
  // refresh token. Handle that service separately and show its limited duration.
  if (service !== "search_console" && state.platform !== "google_search_console" && !tokenData.refresh_token) {
    console.error("[Google OAuth] No refresh_token in response.");
    return errorRedirect(req, state.brand_id, "no_refresh_token", state.return_to);
  }

  if (service === "gmail" || state.platform === "gmail") {
    return finalizeGmailConnection(req, state, tokenData);
  }

  // Search Console requires its own read-only scope and a per-brand verified
  // property. Never equate a Gmail/YouTube consent with verified GSC access.
  if (service === "search_console" || state.platform === "google_search_console") {
    const fail = async (reason: string) => {
      await recordGSCOutcome(state.brand_id, "error", reason);
      return errorRedirect(req, state.brand_id, reason, "/agents");
    };
    if (service !== "search_console" || state.platform !== "google_search_console") {
      return fail("gsc_oauth_service_mismatch");
    }
    const grantedScopes = (tokenData.scope || "").split(" ").filter(Boolean);
    if (!grantedScopes.includes(GSC_READ_SCOPE)) return fail("gsc_readonly_scope_not_granted");
    let authorizedProperties;
    try {
      authorizedProperties = await listGSCProperties(tokenData.access_token);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      console.error("[GSC OAuth] Property listing failed:", msg);
      return fail(msg.includes("API_DISABLED") ? "gsc_api_disabled" :
        msg.includes("HTTP 403") ? "gsc_property_list_forbidden" : "gsc_property_list_failed");
    }
    const property = selectGSCProperty(state.brand_id, authorizedProperties);
    if (!property) return fail(
      authorizedProperties.length === 0 ? "gsc_no_properties_in_google_account" : "gsc_no_verified_property_for_brand",
    );
    try {
      // The one-hour token may still be useful if Google did not return a
      // refresh token; never claim that access will renew automatically.
      const temporary = !tokenData.refresh_token;
      if (temporary && (!tokenData.expires_in || tokenData.expires_in <= 90)) {
        return fail("gsc_no_usable_token");
      }
      const existing = await getChannelsByBrand(state.brand_id, "google_search_console");
      await finalizeGoogleChannel({
        brandId: state.brand_id,
        platform: "google_search_console",
        channel: { id: property, title: "Google Search Console · " + property },
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        scopes: grantedScopes,
      });
      for (const channel of existing) {
        if (channel.external_id !== property) await setChannelActive(channel.id, false);
      }
      await recordGSCOutcome(state.brand_id, "success", temporary ? "gsc_temporary_grant" : "gsc_connected", property);
      return successRedirect(req, "/agents", {
        platform: "google_search_console", brand: state.brand_id, count: 1, temporary,
      });
    } catch (error) {
      console.error("[GSC OAuth] Connection save failed:", error instanceof Error ? error.message : "unknown");
      return fail("gsc_property_or_token_save_failed");
    }
  }

  let channels: YouTubeChannelInfo[];
  if (service === "drive" || state.platform === "google_drive") {
    const userInfo = await fetchGoogleUserInfo(tokenData.access_token);
    channels = [
      {
        id: userInfo.sub,
        title: userInfo.name || userInfo.email || "Google Drive",
      },
    ];
  } else {
    try {
      channels = await listYouTubeChannels(tokenData.access_token);
    } catch (err) {
      console.error("[Google OAuth] channels.list failed:", err);
      return errorRedirect(
        req,
        state.brand_id,
        err instanceof Error ? err.message : "channels_list_failed",
        state.return_to,
      );
    }
  }

  if (channels.length === 0) {
    return errorRedirect(req, state.brand_id, "no_channels_found", state.return_to);
  }

  if (channels.length === 1) {
    try {
      await finalizeGoogleChannel({
        brandId: state.brand_id,
        platform: state.platform === "google_drive" ? "google_drive" : "youtube",
        channel: channels[0],
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        scopes: (tokenData.scope || "").split(" ").filter(Boolean),
      });
    } catch (err) {
      console.error("[Google OAuth] finalize failed:", err);
      return errorRedirect(
        req,
        state.brand_id,
        err instanceof Error ? err.message : "finalize_failed",
        state.return_to,
      );
    }

    if (
      state.brand_id === "remasterfreddy" &&
      state.platform !== "google_drive" &&
      service !== "drive"
    ) {
      try {
        const repair = await repairRemasterPlaylistsWithFreshAccessToken({
          brandId: state.brand_id,
          accessToken: tokenData.access_token,
          channelId: channels[0].id,
        });
        console.info("[Google OAuth] Re-Master playlist bootstrap:", repair);
      } catch (err) {
        console.error("[Google OAuth] Re-Master playlist bootstrap failed:", err);
      }
    }

    return successRedirect(req, state.return_to, {
      platform: state.platform,
      brand: state.brand_id,
      count: 1,
    });
  }

  const accessEnv = encryptOptional(tokenData.access_token);
  const refreshEnv = encryptOptional(tokenData.refresh_token);
  if (!accessEnv || !refreshEnv) {
    return errorRedirect(req, state.brand_id, "encrypt_pending_token_failed", state.return_to);
  }

  const pickerNonce = await createState({
    brandId: state.brand_id,
    platform: state.platform,
    returnTo: state.return_to,
    metadata: {
      service,
      pending_pick: "google_channel",
      candidates: channels,
      access_token_env: serializeEnvelope(accessEnv),
      refresh_token_env: serializeEnvelope(refreshEnv),
      access_expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
      scopes: (tokenData.scope || "").split(" ").filter(Boolean),
    },
  });

  const pickerUrl = new URL("/oauth/select", req.nextUrl.origin);
  pickerUrl.searchParams.set("state", pickerNonce);
  pickerUrl.searchParams.set(
    "provider",
    state.platform === "google_drive" ? "google_drive" : "google",
  );
  return NextResponse.redirect(pickerUrl.toString());
}

async function finalizeGmailConnection(
  req: NextRequest,
  state: Awaited<ReturnType<typeof consumeState>> & {},
  tokenData: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  },
): Promise<NextResponse> {
  const accountId = typeof state.metadata?.account_id === "string" ? state.metadata.account_id.trim() : "";
  const expectedEmail = typeof state.metadata?.expected_email === "string"
    ? state.metadata.expected_email.trim().toLowerCase()
    : "";

  if (!accountId || !expectedEmail || !tokenData.refresh_token) {
    return errorRedirect(req, state.brand_id, "gmail_state_incomplete", state.return_to);
  }

  let userInfo;
  try {
    userInfo = await fetchGoogleUserInfo(tokenData.access_token);
  } catch (err) {
    console.error("[Google OAuth] Gmail userinfo failed:", err);
    return errorRedirect(req, state.brand_id, "gmail_userinfo_failed", state.return_to);
  }

  const connectedEmail = String(userInfo.email || "").trim().toLowerCase();
  if (!connectedEmail || connectedEmail !== expectedEmail) {
    console.error(`[Google OAuth] Gmail account mismatch expected=${expectedEmail} got=${connectedEmail || "missing"}`);
    return errorRedirect(req, state.brand_id, "gmail_account_mismatch", state.return_to);
  }

  try {
    await checkImapConnection({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      email: connectedEmail,
      accessToken: tokenData.access_token,
    });
  } catch (err) {
    console.error("[Google OAuth] Gmail XOAUTH2 IMAP test failed:", err);
    return errorRedirect(req, state.brand_id, "gmail_imap_oauth_test_failed", state.return_to);
  }

  try {
    await finalizeGoogleChannel({
      brandId: state.brand_id,
      platform: "gmail",
      channel: {
        id: connectedEmail,
        title: userInfo.name ? `${userInfo.name} · ${connectedEmail}` : connectedEmail,
      },
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : null,
      scopes: (tokenData.scope || "").split(" ").filter(Boolean),
    });
  } catch (err) {
    console.error("[Google OAuth] Gmail token persistence failed:", err);
    return errorRedirect(req, state.brand_id, "gmail_token_persist_failed", state.return_to);
  }

  const supabase = createServerClient();
  const { data: account, error: accountError } = await supabase
    .from("brand_email_configs")
    .select("id,brand_id,email_address")
    .eq("id", accountId)
    .maybeSingle();

  if (accountError || !account) {
    return errorRedirect(req, state.brand_id, "gmail_email_account_not_found", state.return_to);
  }
  if (account.brand_id !== state.brand_id || String(account.email_address || "").trim().toLowerCase() !== connectedEmail) {
    return errorRedirect(req, state.brand_id, "gmail_email_account_binding_mismatch", state.return_to);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("brand_email_configs")
    .update({
      imap_host: "imap.gmail.com",
      imap_port: 993,
      imap_secure: true,
      smtp_host: "smtp.gmail.com",
      smtp_port: 465,
      smtp_secure: true,
      auto_fetch: true,
      auto_fetch_paused_by_system: false,
      health_status: "healthy",
      health_message: null,
      consecutive_failures: 0,
      last_error_at: null,
      last_success_at: now,
      updated_at: now,
    })
    .eq("id", accountId);

  if (updateError) {
    return errorRedirect(req, state.brand_id, "gmail_email_account_update_failed", state.return_to);
  }

  await supabase.from("automation_logs").insert({
    action: "email_google_oauth_connected",
    agent_name: "nexus_communications",
    status: "success",
    details: {
      account_id: accountId,
      brand_id: state.brand_id,
      email_address: connectedEmail,
      auth_method: "google_oauth",
      imap_host: "imap.gmail.com",
      smtp_host: "smtp.gmail.com",
    },
  });

  return successRedirect(req, state.return_to, {
    platform: "gmail",
    brand: state.brand_id,
    count: 1,
  });
}

/** Diagnostic events are brand-scoped and contain no Google codes, emails or tokens. */
async function recordGSCOutcome(
  brandId: string, status: "success" | "error", reason: string, property?: string,
): Promise<void> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from("automation_logs").insert({
      action: "gsc_oauth_connection",
      agent_name: "Sam SEO Expert",
      status,
      details: { brand_id: brandId, reason_code: reason, ...(property ? { property } : {}) },
    });
    if (error) console.error("[GSC OAuth] Could not write outcome log:", error.message);
  } catch (error) {
    console.error("[GSC OAuth] Could not write outcome log:", error instanceof Error ? error.message : "unknown");
  }
}

function errorRedirect(
  req: NextRequest,
  brand: string,
  msg: string,
  returnTo?: string,
): NextResponse {
  const path = returnTo || "/settings?tab=sosiale-medier";
  const url = new URL(path, req.nextUrl.origin);
  url.searchParams.set("oauth_error", msg);
  url.searchParams.set("brand", brand);
  return NextResponse.redirect(url.toString());
}

function successRedirect(
  req: NextRequest,
  returnTo: string,
  context: { platform: string; brand: string; count: number; temporary?: boolean },
): NextResponse {
  const url = new URL(returnTo, req.nextUrl.origin);
  url.searchParams.set("oauth_success", "true");
  url.searchParams.set("platform", context.platform);
  url.searchParams.set("brand", context.brand);
  url.searchParams.set("count", String(context.count));
  if (context.temporary) url.searchParams.set("oauth_temporary", "true");
  return NextResponse.redirect(url.toString());
}
