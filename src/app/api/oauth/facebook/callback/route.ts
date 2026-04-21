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

  let brand = "zen-eco";
  try {
    const state = JSON.parse(stateStr || "{}");
    brand = state.brand || "zen-eco";
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
      console.error("[OAuth Facebook] Token exchange error:", tokenData.error);
      throw new Error(tokenData.error.message);
    }

    const shortLivedToken = tokenData.access_token;
    console.log("[OAuth Facebook] Got short-lived token, exchanging for long-lived...");

    // 2. Exchange for long-lived token (60 days)
    const longUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", appId);
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("fb_exchange_token", shortLivedToken);

    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();
    const longLivedToken = longData.access_token || shortLivedToken;
    console.log("[OAuth Facebook] Long-lived token obtained:", !!longLivedToken);

    // 2.5 Scope preflight — verify Facebook actually granted the scopes we
    // requested. If the user clicked "Edit access" and unchecked something on
    // the consent screen, we get a token that LOOKS fine but silently can't
    // post. Bail out now with a clear Norwegian error instead of storing a
    // half-broken token the publisher will fail on later.
    const REQUIRED_USER_SCOPES = [
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
    ];
    try {
      const debugRes = await fetch(
        `https://graph.facebook.com/v19.0/debug_token?input_token=${longLivedToken}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
      );
      const debugData = await debugRes.json();
      const grantedScopes: string[] = Array.isArray(debugData?.data?.scopes)
        ? debugData.data.scopes
        : [];
      const missingScopes = REQUIRED_USER_SCOPES.filter((s) => !grantedScopes.includes(s));
      console.log(
        "[OAuth Facebook] Granted scopes:",
        grantedScopes.join(", "),
        "| missing:",
        missingScopes.join(", ") || "(none)",
      );
      if (missingScopes.length > 0) {
        return NextResponse.redirect(
          `${req.nextUrl.origin}/settings?oauth=error&platform=facebook&msg=${encodeURIComponent(
            `Mangler Facebook-tillatelser: ${missingScopes.join(", ")}. Kjør tilkoblingen på nytt og IKKE klikk "Rediger tilgang" — aksepter ALLE tillatelsene på samtykkeskjermen.`,
          )}`,
        );
      }
    } catch (scopeErr) {
      console.error("[OAuth Facebook] debug_token check failed (non-fatal):", scopeErr);
      // Don't block on debug_token errors — continue and let /me/accounts be
      // the final gate. Scope issues will still surface via publisher errors.
    }

    // 3. Get user's Pages (with explicit fields to maximize response)
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,category,tasks&limit=100&access_token=${longLivedToken}`
    );
    const pagesData = await pagesRes.json();
    const allPages = pagesData.data || [];
    console.log("[OAuth Facebook] /me/accounts full response:", JSON.stringify(pagesData).substring(0, 1000));
    console.log(
      "[OAuth Facebook] Pages found:",
      allPages.length,
      allPages.map((p: { name: string; id: string; tasks?: string[] }) =>
        `${p.name} (${p.id}) [${(p.tasks || []).join(",")}]`),
    );

    // Filter to pages the user can actually post to. Without CREATE_CONTENT in
    // tasks, posting to /{page_id}/photos or /{page_id}/feed returns the same
    // "permission(s) must be granted before impersonating a user's page" error
    // we're trying to prevent.
    const tasksOk = allPages.filter(
      (p: { tasks?: string[] }) => Array.isArray(p.tasks) && p.tasks.includes("CREATE_CONTENT"),
    );

    // Per-page scope verification. With FB Granular Permissions, each Page
    // token has its OWN scope set — the user might have granted full scopes
    // for Page A but only a subset for Page B in the same flow. debug_token
    // each page token and drop the ones missing pages_manage_posts /
    // pages_read_engagement before we save them.
    const REQUIRED_PAGE_SCOPES = ["pages_manage_posts", "pages_read_engagement"];
    const pageChecks = await Promise.all(
      tasksOk.map(async (p: { id: string; name: string; access_token: string }) => {
        try {
          const dbgRes = await fetch(
            `https://graph.facebook.com/v19.0/debug_token?input_token=${encodeURIComponent(p.access_token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
          );
          const dbg = await dbgRes.json();
          const scopes: string[] = dbg?.data?.scopes || [];
          const missing = REQUIRED_PAGE_SCOPES.filter((s) => !scopes.includes(s));
          return { page: p, scopes, missing, ok: missing.length === 0 };
        } catch {
          // On introspection failure, let it through — publisher will surface
          // any real issue at post time.
          return { page: p, scopes: [] as string[], missing: [] as string[], ok: true };
        }
      }),
    );

    const pages = pageChecks.filter((c) => c.ok).map((c) => c.page);
    const badPages = pageChecks.filter((c) => !c.ok);
    const skippedPages = [
      ...allPages.filter(
        (p: { tasks?: string[] }) => !Array.isArray(p.tasks) || !p.tasks.includes("CREATE_CONTENT"),
      ),
      ...badPages.map((c) => c.page),
    ];

    if (skippedPages.length > 0) {
      console.warn(
        "[OAuth Facebook] Skipping pages:",
        skippedPages.map((p: { name: string; id: string }) => `${p.name} (${p.id})`),
        "| missing-scope details:",
        badPages.map((c) => `${c.page.name}: missing ${c.missing.join(",")}`),
      );
    }

    if (pages.length === 0 && allPages.length > 0) {
      const details = badPages
        .map((c) => `${c.page.name} mangler: ${c.missing.join(", ")}`)
        .join(" | ");
      return NextResponse.redirect(
        `${req.nextUrl.origin}/settings?oauth=error&platform=facebook&msg=${encodeURIComponent(
          `Ingen Facebook-sider med tilstrekkelige tillatelser. ${details || ""} Fjern appen fra https://www.facebook.com/settings?tab=business_tools og prøv igjen.`,
        )}`,
      );
    }

    // If no pages found via /me/accounts, do NOT fall back to storing the user
    // token — posting to /{user_id}/photos with a user token yields
    // "...permission(s) must be granted before impersonating a user's page".
    // Instead, surface a clear error so the user knows to re-auth with the
    // right scopes / admin role.
    if (pages.length === 0) {
      console.warn("[OAuth Facebook] /me/accounts returned no pages — aborting without fallback");
      return NextResponse.redirect(
        `${req.nextUrl.origin}/settings?oauth=error&platform=facebook&msg=${encodeURIComponent(
          "Ingen Facebook-sider funnet. Sørg for at du er admin for minst én side og at du godtok tillatelsene pages_show_list + pages_manage_posts + pages_read_engagement.",
        )}`,
      );
    }

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
