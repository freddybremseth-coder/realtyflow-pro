import { NextRequest, NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/api-admin";
import { buildRedirectUri, getGoogleCredentials } from "@/lib/oauth/providers";
import { createState } from "@/lib/oauth/state";
import { normalizeBrandId } from "@/lib/realty/brand-rules";
import { GOOGLE_MAIL_SCOPE } from "@/services/email/account-auth";
import { GSC_READ_SCOPE, targetForBrand } from "@/services/agents/seo-search-console";

/**
 * GET /api/oauth/google?brand_id=<id>&service=<youtube|drive|gmail|search_console>&return_to=<path>
 *
 * Multi-brand Google OAuth entry point. Gmail additionally requires the
 * concrete brand_email_configs account id + expected email address so the
 * callback cannot bind the wrong Google account to a mailbox.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const rawBrandId = (params.get("brand_id") || params.get("brand") || "").trim();
  const brandId = normalizeBrandId(rawBrandId);
  if (!brandId) {
    return NextResponse.json(
      { error: "brand_id is required. Use /api/oauth/google?brand_id=<id>" },
      { status: 400 },
    );
  }

  const service = (params.get("service") || "youtube").trim();
  if (!["youtube", "drive", "gmail", "search_console"].includes(service)) {
    return NextResponse.json({ error: "service must be youtube, drive, gmail or search_console" }, { status: 400 });
  }

  if (service === "search_console" && !targetForBrand(brandId)) {
    return NextResponse.json({ error: "Unknown approved SEO website" }, { status: 400 });
  }

  if (service === "gmail" || service === "search_console") {
    const denied = await requireAdminApi(req);
    if (denied) return denied;
  }

  const returnTo = service === "search_console" ? "/agents" : (params.get("return_to") || "/settings?tab=sosiale-medier");
  const accountId = (params.get("account_id") || "").trim();
  const expectedEmail = (params.get("email") || "").trim().toLowerCase();

  if (service === "gmail" && (!accountId || !expectedEmail || !expectedEmail.includes("@"))) {
    return NextResponse.json(
      { error: "Gmail OAuth requires account_id and a valid email address" },
      { status: 400 },
    );
  }

  let credentials;
  try {
    credentials = getGoogleCredentials();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Google OAuth not configured" },
      { status: 500 },
    );
  }

  const redirectUri = buildRedirectUri("google", req.nextUrl.origin);

  const scopes = service === "gmail"
    ? ["openid", "email", "profile", GOOGLE_MAIL_SCOPE]
    : service === "search_console"
      ? [GSC_READ_SCOPE]
    : [
        "https://www.googleapis.com/auth/youtube",
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.force-ssl",
        "https://www.googleapis.com/auth/yt-analytics.readonly",
        ...(service === "drive" ? ["https://www.googleapis.com/auth/drive.file"] : []),
      ];

  let stateNonce: string;
  try {
    stateNonce = await createState({
      brandId,
      platform: service === "drive" ? "google_drive" : service === "gmail" ? "gmail" : service === "search_console" ? "google_search_console" : "youtube",
      returnTo,
      metadata: {
        service,
        ...(service === "gmail" ? { account_id: accountId, expected_email: expectedEmail } : {}),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start OAuth flow" },
      { status: 500 },
    );
  }

  console.log(
    `[Google OAuth] start brand=${brandId} service=${service} redirect_uri=${redirectUri}`,
  );

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", credentials.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", service === "search_console" ? "select_account consent" : "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", stateNonce);
  if (service === "gmail") authUrl.searchParams.set("login_hint", expectedEmail);

  return NextResponse.redirect(authUrl.toString());
}
