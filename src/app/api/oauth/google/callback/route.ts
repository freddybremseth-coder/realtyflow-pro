import { NextRequest, NextResponse } from "next/server";

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

/**
 * GET /api/oauth/google/callback
 *
 * Phase 3 refactor:
 *   - Verifies + consumes the `state` nonce. Rejects forged or replayed
 *     callbacks before exchanging the code.
 *   - Exchanges the code for access + refresh tokens.
 *   - Calls `youtube.channels.list({mine: true})` to enumerate the YouTube
 *     channels the auth subject can manage.
 *   - If exactly one channel is returned: creates a `social_channels` row
 *     for it under the requested brand_id and persists encrypted tokens.
 *   - If multiple channels are returned: stashes the channel list and
 *     encrypted token envelopes in a fresh state row, then redirects to
 *     /oauth/select for the user to pick one.
 *
 * Backwards-compat: also writes the refresh token to
 * `brand_settings.settings.youtube_refresh_token` (via finalizeGoogleChannel)
 * so the existing youtube-client token-walker keeps working through Phase 4.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const stateNonce = params.get("state");
  const oauthError = params.get("error");

  if (oauthError) {
    return errorRedirect(req, "_unknown", `oauth_error:${oauthError}`);
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

  // ─── 1. Code → tokens ────────────────────────────────────────────────────
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

  if (!tokenData.refresh_token) {
    // Google only issues refresh_token on first consent. /api/oauth/google
    // always sets prompt=consent so this is unexpected — log and surface.
    console.error("[Google OAuth] No refresh_token in response.");
    return errorRedirect(req, state.brand_id, "no_refresh_token", state.return_to);
  }

  // ─── 2. Enumerate channels ───────────────────────────────────────────────
  let channels: YouTubeChannelInfo[];
  if (service === "drive" || state.platform === "google_drive") {
    // Drive flows authenticate a single Google account, no channel list.
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

  // ─── 3a. Single channel → finalize immediately ───────────────────────────
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

    return successRedirect(req, state.return_to, {
      platform: state.platform,
      brand: state.brand_id,
      count: 1,
    });
  }

  // ─── 3b. Multiple channels → re-issue state, redirect to picker ──────────
  // Tokens are encrypted with OAUTH_ENCRYPTION_KEY before going into the
  // (short-lived, single-use) state row. The picker page POSTs to
  // /api/oauth/google/finalize with {state, external_id} and that endpoint
  // decrypts the chosen one and creates the channel.
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

// ─── Redirect helpers ───────────────────────────────────────────────────────

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
  context: { platform: string; brand: string; count: number },
): NextResponse {
  const url = new URL(returnTo, req.nextUrl.origin);
  url.searchParams.set("oauth_success", "true");
  url.searchParams.set("platform", context.platform);
  url.searchParams.set("brand", context.brand);
  url.searchParams.set("count", String(context.count));
  return NextResponse.redirect(url.toString());
}
