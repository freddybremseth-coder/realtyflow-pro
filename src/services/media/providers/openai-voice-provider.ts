import {
  emptyAvatarCapabilities,
  emptyImageCapabilities,
  emptyVideoCapabilities,
  providerCapabilitiesSchema,
  type MediaGenerationJob,
  type MediaProvider,
  type ProviderCapabilities,
  type ProviderJobStatus,
  type VoiceGenerationInput,
} from "../types";

const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const DEFAULT_MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "alloy";
const SUPPORTED_FORMATS = new Set(["mp3", "opus", "aac", "flac", "wav", "pcm"]);
const SUPPORTED_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

function mimeForFormat(format: string) {
  if (format === "wav") return "audio/wav";
  if (format === "aac") return "audio/aac";
  if (format === "flac") return "audio/flac";
  if (format === "opus") return "audio/ogg";
  if (format === "pcm") return "audio/L16";
  return "audio/mpeg";
}

function safeFormat(value?: string) {
  return value && SUPPORTED_FORMATS.has(value) ? value : "mp3";
}

function safeVoice(value?: string) {
  return value && SUPPORTED_VOICES.has(value) ? value : DEFAULT_VOICE;
}

function supportsInstructions(model: string) {
  return model !== "tts-1" && model !== "tts-1-hd";
}

export class OpenAIVoiceProvider implements MediaProvider {
  readonly id = "openai" as const;
  readonly displayName = "OpenAI Voice";

  async getCapabilities(): Promise<ProviderCapabilities> {
    const configured = Boolean(process.env.OPENAI_API_KEY);
    return providerCapabilitiesSchema.parse({
      provider: this.id,
      displayName: this.displayName,
      updatedAt: new Date().toISOString(),
      status: configured ? "available" : "unavailable",
      image: emptyImageCapabilities,
      video: emptyVideoCapabilities,
      avatar: emptyAvatarCapabilities,
      voice: {
        textToSpeech: configured,
        voiceClone: false,
      },
      tools: configured
        ? [{ name: "audio.speech", description: "OpenAI server-side text-to-speech" }]
        : [],
      account: { configured },
      errorMessage: configured ? undefined : "OPENAI_API_KEY er ikke konfigurert.",
    });
  }

  async generateVoice(input: VoiceGenerationInput): Promise<MediaGenerationJob> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY er ikke konfigurert.");

    const text = input.text.trim();
    if (!text) throw new Error("Manuset kan ikke være tomt.");
    if (text.length > 4096) throw new Error("Manuset kan være maksimalt 4096 tegn per lydgenerering.");

    const model = input.model || process.env.OPENAI_TTS_MODEL || DEFAULT_MODEL;
    const responseFormat = safeFormat(input.outputFormat);
    const voice = safeVoice(input.voiceId);
    const speed = Math.min(4, Math.max(0.25, Number(input.speed || 1)));
    const instructions = [
      input.language ? `Speak naturally in ${input.language}.` : "",
      input.tone?.trim() || "",
    ].filter(Boolean).join(" ");

    const payload: Record<string, unknown> = {
      model,
      input: text,
      voice,
      response_format: responseFormat,
      speed,
    };
    if (instructions && supportsInstructions(model)) payload.instructions = instructions;

    const response = await fetch(OPENAI_SPEECH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(body.error?.message || `OpenAI Voice feilet (${response.status}).`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.byteLength) throw new Error("OpenAI Voice returnerte en tom lydfil.");

    return {
      provider: this.id,
      status: "completed",
      inlineBase64: buffer.toString("base64"),
      mimeType: mimeForFormat(responseFormat),
      model,
    };
  }

  async getJobStatus(providerJobId: string): Promise<ProviderJobStatus> {
    return {
      providerJobId,
      status: "unknown",
      errorMessage: "OpenAI Voice-jobber fullføres synkront og skal ikke polles.",
    };
  }
}
