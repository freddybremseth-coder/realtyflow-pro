const DEFAULT_ADMIN_EMAILS = ["freddy@soleada.no"];

export function getAdminEmails() {
  return (process.env.REALTYFLOW_ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS.join(","))
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return getAdminEmails().includes(email.trim().toLowerCase());
}

function base64UrlEncode(input: string) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

async function hmac(message: string, secret: string) {
  const crypto = await import("crypto");
  return crypto.createHmac("sha256", secret).update(message).digest("base64url");
}

export async function createAdminSession(email: string) {
  const secret = process.env.REALTYFLOW_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing REALTYFLOW_SESSION_SECRET");

  const payload = base64UrlEncode(
    JSON.stringify({
      email: email.toLowerCase(),
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    }),
  );
  const signature = await hmac(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifyAdminSession(token?: string) {
  const secret = process.env.REALTYFLOW_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !secret) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = await hmac(payload, secret);
  if (signature !== expected) return null;

  try {
    const data = JSON.parse(base64UrlDecode(payload)) as { email?: string; exp?: number };
    if (!data.email || !data.exp || data.exp < Date.now()) return null;
    if (!isAdminEmail(data.email)) return null;
    return data;
  } catch {
    return null;
  }
}
