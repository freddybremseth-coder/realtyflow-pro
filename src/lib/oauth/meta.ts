/**
 * Meta (Facebook + Instagram) OAuth helpers.
 *
 * Notable differences vs. Google:
 *   - Tokens come back short-lived; we exchange for a long-lived (60-day)
 *     user token and then per-Page tokens that are effectively permanent.
 *   - There's no separate "Instagram OAuth" — IG Business accounts are
 *     reached through the Facebook Page they're linked to. Posting to IG
 *     uses the FB Page token. This is why the page picker in Phase 3 is
 *     the structural fix: one Page binding → one IG binding, instead of
 *     one user authorization auto-binding all 12 of Freddy's Pages.
 *   - Granular Permissions: each Page can have its own subset of granted
 *     scopes. We debug_token EACH page token and skip Pages missing the
 *     required scopes — same defensive logic the old callback already had,
 *     but now applied at finalize time, not at consent time.
 */

import { saveTokens, upsertChannel } from "./channels";
import { createServerClient } from "@/lib/supabase/server";

const GRAPH = "https://graph.facebook.com/v19.0";

export interface FacebookPageInfo {
  id: string;
  name: string;
  category?: string;
  tasks?: string[];
  /** Page access token — only populated server-side; do NOT log this. */
  accessToken: string;
  /** True if the page-token's scopes include posting permissions. */
  canPost: boolean;
  /** Linked IG Business account, if any. Pulled by `attachInstagramInfo`. */
  instagram?: {
    id: string;
    username?: string;
  };
}

export interface FacebookTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/**
 * Exchange the OAuth `code` for a short-lived user access token, then
 * upgrade to a long-lived (60-day) user token. Returns the long-lived one.
 */
