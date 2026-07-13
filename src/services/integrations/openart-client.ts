/**
 * OpenArt MCP client.
 *
 * OpenArt (openart.ai) does not expose a public REST API — the supported
 * server-to-server surface is their MCP server at https://mcp.openart.ai/mcp
 * (JSON-RPC 2.0 over streamable HTTP), authenticated with an OAuth 2.0
 * Bearer token. The connect flow lives in /api/oauth/openart; this module
 * owns everything after the user has connected:
 *
 *   - token storage/refresh against the singleton `openart_connection` row
 *   - a minimal MCP client (initialize → tools/call, JSON or SSE responses)
 *   - typed wrappers: generate image, generate video, poll a creation,
 *     account status
 *
 * Generation is asynchronous on OpenArt's side: a generate call returns a
 * `historyId` immediately and the media is ready when the creation status
 * becomes COMPLETED. `waitForOpenArtCreation` polls with a time budget so
 * callers can fit inside serverless limits.
 *
 * Everything here costs OpenArt credits from the connected account, which
 * is why every caller in the app treats OpenArt as an explicit opt-in.
 */

import { createClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/oauth/crypto";
import { deserializeEnvelope, serializeEnvelope, type SerializedEnvelope } from "@/lib/oauth/envelope";

export const OPENART_MCP_URL = "https://mcp.openart.ai/mcp";
export const OPENART_AUTHORIZE_URL = "https://openart.ai/suite/api/auth/oauth/authorize";
export const OPENART_TOKEN_URL = "https://openart.ai/suite/api/auth/oauth/token";
export const OPENART_REGISTRATION_URL = "https://openart.ai/suite/api/auth/oauth/register";
export const OPENART_SCOPE = "full_access";

/** Default models — overridable per request or via env. */
export const OPENART_DEFAULT_IMAGE_MODEL = process.env.OPENART_IMAGE_MODEL || "nano-banana-2";
export const OPENART_DEFAULT_VIDEO_MODEL = process.env.OPENART_VIDEO_MODEL || "pixverseV6";

/** Aspect ratios OpenArt's image models accept (superset of the app's). */
const OPENART_IMAGE_RATIOS = new Set([
  "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16",
]);

export class OpenArtError extends Error {
  constructor(
    message: string,
    /** True when the fix is (re)connecting OpenArt in the app. */
    public readonly connectRequired = false,
  ) {
    super(message);
    this.name = "OpenArtError";
  }
}

// ─── Connection row ─────────────────────────────────────────────────────────

export interface OpenArtConnectionRow {
  id: number;
  oauth_client_id: string | null;
  redirect_uri: string | null;
  access_token_envelope: SerializedEnvelope | null;
  refresh_token_envelope: SerializedEnvelope | null;
  token_expires_at: string | null;
  account_email: string | null;
  connected_at: string | null;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new OpenArtError("Supabase er ikke konfigurert på serveren.");
  return createClient(url, key);
}

export async function getOpenArtConnectionRow(): Promise<OpenArtConnectionRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("openart_connection")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    // Missing table (migration not applied) reads as "not connected".
    console.warn("[OpenArt] Could not read connection:", error.message);
    return null;
  }
  return (data as OpenArtConnectionRow | null) ?? null;
}

