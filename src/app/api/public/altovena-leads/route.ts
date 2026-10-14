import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const products = new Set(["offer", "visibility", "realtyflow", "olivia", "other"]);
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const headers = { "Cache-Control": "no-store" };
const respond = (code: number, error: string) =>
  NextResponse.json({ ok: false, accepted: false, error }, { status: code, headers });
const value = (x: unknown) => typeof x === "string" ? x.trim() : "";
const permitted = (x: unknown, max: number) =>
  typeof x === "string" && x.trim().length > 0 && x.trim().length <= max;

function matchKey(given: string, expected: string) {
  // Constant-duration comparison without revealing configured secret length.
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return given.length > 0 && expected.length >= 32 &&
    timingSafeEqual(digest(given), digest(expected));
}

/**
 * Narrow server-to-server intake for Altovena. Never accept public website clients
 * directly, never use the generic property-leads fallback, never rebrand another lead.
 */
export async function POST(request: NextRequest) {
  const cfg = process.env;
  if (cfg.ALTOVENA_INTAKE_ENABLED !== "true" ||
      !cfg.ALTOVENA_INTAKE_KEY || !cfg.NEXT_PUBLIC_SUPABASE_URL ||
      !cfg.SUPABASE_SERVICE_ROLE_KEY) return respond(503, "INTAKE_NOT_CONFIGURED");
  if (!matchKey(request.headers.get("x-altovena-ingest-key") || "", cfg.ALTOVENA_INTAKE_KEY))
    return respond(401, "UNAUTHORIZED");

  if (!/^application\/json\b/i.test(request.headers.get("content-type") || ""))
    return respond(415, "UNSUPPORTED_MEDIA_TYPE");
  const claimedSize = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(claimedSize) || claimedSize > 12000 || claimedSize < 0)
    return respond(413, "PAYLOAD_TOO_LARGE");

  let input: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 12000) return respond(413, "PAYLOAD_TOO_LARGE");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return respond(400, "INVALID_BODY");
    input = parsed as Record<string, unknown>;
  } catch {
    return respond(400, "INVALID_JSON");
  }

  const allowedKeys = new Set([
    "brandKey", "source", "requestType", "submissionId",
    "name", "company", "email", "message", "product", "consent", "pageUrl",
  ]);
  if (Object.keys(input).some(key => !allowedKeys.has(key))) return respond(422, "UNKNOWN_FIELDS");
  if (input.brandKey !== "altovena" ||
      input.source !== "altovena.com/contact" ||
      input.requestType !== "product-enquiry") return respond(422, "WRONG_BRAND");
  if (!permitted(input.submissionId, 36) || !uuid.test(value(input.submissionId)))
    return respond(422, "INVALID_SUBMISSION_ID");
  if (!permitted(input.name, 120) || !permitted(input.email, 254) ||
      !permitted(input.message, 2500) || !emailPattern.test(value(input.email)) ||
      typeof input.company !== "string" || input.company.length > 160 ||
      (typeof input.product !== "string" || !products.has(input.product))) return respond(422, "INVALID_FIELDS");
  const consent = input.consent;
  if (!consent || typeof consent !== "object" || Array.isArray(consent) ||
      (consent as Record<string, unknown>).purpose !== "respond_to_request" ||
      (consent as Record<string, unknown>).marketing !== false)
    return respond(422, "INVALID_PURPOSE");
  if (input.pageUrl !== undefined &&
      (typeof input.pageUrl !== "string" || input.pageUrl.length > 300))
    return respond(422, "INVALID_PAGE");

  const supabase = createClient(cfg.NEXT_PUBLIC_SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const { data, error } = await supabase.rpc("altovena_receive_lead", {
      p_submission_id: value(input.submissionId).toLowerCase(),
      p_name: value(input.name),
      p_email: value(input.email).toLowerCase(),
      p_company: value(input.company),
      p_message: value(input.message),
      p_product: input.product,
    });
    if (error) {
      // Do not leak database error details or personal information to callers.
      return respond(503, "CRM_WRITE_FAILED");
    }
    if (data?.ok !== true || data?.accepted !== true ||
        !uuid.test(String(data.leadId || "")) || !uuid.test(String(data.workItemId || "")))
      return respond(503, "CRM_NOT_CONFIRMED");
    return NextResponse.json({
      ok: true, accepted: true, leadId: data.leadId, workItemId: data.workItemId,
      duplicate: data.duplicate === true,
    }, { headers });
  } catch {
    return respond(503, "CRM_UNAVAILABLE");
  }
}

export function GET() {
  return NextResponse.json({ ok: false, error: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { ...headers, Allow: "POST" } });
}
