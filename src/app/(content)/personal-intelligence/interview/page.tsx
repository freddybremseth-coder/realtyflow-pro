"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Check, Compass, Loader2, Save, Trash2 } from "lucide-react";

type PrivacyLevel = "public" | "internal" | "private" | "sensitive" | "restricted";
type Candidate = {
  id: string; type: "fact" | "goal" | "preference" | "belief" | "interest";
  predicate: string; statement: string; confidence: number; privacyLevel: PrivacyLevel;
  persistence: "CONFIRM"; reason: string; sourceQuestionId: string; sourceExcerpt: string;
  status?: "pending" | "saved" | "dropped";
};

type SavedProgressItem = { id:string; kind:string; label:string; questionId?:string|null; sourceExcerpt?:string|null };
type OnboardingProgress = { stages:{ orient:{ completed:boolean; savedItems:SavedProgressItem[]; sourceExcerpts:string[] }; interview:{ completed:boolean; savedItems:SavedProgressItem[]; sourceExcerpts:string[] } }; map:{ domains:number; topics:number; completed:boolean } };
type Prompt = { id: string; section: string; question: string };
const PROMPTS: Prompt[] = [
  { id: "history_turning_points", section: "History", question: "Which experiences or turning points have shaped how you see the world?" },
  { id: "work_real_experience", section: "Experience", question: "What have you learned through real work or responsibility that formal education did not teach you?" },
  { id: "values_nonnegotiable", section: "Values", question: "Which principles or values are non-negotiable for you, and why?" },
  { id: "interests_pull", section: "Curiosity", question: "Which subjects repeatedly pull your attention even when nobody asks you to study them?" },
  { id: "knowledge_strength", section: "Knowledge", question: "Which subjects do you believe you understand well, and where did that understanding come from?" },
  { id: "knowledge_gaps", section: "Knowledge", question: "Which important subjects do you feel you should understand better?" },
  { id: "future_direction", section: "Future", question: "What would you like your life to contain more of in the next few years?" },
  { id: "future_avoid", section: "Future", question: "What do you want to avoid becoming, repeating or spending your life on?" },
];

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `${url} failed (${response.status})`);
  return body as T;
}

