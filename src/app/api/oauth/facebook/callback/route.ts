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
      `${req.nextUrl.origin}/settings?oauth=error&platform=facebook&msg=${error || "no_code"}`
    );
  }

  let brand = "soleada";
  try {
    const state = JSON.parse(stateStr || "{}");
    brand = state.brand || "soleada";
  } catch {}

  const appId = process.env.FACEBOOK_APP_ID!;
  const appSecret = process.env.FACEBOOK_APP_SECRET!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/oauth/facebook/callback`;

  try {
    // 1. Exchange code for short-lived token
    const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      throw new Error(tokenData.error.message);
    }

    const shortLivedToken = tokenData.access_token;

    // 2. Exchange for long-lived token (60 days)
    const longUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", appId);
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("fb_exchange_token", shortLivedToken);

    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();
    const longLivedToken = longData.access_token || shortLivedToken;

    // 3. Get user's Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${longLivedToken}`
    );
    const pagesData = await pagesRes.json();
    const pages = pagesData.data || [];

    const supabase = getSupabase();

    // 4. Save each page as a social account
    for (const page of pages) {
      // Upsert: update if exists, insert if not
      const { data: existing } = await supabase
        .from("social_accounts")
        .select("id")
        .eq("platform", "facebook")
        .eq("account_id", page.id)
        .eq("brand", brand)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("social_accounts")
          .update({
            access_token: page.access_token, // Page access token (never expires)
            account_name: page.name,
            is_active: true,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("social_accounts").insert({
          platform: "facebook",
          account_id: page.id,
          account_name: page.name,
          access_token: page.access_token,
          brand,
          is_active: true,
        });
      }

      // 5. Check for Instagram Business Account linked to this page
      try {
        const igRes = await fetch(
          `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
        );
        const igData = await igRes.json();

        if (igData.instagram_business_account?.id) {
          const igId = igData.instagram_business_account.id;

          // Get IG username
          const igInfoRes = await fetch(
            `https://graph.facebook.com/v19.0/${igId}?fields=username&access_token=${page.access_token}`
          );
          const igInfo = await igInfoRes.json();

          const { data: existingIg } = await supabase
            .from("social_accounts")
            .select("id")
            .eq("platform", "instagram")
            .eq("account_id", igId)
            .eq("brand", brand)
            .maybeSingle();

          if (existingIg) {
            await supabase
              .from("social_accounts")
              .update({
                access_token: page.access_token,
                account_name: igInfo.username || `IG-${page.name}`,
                is_active: true,
              })
              .eq("id", existingIg.id);
          } else {
            await supabase.from("social_accounts").insert({
              platform: "instagram",
              account_id: igId,
              account_name: igInfo.username || `IG-${page.name}`,
              access_token: page.access_token,
              brand,
              is_active: true,
            });
          }
        }
      } catch (igError) {
        console.error("[OAuth Facebook] Instagram check failed:", igError);
      }
    }

    return NextResponse.redirect(
      `${req.nextUrl.origin}/settings?oauth=success&platform=facebook&pages=${pages.length}`
    );
  } catch (err) {
    console.error("[OAuth Facebook] Error:", err);
    return NextResponse.redirect(
      `${req.nextUrl.origin}/settings?oauth=error&platform=facebook&msg=${encodeURIComponent(
        err instanceof Error ? err.message : "Unknown error"
      )}`
    );
  }
}
