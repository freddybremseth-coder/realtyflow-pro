/**
 * Privacy-minimal, exact-host classification of observed search/AI referrers.
 * Gemini must be tested before generic Google; otherwise AI arrivals are
 * incorrectly counted as web search. This does not verify organic attribution.
 */
const SOURCES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^gemini\.google\.com$/i, "google_gemini"],
  [/(^|\.)google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/i, "google_search"],
  [/(^|\.)bing\.com$/i, "bing_search"],
  [/(^|\.)chatgpt\.com$/i, "chatgpt"],
  [/^copilot\.microsoft\.com$/i, "microsoft_copilot"],
  [/(^|\.)perplexity\.ai$/i, "perplexity"],
  [/^search\.brave\.com$/i, "brave_search"],
  [/(^|\.)duckduckgo\.com$/i, "duckduckgo"],
];

export function classifySearchDiscoveryReferrer(
  raw: unknown,
): { source: string; host: string } | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const match = SOURCES.find(([pattern]) => pattern.test(host));
    return match ? { source: match[1], host } : null;
  } catch {
    return null;
  }
}
