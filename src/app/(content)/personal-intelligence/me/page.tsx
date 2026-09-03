"use client";

import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, CircleHelp, Edit3, Eye, Loader2, RefreshCw, Shield, Trash2 } from "lucide-react";

type Claim = {
  id: string; predicate: string; value_text?: string | null; claim_type: string; status: string;
  confidence: number; privacy_level: string; requires_confirmation: boolean; updated_at: string;
};
type Goal = { id: string; title: string; domain?: string | null; status: string; priority?: number | null; target_date?: string | null; why_it_matters?: string | null };
type Mastery = { id: string; topic_id: string; exposure_score?: number | null; understanding_score?: number | null; retention_score?: number | null; transfer_score?: number | null; evidence_strength?: number | null; topic?: { id: string; name: string } | null };
type Observation = { id: string; observation: string; category?: string | null; confidence: number; status: string; requires_confirmation: boolean; privacy_level: string };
type MeResponse = {
  subject: { id: string; display_name: string; privacy_level: string };
  summary: { activeClaims: number; uncertainClaims: number; activeGoals: number; knowledgeTopics: number; masteryRecords: number; candidateObservations: number; decisions: number; mentorSessions: number; onboardingState: "empty" | "learning" };
  claims: Claim[]; goals: Goal[]; mastery: Mastery[]; observations: Observation[];
  decisions: Array<{ id: string; status: string; decision_type: string }>;
  recentSessions: Array<{ id: string; session_type: string; input_mode: string; started_at: string }>;
};

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `${url} feilet (${response.status})`);
  return body as T;
}

function pct(value: number | null | undefined) { return value == null ? "Unknown" : `${Math.round(value * 100)}%`; }

