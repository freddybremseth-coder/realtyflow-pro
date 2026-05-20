import { NextRequest, NextResponse } from "next/server";

import { saveTokens, upsertChannel } from "@/lib/oauth/channels";
import { buildRedirectUri, getLinkedInCredentials } from "@/lib/oauth/providers";
import { consumeState } from "@/lib/oauth/state";
import { normalizeBrandId } from "@/lib/realty/brand-rules";

/**
 * GET /api/oauth/linkedin/callback
 *
 * Phase 3.5: LinkedIn callback aligned with the new flow.
 *
 *   1) Consume the state nonce.
 *   2) Exchange the code for tokens.
 *   3) Call /v2/userinfo to identify the authorized member.
 *   4) Upsert `social_channels` (one row per member, per brand) and persist
 *      encrypted tokens. Re-authing the same brand+member updates in place.
 *
 * No picker step — LinkedIn member auth maps to exactly one URN. Company
 * Page support, when it lands, will need a separate flow with a picker.
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
  const canonicalBrandId = normalizeBrandId(state.brand_id);

  let credentials;
  try {
    credentials = getLinkedInCredentials();
  } catch (err) {
    return errorRedirect(
      req,
      canonicalBrandId,
      err instanceof Error ? err.message : "linkedin_creds_missing",
      state.return_to,
    );
  }

  const redirectUri = buildRedirectUri("linkedin", req.nextUrl.origin);

  // ─── 1. Token exchange ──────────────────────────────────────────────────
  let tokenData: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };
  try {
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });
    tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`);
    }
  } catch (err) {
    console.error("[LinkedIn OAuth] token exchange failed:", err);
    return errorRedirect(
      req,
      canonicalBrandId,
      err instanceof Error ? err.message : "token_exchange_failed",
      state.return_to,
    );
  }

  // ─── 2. /v2/userinfo to get a stable URN + display name ─────────────────
  let profile: { sub?: string; name?: string; email?: string };
  try {
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    profile = await profileRes.json();
    if (!profileRes.ok || !profile.sub) {
      throw new Error(`userinfo failed: ${profileRes.status}`);
    }
  } catch (err) {
    console.error("[LinkedIn OAuth] userinfo failed:", err);
    return errorRedirect(
      req,
      canonicalBrandId,
      err instanceof Error ? err.message : "userinfo_failed",
      state.return_to,
    );
  }

  // The publisher in src/services/publishing/publisher.ts expects either a
  // raw member id or a urn:li:person URN. We store the raw `sub` so that
  // `accountId.startsWith("urn:")` evaluates false and the publisher prefixes
  // it correctly. If we ever add Company Page posting, those rows will store
  // a `urn:li:organization:<id>` instead.
  const externalId = profile.sub!;
  const displayName = profile.name || profile.email || `LinkedIn ${externalId.slice(0, 8)}`;

  // ─── 3. Persist channel + tokens ────────────────────────────────────────
  try {
    const channel = await upsertChannel({
      brandId: canonicalBrandId,
      platform: "linkedin",
      externalId,
      displayName,
      metadata: {
        urn_kind: "person",
        email: profile.email,
      },
    });

    await saveTokens({
      socialChannelId: channel.id,
      accessToken: tokenData.access_token!,
      refreshToken: tokenData.refresh_token ?? null,
      expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
      scopes: (tokenData.scope || "").split(" ").filter(Boolean),
    });
  } catch (err) {
    console.error("[LinkedIn OAuth] persist failed:", err);
    return errorRedirect(
      req,
      canonicalBrandId,
      err instanceof Error ? err.message : "persist_failed",
      state.return_to,
    );
  }

  return successRedirect(req, state.return_to, {
    platform: "linkedin",
    brand: canonicalBrandId,
    count: 1,
  });
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
  ctx: { platform: string; brand: string; count: number },
): NextResponse {
  const url = new URL(returnTo, req.nextUrl.origin);
  url.searchParams.set("oauth_success", "true");
  url.searchParams.set("platform", ctx.platform);
  url.searchParams.set("brand", ctx.brand);
  url.searchParams.set("count", String(ctx.count));
  return NextResponse.redirect(url.toString());
}
