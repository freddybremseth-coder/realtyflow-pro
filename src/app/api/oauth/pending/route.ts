import { NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /api/oauth/pending?state=<nonce>
 *
 * Read-only lookup used by the picker page (/oauth/select). Returns the
 * scrubbed candidate list for the in-flight pick.
 *
 * Importantly, this endpoint:
 *   - Does NOT consume the state nonce (consumption happens in /finalize).
 *   - Strips encrypted token envelopes before returning. The picker UI only
 *     needs to know the brand, the platform, and the human-readable label
 *     for each candidate. Tokens stay server-side.
 */
export async function GET(req: NextRequest) {
  const stateNonce = req.nextUrl.searchParams.get("state");
  if (!stateNonce || !/^[0-9a-f]{64}$/.test(stateNonce)) {
    return NextResponse.json({ error: "Invalid state nonce" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("oauth_states")
    .select("state_nonce, brand_id, platform, return_to, metadata, expires_at, consumed_at")
    .eq("state_nonce", stateNonce)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Unknown state" }, { status: 404 });
  }
  if (data.consumed_at) {
    return NextResponse.json({ error: "OAuth flow already completed" }, { status: 410 });
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "OAuth flow expired" }, { status: 410 });
  }

  const meta = (data.metadata as Record<string, unknown>) ?? {};
  const pendingPick = typeof meta.pending_pick === "string" ? meta.pending_pick : null;
  if (!pendingPick) {
    return NextResponse.json({ error: "Not a pending pick" }, { status: 400 });
  }

  // Strip encrypted token envelopes before returning to the client. The UI
  // never needs to see them; they stay in oauth_states.metadata until the
  // user POSTs to /finalize.
  let candidates: Array<Record<string, unknown>> = [];
  if (Array.isArray(meta.candidates)) {
    candidates = (meta.candidates as Array<Record<string, unknown>>).map((c) => {
      const clone = { ...c };
      delete clone.access_token_env;
      delete clone.refresh_token_env;
      delete clone.page_token_env;
      return clone;
    });
  }

  return NextResponse.json({
    state_nonce: data.state_nonce,
    brand_id: data.brand_id,
    platform: data.platform,
    return_to: data.return_to,
    pending_pick: pendingPick,
    candidates,
    non_postable: Array.isArray(meta.non_postable) ? meta.non_postable : [],
    expires_at: data.expires_at,
  });
}
