import { askClaude, isConfigured as isFallbackConfigured } from "@/services/ai/claude-client";

export interface NexusAIOptions {
  systemPrompt: string;
  maxTokens?: number;
}

export interface NexusAIResult {
  text: string;
  provider: "openai" | "fallback";
  model: string;
}

function extractResponseText(payload: Record<string, any>) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function supportsReasoning(model: string) {
  return /^(gpt-5|o\d)/i.test(model);
}

export function isNexusAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY) || isFallbackConfigured();
}

export async function askNexusAI(prompt: string, options: NexusAIOptions): Promise<NexusAIResult> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const model = String(process.env.OPENAI_NEXUS_MODEL || "gpt-5.6").trim();

  if (apiKey) {
    try {
      const payload = {
        model,
        instructions: options.systemPrompt,
        input: prompt,
        max_output_tokens: Math.max(Number(options.maxTokens || 1900), 2500),
        ...(supportsReasoning(model) ? { reasoning: { effort: "medium" } } : {}),
      };

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        const reason = String((body as any)?.error?.message || `OpenAI-feil ${response.status}`);
        throw new Error(reason.slice(0, 600));
      }
      if ((body as any)?.status === "incomplete") {
        throw new Error(`OpenAI-svaret ble ufullstendig (${String((body as any)?.incomplete_details?.reason || "ukjent årsak")}).`);
      }

      const text = extractResponseText(body as Record<string, any>);
      if (!text) throw new Error("OpenAI returnerte ikke tekst.");
      return { text, provider: "openai", model };
    } catch (error) {
      console.warn(`[Nexus AI] OpenAI primary failed, using reserve provider: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const text = await askClaude(prompt, {
    systemPrompt: options.systemPrompt,
    maxTokens: options.maxTokens || 1900,
    model: "sonnet",
  });
  return { text, provider: "fallback", model: "provider-chain" };
}
