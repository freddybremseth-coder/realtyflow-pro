import { NextRequest, NextResponse } from "next/server";

import { buildRedirectUri, getMetaCredentials } from "@/lib/oauth/providers";
import { createState } from "@/lib/oauth/state";
import { META_COMMUNICATION_SCOPES, META_PUBLISHING_SCOPES } from "@/lib/oauth/meta-capabilities";
import { normalizeBrandId } from "@/lib/realty/brand-rules";

/**
 * GET /api/oauth/facebook?brand_id=<id>&return_to=<path>&capability=publishing|communications
 *
 * Communication scopes are requested only for capability=communications.
 * Meta may still require App Review / Advanced Access / a verified business.
 * Requested permission is never treated as granted capability; Nexus checks
 * the saved OAuth scopes after callback/finalize and Runtime remains separate.
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
    ...META_PUBLISHING_SCOPES,
    ...(requestedCapability === "communications" ? META_COMMUNICATION_SCOPES : []),
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
