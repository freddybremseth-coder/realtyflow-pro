import { z } from "zod";
import { BRANDS } from "@/lib/constants";
import { askClaude } from "@/services/ai/claude-client";

export const voiceScriptActions = ["create", "rewrite", "shorten", "expand", "translate"] as const;
export const voiceUseCases = ["property", "business", "social_ad", "audiobook", "course", "podcast", "general"] as const;

export const voiceScriptRequestSchema = z.object({
  action: z.enum(voiceScriptActions),
  script: z.string().max(12_000).default(""),
  brief: z.string().max(4_000).optional(),
  language: z.string().min(2).max(80).default("Norwegian"),
  tone: z.string().max(500).default("Warm, professional, natural and credible."),
  useCase: z.enum(voiceUseCases).default("general"),
  targetDurationSeconds: z.number().int().min(10).max(240).optional(),
  brandId: z.string().max(80).optional(),
  pronunciationGuide: z.string().max(1_000).optional(),
}).superRefine((value, context) => {
  if (value.action === "create" && !(value.brief || value.script).trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["brief"], message: "Skriv en idé eller brief først." });
  }
  if (value.action !== "create" && value.script.trim().length < 3) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["script"], message: "Manuset er for kort." });
  }
});

export type VoiceScriptRequest = z.infer<typeof voiceScriptRequestSchema>;

const USE_CASE_LABELS: Record<(typeof voiceUseCases)[number], string> = {
  property: "a premium real-estate presentation",
  business: "a professional business presentation",
  social_ad: "a concise social-media advertisement",
  audiobook: "an engaging audiobook narration",
  course: "clear educational or course narration",
  podcast: "a polished podcast intro or segment",
  general: "a professional voice-over",
};

export function countVoiceWords(value: string) {
  return value.trim() ? value.trim().split(/\s+/u).filter(Boolean).length : 0;
}

export function estimateVoiceDurationSeconds(value: string, speed = 1) {
  const words = countVoiceWords(value);
  if (!words) return 0;
  const safeSpeed = Math.min(4, Math.max(0.25, Number(speed) || 1));
  return Math.max(1, Math.round((words / (145 * safeSpeed)) * 60));
}

export function cleanVoiceScriptOutput(value: string, maxCharacters = 4_000) {
  let text = value
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/^\s*(?:manus|script|voice[- ]?over)\s*:\s*/i, "")
    .trim();

  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("“") && text.endsWith("”"))) {
    text = text.slice(1, -1).trim();
  }

  if (text.length <= maxCharacters) return { text, truncated: false };

  const slice = text.slice(0, maxCharacters);
  const sentenceBoundary = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  const safeText = (sentenceBoundary > maxCharacters * 0.65 ? slice.slice(0, sentenceBoundary + 1) : slice).trim();
  return { text: safeText, truncated: true };
}

export function buildVoiceScriptPrompt(input: VoiceScriptRequest) {
  const brand = BRANDS.find((item) => item.id === input.brandId);
  const source = input.action === "create" ? (input.brief || input.script).trim() : input.script.trim();
  const targetWords = input.targetDurationSeconds
    ? Math.max(25, Math.round((input.targetDurationSeconds / 60) * 145))
    : undefined;

  const actionInstruction = {
    create: "Write a complete spoken script from the brief.",
    rewrite: "Rewrite the script so it sounds natural when spoken, while preserving verified meaning, names and numbers.",
    shorten: "Shorten the script substantially without losing its core message or call to action.",
    expand: "Expand the script with useful transitions and context, without inventing facts or unsupported claims.",
    translate: `Translate the script into ${input.language}, preserving meaning, names, numbers and brand terminology.`,
  }[input.action];

  const brandContext = brand
    ? [
        `Brand: ${brand.name}.`,
        `Brand tone: ${brand.tone}.`,
        `Audience: ${brand.target_audience}.`,
        brand.specialties?.length ? `Relevant areas: ${brand.specialties.join(", ")}.` : "",
      ].filter(Boolean).join(" ")
    : "No specific brand has been selected.";

  return [
    actionInstruction,
    `Output language: ${input.language}.`,
    `Use case: ${USE_CASE_LABELS[input.useCase]}.`,
    `Voice direction: ${input.tone}.`,
    targetWords ? `Target approximately ${targetWords} spoken words, while staying below 4,000 characters.` : "Stay below 4,000 characters.",
    brandContext,
    input.pronunciationGuide ? `Pronunciation guide for the narrator: ${input.pronunciationGuide}.` : "",
    "Use natural sentence rhythm and punctuation for breathing and pauses.",
    "Do not use Markdown, headings, bullet points, production notes, brackets or stage directions.",
    "Do not claim that AI-generated speech is a real person's recording.",
    "Do not invent property facts, prices, guarantees, credentials, statistics or customer results.",
    "Return only the final voice-over script.",
    "",
    "SOURCE OR BRIEF:",
    source,
  ].filter(Boolean).join("\n");
}

export async function generateVoiceScript(rawInput: VoiceScriptRequest) {
  const input = voiceScriptRequestSchema.parse(rawInput);
  const prompt = buildVoiceScriptPrompt(input);
  const generated = await askClaude(prompt, {
    model: "haiku",
    temperature: 0.35,
    maxTokens: 1_800,
    systemPrompt: "You are a senior multilingual voice-over writer. Produce accurate, natural spoken copy that is easy to narrate. Never invent factual claims.",
  });
  const cleaned = cleanVoiceScriptOutput(generated);
  if (cleaned.text.length < 3) throw new Error("AI returnerte ikke et brukbart manus.");

  return {
    script: cleaned.text,
    truncated: cleaned.truncated,
    stats: {
      characters: cleaned.text.length,
      words: countVoiceWords(cleaned.text),
      estimatedDurationSeconds: estimateVoiceDurationSeconds(cleaned.text),
    },
  };
}
