import { NextRequest, NextResponse } from "next/server";

import { decrypt } from "@/lib/oauth/crypto";
import { deserializeEnvelope } from "@/lib/oauth/envelope";
import { finalizeGoogleChannel, type YouTubeChannelInfo } from "@/lib/oauth/google";
import { consumeState } from "@/lib/oauth/state";

/**
 * POST /api/oauth/google/finalize
 * Body: { state: string; external_id: string }
 *
 * Final step of the multi-channel Google OAuth flow. Called by /oauth/select
 * after the user picks which YouTube channel to bind to the brand.
 *
 *   1) Atomically consume the state nonce (CSRF + replay protection).
 *   2) Verify the chosen `external_id` is one of the candidates the
 *      callback enumerated. The candidates list was filled in by the
 *      callback after a successful `youtube.channels.list({mine: true})`,
 *      so this defends against an attacker submitting an arbitrary channel
 *      id along with a stolen state.
 *   3) Decrypt the access + refresh token envelopes.
 *   4) Hand off to finalizeGoogleChannel which upserts social_channels +
 *      oauth_tokens and (legacy) mirrors the refresh token to brand_settings.
 */
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
  if (state.metadata?.pending_pick !== "google_channel") {
    return NextResponse.json(
      { error: "State row is not a pending Google channel pick." },
      { status: 400 },
    );
  }

  const candidates = (state.metadata.candidates as YouTubeChannelInfo[] | undefined) || [];
  const picked = candidates.find((c) => c.id === externalId);
  if (!picked) {
    return NextResponse.json(
      { error: `Channel ${externalId} is not in the authorized list.` },
      { status: 400 },
    );
  }

  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken = decrypt(deserializeEnvelope(state.metadata.access_token_env));
    refreshToken = decrypt(deserializeEnvelope(state.metadata.refresh_token_env));
  } catch (err) {
    console.error("[Google OAuth finalize] Failed to decrypt token envelopes:", err);
    return NextResponse.json({ error: "Token decryption failed" }, { status: 500 });
  }

  const expiresAtIso = state.metadata.access_expires_at;
  const scopes = Array.isArray(state.metadata.scopes)
    ? (state.metadata.scopes as string[])
    : [];

  try {
    await finalizeGoogleChannel({
      brandId: state.brand_id,
      platform: state.platform === "google_drive" ? "google_drive" : "youtube",
      channel: picked,
      accessToken,
      refreshToken,
      expiresAt: typeof expiresAtIso === "string" ? new Date(expiresAtIso) : null,
      scopes,
    });
  } catch (err) {
    console.error("[Google OAuth finalize] finalizeGoogleChannel failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Finalize failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    return_to: state.return_to,
    brand_id: state.brand_id,
    external_id: picked.id,
    display_name: picked.title,
  });
}
