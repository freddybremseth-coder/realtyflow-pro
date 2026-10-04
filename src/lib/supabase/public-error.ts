export const SUPABASE_UNAVAILABLE_MESSAGE =
  "Datakilden er midlertidig utilgjengelig. Supabase svarer ikke stabilt akkurat nå. Ingen data er slettet; prøv igjen om litt.";

export function publicSupabaseError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("<!doctype html") ||
    normalized.includes("error code 522") ||
    normalized.includes("connection timed out") ||
    normalized.includes("connection timeout") ||
    normalized.includes("connection terminated due to connection timeout") ||
    normalized.includes("supabase request timed out") ||
    normalized.includes("aborterror") ||
    normalized.includes("the operation was aborted") ||
    (normalized.includes("supabase.co") && normalized.includes("cloudflare"))
  ) {
    return SUPABASE_UNAVAILABLE_MESSAGE;
  }

  if (!raw.trim()) return SUPABASE_UNAVAILABLE_MESSAGE;
  return raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
}
