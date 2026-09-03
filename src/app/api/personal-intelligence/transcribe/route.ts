import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ALLOWED_AUDIO_PREFIX = "audio/";

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") {
      return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    }

    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI transcription is not configured" }, { status: 503 });
    }

    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }
    if (!audio.type.startsWith(ALLOWED_AUDIO_PREFIX)) {
      return NextResponse.json({ error: "Unsupported audio type" }, { status: 415 });
    }
    if (audio.size <= 0 || audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Audio must be between 1 byte and 10 MB" }, { status: 413 });
    }

    const upstream = new FormData();
    upstream.append("file", audio, audio.name || "dictation.webm");
    upstream.append("model", "gpt-4o-mini-transcribe");
    upstream.append("response_format", "json");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
      cache: "no-store",
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[Personal Intelligence transcription] upstream failed", response.status, body?.error?.code || body?.error?.type || "unknown");
      return NextResponse.json({ error: "Transcription failed" }, { status: response.status >= 500 ? 502 : 400 });
    }

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "No speech detected" }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      text,
      retention: {
        rawAudioStoredByRealtyFlow: false,
        transcriptPersistedByThisRoute: false,
      },
    });
  } catch (error) {
    console.error("[Personal Intelligence transcription]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcription failed" },
      { status: 500 },
    );
  }
}
