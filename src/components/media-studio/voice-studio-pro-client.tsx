"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Languages,
  Loader2,
  Mic2,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";
import { BRANDS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProviderCapabilities {
  provider: string;
  displayName: string;
  status: "available" | "not_connected" | "degraded" | "unavailable" | "unknown";
  updatedAt: string;
  voice: { textToSpeech?: boolean; voiceClone?: boolean };
  errorMessage?: string;
}

interface MediaPromptPlan {
  mediaType: "voice" | "audio";
  operation: string;
  originalRequest: string;
  optimizedPrompt: string;
  brandId?: string;
  qualityTier: "fast" | "balanced" | "premium";
  voiceLanguage?: string;
  voiceId?: string;
  voiceTone?: string;
  voiceSpeed?: number;
  outputFormat?: VoiceFormat;
  providerRecommendation: {
    provider: "openai" | "gemini" | "openart";
    displayName: string;
    reason: string;
    estimatedCostTier: "low" | "medium" | "high" | "premium";
    model?: string;
  };
  safetyNotes: string[];
  referenceRequirements: unknown[];
  promptBlocks: Record<string, string>;
  estimatedCostTier: "low" | "medium" | "high" | "premium";
}

interface MediaAsset {
  id: string;
  title?: string | null;
  media_type: string;
  mime_type?: string | null;
  public_url?: string | null;
  provider?: string | null;
  brand_id?: string | null;
  exported_to_content_hub_at?: string | null;
  created_at: string;
}

interface MediaJob {
  id: string;
  status: string;
  provider: string;
  media_type: string;
  original_request: string;
  progress: number;
  error_message?: string | null;
  created_at: string;
  result_assets_json?: MediaAsset[];
}

type VoiceFormat = "mp3" | "wav" | "aac" | "opus" | "flac";
type QualityTier = "fast" | "balanced" | "premium";
type ScriptAction = "create" | "rewrite" | "shorten" | "expand" | "translate";
type VoiceUseCase = "property" | "business" | "social_ad" | "audiobook" | "course" | "podcast" | "general";

const voices = [
  { value: "alloy", label: "Alloy · balansert" },
  { value: "ash", label: "Ash · tydelig" },
  { value: "ballad", label: "Ballad · fortellende" },
  { value: "coral", label: "Coral · varm" },
  { value: "echo", label: "Echo · rolig" },
  { value: "fable", label: "Fable · uttrykksfull" },
  { value: "onyx", label: "Onyx · dyp" },
  { value: "nova", label: "Nova · energisk" },
  { value: "sage", label: "Sage · trygg" },
  { value: "shimmer", label: "Shimmer · lys" },
  { value: "verse", label: "Verse · moderne" },
  { value: "marin", label: "Marin · naturlig" },
  { value: "cedar", label: "Cedar · autoritativ" },
];

const languages = ["Norwegian", "English", "Spanish", "Swedish", "Danish", "German", "French"];

const presets: Array<{
  id: string;
  label: string;
  description: string;
  useCase: VoiceUseCase;
  tone: string;
  speed: number;
  duration: number;
  pauseStyle: string;
}> = [
  {
    id: "property",
    label: "Premium eiendom",
    description: "Rolig og eksklusiv presentasjon av bolig eller prosjekt.",
    useCase: "property",
    tone: "Warm, calm, premium and trustworthy. Sound like an experienced property advisor, not an aggressive salesperson.",
    speed: 0.95,
    duration: 60,
    pauseStyle: "Use elegant sentence-level pauses and a slightly longer pause between sections.",
  },
  {
    id: "business",
    label: "Business-presentasjon",
    description: "Tydelig og troverdig bedriftskommunikasjon.",
    useCase: "business",
    tone: "Professional, confident, grounded and conversational. Emphasize clarity and credibility.",
    speed: 1,
    duration: 75,
    pauseStyle: "Use clear pauses after key statements and natural breathing space.",
  },
  {
    id: "social-ad",
    label: "Sosial annonse",
    description: "Kort, energisk og handlingsorientert voice-over.",
    useCase: "social_ad",
    tone: "Energetic, modern and persuasive without sounding pushy. Make the call to action distinct.",
    speed: 1.08,
    duration: 30,
    pauseStyle: "Keep pauses short and rhythmic, with a clear pause before the call to action.",
  },
  {
    id: "audiobook",
    label: "Lydbok",
    description: "Nær, levende og behagelig fortellerstemme.",
    useCase: "audiobook",
    tone: "Intimate, expressive and emotionally present. Narrate naturally without exaggeration.",
    speed: 0.92,
    duration: 180,
    pauseStyle: "Use natural paragraph pauses and subtle emotional pacing.",
  },
  {
    id: "course",
    label: "Kurs og opplæring",
    description: "Pedagogisk, rolig og lett å følge.",
    useCase: "course",
    tone: "Clear, patient and educational. Explain with confidence and make important terms easy to understand.",
    speed: 0.96,
    duration: 120,
    pauseStyle: "Pause briefly after definitions, numbered steps and important instructions.",
  },
  {
    id: "podcast",
    label: "Podcast-intro",
    description: "Personlig og profesjonell åpning eller segment.",
    useCase: "podcast",
    tone: "Friendly, polished and engaging, with a natural host-like delivery.",
    speed: 1,
    duration: 45,
    pauseStyle: "Use relaxed conversational pauses and a clean ending.",
  },
];

function statusVariant(status?: string) {
  if (status === "available" || status === "completed") return "success" as const;
  if (status === "unavailable" || status === "failed") return "destructive" as const;
  if (["queued", "submitted", "processing", "degraded"].includes(status || "")) return "warning" as const;
  return "secondary" as const;
}

function errorMessage(data: unknown, status: number) {
  if (data && typeof data === "object") {
    const value = data as { error?: string | { message?: string }; message?: string };
    if (typeof value.error === "string") return value.error;
    if (value.error && typeof value.error === "object" && value.error.message) return value.error.message;
    if (value.message) return value.message;
  }
  return `Forespørselen feilet (${status}).`;
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(data, response.status));
  return data as T;
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/u).filter(Boolean).length : 0;
}

