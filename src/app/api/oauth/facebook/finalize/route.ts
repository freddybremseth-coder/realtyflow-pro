import { NextRequest, NextResponse } from "next/server";

import { decrypt } from "@/lib/oauth/crypto";
import { deserializeEnvelope } from "@/lib/oauth/envelope";
import { finalizeFacebookPage } from "@/lib/oauth/meta";
import { consumeState } from "@/lib/oauth/state";

/**
 * POST /api/oauth/facebook/finalize
 * Body: { state: string; external_id: string }
 *
 * Final step of the Facebook OAuth flow when the user admins multiple Pages.
 * Called by /oauth/select after they pick which Page to bind to the brand.
 *
 *   1) Atomically consume the state nonce.
 *   2) Verify the chosen `external_id` is in the candidate list. The
 *      candidates list was filled in by the callback after a successful
 *      /me/accounts call, so this defends against state-substitution.
 *   3) Decrypt the chosen Page's access token from the candidate's
 *      `page_token_env`.
 *   4) finalizeFacebookPage upserts the FB social_channel + (if linked)
 *      the IG social_channel and persists encrypted tokens for both.
 *      No other Pages from the candidate list are touched.
 */
interface PageCandidate {
  id: string;
  name: string;
  category?: string;
  instagram?: { id: string; username?: string };
  page_token_env: { c: string; i: string; t: string; k: string };
}

export async function POST(req: NextRequest) {
  let body: { state?: unknown; external_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const stateNonce = typeof body.state === "string" ? body.state : "";
  const externalId = typeof body.external_id === "string" ? body.external_id : "";
  if (!stateNonce || !externalId) {
    return NextResponse.json({ error: "Missing state or external_id" }, { status: 400 });
  }

  const state = await consumeState(stateNonce);
  if (!state) {
    return NextResponse.json(
      { error: "OAuth flow expired or already completed. Re-connect from Settings." },
      { status: 400 },
    );
  }
  if (state.metadata?.pending_pick !== "facebook_page") {
    return NextResponse.json(
      { error: "State row is not a pending Facebook page pick." },
      { status: 400 },
    );
  }

  const candidates = (state.metadata.candidates as PageCandidate[] | undefined) ?? [];
  const picked = candidates.find((c) => c.id === externalId);
  if (!picked) {
    return NextResponse.json(
      { error: `Page ${externalId} is not in the authorized list.` },
      { status: 400 },
    );
  }

  let pageToken: string;
  try {
    pageToken = decrypt(deserializeEnvelope(picked.page_token_env));
  } catch (err) {
    console.error("[FB OAuth finalize] decrypt failed:", err);
    return NextResponse.json({ error: "Token decryption failed" }, { status: 500 });
  }

  const scopes = Array.isArray(state.metadata.scopes)
    ? (state.metadata.scopes as string[])
    : [];

  try {
    const result = await finalizeFacebookPage({
      brandId: state.brand_id,
      page: {
        id: picked.id,
        name: picked.name,
        category: picked.category,
        accessToken: pageToken,
        canPost: true,
        instagram: picked.instagram,
      },
      scopes,
    });

    return NextResponse.json({
      success: true,
      return_to: state.return_to,
      brand_id: state.brand_id,
      facebook_channel_id: result.facebookChannelId,
      instagram_channel_id: result.instagramChannelId,
      page_name: picked.name,
      ig_username: picked.instagram?.username ?? null,
    });
  } catch (err) {
    console.error("[FB OAuth finalize] finalizeFacebookPage failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Finalize failed" },
      { status: 500 },
    );
  }
}
