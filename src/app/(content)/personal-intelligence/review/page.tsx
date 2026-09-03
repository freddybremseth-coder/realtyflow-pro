"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, Loader2, RefreshCw, Sparkles } from "lucide-react";

type Review = {
  id: string; review_type: string; period_start: string; period_end: string; status: string;
  summary?: string | null; progress_summary?: string | null; friction_summary?: string | null;
  learning_summary?: string | null; decision_summary?: string | null; trajectory_summary?: string | null;
  recommendation?: string | null; confidence?: number | null; presented_at?: string | null; accepted_at?: string | null; created_at: string;
};

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `${url} feilet (${response.status})`);
  return body as T;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)); }

export default function WeeklyReviewPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selected, setSelected] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(preferId?: string) {
    setLoading(true); setError(null);
    try {
      const result = await jsonRequest<{ ok: boolean; reviews: Review[] }>("/api/personal-intelligence/reviews/weekly");
      setReviews(result.reviews);
      const next = preferId ? result.reviews.find((item) => item.id === preferId) : result.reviews[0];
      setSelected(next || null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function generate() {
    setGenerating(true); setError(null); setNotice(null);
    try {
      const result = await jsonRequest<{ generated: boolean; reason?: string; review?: Review }>("/api/personal-intelligence/reviews/weekly", { method: "POST", body: "{}" });
      if (!result.generated || !result.review) { setNotice(result.reason || "No review generated."); return; }
      await load(result.review.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setGenerating(false); }
  }

  async function accept() {
    if (!selected) return;
    setAccepting(true); setError(null);
    try {
      await jsonRequest("/api/personal-intelligence/reviews/weekly", { method: "PATCH", body: JSON.stringify({ reviewId: selected.id }) });
      await load(selected.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setAccepting(false); }
  }

  return <main className="mx-auto max-w-[1200px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-indigo-700"><CalendarDays size={17}/> Weekly Review</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">What actually happened this week?</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Review bruker et eksplisitt 7-dagers evidensvindu. Progress, friction, learning, decisions og trajectory holdes separat. Det finnes ingen samlet Freddy-score.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load(selected?.id)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><RefreshCw size={14}/> Refresh</button>
          <button disabled={generating} onClick={() => void generate()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{generating ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>} Generate 7-day review</button>
        </div>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
    {notice && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{notice}</div>}

    <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-black">Review history</div>
        {loading ? <Loader2 className="mt-4 animate-spin" size={18}/> : reviews.length === 0 ? <p className="mt-3 text-sm text-slate-500">Ingen weekly reviews ennå.</p> : <div className="mt-3 space-y-2">{reviews.map((review) => <button key={review.id} onClick={() => setSelected(review)} className={`w-full rounded-xl border p-3 text-left ${selected?.id === review.id ? "border-indigo-300 bg-indigo-50" : "border-slate-200"}`}><div className="text-xs font-black text-slate-900">{formatDate(review.period_start)} → {formatDate(review.period_end)}</div><div className="mt-1 text-[11px] text-slate-500">{review.status}{review.confidence != null ? ` · evidence confidence ${Math.round(review.confidence * 100)}%` : ""}</div></button>)}</div>}
      </aside>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        {!selected ? <div className="py-12 text-center text-sm text-slate-500">Generate a review when there is Personal Intelligence evidence in the last 7 days.</div> : <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wide text-indigo-700">{formatDate(selected.period_start)} → {formatDate(selected.period_end)}</div><div className="mt-1 text-sm text-slate-500">Status: {selected.status}</div></div>{selected.status !== "accepted" && <button disabled={accepting} onClick={() => void accept()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">{accepting ? <Loader2 size={13} className="animate-spin"/> : <Check size={13}/>} Accept review</button>}</div>
          {[
            ["Progress", selected.progress_summary], ["Friction", selected.friction_summary], ["Learning", selected.learning_summary], ["Decisions", selected.decision_summary], ["Trajectory", selected.trajectory_summary], ["Next adjustment", selected.recommendation],
          ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 text-sm leading-6 text-slate-800">{value || "No evidence-backed statement for this section."}</div></div>)}
          <p className="text-[11px] leading-5 text-slate-400">Review confidence describes evidence coverage for this period, not confidence in you as a person. Activity volume is not treated as life progress by itself.</p>
        </div>}
      </section>
    </section>
  </main>;
}
