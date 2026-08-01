"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Video,
  Volume2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface MediaAsset {
  id: string;
  title?: string | null;
  media_type: string;
  mime_type?: string | null;
  public_url?: string | null;
  thumbnail_url?: string | null;
  provider?: string | null;
  created_at: string;
}

interface BridgeOption {
  model: string;
  label: string;
  description: string;
  mode: string;
  modeDescription: string;
  supportsAudioReference: boolean;
  supportsVisualReference: boolean;
}

interface MediaJob {
  id: string;
  status: string;
  progress: number;
  provider: string;
  model?: string | null;
  error_message?: string | null;
  result_assets_json?: MediaAsset[];
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

function statusVariant(status?: string) {
  if (status === "completed" || status === "available") return "success" as const;
  if (status === "failed" || status === "cancelled") return "destructive" as const;
  if (["queued", "submitted", "processing"].includes(status || "")) return "warning" as const;
  return "secondary" as const;
}

export function OpenArtVoiceBridgePanel() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [options, setOptions] = useState<BridgeOption[]>([]);
  const [rawModelModeCount, setRawModelModeCount] = useState(0);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshingOptions, setRefreshingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [job, setJob] = useState<MediaJob | null>(null);

  const [audioAssetId, setAudioAssetId] = useState("");
  const [visualAssetId, setVisualAssetId] = useState("");
  const [optionKey, setOptionKey] = useState("");
  const [prompt, setPrompt] = useState("Create a natural talking presentation with accurate lip movement, subtle facial expression and realistic head motion. Preserve the person's identity and the original visual composition.");
  const [durationSeconds, setDurationSeconds] = useState(15);
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [autoExport, setAutoExport] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);

  const audioAssets = useMemo(
    () => assets.filter((asset) => /voice|audio/.test(asset.media_type)),
    [assets],
  );
  const visualAssets = useMemo(
    () => assets.filter((asset) => /image|video|avatar/.test(asset.media_type)),
    [assets],
  );
  const selectedAudio = audioAssets.find((asset) => asset.id === audioAssetId);
  const selectedVisual = visualAssets.find((asset) => asset.id === visualAssetId);
  const selectedOption = options.find((option) => `${option.model}::${option.mode}` === optionKey);
  const resultAsset = job?.result_assets_json?.[0];

  const loadAssets = useCallback(async () => {
    const result = await readJson<{ assets: MediaAsset[] }>("/api/media/assets?limit=100");
    setAssets(result.assets || []);
    setAudioAssetId((current) => current || result.assets.find((asset) => /voice|audio/.test(asset.media_type))?.id || "");
    setVisualAssetId((current) => current || result.assets.find((asset) => /image|video|avatar/.test(asset.media_type))?.id || "");
  }, []);

  const loadOptions = useCallback(async (force = false) => {
    setRefreshingOptions(true);
    try {
      const result = await readJson<{
        available: boolean;
        rawModelModeCount: number;
        options: BridgeOption[];
        message?: string;
      }>(`/api/media/openart/voice-bridge/options${force ? "?refresh=true" : ""}`);
      setOptions(result.options || []);
      setRawModelModeCount(result.rawModelModeCount || 0);
      setAvailabilityMessage(result.message || "");
      setOptionKey((current) => current || (result.options[0] ? `${result.options[0].model}::${result.options[0].mode}` : ""));
    } finally {
      setRefreshingOptions(false);
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError("");
    const failures: string[] = [];
    await Promise.all([
      loadAssets().catch((caught) => failures.push(caught instanceof Error ? caught.message : String(caught))),
      loadOptions().catch((caught) => failures.push(caught instanceof Error ? caught.message : String(caught))),
    ]);
    setError(failures.join(" · "));
    setLoading(false);
  }, [loadAssets, loadOptions]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!job || ["completed", "failed", "cancelled", "expired"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await readJson<{ job: MediaJob }>(`/api/media/jobs/${job.id}`);
        setJob(result.job);
        if (result.job.status === "completed") {
          setNotice("OpenArt-videoen er ferdig og lagret i Media Library.");
          await loadAssets();
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Kunne ikke oppdatere OpenArt-jobben.");
      }
    }, 6_000);
    return () => window.clearInterval(timer);
  }, [job, loadAssets]);

  const generate = async () => {
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      if (!audioAssetId) throw new Error("Velg en ferdig lydfil fra Voice Studio eller Media Library.");
      if (!visualAssetId) throw new Error("Velg et bilde, en video eller en avatar.");
      if (!selectedOption) throw new Error("Ingen kompatibel OpenArt-modell er valgt.");
      if (!consentConfirmed) throw new Error("Bekreft rettigheter og samtykke før generering.");

      const result = await readJson<{ job: MediaJob }>("/api/media/openart/voice-bridge/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioAssetId,
          visualAssetId,
          model: selectedOption.model,
          mode: selectedOption.mode,
          prompt,
          durationSeconds,
          resolution,
          aspectRatio,
          autoExportToContentHub: autoExport,
          consentConfirmed: true,
          idempotencyKey: `${crypto.randomUUID()}-openart-voice`,
        }),
      });
      setJob(result.job);
      setNotice("Lyd og visuelt materiale er sendt til OpenArt. Jobben oppdateres automatisk.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke starte OpenArt-jobben.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card id="openart-voice-bridge" className="border-fuchsia-500/25 bg-gradient-to-br from-slate-950 via-slate-950 to-fuchsia-950/20">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Sparkles size={18} className="text-fuchsia-300" />Voice → OpenArt Bridge</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              Kombiner en ferdig Voice Studio-lydfil med et bilde eller en video. RealtyFlow bruker bare OpenArt-modeller som dynamisk rapporterer støtte for både lyd- og visuelle referanser.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={options.length ? "success" : "warning"}>{options.length} kompatible valg</Badge>
            <Badge variant="outline">{rawModelModeCount} analyserte model/mode-par</Badge>
            <Button size="sm" variant="outline" disabled={refreshingOptions} onClick={() => void loadOptions(true)} className="gap-2">
              {refreshingOptions ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Oppdater OpenArt
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" />Kartlegger OpenArt-modeller og Media Library...</div>}
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100"><AlertCircle size={15} className="mr-2 inline" />{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100"><CheckCircle2 size={15} className="mr-2 inline" />{notice}</div>}

        {!loading && options.length === 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-semibold">Ingen kompatibel OpenArt lip-sync/audio-reference-modell ble funnet gjennom MCP.</p>
            <p className="mt-1 text-amber-100/80">{availabilityMessage || "OpenArt-tilkoblingen har upload-støtte, men den aktive modellisten annonserer ikke en trygg kombinasjon av lyd og visuelt referansemateriale."}</p>
            <p className="mt-2 text-xs text-amber-100/70">Ingen kreditter brukes ved denne kontrollen. Når OpenArt eksponerer en kompatibel modell eller mode, dukker den automatisk opp her.</p>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr_0.95fr]">
          <div className="space-y-3">
            <label className="text-xs font-medium text-slate-300">1. Lyd fra Voice Studio</label>
            <select value={audioAssetId} onChange={(event) => setAudioAssetId(event.target.value)} className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100">
              <option value="">Velg lydfil</option>
              {audioAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title || "AI voice-over"} · {asset.provider || "provider"}</option>)}
            </select>
            {selectedAudio?.public_url ? (
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-400"><Volume2 size={14} />{selectedAudio.mime_type || "audio"}</div>
                <audio src={selectedAudio.public_url} controls preload="metadata" className="w-full" />
              </div>
            ) : <EmptyState icon={<Volume2 size={18} />} text="Generer eller importer en lydfil først." />}
          </div>

          <div className="space-y-3">
            <label className="text-xs font-medium text-slate-300">2. Bilde, video eller avatar</label>
            <select value={visualAssetId} onChange={(event) => setVisualAssetId(event.target.value)} className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100">
              <option value="">Velg visuelt motiv</option>
              {visualAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title || asset.media_type} · {asset.media_type}</option>)}
            </select>
            {selectedVisual?.public_url ? (
              <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900/50">
                {selectedVisual.media_type === "video"
                  ? <video src={selectedVisual.public_url} controls preload="metadata" className="aspect-video w-full object-contain" />
                  : <img src={selectedVisual.thumbnail_url || selectedVisual.public_url} alt={selectedVisual.title || "Visual reference"} className="aspect-video w-full object-contain" />}
              </div>
            ) : <EmptyState icon={<ImageIcon size={18} />} text="Velg et bilde eller en video fra Media Library." />}
          </div>

          <div className="space-y-3">
            <label className="text-xs font-medium text-slate-300">3. OpenArt-modell</label>
            <select value={optionKey} onChange={(event) => setOptionKey(event.target.value)} disabled={!options.length} className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 disabled:opacity-50">
              <option value="">Velg kompatibel modell</option>
              {options.map((option) => <option key={`${option.model}:${option.mode}`} value={`${option.model}::${option.mode}`}>{option.label || option.model} · {option.mode}</option>)}
            </select>
            {selectedOption && (
              <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/10 p-3 text-xs text-fuchsia-100">
                <p className="font-medium">{selectedOption.model}</p>
                <p className="mt-1 text-fuchsia-100/75">{selectedOption.modeDescription || selectedOption.description || "OpenArt audio + visual reference mode"}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <SelectField label="Varighet" value={String(durationSeconds)} onChange={(value) => setDurationSeconds(Number(value))} options={[5, 10, 15, 30, 60, 90, 120].map((value) => ({ value: String(value), label: `${value} sek` }))} />
              <SelectField label="Oppløsning" value={resolution} onChange={setResolution} options={[{ value: "540p", label: "540p" }, { value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }]} />
            </div>
            <SelectField label="Format" value={aspectRatio} onChange={setAspectRatio} options={[{ value: "16:9", label: "16:9 liggende" }, { value: "9:16", label: "9:16 vertikal" }, { value: "1:1", label: "1:1 kvadrat" }]} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">Bevegelse og videoinstruksjon</label>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} maxLength={4_096} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm leading-6 text-slate-100 outline-none focus:border-fuchsia-400" />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-2">
            <label className="flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-xs text-slate-300">
              <input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} className="mt-0.5" />
              <span>Jeg bekrefter at jeg har rettigheter og nødvendig samtykke til både stemmen/lyden og personen eller materialet i bildet/videoen.</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={autoExport} onChange={(event) => setAutoExport(event.target.checked)} /> Send ferdig video automatisk til Content Hub
            </label>
          </div>
          <Button onClick={() => void generate()} disabled={submitting || !options.length || !audioAssetId || !visualAssetId || !consentConfirmed} className="h-11 gap-2 bg-fuchsia-600 hover:bg-fuchsia-500">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Lag OpenArt-video
          </Button>
        </div>

        {job && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">OpenArt-jobb</p>
                <p className="mt-1 text-xs text-slate-500">{job.model || selectedOption?.model || "OpenArt"} · {job.progress || 0}%</p>
              </div>
              <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-fuchsia-400 transition-all" style={{ width: `${Math.min(100, Math.max(3, job.progress || 0))}%` }} /></div>
            {job.error_message && <p className="mt-3 text-sm text-red-300">{job.error_message}</p>}
            {resultAsset?.public_url && (
              <div className="mt-4 space-y-3">
                <video src={resultAsset.public_url} controls preload="metadata" className="aspect-video w-full rounded-lg bg-black object-contain" />
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline" className="gap-2"><a href={resultAsset.public_url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Åpne video</a></Button>
                  <Button asChild size="sm" variant="outline" className="gap-2"><a href="/media-studio"><Video size={14} />Media Library</a></Button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] text-slate-500">OpenArt-modeller og inputskjema kontrolleres dynamisk før generering. Funksjonen sender ikke lyd til en tilfeldig image-to-video-modell og bruker ikke voice cloning.</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex min-h-28 items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-4 text-center text-xs text-slate-500">{icon}{text}</div>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <div><label className="mb-1 block text-[11px] text-slate-500">{label}</label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}
