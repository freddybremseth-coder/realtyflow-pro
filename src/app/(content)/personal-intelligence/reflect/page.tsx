"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, BrainCircuit, Loader2, Lock, Save, Send, Trash2 } from "lucide-react";
import { DictationButton } from "@/components/personal-intelligence/dictation-button";

type PrivacyLevel = "public" | "internal" | "private" | "sensitive" | "restricted";

type Subject = {
  id: string;
  display_name: string;
};

type MemoryCandidate = {
  type: "fact" | "goal" | "preference" | "belief" | "interest" | "decision" | "action" | "reflection_insight";
  predicate: string;
  statement: string;
  confidence: number;
  privacyLevel: PrivacyLevel;
  persistence: "AUTO" | "CONFIRM" | "SESSION_ONLY" | "REJECT";
  reason: string;
};

type ReflectionResult = {
  sessionId: string;
  response: string;
  memoryCandidates: MemoryCandidate[];
  retention: {
    rawReflectionStoredInMessages: false;
    mentorResponseStoredInMessages: false;
    memoryCandidatesPersistedAutomatically: false;
  };
};

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `${url} feilet (${response.status})`);
  return body as T;
}

export default function ReflectionPage() {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [reflection, setReflection] = useState("");
  const [response, setResponse] = useState("");
  const [candidates, setCandidates] = useState<Array<MemoryCandidate & { id: string; state: "pending" | "saved" | "discarded" }>>([]);
  const [privacyScope, setPrivacyScope] = useState<"internal" | "private">("private");
  const [thinkDeeper, setThinkDeeper] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void jsonRequest<{ ok: boolean; subject: Subject }>("/api/personal-intelligence/bootstrap", {
      method: "POST",
      body: "{}",
    }).then((result) => setSubject(result.subject)).catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)));
  }, []);

  function appendTranscript(text: string) {
    setError(null);
    setReflection((current) => current.trim() ? `${current.trim()} ${text}` : text);
  }

  async function submitReflection() {
    const text = reflection.trim();
    if (!text || !subject || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await jsonRequest<ReflectionResult>("/api/personal-intelligence/reflect", {
        method: "POST",
        body: JSON.stringify({
          subjectEntityId: subject.id,
          reflection: text,
          privacyScope,
          thinkDeeper,
        }),
      });
      setResponse(result.response);
      setCandidates(result.memoryCandidates
        .filter((candidate) => candidate.persistence === "CONFIRM" || candidate.persistence === "AUTO")
        .map((candidate, index) => ({ ...candidate, id: `${result.sessionId}:${index}`, state: "pending" as const })));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveCandidate(candidate: MemoryCandidate & { id: string }, makePrivate = false) {
    if (!subject) return;
    setSaving(candidate.id);
    setError(null);
    try {
      await jsonRequest("/api/personal-intelligence/memory/confirm", {
        method: "POST",
        body: JSON.stringify({
          subjectEntityId: subject.id,
          predicate: candidate.predicate,
          statement: candidate.statement,
          claimType: candidate.type,
          confidence: candidate.confidence,
          privacyLevel: makePrivate ? "private" : candidate.privacyLevel,
          sourceExcerpt: candidate.statement,
        }),
      });
      setCandidates((current) => current.map((item) => item.id === candidate.id ? { ...item, state: "saved" } : item));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(null);
    }
  }

  return <main className="mx-auto max-w-[1000px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <Link href="/personal-intelligence" className="inline-flex items-center gap-1.5 text-xs font-black text-cyan-700"><ArrowLeft size={14} /> Mentor</Link>
      <div className="mt-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-violet-700"><BrainCircuit size={17} /> Reflection Mode</div>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Think out loud. Nothing here has to become memory.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Rå refleksjon og mentorsvar lagres ikke i samtalemeldinger. Mentoren kan foreslå ting som kan være verdt å huske, men ingenting lagres som personlig memory før du aktivt velger det.</p>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-black text-slate-950">I'm listening. Take your time.</div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPrivacyScope((value) => value === "private" ? "internal" : "private")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">{privacyScope === "private" ? "Privat" : "Intern"}</button>
          <button type="button" onClick={() => setThinkDeeper((value) => !value)} className={`rounded-xl border px-3 py-2 text-xs font-black ${thinkDeeper ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-700"}`}>Think Deeper {thinkDeeper ? "ON" : "OFF"}</button>
        </div>
      </div>

      <textarea value={reflection} onChange={(event) => setReflection(event.target.value)} rows={9} placeholder="Snakk eller skriv fritt. Du trenger ikke formulere en oppgave eller et spørsmål…" className="w-full resize-y rounded-2xl border border-slate-200 p-4 text-sm leading-6 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <DictationButton disabled={!subject || submitting} onTranscript={appendTranscript} onError={setError} />
          <span className="text-[11px] text-slate-400">Diktat blir redigerbar tekst. Lydopptaket lagres ikke.</span>
        </div>
        <button type="button" disabled={!subject || submitting || !reflection.trim()} onClick={() => void submitReflection()} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40">{submitting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Reflect</button>
      </div>
    </section>

    {response && <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Mentor reflection</div>
      <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-800">{response}</div>
      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">Denne refleksjonen og mentorsvaret ble ikke skrevet til mentor.messages.</div>
    </section>}

    {candidates.some((candidate) => candidate.state === "pending") && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-black text-slate-950">Possible things worth remembering</div>
      <p className="mt-1 text-xs text-slate-500">Dette er forslag, ikke etablerte sannheter. Velg bare det du faktisk ønsker å ta med videre.</p>
      <div className="mt-4 space-y-3">
        {candidates.filter((candidate) => candidate.state === "pending").map((candidate) => <article key={candidate.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="text-sm font-bold text-slate-900">{candidate.statement}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{candidate.reason}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={saving === candidate.id} onClick={() => void saveCandidate(candidate)} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white"><Save size={13} /> Husk</button>
            <button type="button" disabled={saving === candidate.id} onClick={() => void saveCandidate(candidate, true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"><Lock size={13} /> Privat</button>
            <button type="button" onClick={() => setCandidates((current) => current.map((item) => item.id === candidate.id ? { ...item, state: "discarded" } : item))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-500"><Trash2 size={13} /> Dropp</button>
          </div>
        </article>)}
      </div>
    </section>}
  </main>;
}
