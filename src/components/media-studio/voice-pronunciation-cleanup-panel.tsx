"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Volume2,
} from "lucide-react";
import { BRANDS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PronunciationRule {
  id: string;
  brand_id?: string | null;
  language: string;
  term: string;
  pronunciation: string;
  notes?: string | null;
  active: boolean;
}

interface MediaAsset {
  id: string;
  job_id?: string | null;
  title?: string | null;
  media_type: string;
  mime_type?: string | null;
  provider?: string | null;
  public_url?: string | null;
  exported_to_content_hub_at?: string | null;
  created_at: string;
}

interface MediaJob {
  id: string;
  status: string;
  provider: string;
  media_type: string;
  original_request: string;
  error_message?: string | null;
  created_at: string;
  result_assets_json?: MediaAsset[];
}

function messageFrom(data: unknown, status: number) {
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
  if (!response.ok) throw new Error(messageFrom(data, response.status));
  return data as T;
}

function statusVariant(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "destructive" as const;
  if (["queued", "submitted", "processing"].includes(status)) return "warning" as const;
  return "secondary" as const;
}

export function VoicePronunciationCleanupPanel() {
  const [rules, setRules] = useState<PronunciationRule[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [term, setTerm] = useState("Doña Anna");
  const [pronunciation, setPronunciation] = useState("Donja Anna");
  const [language, setLanguage] = useState("Norwegian");
  const [brandId, setBrandId] = useState("");
  const [notes, setNotes] = useState("Merkevarenavn");

  const voiceJobs = useMemo(
    () => jobs.filter((job) => job.media_type === "voice" || job.media_type === "audio"),
    [jobs],
  );
  const orphanVoiceAssets = useMemo(
    () => assets.filter((asset) => (asset.media_type === "voice" || asset.media_type === "audio") && !asset.job_id),
    [assets],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    const failures: string[] = [];
    await Promise.all([
      readJson<{ pronunciations: PronunciationRule[] }>("/api/media/voice/pronunciations?includeInactive=true")
        .then((result) => setRules(result.pronunciations || []))
        .catch((caught) => failures.push(`Uttaleordbok: ${caught instanceof Error ? caught.message : String(caught)}`)),
      readJson<{ assets: MediaAsset[] }>("/api/media/assets?limit=120")
        .then((result) => setAssets(result.assets || []))
        .catch((caught) => failures.push(`Lydfiler: ${caught instanceof Error ? caught.message : String(caught)}`)),
      readJson<{ jobs: MediaJob[] }>("/api/media/jobs?limit=120")
        .then((result) => setJobs(result.jobs || []))
        .catch((caught) => failures.push(`Jobber: ${caught instanceof Error ? caught.message : String(caught)}`)),
    ]);
    setError(failures.join(" · "));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const saveRule = async () => {
    setBusy("save-rule");
    setError("");
    setNotice("");
    try {
      const result = await readJson<{ pronunciation: PronunciationRule }>("/api/media/voice/pronunciations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: brandId || null,
          language,
          term,
          pronunciation,
          notes: notes || null,
          active: true,
        }),
      });
      setRules((current) => [
        result.pronunciation,
        ...current.filter((item) => item.id !== result.pronunciation.id),
      ]);
      setNotice(`«${result.pronunciation.term}» blir nå uttalt som «${result.pronunciation.pronunciation}». Regelen brukes automatisk når ordet finnes i manuset.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke lagre uttaleregelen.");
    } finally {
      setBusy(null);
    }
  };

  const deleteRule = async (id: string) => {
    if (!window.confirm("Slette denne uttaleregelen?")) return;
    setBusy(`rule-${id}`);
    setError("");
    try {
      await readJson(`/api/media/voice/pronunciations/${id}`, { method: "DELETE" });
      setRules((current) => current.filter((item) => item.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke slette uttaleregelen.");
    } finally {
      setBusy(null);
    }
  };

  const deleteJob = async (job: MediaJob) => {
    const hasResult = Boolean(job.result_assets_json?.length);
    const text = hasResult
      ? "Slette både voice-jobben og den tilhørende lydfilen fra Media Studio? En eventuell kopi i Content Hub beholdes."
      : "Slette denne voice-jobben fra listen?";
    if (!window.confirm(text)) return;

    setBusy(`job-${job.id}`);
    setError("");
    try {
      await readJson(`/api/media/jobs/${job.id}?deleteAssets=${hasResult ? "true" : "false"}`, { method: "DELETE" });
      setJobs((current) => current.filter((item) => item.id !== job.id));
      setAssets((current) => current.filter((asset) => asset.job_id !== job.id));
      setNotice(hasResult ? "Voice-jobben og lydfilen er fjernet fra Media Studio." : "Voice-jobben er fjernet fra listen.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke slette voice-jobben.");
    } finally {
      setBusy(null);
    }
  };

  const deleteAsset = async (asset: MediaAsset) => {
    if (!window.confirm("Slette denne lydfilen fra Media Library? En eventuell kopi i Content Hub beholdes.")) return;
    setBusy(`asset-${asset.id}`);
    setError("");
    try {
      await readJson(`/api/media/assets/${asset.id}`, { method: "DELETE" });
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setNotice("Lydfilen er fjernet fra Media Library.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke slette lydfilen.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.15fr]">
      <Card className="border-primary-500/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpenText size={18} className="text-primary-400" />Uttaleordbok</CardTitle>
          <CardDescription>
            Lagre ord, navn og stedsnavn én gang. Reglene legges automatisk til Voice-instruksjonene når uttrykket finnes i manuset.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ord eller navn" value={term} onChange={setTerm} placeholder="Doña Anna" />
            <Field label="Skal uttales som" value={pronunciation} onChange={setPronunciation} placeholder="Donja Anna" />
            <SelectField label="Språk" value={language} onChange={setLanguage} options={["Norwegian", "English", "Spanish", "Swedish", "Danish", "German", "French"].map((value) => ({ value, label: value }))} />
            <SelectField label="Merkevare" value={brandId} onChange={setBrandId} options={[{ value: "", label: "Alle merkevarer" }, ...BRANDS.map((brand) => ({ value: brand.id, label: brand.name }))]} />
          </div>
          <Field label="Notat" value={notes} onChange={setNotes} placeholder="Valgfritt notat" />
          <Button onClick={() => void saveRule()} disabled={busy === "save-rule" || !term.trim() || !pronunciation.trim()} className="gap-2">
            {busy === "save-rule" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}Lagre uttale
          </Button>

          <div className="space-y-2 border-t border-slate-800 pt-4">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-100"><span className="font-medium">{rule.term}</span> → {rule.pronunciation}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                    <span>{rule.language}</span>
                    <span>·</span>
                    <span>{rule.brand_id ? BRANDS.find((brand) => brand.id === rule.brand_id)?.name || rule.brand_id : "Alle merkevarer"}</span>
                    {!rule.active && <Badge variant="secondary">Inaktiv</Badge>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" disabled={busy === `rule-${rule.id}`} onClick={() => void deleteRule(rule.id)} className="shrink-0 text-red-300 hover:text-red-200">
                  {busy === `rule-${rule.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </Button>
              </div>
            ))}
            {!loading && rules.length === 0 && <p className="text-sm text-slate-500">Ingen uttaleregler ennå.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Volume2 size={18} className="text-primary-400" />Rydd voice-listen</CardTitle>
              <CardDescription>Fjern mislykkede forsøk eller lydfiler du ikke vil beholde.</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => void loadAll()} disabled={loading} className="gap-2">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Oppdater
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100"><AlertCircle size={14} className="mr-2 inline" />{error}</div>}
          {notice && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100"><CheckCircle2 size={14} className="mr-2 inline" />{notice}</div>}

          {voiceJobs.map((job) => (
            <div key={job.id} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm text-slate-100">{job.original_request}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(job.created_at).toLocaleString("nb-NO")} · {job.provider}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                  <Button size="sm" variant="ghost" disabled={busy === `job-${job.id}` || ["queued", "submitted", "processing"].includes(job.status)} onClick={() => void deleteJob(job)} className="text-red-300 hover:text-red-200">
                    {busy === `job-${job.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </Button>
                </div>
              </div>
              {job.error_message && <p className="mt-2 line-clamp-3 text-xs text-red-300">{job.error_message}</p>}
              {job.result_assets_json?.[0]?.public_url && <audio src={job.result_assets_json[0].public_url || ""} controls preload="metadata" className="mt-3 w-full" />}
            </div>
          ))}

          {orphanVoiceAssets.map((asset) => (
            <div key={asset.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-100">{asset.title || "Voice asset"}</p>
                <p className="text-xs text-slate-500">Lydfil uten tilknyttet jobb · {asset.provider || "provider"}</p>
              </div>
              <Button size="sm" variant="ghost" disabled={busy === `asset-${asset.id}`} onClick={() => void deleteAsset(asset)} className="text-red-300 hover:text-red-200">
                {busy === `asset-${asset.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </Button>
            </div>
          ))}

          {!loading && voiceJobs.length === 0 && orphanVoiceAssets.length === 0 && <p className="text-sm text-slate-500">Ingen voice-jobber eller løse lydfiler å rydde.</p>}
          <p className="text-[11px] text-slate-500">Sletting fjerner jobben fra listen og markerer tilhørende Media Studio-filer som slettet. Allerede eksporterte Content Hub-kopier beholdes.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div><label className="mb-1 block text-xs text-slate-400">{label}</label><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-primary-400" /></div>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <div><label className="mb-1 block text-xs text-slate-400">{label}</label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-primary-400">{options.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}</select></div>;
}
