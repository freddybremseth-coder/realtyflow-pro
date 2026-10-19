import { createHash } from "node:crypto";
import { findZenecoAiPrompt } from "./visibility-ai-prompt-panel";
import type { AiSearchProvider } from "./visibility-ai-observation";

/**
 * Immutable identity for a planned sampling request. Planning does not call a
 * provider, incur cost, claim a response or write an observation.
 */
export type AiSamplingPlan = {
  id: string;
  brandId: "zeneco";
  provider: AiSearchProvider;
  promptId: string;
  prompt: string;
  locale: string;
  scheduledDate: string;
  state: "PLANNED_NOT_EXECUTED";
  providerResponseReceived: false;
  independentlyVerified: false;
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PROVIDERS: AiSearchProvider[] = ["chatgpt", "google_ai", "perplexity", "copilot"];
export function planZenecoAiSample(provider: AiSearchProvider, promptId: string, scheduledDate: string): AiSamplingPlan {
  const prompt = findZenecoAiPrompt(promptId);
  if (!prompt || !PROVIDERS.includes(provider) || !DATE.test(scheduledDate) ||
      !Number.isFinite(Date.parse(scheduledDate)) || new Date(scheduledDate).toISOString().slice(0, 10) !== scheduledDate)
    throw new Error("Invalid AI sampling parameters");
  const id = createHash("sha256").update(["zeneco", provider, prompt.id, prompt.locale, scheduledDate].join("\u0000")).digest("hex");
  return {
    id, brandId: "zeneco", provider, promptId: prompt.id, prompt: prompt.prompt,
    locale: prompt.locale, scheduledDate, state: "PLANNED_NOT_EXECUTED",
    providerResponseReceived: false, independentlyVerified: false,
  };
}
