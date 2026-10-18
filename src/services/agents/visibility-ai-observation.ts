/** Read-only AI visibility evidence model. Never infer a citation from referrals or a generated answer alone. */
export type AiSearchProvider = "chatgpt" | "perplexity" | "google_ai" | "copilot";
export type AiVisibilityObservation = {
  provider: AiSearchProvider;
  prompt: string;
  locale: string;
  observedAt: string;
  responseExcerpt: string;
  citedUrls: string[];
  brandMentioned: boolean;
  capturedBy: "manual" | "authorized_api";
};
export type AiVisibilityAssessment = {
  state: "CITED" | "MENTIONED_NOT_CITED" | "NOT_OBSERVED" | "INVALID_EVIDENCE";
  citedPages: string[];
  isPopulationEstimate: false;
  note: string;
};
export function assessAiVisibilityObservation(
  observation: AiVisibilityObservation, verifiedHost: string,
): AiVisibilityAssessment {
  const invalid = (): AiVisibilityAssessment => ({
    state:"INVALID_EVIDENCE",citedPages:[],isPopulationEstimate:false,
    note:"Mangelfull dokumentasjon; dette er ikke et bekreftet AI-treff.",
  });
  if (!observation.prompt.trim() || !observation.locale.trim() ||
      !observation.responseExcerpt.trim() || !Number.isFinite(Date.parse(observation.observedAt)) ||
      !Array.isArray(observation.citedUrls) || observation.citedUrls.length > 20 ||
      !["manual","authorized_api"].includes(observation.capturedBy))
    return invalid();
  const pages: string[] = [];
  for (const value of observation.citedUrls) {
    try {
      if (typeof value !== "string" || value.length > 2048) return invalid();
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.hostname.endsWith(".") ||
          /[\\u0000-\\u001f]/.test(value)) return invalid();
      const host = url.hostname.toLowerCase();
      if (host === verifiedHost || host === "www." + verifiedHost ||
          ("www." + host) === verifiedHost) pages.push(url.toString());
    } catch { return invalid(); }
  }
  return {
    state:pages.length ? "CITED" : observation.brandMentioned ? "MENTIONED_NOT_CITED" : "NOT_OBSERVED",
    citedPages:pages,isPopulationEstimate:false,
    note:"Én dokumentert AI-observasjon, ikke en fullstendig eller personaliseringsfri rangering. Omtale og URL-sitering må skilles.",
  };
}
