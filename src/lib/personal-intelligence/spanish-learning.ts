import { createHmac, timingSafeEqual } from "node:crypto";

export const SPANISH_PROVIDER = "spanish_chatgenius";
export const SPANISH_COURSE = "daily_5_min";
export const SPANISH_APP_URL = "https://spanish.chatgenius.pro/";

export function spanishBridgeSecret() {
  return (process.env.SPANISH_LEARNING_BRIDGE_SECRET || process.env.REALTYFLOW_MIGRATION_SECRET || "").trim();
}

function b64url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function signSpanishProgressToken(payload: { ownerUserId: string; subjectEntityId: string; exp: number }) {
  const secret = spanishBridgeSecret();
  if (!secret) return null;
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySpanishProgressToken(token: string) {
  const secret = spanishBridgeSecret();
  if (!secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      ownerUserId?: string;
      subjectEntityId?: string;
      exp?: number;
    };
    if (!parsed.ownerUserId || !parsed.subjectEntityId || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function recommendedSpanishFocus(totalSessions: number, nextFocus?: string | null) {
  if (nextFocus?.trim()) return nextFocus.trim();
  if (totalSessions < 3) return "Hverdagsfraser: hilse, bestille, spørre og forstå korte svar";
  if (totalSessions < 7) return "Praktisk hverdag: café, butikk, avtaler, transport og småprat";
  if (totalSessions < 12) return "Bolig og arbeid: visning, avtaler, priser, spørsmål og kundedialog";
  if (totalSessions < 20) return "Samtaleflyt: fortid, planer, meninger og naturlige oppfølgingsspørsmål";
  return "Adaptiv repetisjon av svake områder + mer spontan samtale";
}

export function madridDateKey(date: Date | string | null | undefined) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