export async function saveOpenArtConnection(update: Partial<OpenArtConnectionRow>): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("openart_connection")
    .upsert({ id: 1, ...update, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new OpenArtError(`Kunne ikke lagre OpenArt-tilkobling: ${error.message}`);
}

export async function saveOpenArtTokens(tokens: {
  accessToken: string;
  refreshToken?: string | null;
  expiresInSeconds?: number | null;
  accountEmail?: string | null;
}): Promise<void> {
  const expiresAt = tokens.expiresInSeconds
    ? new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString()
    : null;
  await saveOpenArtConnection({
    access_token_envelope: serializeEnvelope(encrypt(tokens.accessToken)),
    ...(tokens.refreshToken
      ? { refresh_token_envelope: serializeEnvelope(encrypt(tokens.refreshToken)) }
      : {}),
    token_expires_at: expiresAt,
    ...(tokens.accountEmail ? { account_email: tokens.accountEmail } : {}),
    connected_at: new Date().toISOString(),
  });
}

export async function disconnectOpenArt(): Promise<void> {
  const supabase = getSupabase();
  // Keep the registered client (id/redirect) so reconnecting skips re-registration.
  const { error } = await supabase
    .from("openart_connection")
    .update({
      access_token_envelope: null,
      refresh_token_envelope: null,
      token_expires_at: null,
      account_email: null,
      connected_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new OpenArtError(`Kunne ikke koble fra OpenArt: ${error.message}`);
}

export async function isOpenArtConnected(): Promise<boolean> {
  const row = await getOpenArtConnectionRow();
  return Boolean(row?.access_token_envelope && row?.refresh_token_envelope);
}

// ─── Token refresh ──────────────────────────────────────────────────────────

async function getValidAccessToken(): Promise<string> {
  const row = await getOpenArtConnectionRow();
  if (!row?.access_token_envelope) {
    throw new OpenArtError("OpenArt er ikke tilkoblet. Koble til OpenArt i innstillingene.", true);
  }

  const expiresAt = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  const needsRefresh = !expiresAt || expiresAt - Date.now() < 60_000;
  if (!needsRefresh) {
    return decrypt(deserializeEnvelope(row.access_token_envelope));
  }

  if (!row.refresh_token_envelope || !row.oauth_client_id) {
    throw new OpenArtError("OpenArt-tilkoblingen er utløpt. Koble til på nytt.", true);
  }

  const refreshToken = decrypt(deserializeEnvelope(row.refresh_token_envelope));
  const res = await fetch(OPENART_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: row.oauth_client_id,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[OpenArt] Token refresh failed:", res.status, text.slice(0, 300));
    throw new OpenArtError("OpenArt-tilkoblingen kunne ikke fornyes. Koble til på nytt.", true);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  await saveOpenArtTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresInSeconds: data.expires_in || 3600,
  });
  return data.access_token;
}

// ─── Minimal MCP client (streamable HTTP) ───────────────────────────────────

interface JsonRpcResponse {
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Parse an MCP HTTP response body that is either JSON or an SSE stream. */
async function parseMcpBody(res: Response): Promise<JsonRpcResponse | null> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!text.trim()) return null;

  if (contentType.includes("text/event-stream")) {
    let last: JsonRpcResponse | null = null;
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as JsonRpcResponse;
        if (parsed.result !== undefined || parsed.error !== undefined) last = parsed;
      } catch {
        // Ignore non-JSON keepalive frames.
      }
    }
    return last;
  }

  try {
    return JSON.parse(text) as JsonRpcResponse;
  } catch {
    throw new OpenArtError(`Uventet svar fra OpenArt MCP: ${text.slice(0, 200)}`);
  }
}

async function mcpRequest(
  token: string,
  body: unknown,
  sessionId?: string,
  timeoutMs = 60_000,
): Promise<{ response: JsonRpcResponse | null; sessionId?: string; status: number }> {
  const res = await fetch(OPENART_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (res.status === 401) {
    await res.text().catch(() => "");
    throw new OpenArtError("OpenArt avviste tilgangen. Koble til på nytt.", true);
  }

  const response = await parseMcpBody(res);
  if (!res.ok && !response?.error) {
    throw new OpenArtError(`OpenArt MCP feilet (HTTP ${res.status}).`);
  }
  return {
    response,
    sessionId: res.headers.get("mcp-session-id") || sessionId,
    status: res.status,
  };
}

/**
 * Call one MCP tool: initialize → notifications/initialized → tools/call.
 * A fresh session per call keeps this stateless-friendly for serverless.
 */
export async function callOpenArtTool<T = Record<string, unknown>>(
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<T> {
  const token = await getValidAccessToken();

  const init = await mcpRequest(token, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "realtyflow-pro", version: "1.0.0" },
    },
  }, undefined, 30_000);
  if (init.response?.error) {
    throw new OpenArtError(`OpenArt MCP initialize feilet: ${init.response.error.message}`);
  }
  const sessionId = init.sessionId;

  // Best-effort per spec; some servers 202/ignore it.
  await mcpRequest(token, { jsonrpc: "2.0", method: "notifications/initialized" }, sessionId, 15_000)
    .catch(() => undefined);

  const call = await mcpRequest(token, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  }, sessionId, timeoutMs);

  if (call.response?.error) {
    throw new OpenArtError(`OpenArt ${toolName} feilet: ${call.response.error.message}`);
  }

  const result = (call.response?.result ?? {}) as {
    isError?: boolean;
    structuredContent?: unknown;
    content?: Array<{ type: string; text?: string }>;
  };

  const textBlock = result.content?.find((c) => c.type === "text")?.text;
  if (result.isError) {
    throw new OpenArtError(`OpenArt ${toolName} feilet: ${textBlock?.slice(0, 300) || "ukjent feil"}`);
  }

  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent as T;
  }
  if (textBlock) {
    try {
      return JSON.parse(textBlock) as T;
    } catch {
      return { text: textBlock } as unknown as T;
    }
  }
  return {} as T;
}