export default function LifeInterviewPage() {
  const [answers, setAnswers] = useState<Record<string,string>>({});
  const [subjectEntityId, setSubjectEntityId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const p = await jsonRequest<OnboardingProgress>("/api/personal-intelligence/onboarding/progress");
        setProgress(p);
        const restored: Record<string,string> = {};
        for (const item of p.stages.interview.savedItems) {
          if (item.questionId && item.sourceExcerpt && !restored[item.questionId]) restored[item.questionId] = item.sourceExcerpt;
        }
        if (Object.keys(restored).length) setAnswers((current) => Object.keys(current).length ? current : restored);
      } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    })();
  }, []);

  async function extract(event: FormEvent) {
    event.preventDefault();
    const payload = PROMPTS.map((prompt) => ({ questionId: prompt.id, answer: answers[prompt.id]?.trim() || "" })).filter((item) => item.answer);
    if (!payload.length) return;
    setExtracting(true); setError(null);
    try {
      const result = await jsonRequest<{ subjectEntityId: string; candidates: Candidate[]; writesPerformed: number }>("/api/personal-intelligence/orientation/candidates", { method: "POST", body: JSON.stringify({ answers: payload }) });
      setSubjectEntityId(result.subjectEntityId);
      setCandidates(result.candidates.map((candidate) => ({ ...candidate, status: "pending" })));
      if (result.writesPerformed !== 0) throw new Error("Life Interview candidate extraction unexpectedly wrote data");
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setExtracting(false); }
  }

  async function remember(candidate: Candidate) {
    if (!subjectEntityId) return;
    setSaving(candidate.id); setError(null);
    try {
      if (candidate.type === "goal") {
        await jsonRequest("/api/personal-intelligence/goals/confirm", { method: "POST", body: JSON.stringify({ subjectEntityId, title: candidate.statement, description: candidate.reason, privacyLevel: candidate.privacyLevel, sourceExcerpt: candidate.sourceExcerpt, sourceStage: "interview", sourceQuestionId: candidate.sourceQuestionId }) });
      } else {
        await jsonRequest("/api/personal-intelligence/memory/confirm", { method: "POST", body: JSON.stringify({ subjectEntityId, predicate: candidate.predicate, statement: candidate.statement, claimType: candidate.type, confidence: candidate.confidence, privacyLevel: candidate.privacyLevel, sourceExcerpt: candidate.sourceExcerpt, sourceStage: "interview", sourceQuestionId: candidate.sourceQuestionId }) });
      }
      setCandidates((items) => items.map((item) => item.id === candidate.id ? { ...item, status: "saved" } : item));
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setSaving(null); }
  }

  return <main className="mx-auto max-w-[1200px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-fuchsia-700"><Compass size={17}/> Life Interview</div>
      <h1 className="mt-2 text-3xl font-black tracking-tight">Build context from your own words.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Svar bare på det du ønsker. Intervjuet lager kandidater, ikke sannheter. Ingenting lagres før du eksplisitt velger Remember.</p>
    </header>
    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
    {progress?.stages.interview.completed && <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-center gap-2 text-sm font-black text-emerald-900"><Check size={16}/> Interview er allerede lagret</div>
      <p className="mt-1 text-xs leading-5 text-emerald-800">Det du bekreftet i intervjuet ligger fortsatt i Personal Intelligence. Du kan legge til mer uten å starte på nytt.</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">{progress.stages.interview.savedItems.map((item) => <div key={item.id} className="rounded-xl bg-white/80 p-3 text-xs text-slate-700"><strong>{item.kind === "goal" ? "Mål" : "Husket"}:</strong> {item.label}</div>)}</div>
      {!!progress.stages.interview.sourceExcerpts.length && <details className="mt-3 rounded-xl bg-white/70 p-3 text-xs text-slate-600"><summary className="cursor-pointer font-black">Vis tidligere svartekst</summary><div className="mt-2 space-y-2">{progress.stages.interview.sourceExcerpts.map((excerpt,index) => <p key={index} className="whitespace-pre-wrap">{excerpt}</p>)}</div></details>}
    </section>}

    <form onSubmit={extract} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      {PROMPTS.map((prompt) => <label key={prompt.id} className="block rounded-2xl border border-slate-200 p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-700">{prompt.section}</div>
        <div className="mt-1 text-sm font-black text-slate-950">{prompt.question}</div>
        <textarea value={answers[prompt.id] || ""} onChange={(e) => setAnswers((current) => ({ ...current, [prompt.id]: e.target.value }))} rows={3} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </label>)}
      <button disabled={extracting || !Object.values(answers).some((value) => value.trim())} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{extracting ? <Loader2 size={14} className="animate-spin"/> : <Compass size={14}/>} Extract possible memories</button>
      <p className="text-[11px] text-slate-500">Extraction reuses Orientation and performs zero database writes.</p>
    </form>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-black">Review candidates</div>
      {!candidates.length ? <p className="mt-3 text-sm text-slate-500">Ingen kandidater ennå.</p> : <div className="mt-4 space-y-3">{candidates.filter((candidate) => candidate.status === "pending").map((candidate) => <article key={candidate.id} className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-wide text-fuchsia-700">{candidate.type}</span><span className="text-[11px] text-slate-500">confidence {Math.round(candidate.confidence * 100)}%</span></div>
        <textarea value={candidate.statement} onChange={(e) => setCandidates((items) => items.map((item) => item.id === candidate.id ? { ...item, statement: e.target.value } : item))} rows={2} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={candidate.privacyLevel} onChange={(e) => setCandidates((items) => items.map((item) => item.id === candidate.id ? { ...item, privacyLevel: e.target.value as PrivacyLevel } : item))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">
            {(["internal","private","sensitive","restricted"] as PrivacyLevel[]).map((level) => <option key={level}>{level}</option>)}
          </select>
          <button type="button" disabled={saving === candidate.id || !candidate.statement.trim()} onClick={() => void remember(candidate)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white">{saving === candidate.id ? <Loader2 size={13} className="animate-spin"/> : <Save size={13}/>} Remember</button>
          <button type="button" onClick={() => setCandidates((items) => items.map((item) => item.id === candidate.id ? { ...item, status: "dropped" } : item))} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><Trash2 size={13}/> Drop</button>
        </div>
        {candidate.type === "goal" && <p className="mt-2 text-[11px] font-semibold text-amber-700">Remembering a goal stores it as an idea, not an active commitment.</p>}
      </article>)}</div>}
      {candidates.some((candidate) => candidate.status === "saved") && <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800"><Check size={14}/> Saved items are now part of the canonical review/correction flow.</div>}
    </section>
    <section className="rounded-3xl border border-fuchsia-200 bg-fuchsia-50 p-5">
      <div className="text-xs font-black uppercase tracking-[0.16em] text-fuchsia-700">Next step</div>
      <h2 className="mt-1 text-lg font-black text-slate-950">Map what you want to understand</h2>
      <p className="mt-1 text-sm text-slate-600">Knowledge Map records interests and learning areas only. It does not claim mastery.</p>
      <Link href="/personal-intelligence/map" className="mt-3 inline-flex rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white">Open Knowledge Map</Link>
    </section>
  </main>;
}
