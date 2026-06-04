"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FileText, Plus, Save, Trash2, RefreshCw, Loader2, Image as ImageIcon, ExternalLink } from "lucide-react";

interface Post {
  id?: string;
  brand_id: string;
  destination_id: string;
  destination_label: string;
  destination_path: string;
  content_type: string;
  title: string;
  slug: string;
  summary: string;
  markdown: string;
  image_url: string | null;
  tags: string[] | string;
  status: string;
  published_at: string | null;
  updated_at?: string;
}

const BRANDS = ["zeneco", "soleada", "pinosoecolife", "donaanna", "chatgenius", "freddyb", "freddypublishing"];
const STATUSES = ["draft", "published", "archived"];
const EMPTY: Post = {
  brand_id: "zeneco",
  destination_id: "magasin",
  destination_label: "Magasin",
  destination_path: "/magasin",
  content_type: "article",
  title: "",
  slug: "",
  summary: "",
  markdown: "",
  image_url: "",
  tags: "",
  status: "draft",
  published_at: null,
};

function statusBadge(s: string) {
  const map: Record<string, string> = {
    published: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    draft: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    archived: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  };
  return <Badge className={`border ${map[s] || map.draft}`}>{s}</Badge>;
}

export default function WebsiteCmsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Post | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/website-posts", { cache: "no-store" });
      if (res.ok) setPosts((await res.json()).posts || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      posts.filter(
        (p) =>
          (brandFilter === "all" || p.brand_id === brandFilter) &&
          (statusFilter === "all" || p.status === statusFilter),
      ),
    [posts, brandFilter, statusFilter],
  );

  function startEdit(p: Post) {
    setMsg(null);
    setEditing({ ...p, tags: Array.isArray(p.tags) ? p.tags.join(", ") : p.tags || "" });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setMsg(null);
    try {
      const method = editing.id ? "PATCH" : "POST";
      const res = await fetch("/api/website-posts", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      const j = await res.json();
      if (res.ok) {
        setMsg("Lagret ✓");
        setEditing(null);
        await load();
      } else {
        setMsg(`Feil: ${j.error}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id?: string) {
    if (!id || !confirm("Slette denne artikkelen permanent?")) return;
    const res = await fetch("/api/website-posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setEditing(null);
      await load();
    }
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/website-posts/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (res.ok) setEditing((e) => (e ? { ...e, image_url: j.url } : e));
      else setMsg(`Opplasting feilet: ${j.error}`);
    } finally {
      setUploading(false);
    }
  }

  const set = (patch: Partial<Post>) => setEditing((e) => (e ? { ...e, ...patch } : e));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="text-cyan-400" /> Publisert innhold (CMS)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Alt nettside-innhold på tvers av merker. Rediger, bytt merke/destinasjon, legg til bilde, publiser eller slett.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Oppdater
          </Button>
          <Button onClick={() => startEdit({ ...EMPTY })}>
            <Plus className="w-4 h-4 mr-2" /> Ny artikkel
          </Button>
        </div>
      </div>

      {msg && <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">{msg}</div>}

      <div className="flex gap-3 flex-wrap">
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm">
          <option value="all">Alle merker</option>
          {BRANDS.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm">
          <option value="all">Alle statuser</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-slate-400 text-sm self-center">{filtered.length} av {posts.length}</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Liste */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Artikler</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !posts.length ? (
              <div className="text-slate-400 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Laster…</div>
            ) : !filtered.length ? (
              <div className="text-slate-400 text-sm">Ingen artikler.</div>
            ) : (
              <div className="space-y-2">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => startEdit(p)}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                      editing?.id === p.id ? "border-cyan-500/50 bg-cyan-500/5" : "border-white/10 hover:bg-slate-700/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm line-clamp-1">{p.title || "(uten tittel)"}</span>
                      {statusBadge(p.status)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex gap-2 flex-wrap">
                      <span className="text-slate-400">{p.brand_id}</span>·
                      <span>{p.destination_label}</span>·
                      <span>/{p.slug}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Editor */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing ? (editing.id ? "Rediger" : "Ny artikkel") : "Velg en artikkel"}</CardTitle>
          </CardHeader>
          <CardContent>
            {!editing ? (
              <div className="text-slate-400 text-sm">Klikk en artikkel i listen, eller «Ny artikkel».</div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className="text-slate-400">Tittel</span>
                  <Input value={editing.title} onChange={(e) => set({ title: e.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="text-slate-400">Slug</span>
                    <Input value={editing.slug} onChange={(e) => set({ slug: e.target.value })} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-400">Merke</span>
                    <select value={editing.brand_id} onChange={(e) => set({ brand_id: e.target.value })} className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1">
                      {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <label className="block text-sm">
                    <span className="text-slate-400">Destinasjon-id</span>
                    <Input value={editing.destination_id} onChange={(e) => set({ destination_id: e.target.value })} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-400">Destinasjon-navn</span>
                    <Input value={editing.destination_label} onChange={(e) => set({ destination_label: e.target.value })} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-400">Sti</span>
                    <Input value={editing.destination_path} onChange={(e) => set({ destination_path: e.target.value })} />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="text-slate-400">Sammendrag</span>
                  <textarea value={editing.summary} onChange={(e) => set({ summary: e.target.value })} rows={2} className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1" />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-400">Innhold (markdown)</span>
                  <textarea value={editing.markdown} onChange={(e) => set({ markdown: e.target.value })} rows={10} className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1 font-mono" />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-400 flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" /> Bilde-URL</span>
                  <Input value={editing.image_url || ""} onChange={(e) => set({ image_url: e.target.value })} placeholder="https://… eller last opp under" />
                </label>
                <div className="text-sm flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadImage(f);
                    }}
                    className="text-xs text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-slate-200"
                  />
                  {uploading && (
                    <span className="text-cyan-400 text-xs inline-flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Laster opp…
                    </span>
                  )}
                </div>
                {editing.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editing.image_url} alt="" className="rounded-lg max-h-40 border border-white/10" />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="text-slate-400">Tags (komma)</span>
                    <Input value={editing.tags as string} onChange={(e) => set({ tags: e.target.value })} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-400">Status</span>
                    <select value={editing.status} onChange={(e) => set({ status: e.target.value })} className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1">
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  <div className="flex gap-2">
                    <Button onClick={save} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Lagre
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(null)}>Avbryt</Button>
                  </div>
                  {editing.id && (
                    <Button variant="outline" onClick={() => remove(editing.id)} className="text-red-400 border-red-500/30 hover:bg-red-500/10">
                      <Trash2 className="w-4 h-4 mr-2" /> Slett
                    </Button>
                  )}
                </div>
                {editing.destination_path && editing.slug && (
                  <a
                    href={`https://www.zenecohomes.com${editing.destination_path}/${editing.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 text-xs inline-flex items-center gap-1"
                  >
                    Se på nettsiden <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