function estimatedDuration(value: string, speed: number) {
  const words = wordCount(value);
  if (!words) return 0;
  const safeSpeed = Math.min(4, Math.max(0.25, speed || 1));
  return Math.max(1, Math.round((words / (145 * safeSpeed)) * 60));
}

function durationLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes} min ${rest.toString().padStart(2, "0")} sek` : `${rest} sek`;
}

function splitCaptions(script: string, maxLength = 78) {
  const sentences = script.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [script];
  const captions: string[] = [];
  for (const rawSentence of sentences) {
    const sentence = rawSentence.replace(/\s+/g, " ").trim();
    if (!sentence) continue;
    if (sentence.length <= maxLength) {
      captions.push(sentence);
      continue;
    }
    const words = sentence.split(" ");
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxLength && current) {
        captions.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) captions.push(current);
  }
  return captions;
}

function subtitleTime(seconds: number, srt: boolean) {
  const whole = Math.max(0, seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = Math.floor(whole % 60);
  const millis = Math.round((whole - Math.floor(whole)) * 1000);
  const separator = srt ? "," : ".";
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}${separator}${millis.toString().padStart(3, "0")}`;
}

function buildSubtitles(script: string, speed: number, format: "srt" | "vtt") {
  const captions = splitCaptions(script);
  const totalWords = Math.max(1, wordCount(script));
  const totalSeconds = Math.max(captions.length * 1.4, estimatedDuration(script, speed));
  let cursor = 0;
  const lines = captions.map((caption, index) => {
    const share = Math.max(0.9, (wordCount(caption) / totalWords) * totalSeconds);
    const start = cursor;
    const end = Math.min(totalSeconds, cursor + share);
    cursor = end;
    const timing = `${subtitleTime(start, format === "srt")} --> ${subtitleTime(end, format === "srt")}`;
    return format === "srt" ? `${index + 1}\n${timing}\n${caption}` : `${timing}\n${caption}`;
  });
  return format === "vtt" ? `WEBVTT\n\n${lines.join("\n\n")}\n` : `${lines.join("\n\n")}\n`;
}

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function VoiceStudioProClient() {
  const [capabilities, setCapabilities] = useState<ProviderCapabilities[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [brandId, setBrandId] = useState("soleada");
  const [presetId, setPresetId] = useState("property");
  const [useCase, setUseCase] = useState<VoiceUseCase>("property");
  const [language, setLanguage] = useState("Norwegian");
  const [voiceId, setVoiceId] = useState("coral");
  const [tone, setTone] = useState(presets[0].tone);
  const [pauseStyle, setPauseStyle] = useState(presets[0].pauseStyle);
  const [pronunciationGuide, setPronunciationGuide] = useState("");
  const [speed, setSpeed] = useState(presets[0].speed);
  const [outputFormat, setOutputFormat] = useState<VoiceFormat>("mp3");
  const [qualityTier, setQualityTier] = useState<QualityTier>("balanced");
  const [targetDurationSeconds, setTargetDurationSeconds] = useState(presets[0].duration);
  const [autoExport, setAutoExport] = useState(false);
  const [brief, setBrief] = useState("Presenter en moderne bolig på Costa Blanca for skandinaviske kjøpere. Fremhev trygg rådgivning, beliggenhet og livsstil uten å finne på fakta.");
  const [script, setScript] = useState("Velkommen til Costa Blanca. Her møter moderne boliger et roligere middelhavsliv, med nærhet til både strand, service og opplevelser. Vi hjelper deg gjennom hele prosessen med tydelig informasjon og lokal kunnskap.");

  const openai = capabilities.find((item) => item.provider === "openai");
  const activeVoiceProvider = capabilities.find((item) => item.voice?.textToSpeech);
  const voiceAvailable = Boolean(activeVoiceProvider);
  const voiceAssets = useMemo(
    () => assets.filter((asset) => asset.media_type === "voice" || asset.media_type === "audio").slice(0, 12),
    [assets],
  );
  const voiceJobs = useMemo(
    () => jobs.filter((job) => job.media_type === "voice" || job.media_type === "audio").slice(0, 12),
    [jobs],
  );
  const stats = useMemo(() => ({
    characters: script.length,
    words: wordCount(script),
    duration: estimatedDuration(script, speed),
  }), [script, speed]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const failures: string[] = [];
    await Promise.all([
      readJson<{ capabilities: ProviderCapabilities[] }>("/api/media/providers/capabilities")
        .then((result) => setCapabilities(result.capabilities))
        .catch((caught) => failures.push(`Provider: ${caught instanceof Error ? caught.message : String(caught)}`)),
      readJson<{ assets: MediaAsset[] }>("/api/media/assets?limit=60")
        .then((result) => setAssets(result.assets))
        .catch((caught) => failures.push(`Lydfiler: ${caught instanceof Error ? caught.message : String(caught)}`)),
      readJson<{ jobs: MediaJob[] }>("/api/media/jobs?limit=60")
        .then((result) => setJobs(result.jobs))
        .catch((caught) => failures.push(`Jobber: ${caught instanceof Error ? caught.message : String(caught)}`)),
    ]);
    setError(failures.join(" · "));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const applyPreset = (id: string) => {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setPresetId(id);
    setUseCase(preset.useCase);
    setTone(preset.tone);
    setSpeed(preset.speed);
    setPauseStyle(preset.pauseStyle);
    setTargetDurationSeconds(preset.duration);
  };

  const improveScript = async (action: ScriptAction) => {
    setBusy(`script-${action}`);
    setError("");
    setNotice("");
    try {
      const result = await readJson<{
        script: string;
        truncated: boolean;
        stats: { characters: number; words: number; estimatedDurationSeconds: number };
      }>("/api/media/voice/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          script,
          brief,
          language,
          tone,
          useCase,
          targetDurationSeconds,
          brandId,
          pronunciationGuide: pronunciationGuide || undefined,
        }),
      });
      setScript(result.script);
      setNotice(result.truncated
        ? "Manuset ble forbedret og tilpasset grensen for én lydgenerering."
        : `Manuset er klart: ${result.stats.words} ord, omtrent ${durationLabel(result.stats.estimatedDurationSeconds)}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke forbedre manuset.");
    } finally {
      setBusy(null);
    }
  };

  const voiceInstructions = useMemo(() => [
    tone.trim(),
    pauseStyle.trim(),
    pronunciationGuide.trim() ? `Pronunciation guide: ${pronunciationGuide.trim()}` : "",
    "Speak naturally in the selected language. Do not read instructions, metadata or punctuation aloud.",
  ].filter(Boolean).join(" "), [pauseStyle, pronunciationGuide, tone]);

  const generateVoice = async () => {
    setBusy("generate");
    setError("");
    setNotice("");
    try {
      if (!voiceAvailable) throw new Error(openai?.errorMessage || "Ingen aktiv text-to-speech-provider er konfigurert.");
      if (script.trim().length < 3) throw new Error("Manuset er tomt.");
      if (script.length > 4_096) throw new Error("Manuset kan være maksimalt 4096 tegn per lydfil. Bruk «Kort ned» eller del manuset i flere deler.");

      const planResult = await readJson<{ plan: MediaPromptPlan }>("/api/media/create-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: script,
          mode: "professional",
          mediaType: "voice",
          useCase,
          brandId,
          qualityTier,
          voiceLanguage: language,
          voiceId,
          voiceTone: voiceInstructions,
          voiceSpeed: speed,
          outputFormat,
        }),
      });

      const jobResult = await readJson<{ job: MediaJob }>("/api/media/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planResult.plan,
          brandId,
          sourceImageUrls: [],
          autoExportToContentHub: autoExport,
          idempotencyKey: `${crypto.randomUUID()}-voice`,
        }),
      });

      setJobs((current) => [jobResult.job, ...current.filter((item) => item.id !== jobResult.job.id)]);
      if (jobResult.job.status === "failed") {
        throw new Error(jobResult.job.error_message || "Voice-jobben feilet.");
      }
      setNotice(jobResult.job.status === "completed"
        ? "Lydfilen er ferdig og lagret i Media Library."
        : "Voice-jobben er startet. Status oppdateres i jobblisten.");
      window.setTimeout(() => void loadAll(), 700);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke generere voice-over.");
    } finally {
      setBusy(null);
    }
  };

  const exportAsset = async (assetId: string) => {
    setBusy(`export-${assetId}`);
    setError("");
    try {
      await readJson(`/api/media/assets/${assetId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const exportedAt = new Date().toISOString();
      setAssets((current) => current.map((asset) => asset.id === assetId
        ? { ...asset, exported_to_content_hub_at: exportedAt }
        : asset));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke sende lydfilen til Content Hub.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/media-studio" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
            <ArrowLeft size={15} /> Tilbake til AI Media Studio
          </Link>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <Mic2 className="text-primary-400" size={28} /> Voice Studio Pro
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Skriv, forbedre og produser flerspråklig voice-over med stil, uttale, tempo, pauser og undertekster.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant={statusVariant(openai?.status)}>OpenAI Voice: {openai?.status || "unknown"}</Badge>
            <Badge variant="outline">Voice cloning: av</Badge>
            <Badge variant="outline">{stats.words} ord</Badge>
            <Badge variant="outline">ca. {durationLabel(stats.duration)}</Badge>
          </div>
        </div>
        <Button variant="outline" onClick={() => void loadAll()} disabled={loading} className="gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Oppdater
        </Button>
      </div>

      {!voiceAvailable && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Lydgenerering er ikke aktivert i produksjon</p>
              <p className="mt-1 text-red-100/80">{openai?.errorMessage || "OPENAI_API_KEY mangler i Vercel."}</p>
              <p className="mt-2 text-xs text-red-100/70">AI-manus, stilvalg, beregnet spilletid og undertekstfiler fungerer fortsatt. Selve lydfilen kan genereres straks den server-side API-nøkkelen er konfigurert.</p>
            </div>
          </div>
        </div>
      )}

      {error && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100"><AlertCircle size={15} className="mr-2 inline" />{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100"><CheckCircle2 size={15} className="mr-2 inline" />{notice}</div>}

      <div className="grid gap-5 xl:grid-cols-[0.78fr_1.35fr_0.87fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles size={17} className="text-primary-400" />Voice-stil</CardTitle>
              <CardDescription>Velg et utgangspunkt og finjuster uttrykket.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {presets.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${presetId === preset.id ? "border-primary-400 bg-primary-500/10" : "border-slate-700 bg-slate-900/40 hover:border-slate-600"}`}
                >
                  <p className="text-sm font-medium text-slate-100">{preset.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{preset.description}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Produksjonsvalg</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <SelectField label="Brand" value={brandId} onChange={setBrandId} options={BRANDS.map((brand) => ({ value: brand.id, label: brand.name }))} />
              <SelectField label="Språk" value={language} onChange={setLanguage} options={languages.map((value) => ({ value, label: value }))} />
              <SelectField label="Stemme" value={voiceId} onChange={setVoiceId} options={voices} />
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Format" value={outputFormat} onChange={(value) => setOutputFormat(value as VoiceFormat)} options={["mp3", "wav", "aac", "opus", "flac"].map((value) => ({ value, label: value.toUpperCase() }))} />
                <SelectField label="Kvalitet" value={qualityTier} onChange={(value) => setQualityTier(value as QualityTier)} options={[{ value: "fast", label: "Rask" }, { value: "balanced", label: "Balansert" }, { value: "premium", label: "Premium" }]} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-400"><span>Hastighet</span><span>{speed.toFixed(2)}×</span></div>
                <input type="range" min={0.7} max={1.35} step={0.01} value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="w-full" />
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-300">
                <input type="checkbox" checked={autoExport} onChange={(event) => setAutoExport(event.target.checked)} />
                Send automatisk til Content Hub
              </label>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wand2 size={17} className="text-primary-400" />AI-manus</CardTitle>
              <CardDescription>Lag et nytt manus fra en brief eller forbedre teksten du allerede har.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Idé eller brief</label>
                <textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={3} maxLength={4_000} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-slate-100 outline-none focus:border-primary-400" />
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton label="Lag manus" action="create" busy={busy} onClick={improveScript} />
                <ActionButton label="Gjør mer muntlig" action="rewrite" busy={busy} onClick={improveScript} />
                <ActionButton label="Kort ned" action="shorten" busy={busy} onClick={improveScript} />
                <ActionButton label="Utvid" action="expand" busy={busy} onClick={improveScript} />
                <ActionButton label={`Oversett til ${language}`} action="translate" busy={busy} onClick={improveScript} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-400"><span>Ferdig manus</span><span>{script.length}/4096</span></div>
                <textarea value={script} onChange={(event) => setScript(event.target.value)} rows={13} maxLength={4_096} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm leading-6 text-slate-100 outline-none focus:border-primary-400" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Tegn" value={stats.characters.toLocaleString("nb-NO")} />
                <Stat label="Ord" value={stats.words.toLocaleString("nb-NO")} />
                <Stat label="Spilletid" value={durationLabel(stats.duration)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Regi, pauser og uttale</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Stemmeinstruksjoner</label>
                <textarea value={tone} onChange={(event) => setTone(event.target.value)} rows={3} maxLength={500} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Pause- og rytmestil</label>
                <input value={pauseStyle} onChange={(event) => setPauseStyle(event.target.value)} maxLength={500} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Uttaleveiledning</label>
                <textarea value={pronunciationGuide} onChange={(event) => setPronunciationGuide(event.target.value)} rows={3} maxLength={1_000} placeholder="Eksempel: Altea uttales Al-te-a. Doña Anna uttales Donja Anna." className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </div>
              <Button onClick={() => void generateVoice()} disabled={!voiceAvailable || busy === "generate" || script.trim().length < 3} className="w-full gap-2">
                {busy === "generate" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                Generer og lagre voice-over
              </Button>
              <p className="text-center text-[11px] text-slate-500">AI-generert lyd skal ikke fremstilles som en ekte persons innspilling. Stemme-kloning er deaktivert.</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText size={17} className="text-primary-400" />Undertekster</CardTitle>
              <CardDescription>Estimerte tidskoder basert på manus og valgt tempo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full gap-2" disabled={!script.trim()} onClick={() => downloadText("voice-over.srt", buildSubtitles(script, speed, "srt"), "application/x-subrip")}><Download size={15} />Last ned SRT</Button>
              <Button variant="outline" className="w-full gap-2" disabled={!script.trim()} onClick={() => downloadText("voice-over.vtt", buildSubtitles(script, speed, "vtt"), "text/vtt")}><Download size={15} />Last ned VTT</Button>
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-3 text-xs text-sky-100">Tidskodene er beregnet. Finjuster dem mot den ferdige lydfilen før publisering av video.</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 size={17} />Mållengde</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <SelectField label="Ønsket lengde for AI-manus" value={String(targetDurationSeconds)} onChange={(value) => setTargetDurationSeconds(Number(value))} options={[15, 30, 45, 60, 90, 120, 180, 240].map((value) => ({ value: String(value), label: durationLabel(value) }))} />
              <p className="text-xs text-slate-500">AI-manus tilpasses ønsket varighet, men én OpenAI TTS-generering er begrenset til 4096 tegn.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Languages size={17} />Aktiv provider</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-slate-400">Provider</span><span className="text-slate-100">{activeVoiceProvider?.displayName || "Ingen"}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Status</span><Badge variant={statusVariant(activeVoiceProvider?.status || openai?.status)}>{activeVoiceProvider?.status || openai?.status || "unknown"}</Badge></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Kloning</span><span className="text-slate-100">Deaktivert</span></div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle>Nylige lydfiler</CardTitle><CardDescription>{voiceAssets.length} voice-assets fra Media Library</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {voiceAssets.map((asset) => (
              <div key={asset.id} className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-100">{asset.title || "AI voice-over"}</p><p className="text-xs text-slate-500">{asset.provider || "provider"} · {asset.mime_type || "audio"}</p></div>
                  {asset.exported_to_content_hub_at && <Badge variant="success"><BadgeCheck size={12} className="mr-1" />I Hub</Badge>}
                </div>
                {asset.public_url && <audio src={asset.public_url} controls preload="metadata" className="mt-4 w-full" />}
                <div className="mt-3 flex flex-wrap gap-2">
                  {asset.public_url && <Button asChild size="sm" variant="ghost" className="gap-1.5"><a href={asset.public_url} download target="_blank" rel="noreferrer"><Download size={13} />Last ned</a></Button>}
                  <Button size="sm" variant={asset.exported_to_content_hub_at ? "secondary" : "outline"} disabled={Boolean(asset.exported_to_content_hub_at) || busy === `export-${asset.id}`} onClick={() => void exportAsset(asset.id)} className="gap-1.5">
                    {busy === `export-${asset.id}` ? <Loader2 size={13} className="animate-spin" /> : asset.exported_to_content_hub_at ? <CheckCircle2 size={13} /> : <Send size={13} />}
                    {asset.exported_to_content_hub_at ? "I Content Hub" : "Content Hub"}
                  </Button>
                </div>
              </div>
            ))}
            {voiceAssets.length === 0 && <p className="text-sm text-slate-500">Ingen lydfiler er generert ennå.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Voice-jobber</CardTitle><CardDescription>Siste produksjonsforsøk og status.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {voiceJobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="line-clamp-2 text-sm text-slate-100">{job.original_request}</p><p className="mt-1 text-xs text-slate-500">{new Date(job.created_at).toLocaleString("nb-NO")} · {job.provider}</p></div><Badge variant={statusVariant(job.status)}>{job.status}</Badge></div>
                {job.error_message && <p className="mt-2 text-xs text-red-300">{job.error_message}</p>}
                {job.result_assets_json?.[0]?.public_url && <audio src={job.result_assets_json[0].public_url || ""} controls preload="metadata" className="mt-3 w-full" />}
              </div>
            ))}
            {voiceJobs.length === 0 && <p className="text-sm text-slate-500">Ingen voice-jobber ennå.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-primary-400">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

function ActionButton({ label, action, busy, onClick }: { label: string; action: ScriptAction; busy: string | null; onClick: (action: ScriptAction) => Promise<void> }) {
  const active = busy === `script-${action}`;
  return <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void onClick(action)} className="gap-1.5">{active ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{label}</Button>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-center"><div className="text-sm font-semibold text-slate-100">{value}</div><div className="mt-1 text-[11px] text-slate-500">{label}</div></div>;
}
