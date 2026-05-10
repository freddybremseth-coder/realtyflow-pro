import { NextRequest, NextResponse } from "next/server";

import { getChannelById, getDecryptedTokens } from "@/lib/oauth/channels";

/**
 * POST /api/oauth/test
 * Body: { social_channel_id: string }
 *
 * Verifies a stored token still works against the provider's API. Returns
 *   { ok: true, info: <provider-specific> }   on success
 *   { ok: false, error: <message> }           on failure
 *
 * The Settings UI uses this to show a green/red dot per channel. We call the
 * provider's lightest "who am I" endpoint:
 *   - Google/YouTube: GET youtube/v3/channels?mine=true
 *   - Google Drive:   GET userinfo
 *   - Facebook:       GET /{page_id}?fields=id,name
 *   - Instagram:      GET /{ig_user_id}?fields=id,username
 *   - LinkedIn:       GET /v2/userinfo  (only after Phase 3.5 LI refactor)
 */

export async function POST(req: NextRequest) {
  let body: { social_channel_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }

  const channelId = typeof body.social_channel_id === "string" ? body.social_channel_id : "";
  if (!channelId) {
    return NextResponse.json({ ok: false, error: "Missing social_channel_id" }, { status: 400 });
  }

  const channel = await getChannelById(channelId);
  if (!channel) {
    return NextResponse.json({ ok: false, error: "Unknown channel" }, { status: 404 });
  }
  const tokens = await getDecryptedTokens(channelId);
  if (!tokens) {
    return NextResponse.json({ ok: false, error: "No tokens stored for this channel" }, { status: 404 });
  }

  try {
    switch (channel.platform) {
      case "youtube": {
        // Use the access token directly. If it's stale, the actual publisher
        // would refresh via the OAuth client; here we only need a yes/no
        // signal so we accept either success or refresh-required as "needs
        // re-auth".
        const r = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
        );
        const data = await r.json();
        if (!r.ok) return NextResponse.json({ ok: false, error: data.error?.message || `HTTP ${r.status}` });
        return NextResponse.json({
          ok: true,
          info: {
            channel_count: data.items?.length ?? 0,
            primary: data.items?.[0]?.snippet?.title,
          },
        });
      }
      case "google_drive": {
        const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        const data = await r.json();
        if (!r.ok) return NextResponse.json({ ok: false, error: data.error?.message || `HTTP ${r.status}` });
        return NextResponse.json({ ok: true, info: { email: data.email, name: data.name } });
      }
      case "facebook": {
        const r = await fetch(
          `https://graph.facebook.com/v19.0/${channel.external_id}?fields=id,name,category&access_token=${encodeURIComponent(tokens.accessToken)}`,
        );
        const data = await r.json();
        if (!r.ok || data.error) {
          return NextResponse.json({ ok: false, error: data.error?.message || `HTTP ${r.status}` });
        }
        return NextResponse.json({ ok: true, info: { id: data.id, name: data.name, category: data.category } });
      }
      case "instagram": {
        const r = await fetch(
          `https://graph.facebook.com/v19.0/${channel.external_id}?fields=id,username&access_token=${encodeURIComponent(tokens.accessToken)}`,
        );
        const data = await r.json();
        if (!r.ok || data.error) {
          return NextResponse.json({ ok: false, error: data.error?.message || `HTTP ${r.status}` });
        }
        return NextResponse.json({ ok: true, info: { id: data.id, username: data.username } });
      }
      case "linkedin": {
        const r = await fetch("https://api.linkedin.com/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        const data = await r.json();
        if (!r.ok) return NextResponse.json({ ok: false, error: data.message || `HTTP ${r.status}` });
        return NextResponse.json({ ok: true, info: { sub: data.sub, name: data.name } });
      }
      default:
        return NextResponse.json(
          { ok: false, error: `Test not implemented for platform ${channel.platform}` },
          { status: 501 },
        );
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Network error" },
      { status: 500 },
    );
  }
}
