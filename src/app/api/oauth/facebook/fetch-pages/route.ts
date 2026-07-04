import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * POST /api/oauth/facebook/fetch-pages
 * Uses the stored Facebook user token to fetch all pages the user manages
 * and saves them with proper Page Access Tokens.
 *
 * If /me/accounts doesn't return pages, it tries fetching pages
 * by their known IDs using the user token.
 */
export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminApi(req);
    if (adminError) return adminError;

    const body = await req.json();
    const { brand } = body;

    if (!brand) {
      return NextResponse.json({ error: "brand is required" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    // Get existing Facebook account for this brand (might be a user token)
    const { data: existingAccounts } = await supabase
      .from("social_accounts")
      .select("*")
      .eq("platform", "facebook")
      .eq("is_active", true);

    // Find account matching this brand (flexible matching)
    const normBrand = (b: string) =>
      b.toLowerCase().replace(/[-_.\s]/g, "").replace(/homes$/, "").replace(/pro$/, "");

    const account = (existingAccounts || []).find(
      (a: { brand: string }) => normBrand(a.brand) === normBrand(brand)
    );

    if (!account) {
      return NextResponse.json(
        { error: `Ingen Facebook-konto funnet for "${brand}". Koble til via OAuth først.` },
        { status: 404 }
      );
    }

    const userToken = account.access_token;
    console.log("[Fetch Pages] Using token from account:", account.account_name, "brand:", account.brand);

    // Try /me/accounts first
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,category&access_token=${userToken}`
    );
    const pagesData = await pagesRes.json();
    console.log("[Fetch Pages] /me/accounts response:", JSON.stringify(pagesData).substring(0, 500));

    let pages = pagesData.data || [];

    // If no pages found, try fetching known page IDs directly
    if (pages.length === 0) {
      console.log("[Fetch Pages] No pages from /me/accounts, trying known page IDs...");

      // Known page IDs for Freddy's pages
      const knownPages = [
        { id: "zenecohomespain", name: "Zen Eco Homes" },
        { id: "61575278322767", name: "Doña Anna" },
        { id: "freddybremseth", name: "Freddy Bremseth" },
      ];

      for (const known of knownPages) {
        try {
          const pageRes = await fetch(
            `https://graph.facebook.com/v19.0/${known.id}?fields=id,name,access_token&access_token=${userToken}`
          );
          const pageData = await pageRes.json();
          console.log(`[Fetch Pages] Page ${known.id}:`, JSON.stringify(pageData).substring(0, 300));

          if (pageData.id && !pageData.error) {
            pages.push({
              id: pageData.id,
              name: pageData.name || known.name,
              access_token: pageData.access_token || userToken,
            });
          }
        } catch (e) {
          console.error(`[Fetch Pages] Failed to fetch page ${known.id}:`, e);
        }
      }
    }

    // If still no pages, try getting page tokens via /{page-id}?fields=access_token
    if (pages.length === 0) {
      // Try the debug token endpoint to see what permissions we actually have
      const appId = process.env.FACEBOOK_APP_ID!;
      const appSecret = process.env.FACEBOOK_APP_SECRET!;
      const debugRes = await fetch(
        `https://graph.facebook.com/v19.0/debug_token?input_token=${userToken}&access_token=${appId}|${appSecret}`
      );
      const debugData = await debugRes.json();
      console.log("[Fetch Pages] Token debug:", JSON.stringify(debugData).substring(0, 500));

      return NextResponse.json({
        success: false,
        pages: [],
        message: "Ingen sider funnet. Token-info er logget. Prøv å re-autorisere med OAuth.",
        tokenDebug: {
          scopes: debugData.data?.scopes || [],
          type: debugData.data?.type,
          userId: debugData.data?.user_id,
          expiresAt: debugData.data?.expires_at,
        },
      });
    }

    // Save/update pages in social_accounts
    const savedPages = [];
    for (const page of pages) {
      // Skip if it's the same as the user's personal ID
      if (page.id === account.account_id && !page.access_token?.startsWith("EAA")) {
        console.log("[Fetch Pages] Skipping personal account ID:", page.id);
        continue;
      }

      const { data: existing } = await supabase
        .from("social_accounts")
        .select("id")
        .eq("platform", "facebook")
        .eq("account_id", page.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("social_accounts")
          .update({
            access_token: page.access_token || userToken,
            account_name: page.name,
            brand,
            is_active: true,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("social_accounts").insert({
          platform: "facebook",
          account_id: page.id,
          account_name: page.name,
          access_token: page.access_token || userToken,
          brand,
          is_active: true,
        });
      }

      savedPages.push({ id: page.id, name: page.name });

      // Check for Instagram Business Account linked to this page
      try {
        const pageToken = page.access_token || userToken;
        const igRes = await fetch(
          `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${pageToken}`
        );
        const igData = await igRes.json();
        console.log(`[Fetch Pages] Instagram check for ${page.name} (${page.id}):`, JSON.stringify(igData).substring(0, 300));

        if (igData.instagram_business_account?.id) {
          const igId = igData.instagram_business_account.id;
          // Fetch Instagram username and profile info
          const igInfoRes = await fetch(
            `https://graph.facebook.com/v19.0/${igId}?fields=username,name,profile_picture_url,followers_count&access_token=${pageToken}`
          );
          const igInfo = await igInfoRes.json();
          console.log(`[Fetch Pages] Instagram account ${igId}:`, JSON.stringify(igInfo).substring(0, 300));

          const igName = igInfo.username || igInfo.name || `IG-${page.name}`;

          const { data: existingIg } = await supabase
            .from("social_accounts")
            .select("id")
            .eq("platform", "instagram")
            .eq("account_id", igId)
            .maybeSingle();

          if (existingIg) {
            await supabase.from("social_accounts").update({
              access_token: pageToken,
              account_name: igName,
              brand,
              is_active: true,
            }).eq("id", existingIg.id);
          } else {
            await supabase.from("social_accounts").insert({
              platform: "instagram",
              account_id: igId,
              account_name: igName,
              access_token: pageToken,
              brand,
              is_active: true,
            });
          }
          savedPages.push({ id: igId, name: igName, platform: "instagram" });
        } else {
          console.log(`[Fetch Pages] No Instagram Business Account linked to page ${page.name}`);
        }
      } catch (igError) {
        console.error("[Fetch Pages] Instagram check failed for", page.name, ":", igError);
      }
    }

    return NextResponse.json({
      success: true,
      pages: savedPages,
      message: `${savedPages.length} kontoer oppdatert.`,
    });
  } catch (err) {
    console.error("[Fetch Pages] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ukjent feil" },
      { status: 500 }
    );
  }
}
