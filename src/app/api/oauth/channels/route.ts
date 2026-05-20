import { NextRequest, NextResponse } from "next/server";

import { brandIdCandidates, normalizeBrandId } from "@/lib/realty/brand-rules";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /api/oauth/channels?brand_id=<id>&platform=<platform>
 *
 * List active connected channels for the Settings UI. Returns scrubbed rows —
 * no token material, only what the UI needs to render the "Connected" cards
 * (display_name, scopes, when it was last rotated).
 *
 * Both `brand_id` and `platform` are optional; pass either to filter.
 *
 * We do this as two queries (channels, then tokens) instead of a join because
 * the Supabase JS client only generates relation hints when DB types are
 * generated, and this repo doesn't currently run `supabase gen types`. Two
 * round-trips keeps the route honest about its inputs.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const rawBrandId = (params.get("brand_id") || "").trim();
  const brandId = normalizeBrandId(rawBrandId);
  const platform = params.get("platform");

  const supabase = createServerClient();

  let chanQuery = supabase
    .from("social_channels")
    .select("id, brand_id, platform, external_id, display_name, metadata, is_active, created_at, updated_at")
    .eq("is_active", true)
    .order("brand_id")
    .order("platform")
    .order("display_name");

  if (brandId) {
    // Backward-compatible alias read: if old rows were persisted with an
    // alias (e.g. `zenecohomes`) before canonicalization was enforced, still
    // show them in Settings so they can be reconnected/migrated.
    const ids = brandIdCandidates(rawBrandId);
    if (ids.length === 1) chanQuery = chanQuery.eq("brand_id", ids[0]);
    else chanQuery = chanQuery.in("brand_id", ids);
  }
  if (platform) chanQuery = chanQuery.eq("platform", platform);

  const { data: channels, error: chanErr } = await chanQuery;
  if (chanErr) {
    return NextResponse.json({ error: chanErr.message }, { status: 500 });
  }

  const channelRows = channels ?? [];
  if (channelRows.length === 0) {
    return NextResponse.json({ channels: [] });
  }

  // Pull tokens for the selected channels in one shot. We never return
  // ciphertext / IV / tag — only the public-facing metadata.
  const ids = channelRows.map((c) => c.id);
  const { data: tokens, error: tokErr } = await supabase
    .from("oauth_tokens")
    .select("social_channel_id, scopes, expires_at, rotated_at")
    .in("social_channel_id", ids);
  if (tokErr) {
    return NextResponse.json({ error: tokErr.message }, { status: 500 });
  }

  const tokenByChannel = new Map<string, { scopes: string[]; expires_at: string | null; rotated_at: string }>();
  for (const t of tokens ?? []) {
    tokenByChannel.set(t.social_channel_id as string, {
      scopes: (t.scopes as string[]) ?? [],
      expires_at: (t.expires_at as string | null) ?? null,
      rotated_at: t.rotated_at as string,
    });
  }

  const enriched = channelRows.map((c) => {
    const t = tokenByChannel.get(c.id as string);
    return {
      id: c.id,
      brand_id: c.brand_id,
      platform: c.platform,
      external_id: c.external_id,
      display_name: c.display_name,
      metadata: c.metadata,
      is_active: c.is_active,
      created_at: c.created_at,
      updated_at: c.updated_at,
      scopes: t?.scopes ?? [],
      token_expires_at: t?.expires_at ?? null,
      token_rotated_at: t?.rotated_at ?? null,
      has_token: !!t,
    };
  });

  return NextResponse.json({ channels: enriched });
}