export async function exchangeCodeForUserToken(input: {
  code: string;
  redirectUri: string;
  appId: string;
  appSecret: string;
}): Promise<string> {
  const shortUrl = new URL(`${GRAPH}/oauth/access_token`);
  shortUrl.searchParams.set("client_id", input.appId);
  shortUrl.searchParams.set("client_secret", input.appSecret);
  shortUrl.searchParams.set("redirect_uri", input.redirectUri);
  shortUrl.searchParams.set("code", input.code);

  const shortRes = await fetch(shortUrl.toString());
  const shortData = (await shortRes.json()) as Partial<FacebookTokenResponse> & {
    error?: { message: string };
  };
  if (!shortRes.ok || shortData.error || !shortData.access_token) {
    throw new Error(
      `Meta short-lived token exchange failed: ${shortData.error?.message || shortRes.status}`,
    );
  }

  const longUrl = new URL(`${GRAPH}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", input.appId);
  longUrl.searchParams.set("client_secret", input.appSecret);
  longUrl.searchParams.set("fb_exchange_token", shortData.access_token);

  const longRes = await fetch(longUrl.toString());
  const longData = (await longRes.json()) as Partial<FacebookTokenResponse> & {
    error?: { message: string };
  };
  if (!longRes.ok || longData.error || !longData.access_token) {
    // If the long-lived exchange fails, fall back to the short token
    // rather than failing the whole flow — the user can still connect
    // pages, they'll just need to reconnect in ~1 hour.
    console.warn(
      `[Meta] Long-lived token exchange failed (${longData.error?.message || longRes.status}), using short-lived.`,
    );
    return shortData.access_token;
  }
  return longData.access_token;
}

/**
 * Verify the user-token's granted scopes via debug_token. Returns the list
 * of REQUIRED scopes the token is missing — empty array means OK.
 *
 * Mirrors the check the legacy callback had inline. We keep it because FB's
 * "Edit access" consent screen lets users uncheck individual scopes silently
 * and we need to surface that before saving tokens we'll never be able to
 * post with.
 */
export async function verifyUserScopes(input: {
  userToken: string;
  appId: string;
  appSecret: string;
  required: string[];
}): Promise<{ granted: string[]; missing: string[] }> {
  const res = await fetch(
    `${GRAPH}/debug_token?input_token=${encodeURIComponent(input.userToken)}` +
      `&access_token=${encodeURIComponent(`${input.appId}|${input.appSecret}`)}`,
  );
  const body = (await res.json()) as { data?: { scopes?: string[] } };
  const granted = Array.isArray(body.data?.scopes) ? body.data.scopes : [];
  const missing = input.required.filter((s) => !granted.includes(s));
  return { granted, missing };
}

/**
 * List the Pages the user admins, with each Page's access token.
 *
 * `tasks` filtering: a Page is only listed for posting if the user's
 * relationship to it includes CREATE_CONTENT. Without it, posts return the
 * famous "permission(s) must be granted before impersonating a user's page"
 * error. We surface non-postable Pages too (in `nonPostable`) so the picker
 * UI can explain to the user why some of their Pages aren't selectable.
 */
export async function listFacebookPages(input: {
  userToken: string;
  appId: string;
  appSecret: string;
}): Promise<{ postable: FacebookPageInfo[]; nonPostable: FacebookPageInfo[] }> {
  const url = new URL(`${GRAPH}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,category,tasks");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", input.userToken);

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    data?: Array<{ id: string; name: string; access_token: string; category?: string; tasks?: string[] }>;
    error?: { message: string };
  };
  if (!res.ok || data.error) {
    throw new Error(`me/accounts failed: ${data.error?.message || res.status}`);
  }
  const all = data.data ?? [];

  // CREATE_CONTENT in tasks is the FB-side gate for "user can post to this Page".
  const tasksOk = all.filter((p) => Array.isArray(p.tasks) && p.tasks.includes("CREATE_CONTENT"));
  const tasksMissing = all.filter(
    (p) => !Array.isArray(p.tasks) || !p.tasks.includes("CREATE_CONTENT"),
  );

  // Per-Page scope check: each Page token has its own scope set under FB's
  // Granular Permissions model. Pages missing the required posting scopes
  // are split into nonPostable.
  const REQUIRED_PAGE_SCOPES = ["pages_manage_posts", "pages_read_engagement"];
  const checks = await Promise.all(
    tasksOk.map(async (p) => {
      try {
        const dbgRes = await fetch(
          `${GRAPH}/debug_token?input_token=${encodeURIComponent(p.access_token)}` +
            `&access_token=${encodeURIComponent(`${input.appId}|${input.appSecret}`)}`,
        );
        const dbg = (await dbgRes.json()) as { data?: { scopes?: string[] } };
        const scopes = dbg.data?.scopes ?? [];
        const missing = REQUIRED_PAGE_SCOPES.filter((s) => !scopes.includes(s));
        return { page: p, ok: missing.length === 0 };
      } catch {
        // On introspection failure, optimistically include the page —
        // publisher will surface any real issue at post time.
        return { page: p, ok: true };
      }
    }),
  );

  const postable: FacebookPageInfo[] = checks
    .filter((c) => c.ok)
    .map((c) => ({
      id: c.page.id,
      name: c.page.name,
      category: c.page.category,
      tasks: c.page.tasks,
      accessToken: c.page.access_token,
      canPost: true,
    }));

  const nonPostable: FacebookPageInfo[] = [
    ...checks
      .filter((c) => !c.ok)
      .map((c) => ({
        id: c.page.id,
        name: c.page.name,
        category: c.page.category,
        tasks: c.page.tasks,
        accessToken: "", // never leak page tokens we can't use
        canPost: false,
      })),
    ...tasksMissing.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      tasks: p.tasks,
      accessToken: "",
      canPost: false,
    })),
  ];

  return { postable, nonPostable };
}

/**
 * For each Page, look up the linked Instagram Business account (if any) and
 * its username. Mutates the list in place to add the `instagram` field.
 */
export async function attachInstagramInfo(pages: FacebookPageInfo[]): Promise<void> {
  await Promise.all(
    pages.map(async (page) => {
      if (!page.accessToken) return;
      try {
        const igRes = await fetch(
          `${GRAPH}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.accessToken)}`,
        );
        const igData = (await igRes.json()) as {
          instagram_business_account?: { id: string };
        };
        const igId = igData.instagram_business_account?.id;
        if (!igId) return;

        const igInfoRes = await fetch(
          `${GRAPH}/${igId}?fields=username&access_token=${encodeURIComponent(page.accessToken)}`,
        );
        const igInfo = (await igInfoRes.json()) as { username?: string };
        page.instagram = { id: igId, username: igInfo.username };
      } catch (err) {
        console.warn(`[Meta] IG lookup for page ${page.id} failed:`, err);
      }
    }),
  );
}

/**
 * Bind ONE Facebook Page (and, if linked, ONE Instagram Business account)
 * to ONE brand. This is the structural fix for the cross-brand contamination:
 * we never auto-create rows for every Page the user admins.
 *
 * Returns the social_channel rows that were created.
 */