// ─── Typed wrappers ─────────────────────────────────────────────────────────

export interface OpenArtAccount {
  email?: string;
  plan?: string;
  credits?: number;
  [key: string]: unknown;
}

export async function getOpenArtAccount(): Promise<OpenArtAccount> {
  const raw = await callOpenArtTool<Record<string, unknown>>("openart_account_get", {}, 30_000);
  // Field names are not contractual — pick the obvious candidates defensively.
  const flat = JSON.stringify(raw);
  const email = (raw.email as string) || flat.match(/"email"\s*:\s*"([^"]+)"/)?.[1];
  const creditsMatch = flat.match(/"(?:credits|creditBalance|remainingCredits|balance)"\s*:\s*([0-9.]+)/);
  const plan = (raw.plan as string) || flat.match(/"(?:plan|subscriptionPlan|planName)"\s*:\s*"([^"]+)"/)?.[1];
  return {
    ...raw,
    email,
    plan,
    credits: creditsMatch ? Number(creditsMatch[1]) : undefined,
  };
}

function normalizeImageRatio(ratio: string | undefined): string {
  if (ratio && OPENART_IMAGE_RATIOS.has(ratio)) return ratio;
  return "1:1";
}

function extractHistoryId(raw: unknown): string {
  const flat = JSON.stringify(raw ?? {});
  const match = flat.match(/"historyId"\s*:\s*"([^"]+)"/);
  if (!match) {
    throw new OpenArtError(`OpenArt startet ikke genereringen: ${flat.slice(0, 300)}`);
  }
  return match[1];
}

export interface OpenArtGenerateImageInput {
  prompt: string;
  aspectRatio?: string;
  /** "1K" | "2K" | "4K" — 1K is the cheapest. */
  resolution?: "1K" | "2K" | "4K";
  imageCount?: number;
  model?: string;
  /** Public URLs used as visual references → image2image mode. */
  sourceImageUrls?: string[];
}

/** Submit an image generation. Returns the historyId to poll. */
export async function openArtGenerateImage(input: OpenArtGenerateImageInput): Promise<string> {
  const model = input.model || OPENART_DEFAULT_IMAGE_MODEL;
  const references = (input.sourceImageUrls || []).filter(Boolean);
  const mode = references.length > 0 ? "image2image" : "text2image";

  const params: Record<string, unknown> = {
    prompt: input.prompt,
    imageCount: Math.min(Math.max(input.imageCount || 1, 1), 4),
    aspectRatio: normalizeImageRatio(input.aspectRatio),
    resolution: input.resolution || "1K",
    autoEnhancePrompt: false,
  };
  if (mode === "image2image") {
    params.visualReferences = references.slice(0, 14).map((url, i) => ({
      type: "image",
      id: `ref-${i + 1}`,
      url,
      label: `Reference ${i + 1}`,
    }));
  }

  const raw = await callOpenArtTool("openart_generate_image", { model, mode, params }, 90_000);
  return extractHistoryId(raw);
}

