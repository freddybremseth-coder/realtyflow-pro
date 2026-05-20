import { NextRequest, NextResponse } from "next/server";

import { buildRedirectUri, getMetaCredentials } from "@/lib/oauth/providers";
import { createState } from "@/lib/oauth/state";
import { normalizeBrandId } from "@/lib/realty/brand-rules";

/**
 * GET /api/oauth/facebook?brand_id=<id>&return_to=<path>
 *
 * Phase 3 refactor:
 *   - `brand_id` is REQUIRED (legacy `brand` param accepted as fallback).
 *   - `state` is now a 32-byte hex nonce persisted in `oauth_states`. The
 *     callback verifies + consumes it. No more unsigned base64-JSON state.
 *   - The callback no longer auto-creates a row for every Page the user
 *     admins. Instead it lists the Pages, stashes them in a fresh state row,
 *     and redirects to /oauth/select for the user to pick exactly one
 *     (Page, Brand) binding. This is the structural fix for cross-brand
 *     contamination.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const rawBrandId = (params.get("brand_id") || params.get("brand") || "").trim();
  const brandId = normalizeBrandId(rawBrandId);
  if (!brandId) {
    return NextResponse.json(
      { error: "brand_id is required. Use /api/oauth/facebook?brand_id=<id>" },
      { status: 400 },
    );
  }
  const returnTo = params.get("return_to") || "/settings?tab=sosiale-medier";

  let credentials;
  try {
    credentials = getMetaCredentials();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Meta OAuth not configured" },
      { status: 500 },
    );
  }

  const redirectUri = buildRedirectUri("facebook", req.nextUrl.origin);

  // Required scopes:
  //   pages_show_list           — list the user's Pages
  //   pages_read_engagement     — read Page info, required by IG Graph API
  //   pages_manage_posts        — post to Pages
  //   pages_read_user_content   — read Page comments etc. (used elsewhere)
  //   business_management       — needed for some Business-Suite Pages
  //   instagram_basic           — read IG Business profile info
  //   instagram_content_publish — post to IG Business
  //
  // Auto-approved without app review when paired with a Business account.
  const scope = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_read_user_content",
    "business_management",
    "instagram_basic",
    "instagram_content_publish",
  ].join(",");

  const stateNonce = await createState({
    brandId,
    platform: "facebook",
    returnTo,
    metadata: {},
  });

  const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  authUrl.searchParams.set("client_id", credentials.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", stateNonce);
  authUrl.searchParams.set("response_type", "code");
  // `auth_type=rerequest` ensures the consent dialog reappears even if the
  // user previously declined a permission, so they can grant the missing
  // scope without manually removing the app from FB settings first.
  authUrl.searchParams.set("auth_type", "rerequest");

  return NextResponse.redirect(authUrl.toString());
}
