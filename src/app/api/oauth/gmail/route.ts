import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";

/**
 * Legacy compatibility endpoint.
 * Gmail now uses the canonical multi-brand Google OAuth flow so tokens are
 * encrypted in oauth_tokens and bound to one concrete email account.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAdminApi(req);
  if (denied) return denied;

  const brandId = (req.nextUrl.searchParams.get("brand_id") || req.nextUrl.searchParams.get("brand") || "").trim();
  const accountId = (req.nextUrl.searchParams.get("account_id") || "").trim();
  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  const returnTo = req.nextUrl.searchParams.get("return_to") || "/nexus-os/communications";

  if (!brandId || !accountId || !email) {
    return NextResponse.json(
      {
        error: "Legacy Gmail OAuth is disabled. Start Google login from E-post & kommunikasjon so brand_id, account_id and email are bound safely.",
      },
      { status: 410 },
    );
  }

  const target = new URL("/api/oauth/google", req.nextUrl.origin);
  target.searchParams.set("brand_id", brandId);
  target.searchParams.set("service", "gmail");
  target.searchParams.set("account_id", accountId);
  target.searchParams.set("email", email);
  target.searchParams.set("return_to", returnTo);
  return NextResponse.redirect(target);
}
