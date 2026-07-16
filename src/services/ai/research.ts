import { askClaudeWithWebSearch } from "@/services/ai/claude-client";

/**
 * Web-research for bokskriving (og annet innhold).
 *
 * Foretrukket kilde er Perplexity (sonar-pro) når PERPLEXITY_API_KEY er satt —
 * Freddy har Pro-abonnement med API-kreditter der. Faller tilbake til
 * Anthropics innebygde web_search-verktøy, og til slutt tom streng: research
 * er alltid et valgfritt steg som aldri skal blokkere skrivingen.
 */

async function researchWithPerplexity(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return "";
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content:
              "Du er en grundig researcher. Svar kompakt, kun med punkter du fant kildedekning for, og oppgi kilde per punkt.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      console.warn(`[Research] Perplexity ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return "";
    }
    const data = await res.json();
    const content = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!content) return "";
    // Perplexity returnerer kildene separat — legg dem ved notatet.
    const citations: string[] = Array.isArray(data?.citations) ? data.citations.map(String) : [];
    const sources = citations.length
      ? `\n\nKilder:\n${citations.map((url, i) => `[${i + 1}] ${url}`).join("\n")}`
      : "";
    return content + sources;
  } catch (error) {
    console.warn("[Research] Perplexity feilet (hopper over):", error instanceof Error ? error.message : error);
    return "";
  }
}

/**
 * Kjør web-research: Perplexity → Anthropic web_search → "" (hopp over).
 */
export async function researchWeb(
  prompt: string,
  options?: { maxTokens?: number; maxSearches?: number },
): Promise<{ text: string; provider: "perplexity" | "anthropic" | "none" }> {
  const maxTokens = options?.maxTokens ?? 1800;

  const perplexity = await researchWithPerplexity(prompt, maxTokens);
  if (perplexity) return { text: perplexity, provider: "perplexity" };

  const anthropic = await askClaudeWithWebSearch(prompt, {
    maxTokens,
    maxSearches: options?.maxSearches ?? 4,
    model: "sonnet",
  });
  if (anthropic) return { text: anthropic, provider: "anthropic" };

  return { text: "", provider: "none" };
}