export default function MePage() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Claim | null>(null);
  const [editText, setEditText] = useState("");

  async function load() {
    setLoading(true); setError(null);
    try { setData(await jsonRequest<MeResponse>("/api/personal-intelligence/me")); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const activeClaims = useMemo(() => data?.claims.filter((item) => ["validated", "canonical"].includes(item.status)) || [], [data]);
  const uncertainClaims = useMemo(() => data?.claims.filter((item) => ["captured", "candidate", "disputed"].includes(item.status)) || [], [data]);
  const rejectedClaims = useMemo(() => data?.claims.filter((item) => ["rejected", "superseded", "expired"].includes(item.status)) || [], [data]);

  async function correctClaim() {
    if (!editing || !editText.trim()) return;
    setBusy(editing.id); setError(null);
    try {
      await jsonRequest("/api/personal-intelligence/memory/correct", { method: "POST", body: JSON.stringify({ claimId: editing.id, statement: editText.trim(), privacyLevel: editing.privacy_level }) });
      setEditing(null); setEditText(""); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(null); }
  }

  async function rejectClaim(claim: Claim) {
    setBusy(claim.id); setError(null);
    try { await jsonRequest("/api/personal-intelligence/memory/reject", { method: "POST", body: JSON.stringify({ claimId: claim.id }) }); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(null); }
  }

  if (loading && !data) return <main className="mx-auto max-w-[1200px] p-6"><div className="rounded-3xl border border-slate-200 bg-white p-8"><Loader2 className="animate-spin" /></div></main>;

  return <main className="mx-auto max-w-[1200px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-sky-700"><BrainCircuit size={17} /> ME · Freddy Core</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">What does the system actually know?</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Dette er ikke en personlighetstest. Siden viser bare lagrede claims, mål, evidens og tentative observations. Ukjent betyr ukjent — ikke lav score.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"><RefreshCw size={14} /> Refresh</button>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}

    {data?.summary.onboardingState === "empty" && <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-center gap-2 text-sm font-black text-amber-950"><CircleHelp size={18} /> Freddy Core is active, but not learned yet.</div>
      <p className="mt-2 text-sm leading-6 text-amber-900">Det finnes foreløpig ingen canonical claims, mål eller knowledge topics i Personal Intelligence. Systemet skal derfor ikke fylle inn en profil fra antakelser. Bruk Mentor, Reflect, Learn og Think; candidate memory må fortsatt godkjennes før den blir varig.</p>
    </section>}

    {data && <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Canonical / validated", data.summary.activeClaims], ["Uncertain claims", data.summary.uncertainClaims], ["Active goals", data.summary.activeGoals], ["Knowledge topics", data.summary.knowledgeTopics],
        ["Mastery evidence", data.summary.masteryRecords], ["Candidate observations", data.summary.candidateObservations], ["Decision Journal", data.summary.decisions], ["Mentor sessions", data.summary.mentorSessions],
      ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-2xl font-black text-slate-950">{value}</div><div className="mt-1 text-xs font-bold text-slate-500">{label}</div></div>)}
    </section>}

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-black"><CheckCircle2 size={17} /> Active memory</div>
      {activeClaims.length === 0 ? <p className="mt-3 text-sm text-slate-500">Ingen validated/canonical claims ennå.</p> : <div className="mt-4 space-y-3">{activeClaims.map((claim) => <article key={claim.id} className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wide text-slate-400">{claim.predicate}</div><div className="mt-1 text-sm font-bold text-slate-900">{claim.value_text || "(structured value)"}</div></div><div className="text-right text-xs text-slate-500">{claim.status} · {claim.privacy_level}<br/>confidence {pct(claim.confidence)}</div></div>
        <div className="mt-3 flex gap-2"><button type="button" onClick={() => { setEditing(claim); setEditText(claim.value_text || ""); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black"><Edit3 size={13}/> Correct</button><button type="button" disabled={busy === claim.id} onClick={() => void rejectClaim(claim)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-black text-rose-700"><Trash2 size={13}/> Forget</button></div>
      </article>)}</div>}
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-sm font-black"><CircleHelp size={17}/> Uncertain memory</div>{uncertainClaims.length === 0 ? <p className="mt-3 text-sm text-slate-500">Ingen captured/candidate/disputed claims.</p> : <div className="mt-3 space-y-2">{uncertainClaims.map((claim) => <div key={claim.id} className="rounded-xl border border-slate-200 p-3 text-sm"><div className="font-bold">{claim.value_text || claim.predicate}</div><div className="mt-1 text-xs text-slate-500">{claim.status} · confidence {pct(claim.confidence)} · {claim.privacy_level}</div></div>)}</div>}</div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-sm font-black"><Shield size={17}/> Retired / rejected</div>{rejectedClaims.length === 0 ? <p className="mt-3 text-sm text-slate-500">Ingen rejected, expired eller superseded claims.</p> : <div className="mt-3 space-y-2">{rejectedClaims.map((claim) => <div key={claim.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">{claim.value_text || claim.predicate} · {claim.status}</div>)}</div>}</div>
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-3xl border border-slate-200 bg-white p-5"><div className="text-sm font-black">Goals</div>{data?.goals.length ? <div className="mt-3 space-y-2">{data.goals.map((goal) => <div key={goal.id} className="rounded-xl border border-slate-200 p-3"><div className="text-sm font-bold">{goal.title}</div><div className="mt-1 text-xs text-slate-500">{goal.status}{goal.domain ? ` · ${goal.domain}` : ""}</div>{goal.why_it_matters && <div className="mt-2 text-xs text-slate-600">{goal.why_it_matters}</div>}</div>)}</div> : <p className="mt-3 text-sm text-slate-500">Ingen mål lagret ennå.</p>}</div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5"><div className="text-sm font-black">Knowledge evidence</div>{data?.mastery.length ? <div className="mt-3 space-y-2">{data.mastery.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="text-sm font-bold">{item.topic?.name || "Unknown topic"}</div><div className="mt-1 text-xs text-slate-500">Understanding {pct(item.understanding_score)} · Retention {pct(item.retention_score)} · Transfer {pct(item.transfer_score)} · Evidence {pct(item.evidence_strength)}</div></div>)}</div> : <p className="mt-3 text-sm text-slate-500">Ingen mastery evidence ennå. Dette betyr ukjent, ikke 0 % kunnskap.</p>}</div>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-sm font-black"><Eye size={17}/> Mentor observations</div><p className="mt-1 text-xs text-slate-500">Observations er tentative og holdes separat fra canonical claims.</p>{data?.observations.length ? <div className="mt-3 space-y-2">{data.observations.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3 text-sm"><div className="font-bold">{item.observation}</div><div className="mt-1 text-xs text-slate-500">{item.status} · confidence {pct(item.confidence)} · {item.privacy_level}</div></div>)}</div> : <p className="mt-3 text-sm text-slate-500">Ingen mentor observations ennå.</p>}</section>

    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl"><div className="text-sm font-black">Correct memory</div><p className="mt-1 text-xs text-slate-500">Korreksjonen oppretter en ny direkte brukerkilde og superseder den gamle claimen. Historikken bevares.</p><textarea rows={5} value={editText} onChange={(e) => setEditText(e.target.value)} className="mt-4 w-full rounded-2xl border border-slate-200 p-3 text-sm"/><div className="mt-4 flex justify-end gap-2"><button onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black">Cancel</button><button disabled={busy === editing.id || !editText.trim()} onClick={() => void correctClaim()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">{busy === editing.id && <Loader2 size={13} className="animate-spin"/>} Save correction</button></div></div></div>}
  </main>;
}
