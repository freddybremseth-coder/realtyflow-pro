"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { BookOpenCheck, Loader2, Map as MapIcon, Plus, RefreshCw } from "lucide-react";

type Mastery = {
  exposure_score: number | null;
  understanding_score: number | null;
  retention_score: number | null;
  transfer_score: number | null;
  formal_exposure_score: number | null;
  practical_exposure_score: number | null;
  interest_score: number | null;
  evidence_strength: number | null;
  last_assessed_at: string | null;
  next_review_at: string | null;
};

type Domain = { id: string; name: string; description?: string | null };
type Topic = { id: string; domain_id: string; name: string; description?: string | null; metadata?: Record<string, unknown>; mastery: Mastery | null };

type MapResponse = {
  ok: boolean;
  domains: Domain[];
  topics: Topic[];
  semantics: { missingMasteryMeans: string; topicPresenceMeans: string };
};

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `${url} failed (${response.status})`);
  return body as T;
}

function pct(value: number | null | undefined) { return value == null ? "Unknown" : `${Math.round(value * 100)}%`; }

export default function KnowledgeMapPage() {
  const [snapshot, setSnapshot] = useState<MapResponse | null>(null);
  const [domainName, setDomainName] = useState("");
  const [topicName, setTopicName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { setSnapshot(await jsonRequest<MapResponse>("/api/personal-intelligence/knowledge/map")); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function addTopic(event: FormEvent) {
    event.preventDefault();
    if (!domainName.trim() || !topicName.trim()) return;
    setSaving(true); setError(null);
    try {
      await jsonRequest("/api/personal-intelligence/knowledge/map", {
        method: "POST",
        body: JSON.stringify({ domainName: domainName.trim(), topicName: topicName.trim(), description: description.trim(), sourceExcerpt: topicName.trim() }),
      });
      setTopicName(""); setDescription("");
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setSaving(false); }
  }

  const domainById = new Map((snapshot?.domains || []).map((domain) => [domain.id, domain.name]));

  return <main className="mx-auto max-w-[1200px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-teal-700"><MapIcon size={17}/> Knowledge Map</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">What do you want mapped — not assumed?</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Et topic betyr bare at området er kartlagt som interesse eller læringsområde. Det betyr ikke at du kan det. Mastery forblir ukjent til LEARN, assessment eller teach-back gir evidens.</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><RefreshCw size={14}/> Refresh</button>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}

    <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <form onSubmit={addTopic} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-black"><Plus size={16}/> Add mapped topic</div>
        <label className="mt-4 block text-xs font-black text-slate-600">Domain</label>
        <input value={domainName} onChange={(e) => setDomainName(e.target.value)} placeholder="e.g. Economics" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <label className="mt-3 block text-xs font-black text-slate-600">Topic</label>
        <input value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder="e.g. Monetary policy" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <label className="mt-3 block text-xs font-black text-slate-600">Why / context (optional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <button disabled={saving || !domainName.trim() || !topicName.trim()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin"/> : <BookOpenCheck size={14}/>} Add to map</button>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">Dette oppretter bare domain/topic. Ingen mastery-rad eller kunnskapsscore opprettes.</p>
      </form>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-black">Mapped knowledge areas</div>
        {loading ? <Loader2 className="mt-4 animate-spin" size={18}/> : !snapshot?.topics.length ? <p className="mt-4 text-sm text-slate-500">Ingen topics er kartlagt ennå.</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{snapshot.topics.map((topic) => <article key={topic.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="text-[10px] font-black uppercase tracking-wide text-teal-700">{domainById.get(topic.domain_id) || "Domain"}</div>
          <h2 className="mt-1 text-base font-black text-slate-950">{topic.name}</h2>
          {topic.description && <p className="mt-1 text-xs leading-5 text-slate-500">{topic.description}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-slate-50 p-2"><strong>Understanding</strong><br/>{pct(topic.mastery?.understanding_score)}</div>
            <div className="rounded-lg bg-slate-50 p-2"><strong>Retention</strong><br/>{pct(topic.mastery?.retention_score)}</div>
            <div className="rounded-lg bg-slate-50 p-2"><strong>Transfer</strong><br/>{pct(topic.mastery?.transfer_score)}</div>
            <div className="rounded-lg bg-slate-50 p-2"><strong>Evidence</strong><br/>{pct(topic.mastery?.evidence_strength)}</div>
          </div>
          {!topic.mastery && <p className="mt-3 text-[11px] font-semibold text-amber-700">Knowledge status: unknown — not zero.</p>}
          <Link href={`/personal-intelligence/learn?topic=${encodeURIComponent(topic.id)}`} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">Learn this</Link>
        </article>)}</div>}
      </section>
    </section>
  </main>;
}
