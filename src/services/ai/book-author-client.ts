import type { ResponseSchema } from "@google/generative-ai";
import { askClaude } from "@/services/ai/claude-client";

export type BookAuthorOptions = {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  responseMimeType?: "application/json";
  responseSchema?: ResponseSchema | Record<string, unknown>;
  validateResponse?: (text: string) => boolean;
  fallbackOnInvalidResponse?: boolean;
  model?: "haiku" | "sonnet";
  anthropicOnly?: boolean;
  webSearch?: boolean;
  requireOpenAI?: boolean;
  onWebSources?: (sources: Array<{ title: string; url: string }>) => void;
};

const BOOK_SYSTEM = `Du er Freddy Bremseths primære bokproduksjonsassistent.
Arbeid som en erfaren forfatter, researcher og forlagsredaktør. Følg låst seriebibel, canon, målgruppe, stil og master-outline. Ikke finn opp fakta, kilder, hendelser eller kontinuitet. Skriv kumulativt og bevar tidligere godkjent manus. Skill klart mellom kladd, endelig manus og publiseringsfiler.`;

export function buildOpenAIBookResponsePayload(prompt: string, options: BookAuthorOptions = {}) {
  const fast = options.model === "haiku";
  const schema = options.responseSchema as Record<string, unknown> | undefined;
  const text = options.responseMimeType === "application/json"
    ? {
        format: schema
          ? { type: "json_schema", name: "book_author_output", strict: true, schema }
          : { type: "json_object" },
      }
    : undefined;
  return {
    model: fast
      ? process.env.OPENAI_BOOK_FAST_MODEL || "gpt-5.6-luna"
      : process.env.OPENAI_BOOK_MODEL || "gpt-5.6",
    instructions: [BOOK_SYSTEM, options.systemPrompt].filter(Boolean).join("\n\n"),
    input: prompt,
    reasoning: { effort: fast ? "low" : "high" },
    max_output_tokens: fast
      ? Math.max(Number(options.maxTokens || 2000), 6000)
      : Math.max(Number(options.maxTokens || 8000), 25000),
    ...(options.webSearch
      ? {
          tools: [{ type: "web_search", external_web_access: true }],
          tool_choice: "required",
          include: ["web_search_call.action.sources"],
        }
      : {}),
    ...(text ? { text } : {}),
  };
}

export function extractOpenAIResponseText(payload: Record<string, any>) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

export function extractOpenAIWebSources(payload: Record<string, any>) {
  const sources = new Map<string, { title: string; url: string }>();
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    for (const source of Array.isArray(item?.action?.sources) ? item.action.sources : []) {
      const url = String(source?.url || "").trim();
      if (/^https:\/\//i.test(url)) sources.set(url, { title: String(source?.title || source?.name || url), url });
    }
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
        const url = String(annotation?.url || "").trim();
        if (/^https:\/\//i.test(url)) sources.set(url, { title: String(annotation?.title || url), url });
      }
    }
  }
  return [...sources.values()];
}

async function askOpenAIBookAuthor(prompt: string, options: BookAuthorOptions) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY er ikke konfigurert");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildOpenAIBookResponsePayload(prompt, options)),
  });
  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    const message = String((payload as any)?.error?.message || `OpenAI-feil ${response.status}`);
    throw new Error(message.slice(0, 600));
  }
  if ((payload as any)?.status === "incomplete") {
    throw new Error(`OpenAI-svaret ble ufullstendig (${String((payload as any)?.incomplete_details?.reason || "ukjent årsak")}).`);
  }
  if (options.onWebSources) options.onWebSources(extractOpenAIWebSources(payload as Record<string, any>));
  const text = extractOpenAIResponseText(payload as Record<string, any>);
  if (!text) throw new Error("OpenAI returnerte ikke boktekst.");
  if (options.validateResponse && !options.validateResponse(text)) throw new Error("OpenAI returnerte et svar som ikke bestod bokformat-kontrollen.");
  return text;
}

/** OpenAI/ChatGPT er primær for bokproduksjon. Eksisterende leverandørkjede
 * brukes bare som driftsreserve dersom OpenAI mangler eller feiler. */
export async function askBookAuthor(prompt: string, options: BookAuthorOptions = {}) {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await askOpenAIBookAuthor(prompt, options);
    } catch (error) {
      if (options.requireOpenAI || options.webSearch) throw error;
      console.warn(`[Book Author] OpenAI primary failed, using reserve provider: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (options.requireOpenAI || options.webSearch) {
    throw new Error("OpenAI er ikke konfigurert for markedsresearch. Kontroller OPENAI_API_KEY.");
  }
  return askClaude(prompt, { ...options, anthropicOnly: false });
}
