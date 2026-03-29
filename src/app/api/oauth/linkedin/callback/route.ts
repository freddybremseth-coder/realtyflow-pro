import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateStr = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/settings?oauth=error&platform=linkedin&msg=${error || "no_code"}`
    );
  }

  let brand = "zen-eco";
  try {
    const state = JSON.parse(stateStr || "{}");
    brand = state.brand || "zen-eco";
  } catch {}

  const clientId = process.env.LINKEDIN_CLIENT_ID!;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/oauth/linkedin/callback`;

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const accessToken = tokenData.access_token;

    // 2. Get user profile
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json();

    const accountName = profile.name || profile.email || "LinkedIn User";
    const accountId = profile.sub || "unknown";

    // 3. Save to social_accounts
    const supabase = getSupabase();

    const { data: existing } = await supabase
      .from("social_accounts")
      .select("id")
      .eq("platform", "linkedin")
      .eq("account_id", accountId)
      .eq("brand", brand)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("social_accounts")
        .update({
          access_token: accessToken,
          account_name: accountName,
          is_active: true,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("social_accounts").insert({
        platform: "linkedin",
        account_id: accountId,
        account_name: accountName,
        access_token: accessToken,
        brand,
        is_active: true,
      });
    }

    return NextResponse.redirect(
      `${req.nextUrl.origin}/settings?oauth=success&platform=linkedin`
    );
  } catch (err) {
    console.error("[OAuth LinkedIn] Error:", err);
    return NextResponse.redirect(
      `${req.nextUrl.origin}/settings?oauth=error&platform=linkedin&msg=${encodeURIComponent(
        err instanceof Error ? err.message : "Unknown error"
      )}`
    );
  }
}
