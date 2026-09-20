/**
 * A 204 receipt means a real discovery row was persisted, never merely that
 * the browser sent an allowed request. Network/database failures are unknown
 * measurements, not successful visits; they remain safe to retry.
 */
export function discoveryStorageHttpStatus(outcome: "stored" | "unavailable" | "write_failed"): 204 | 503 {
  return outcome === "stored" ? 204 : 503;
}
