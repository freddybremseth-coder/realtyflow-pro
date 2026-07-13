import { NextResponse } from "next/server";

import {
  disconnectOpenArt,
  getOpenArtAccount,
  getOpenArtConnectionRow,
} from "@/services/integrations/openart-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/openart/status
 *   → { connected, email?, plan?, credits? }
 *
 * Used by the "Bruk OpenArt" toggles to decide between showing the switch
 * and showing a connect button. Credits/plan are fetched live from the MCP
 * server (best effort) so the user sees their balance before generating.
 */
export async function GET() {
  try {
    const row = await getOpenArtConnectionRow();
    const connected = Boolean(row?.access_token_envelope && row?.refresh_token_envelope);
    if (!connected) {
      return NextResponse.json({ connected: false });
    }

    let email = row?.account_email || undefined;
    let plan: string | undefined;
    let credits: number | undefined;
    try {
      const account = await getOpenArtAccount();
      email = account.email || email;
      plan = account.plan;
      credits = account.credits;
    } catch {
      // Token might be mid-refresh or MCP briefly down — still connected.
    }

    return NextResponse.json({ connected: true, email, plan, credits });
  } catch (err) {
    return NextResponse.json(
      { connected: false, error: err instanceof Error ? err.message : "Ukjent feil" },
      { status: 200 },
    );
  }
}

/** DELETE /api/oauth/openart/status — disconnect (clears stored tokens). */
export async function DELETE() {
  try {
    await disconnectOpenArt();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke koble fra" },
      { status: 500 },
    );
  }
}
