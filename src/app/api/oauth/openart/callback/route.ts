import { NextRequest, NextResponse } from "next/server";

import { buildRedirectUri } from "@/lib/oauth/providers";
import { consumeState } from "@/lib/oauth/state";
import {
  OPENART_TOKEN_URL,
  getOpenArtAccount,
  saveOpenArtConnection,
  saveOpenArtTokens,
} from "@/services/integrations/openart-client";

/**
 * GET /api/oauth/openart/callback?code=...&state=...
 *
 * Exchanges the authorization code (PKCE, public client — no secret) and
 * stores encrypted access/refresh tokens in `openart_connection`. Then
 * best-effort fetches the account e-mail via the MCP server so the UI can
 * show which OpenArt account is connected.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const stateNonce = params.get("state");
  const oauthError = params.get("error");

  const fail = (message: string, returnTo = "/image-studio") => {
    const url = new URL(returnTo, req.nextUrl.origin);
    url.searchParams.set("openart", "error");
    url.searchParams.set("openart_message", message.slice(0, 200));
    return NextResponse.redirect(url.toString());
  };

  if (oauthError) return fail(`OpenArt avviste forespørselen: ${oauthError}`);
  if (!code || !stateNonce) return fail("Mangler code/state i OpenArt-callback.");

  const state = await consumeState(stateNonce);
  if (!state || state.platform !== "openart") {
    return fail("Ugyldig eller utløpt state. Prøv å koble til på nytt.");
  }
  const returnTo = state.return_to || "/image-studio";
  const codeVerifier = String(state.metadata?.codeVerifier || "");
  const clientId = String(state.metadata?.clientId || "");
  if (!codeVerifier || !clientId) return fail("Manglende PKCE-data i state.", returnTo);

  try {
    const tokenRes = await fetch(OPENART_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: buildRedirectUri("openart", req.nextUrl.origin),
        client_id: clientId,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      console.error("[OpenArt OAuth] Token exchange failed:", tokenRes.status, text.slice(0, 300));
      return fail(`Token-utveksling feilet (HTTP ${tokenRes.status}).`, returnTo);
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!tokens.access_token) return fail("OpenArt returnerte ingen access_token.", returnTo);

    await saveOpenArtTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiresInSeconds: tokens.expires_in || 3600,
    });

    // Best effort — a failure here must not break the connect flow.
    try {
      const account = await getOpenArtAccount();
      if (account.email) await saveOpenArtConnection({ account_email: account.email });
    } catch (err) {
      console.warn("[OpenArt OAuth] Could not fetch account info:", err);
    }

    const url = new URL(returnTo, req.nextUrl.origin);
    url.searchParams.set("openart", "connected");
    return NextResponse.redirect(url.toString());
  } catch (err) {
    console.error("[OpenArt OAuth] Callback error:", err);
    return fail(err instanceof Error ? err.message : "Ukjent feil i OpenArt-callback.", returnTo);
  }
}