export async function finalizeFacebookPage(input: {
  brandId: string;
  page: FacebookPageInfo;
  /** Scopes granted on the user-token (same set applies to Page tokens). */
  scopes: string[];
}): Promise<{
  facebookChannelId: string;
  instagramChannelId: string | null;
}> {
  if (!input.page.canPost || !input.page.accessToken) {
    throw new Error(
      `Cannot finalize Page ${input.page.id} (${input.page.name}): missing posting permissions.`,
    );
  }

  const fbChannel = await upsertChannel({
    brandId: input.brandId,
    platform: "facebook",
    externalId: input.page.id,
    displayName: input.page.name,
    metadata: {
      category: input.page.category,
      tasks: input.page.tasks,
      linked_ig_id: input.page.instagram?.id,
    },
  });

  // Page tokens don't expire and don't have a refresh token — only
  // an access_token. Saving NULL refresh is the right shape.
  await saveTokens({
    socialChannelId: fbChannel.id,
    accessToken: input.page.accessToken,
    refreshToken: null,
    expiresAt: null,
    scopes: input.scopes,
  });

  let instagramChannelId: string | null = null;
  if (input.page.instagram?.id) {
    const igChannel = await upsertChannel({
      brandId: input.brandId,
      platform: "instagram",
      externalId: input.page.instagram.id,
      displayName: input.page.instagram.username || `IG-${input.page.name}`,
      metadata: {
        linked_page_id: input.page.id,
        username: input.page.instagram.username,
      },
    });
    // IG Business publishing uses the linked Page's token.
    await saveTokens({
      socialChannelId: igChannel.id,
      accessToken: input.page.accessToken,
      refreshToken: null,
      expiresAt: null,
      scopes: input.scopes,
    });
    instagramChannelId = igChannel.id;
  }

  return { facebookChannelId: fbChannel.id, instagramChannelId };
}

/**
 * Refresh stored tokens for ANY existing social_channels row whose
 * `external_id` matches one of the freshly-listed Pages — across every
 * brand, not just the one the user is currently connecting.
 *
 * Why: when Freddy authorises the app a second time (for brand B), Meta
 * silently rotates the PAGE tokens for every Page he admins, including the
 * one already saved for brand A. The old token immediately starts failing
 * with "permission(s) must be granted before impersonating a user's page".
 *
 * Calling this on every successful FB OAuth keeps every brand's stored
 * token in sync with whatever the most recent /me/accounts roundtrip
 * returned, so no brand ever publishes with a stale token.
 *
 * Both the Facebook channel row and any Instagram channel row that's
 * `linked_page_id`-pointed at it get updated, since IG publishing reuses
 * the FB Page token.
 */
export async function refreshKnownChannelTokens(
  pages: FacebookPageInfo[],
  scopes: string[],
): Promise<{ facebookRowsUpdated: number; instagramRowsUpdated: number }> {
  const supabase = createServerClient();
  let fbRows = 0;
  let igRows = 0;

  for (const page of pages) {
    if (!page.canPost || !page.accessToken) continue;

    // Find all FB social_channels rows for this Page (across brands). We
    // could `upsert` here but we want to leave non-existent rows alone —
    // we should only refresh tokens for channels someone explicitly bound.
    const { data: fbChannels } = await supabase
      .from("social_channels")
      .select("id, brand_id")
      .eq("platform", "facebook")
      .eq("external_id", page.id);

    for (const ch of fbChannels ?? []) {
      try {
        await saveTokens({
          socialChannelId: ch.id as string,
          accessToken: page.accessToken,
          refreshToken: null,
          expiresAt: null,
          scopes,
        });
        fbRows++;
        console.log(
          `[Meta] refreshed FB token for channel ${ch.id} (brand=${ch.brand_id}, page=${page.id})`,
        );
      } catch (err) {
        console.warn(
          `[Meta] failed to refresh FB token for channel ${ch.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Cascade to any IG channel linked to this Page. IG channels store
    // `linked_page_id` in their metadata (set by finalizeFacebookPage),
    // and external_id is the IG user id, not the page id, so we filter
    // by metadata.
    if (page.instagram?.id) {
      const { data: igChannels } = await supabase
        .from("social_channels")
        .select("id, brand_id")
        .eq("platform", "instagram")
        .eq("external_id", page.instagram.id);

      for (const ch of igChannels ?? []) {
        try {
          await saveTokens({
            socialChannelId: ch.id as string,
            accessToken: page.accessToken,
            refreshToken: null,
            expiresAt: null,
            scopes,
          });
          igRows++;
          console.log(
            `[Meta] refreshed IG token for channel ${ch.id} (brand=${ch.brand_id}, ig=${page.instagram.id})`,
          );
        } catch (err) {
          console.warn(
            `[Meta] failed to refresh IG token for channel ${ch.id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
  }

  return { facebookRowsUpdated: fbRows, instagramRowsUpdated: igRows };
}
