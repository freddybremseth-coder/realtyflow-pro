import { NextRequest, NextResponse } from "next/server";

import { encryptOptional } from "@/lib/oauth/crypto";
import { serializeEnvelope } from "@/lib/oauth/envelope";
import {
  attachInstagramInfo,
  exchangeCodeForUserToken,
  finalizeFacebookPage,
  listFacebookPages,
  verifyUserScopes,
} from "@/lib/oauth/meta";
import { buildRedirectUri, getMetaCredentials } from "@/lib/oauth/providers";
import { consumeState, createState } from "@/lib/oauth/state";

/**
 * GET /api/oauth/facebook/callback
 *
 * Phase 3 refactor — the structural fix:
 *
 * Before, this callback would loop over every Page the user admins, insert a
 * `social_accounts` row for each, and ALSO auto-bind every linked Instagram
 * Business account. That's how Zen Eco Homes posts were ending up on
 * freddybremseth.com — Freddy admins both Pages with the same Facebook
 * account, and the publisher was picking arbitrary rows by fuzzy matching.
 *
 * Now:
 *   1) Consume the state nonce (CSRF + replay).
 *   2) Exchange code → long-lived user token.
 *   3) Verify granted scopes; bail out with a clear message if anything
 *      essential was unchecked on the consent screen.
 *   4) List the postable Pages and attach each one's linked IG info.
 *   5) Stash the Page list (with each Page's token, encrypted) in a fresh
 *      state row, and redirect to /oauth/select where the user picks
 *      EXACTLY ONE Page to bind to the brand.
 *
 * If the user only admins one Page, we auto-finalize and skip the picker.
 */

const REQUIRED_USER_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
];

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

  let credentials;
  try {
    credentials = getMetaCredentials();
  } catch (err) {
    return errorRedirect(
      req,
      state.brand_id,
      err instanceof Error ? err.message : "meta_creds_missing",
      state.return_to,
    );
  }

  const redirectUri = buildRedirectUri("facebook", req.nextUrl.origin);

  // ─── 1. Code → long-lived user token ─────────────────────────────────────
  let userToken: string;
  try {
    userToken = await exchangeCodeForUserToken({
      code,
      redirectUri,
      appId: credentials.clientId,
      appSecret: credentials.clientSecret,
    });
  } catch (err) {
    console.error("[FB OAuth] token exchange failed:", err);
    return errorRedirect(
      req,
      state.brand_id,
      err instanceof Error ? err.message : "token_exchange_failed",
      state.return_to,
    );
  }

  // ─── 2. Scope preflight ──────────────────────────────────────────────────
  const { granted, missing } = await verifyUserScopes({
    userToken,
    appId: credentials.clientId,
    appSecret: credentials.clientSecret,
    required: REQUIRED_USER_SCOPES,
  });
  if (missing.length > 0) {
    const msg =
      `Mangler Facebook-tillatelser: ${missing.join(", ")}. ` +
      `Kjør tilkoblingen på nytt og IKKE klikk "Rediger tilgang" — aksepter ALLE tillatelsene.`;
    return errorRedirect(req, state.brand_id, msg, state.return_to);
  }

  // ─── 3. List Pages + IG ──────────────────────────────────────────────────
  let pages;
  try {
    pages = await listFacebookPages({
      userToken,
      appId: credentials.clientId,
      appSecret: credentials.clientSecret,
    });
  } catch (err) {
    console.error("[FB OAuth] listPages failed:", err);
    return errorRedirect(
      req,
      state.brand_id,
      err instanceof Error ? err.message : "list_pages_failed",
      state.return_to,
    );
  }

  if (pages.postable.length === 0) {
    const detail = pages.nonPostable.length
      ? ` Sider funnet (men uten tilstrekkelige tillatelser): ${pages.nonPostable.map((p) => p.name).join(", ")}.`
      : "";
    return errorRedirect(
      req,
      state.brand_id,
      `Ingen Facebook-sider med tilstrekkelige tillatelser.${detail} Sørg for at du er admin og at du godtok alle tillatelser.`,
      state.return_to,
    );
  }

  await attachInstagramInfo(pages.postable);

  // ─── 4a. Single Page → finalize immediately ──────────────────────────────
  if (pages.postable.length === 1) {
    try {
      await finalizeFacebookPage({
        brandId: state.brand_id,
        page: pages.postable[0],
        scopes: granted,
      });
    } catch (err) {
      console.error("[FB OAuth] finalize failed:", err);
      return errorRedirect(
        req,
        state.brand_id,
        err instanceof Error ? err.message : "finalize_failed",
        state.return_to,
      );
    }
    return successRedirect(req, state.return_to, {
      platform: "facebook",
      brand: state.brand_id,
      count: 1,
    });
  }

  // ─── 4b. Multiple Pages → encrypt, stash, redirect to picker ─────────────
  // We encrypt each Page's access_token before stashing it in state.metadata.
  // This is the same OAUTH_ENCRYPTION_KEY oauth_tokens uses; the state row is
  // short-lived and single-use.
  const candidates = pages.postable.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    instagram: p.instagram,
    page_token_env: serializeEnvelope(encryptOptional(p.accessToken)!),
  }));

  const pickerNonce = await createState({
    brandId: state.brand_id,
    platform: "facebook",
    returnTo: state.return_to,
    metadata: {
      pending_pick: "facebook_page",
      candidates,
      non_postable: pages.nonPostable.map((p) => ({ id: p.id, name: p.name })),
      scopes: granted,
    },
  });

  const pickerUrl = new URL("/oauth/select", req.nextUrl.origin);
  pickerUrl.searchParams.set("state", pickerNonce);
  pickerUrl.searchParams.set("provider", "facebook");
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
  ctx: { platform: string; brand: string; count: number },
): NextResponse {
  const url = new URL(returnTo, req.nextUrl.origin);
  url.searchParams.set("oauth_success", "true");
  url.searchParams.set("platform", ctx.platform);
  url.searchParams.set("brand", ctx.brand);
  url.searchParams.set("count", String(ctx.count));
  return NextResponse.redirect(url.toString());
}
