import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { buildRedirectUri } from "@/lib/oauth/providers";
import { createState } from "@/lib/oauth/state";
import {
  OPENART_AUTHORIZE_URL,
  OPENART_REGISTRATION_URL,
  OPENART_SCOPE,
  getOpenArtConnectionRow,
  saveOpenArtConnection,
} from "@/services/integrations/openart-client";

/**
 * GET /api/oauth/openart?return_to=<path>
 *
 * Starts the OpenArt connect flow. OpenArt has no developer console where
 * you create an app manually — clients are created via RFC 7591 dynamic
 * registration, so the first run registers a public client (PKCE, no
 * secret) and stores its client_id in `openart_connection`. If the app's
 * origin changes (new domain), we re-register automatically.
 *
 * The connection is workspace-wide (one OpenArt account for the whole app),
 * unlike the per-brand social OAuth flows.
 */
export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get("return_to") || "/image-studio";
  const redirectUri = buildRedirectUri("openart", req.nextUrl.origin);

  // ─── Ensure a registered OAuth client for this redirect URI ─────────
  let clientId: string;
  try {
    const existing = await getOpenArtConnectionRow();
    if (existing?.oauth_client_id && existing.redirect_uri === redirectUri) {
      clientId = existing.oauth_client_id;
    } else {
      const regRes = await fetch(OPENART_REGISTRATION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "RealtyFlow Pro",
          redirect_uris: [redirectUri],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
          scope: OPENART_SCOPE,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!regRes.ok) {
        const text = await regRes.text().catch(() => "");
        throw new Error(`Client registration failed (${regRes.status}): ${text.slice(0, 300)}`);
      }
      const reg = (await regRes.json()) as { client_id?: string };
      if (!reg.client_id) throw new Error("Client registration returned no client_id");
      clientId = reg.client_id;
      await saveOpenArtConnection({ oauth_client_id: clientId, redirect_uri: redirectUri });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OpenArt client registration failed" },
      { status: 500 },
    );
  }

  // ─── PKCE + CSRF state ───────────────────────────────────────────────
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  let stateNonce: string;
  try {
    stateNonce = await createState({
      brandId: "system",
      platform: "openart",
      returnTo,
      metadata: { codeVerifier, clientId },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to start OAuth flow",
        hint: "Er migrasjonen 20260713180000_openart_integration.sql kjørt i Supabase?",
      },
      { status: 500 },
    );
  }

  const authUrl = new URL(OPENART_AUTHORIZE_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", OPENART_SCOPE);
  authUrl.searchParams.set("state", stateNonce);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(authUrl.toString());
}
