import { NextRequest, NextResponse } from "next/server";

import { buildRedirectUri, getMetaCredentials } from "@/lib/oauth/providers";
import { createState } from "@/lib/oauth/state";
import { normalizeBrandId } from "@/lib/realty/brand-rules";

const BASE_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_read_user_content",
  "business_management",
  "instagram_basic",
  "instagram_manage_insights",
  "instagram_content_publish",
] as const;

/**
 * Communication scopes are requested ONLY when capability=communications.
 * Meta may require App Review / Advanced Access / verified business before
 * these grants work for people outside app roles. Requesting a scope never
 * means the capability is available; Nexus verifies the granted scopes after
 * OAuth and keeps social reply runtime controls OFF until capability is real.
 */
const COMMUNICATION_SCOPES = [
  "pages_manage_engagement",
  "pages_manage_metadata",
  "pages_messaging",
  "instagram_manage_comments",
  "instagram_manage_messages",
] as const;

/**
 * GET /api/oauth/facebook?brand_id=<id>&return_to=<path>&capability=publishing|communications
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

  const returnTo = params.get("return_to") || "/connections";
  const requestedCapability = params.get("capability") === "communications" ? "communications" : "publishing";

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
  const scope = [
    ...BASE_SCOPES,
    ...(requestedCapability === "communications" ? COMMUNICATION_SCOPES : []),
  ].join(",");

  const stateNonce = await createState({
    brandId,
    platform: "facebook",
    returnTo,
    metadata: { requested_capability: requestedCapability },
  });

  const authUrl = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  authUrl.searchParams.set("client_id", credentials.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", stateNonce);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("auth_type", "rerequest");

  return NextResponse.redirect(authUrl.toString());
}
