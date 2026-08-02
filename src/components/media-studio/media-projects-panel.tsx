"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { BRANDS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface MediaProject {
  id: string;
  name: string;
  description?: string | null;
  project_type?: string | null;
  brand_id?: string | null;
  status: string;
  updated_at: string;
}

interface MediaAsset {
  id: string;
  title?: string | null;
  media_type: string;
  public_url?: string | null;
  thumbnail_url?: string | null;
  provider?: string | null;
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
}

function messageFrom(data: unknown, status: number) {
  if (data && typeof data === "object") {
    const row = data as { error?: string | { message?: string }; message?: string };
    if (typeof row.error === "string") return row.error;
    if (row.error && typeof row.error === "object" && row.error.message) return row.error.message;
    if (row.message) return row.message;
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
  if (["active", "completed", "available"].includes(status)) return "success" as const;
  if (["failed", "cancelled"].includes(status)) return "destructive" as const;
  if (["draft", "review", "queued", "submitted", "processing"].includes(status)) return "warning" as const;
  return "secondary" as const;
}

function brandName(id?: string | null) {
  return BRANDS.find((brand) => brand.id === id)?.name || id || "Uten brand";
}

export function MediaProjectsPanel() {
  const [projects, setProjects] = useState<MediaProject[]>([]);
  const [selected, setSelected] = useState<MediaProject | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await readJson<{ projects: MediaProject[] }>("/api/media/projects");
      setProjects(result.projects || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke laste prosjekter.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const openProject = async (project: MediaProject) => {
    setSelected(project);
    setName(project.name);
    setDescription(project.description || "");
    setEditing(false);
    setDetailLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await readJson<{ project: MediaProject; assets: MediaAsset[]; jobs: MediaJob[] }>(`/api/media/projects/${project.id}`);
      setSelected(result.project);
      setName(result.project.name);
      setDescription(result.project.description || "");
      setAssets(result.assets || []);
      setJobs(result.jobs || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke åpne prosjektet.");
    } finally {
      setDetailLoading(false);
    }
  };

  const saveProject = async () => {
    if (!selected) return;
    setBusy("save");
    setError("");
    try {
      const result = await readJson<{ project: MediaProject }>(`/api/media/projects/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      setSelected(result.project);
      setProjects((current) => current.map((project) => project.id === result.project.id ? result.project : project));
      setEditing(false);
      setNotice("Prosjektet er oppdatert.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke lagre prosjektet.");
    } finally {
      setBusy(null);
    }
  };

  const deleteProject = async () => {
    if (!selected) return;
    if (!window.confirm(`Slette prosjektet «${selected.name}»? Genererte bilder, videoer og lydfiler beholdes i Media Library.`)) return;
    setBusy("delete");
    setError("");
    try {
      await readJson(`/api/media/projects/${selected.id}`, { method: "DELETE" });
      setProjects((current) => current.filter((project) => project.id !== selected.id));
      setSelected(null);
      setAssets([]);
      setJobs([]);
      setNotice("Prosjektet er slettet. Mediefilene er beholdt i Media Library.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke slette prosjektet.");
    } finally {
      setBusy(null);
    }
  };

  if (selected) {
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)} className="mb-2 -ml-2 gap-1.5"><ArrowLeft size={14} />Tilbake til prosjekter</Button>
              {editing ? (
                <div className="space-y-2">
                  <input value={name} onChange={(event) => setName(event.target.value)} maxLength={180} className="h-10 w-full max-w-xl rounded-lg border border-slate-700 bg-slate-900 px-3 text-lg font-semibold text-white" />
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={2000} className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200" />
                </div>
              ) : (
                <>
                  <CardTitle className="flex flex-wrap items-center gap-2"><FolderOpen size={19} className="text-primary-300" />{selected.name}<Badge variant={statusVariant(selected.status)}>{selected.status}</Badge></CardTitle>
                  <CardDescription className="mt-2">{selected.project_type || "general"} · {brandName(selected.brand_id)}{selected.description ? ` · ${selected.description}` : ""}</CardDescription>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {editing ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Avbryt</Button>
                  <Button size="sm" onClick={() => void saveProject()} disabled={busy === "save" || name.trim().length < 2} className="gap-1.5">{busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Lagre</Button>
                </>
              ) : <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1.5"><Pencil size={14} />Rediger</Button>}
              <Button size="sm" variant="outline" onClick={() => void deleteProject()} disabled={busy === "delete"} className="gap-1.5 border-red-500/40 text-red-200 hover:bg-red-500/10">
                {busy === "delete" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Slett prosjekt
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && <p className="rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
          {notice && <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p>}
          {detailLoading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" />Laster prosjektinnhold ...</div> : (
            <>
              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-200">Mediefiler ({assets.length})</h3>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {assets.map((asset) => (
                    <div key={asset.id} className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900/50">
                      <div className="aspect-video bg-slate-950">
                        {asset.media_type === "image" && asset.public_url ? <img src={asset.thumbnail_url || asset.public_url} alt={asset.title || "Media"} className="h-full w-full object-cover" />
                          : asset.media_type === "video" && asset.public_url ? <video src={asset.public_url} controls preload="metadata" className="h-full w-full object-contain" />
                            : asset.public_url && /voice|audio/.test(asset.media_type) ? <div className="flex h-full items-center p-4"><audio src={asset.public_url} controls preload="metadata" className="w-full" /></div>
                              : <div className="flex h-full items-center justify-center text-slate-600"><ImageIcon size={28} /></div>}
                      </div>
                      <div className="p-3"><p className="truncate text-sm text-slate-100">{asset.title || "AI asset"}</p><p className="text-xs text-slate-500">{asset.media_type} · {asset.provider || "provider"}</p></div>
                    </div>
                  ))}
                  {assets.length === 0 && <p className="text-sm text-slate-500">Ingen mediefiler er knyttet til prosjektet.</p>}
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-200">Jobber ({jobs.length})</h3>
                <div className="space-y-2">
                  {jobs.map((job) => (
                    <div key={job.id} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="line-clamp-2 text-sm text-slate-100">{job.original_request}</p><p className="mt-1 text-xs text-slate-500">{new Date(job.created_at).toLocaleString("nb-NO")} · {job.provider} · {job.media_type}</p></div><Badge variant={statusVariant(job.status)}>{job.status}</Badge></div>
                      {job.error_message && <p className="mt-2 text-xs text-red-300">{job.error_message}</p>}
                    </div>
                  ))}
                  {jobs.length === 0 && <p className="text-sm text-slate-500">Ingen jobber er knyttet til prosjektet.</p>}
                </div>
              </section>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div><CardTitle>Projects</CardTitle><CardDescription>Klikk på et prosjekt for å åpne mediefiler og jobber. Prosjekter kan redigeres eller slettes uten at mediefilene forsvinner.</CardDescription></div>
          <Button size="sm" variant="outline" onClick={() => void loadProjects()} disabled={loading} className="gap-1.5">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Oppdater</Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
        {notice && <p className="mb-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <button key={project.id} type="button" onClick={() => void openProject(project)} className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-left transition hover:border-primary-400/60 hover:bg-slate-900/70">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-medium text-slate-100">{project.name}</h3><p className="text-xs text-slate-500">{project.project_type || "general"} · {brandName(project.brand_id)}</p>{project.description && <p className="mt-2 line-clamp-2 text-xs text-slate-400">{project.description}</p>}</div><Badge variant={statusVariant(project.status)}>{project.status}</Badge></div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-primary-300"><FolderOpen size={13} />Åpne prosjekt</p>
            </button>
          ))}
          {!loading && projects.length === 0 && <p className="text-sm text-slate-500">Ingen prosjekter ennå.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