export interface OpenArtGenerateVideoInput {
  prompt: string;
  /** First-frame image URL → image2video; omit for text2video. */
  sourceImageUrl?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  resolution?: string;
  generateAudio?: boolean;
  model?: string;
}

/** Submit a video generation. Returns the historyId to poll. */
export async function openArtGenerateVideo(input: OpenArtGenerateVideoInput): Promise<string> {
  const model = input.model || OPENART_DEFAULT_VIDEO_MODEL;
  const mode = input.sourceImageUrl ? "image2video" : "text2video";

  const params: Record<string, unknown> = {
    prompt: input.prompt,
    videoCount: 1,
    duration: Math.min(Math.max(input.durationSeconds || 5, 1), 15),
    resolution: input.resolution || "540p",
    generateAudio: input.generateAudio ?? false,
  };
  if (input.sourceImageUrl) {
    params.startFrame = {
      type: "image",
      id: "start-frame",
      url: input.sourceImageUrl,
      label: "Start frame",
    };
  } else {
    params.aspectRatio = input.aspectRatio || "16:9";
  }

  const raw = await callOpenArtTool("openart_generate_video", { model, mode, params }, 90_000);
  return extractHistoryId(raw);
}

export type OpenArtCreationStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "UNKNOWN";

export interface OpenArtCreationResult {
  historyId: string;
  status: OpenArtCreationStatus;
  urls: string[];
  thumbnailUrls: string[];
  failedReason?: string;
}

function collectUrls(node: unknown, urls: Set<string>, thumbs: Set<string>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectUrls(item, urls, thumbs);
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === "string" && /^https?:\/\//.test(value)) {
      if (/thumbnail/i.test(key)) thumbs.add(value);
      else if (/^(url|imageUrl|videoUrl|mediaUrl|outputUrl)$/i.test(key)) urls.add(value);
    } else if (value && typeof value === "object") {
      collectUrls(value, urls, thumbs);
    }
  }
}

export async function getOpenArtCreation(historyId: string): Promise<OpenArtCreationResult> {
  const raw = await callOpenArtTool<Record<string, unknown>>(
    "openart_creation_get",
    { historyId },
    45_000,
  );

  const flat = JSON.stringify(raw);
  const statusMatch = flat.match(/"status"\s*:\s*"([^"]+)"/i);
  const statusText = (statusMatch?.[1] || "UNKNOWN").toUpperCase();
  const status: OpenArtCreationStatus =
    ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"].includes(statusText)
      ? (statusText as OpenArtCreationStatus)
      : "UNKNOWN";

  const urls = new Set<string>();
  const thumbs = new Set<string>();
  collectUrls(raw, urls, thumbs);

  const failedReason =
    flat.match(/"failedReason"\s*:\s*"([^"]+)"/)?.[1] ||
    flat.match(/"errorDisplayCode"\s*:\s*"([^"]+)"/)?.[1];

  return {
    historyId,
    status,
    urls: [...urls],
    thumbnailUrls: [...thumbs],
    failedReason,
  };
}

/**
 * Poll a creation until it settles or the budget runs out.
 * Returns the last observed state either way — check `status`.
 */
export async function waitForOpenArtCreation(
  historyId: string,
  options: { budgetMs?: number; intervalMs?: number } = {},
): Promise<OpenArtCreationResult> {
  const budgetMs = options.budgetMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 4_000;
  const deadline = Date.now() + budgetMs;

  let last = await getOpenArtCreation(historyId);
  while (
    (last.status === "PENDING" || last.status === "RUNNING" || last.status === "UNKNOWN") &&
    Date.now() + intervalMs < deadline
  ) {
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await getOpenArtCreation(historyId);
    // A completed generation without URLs is not usable yet — keep polling.
    if (last.status === "COMPLETED" && last.urls.length === 0) {
      last = { ...last, status: "RUNNING" };
    }
  }
  return last;
}

/** Download a generated asset and return it as a Buffer + mime type. */
export async function downloadOpenArtAsset(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new OpenArtError(`Kunne ikke laste ned fra OpenArt (HTTP ${res.status}).`);
  const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/png";
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType };
}
