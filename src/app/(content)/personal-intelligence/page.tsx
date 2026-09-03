"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BrainCircuit, Eye, Loader2, Lock, Save, Send, ShieldCheck, Sparkles, Trash2 } from "lucide-react";

type PrivacyLevel = "public" | "internal" | "private" | "sensitive" | "restricted";
type MemoryPersistence = "AUTO" | "CONFIRM" | "SESSION_ONLY" | "REJECT";

type Subject = {
  id: string;
  display_name: string;
  canonical_name: string;
  privacy_level: PrivacyLevel;
  status: string;
};

type MemoryCandidate = {
  type: "fact" | "goal" | "preference" | "belief" | "interest" | "decision" | "action" | "reflection_insight";
  predicate: string;
  statement: string;
  confidence: number;
  privacyLevel: PrivacyLevel;
  persistence: MemoryPersistence;
  reason: string;
};

type ContextSummary = {
  claimsUsed: Array<{ id: string; predicate: string; confidence: number }>;
  goalsUsed: Array<{ id: string; title: string; status: string }>;
  privacyLevels: PrivacyLevel[];
};

type MentorTurn = {
  sessionId: string;
  response: string;
  memoryCandidates: MemoryCandidate[];
  contextSummary: ContextSummary;
};

type TodayItem = {
  id: string;
  type: "action" | "followup" | "learning_review" | "goal" | "business_opportunity";
  title: string;
  reason: string;
  priority: number;
  dueAt?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
};

type TodaySnapshot = {
  oneThing: TodayItem | null;
  secondary: TodayItem[];
  learning: TodayItem | null;
  generatedAt: string;
  warnings?: string[];
};

type ConversationTurn = {
  id: string;
  user: string;
  assistant: string;
  contextSummary: ContextSummary;
  thinkDeeper: boolean;
};

type CandidateState = MemoryCandidate & {
  id: string;
  status: "pending" | "saved" | "discarded";
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

function confidenceLabel(value: number) {
  if (value >= 0.85) return "Sterk";
  if (value >= 0.65) return "Moderat";
  return "Foreløpig";
}

function TodayCard({ label, item }: { label: string; item: TodayItem | null }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700">{label}</div>
    {item ? <>
      <h3 className="mt-2 text-base font-black text-slate-950">{item.title}</h3>
      <p className="mt-1 text-sm leading-5 text-slate-600">{item.reason}</p>
      {item.source && <div className="mt-2 text-[11px] font-bold text-slate-400">Source: {item.source}</div>}
    </> : <p className="mt-2 text-sm text-slate-500">Ingen sterk kandidat akkurat nå.</p>}
  </section>;
}

export default function PersonalIntelligencePage() {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [today, setToday] = useState<TodaySnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [thinkDeeper, setThinkDeeper] = useState(false);
  const [privacyScope, setPrivacyScope] = useState<"internal" | "private">("private");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [candidates, setCandidates] = useState<CandidateState[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingCandidate, setSavingCandidate] = useState<string | null>(null);
  const [expandedContext, setExpandedContext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const bootstrap = await jsonRequest<{ ok: boolean; subject: Subject }>("/api/personal-intelligence/bootstrap", {
          method: "POST",
          body: "{}",
        });
        const snapshot = await jsonRequest<{ ok: boolean; snapshot: TodaySnapshot }>("/api/personal-intelligence/today");
        if (!active) return;
        setSubject(bootstrap.subject);
        setToday(snapshot.snapshot);
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const pendingCandidates = useMemo(() => candidates.filter((candidate) => candidate.status === "pending"), [candidates]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || !subject || sending) return;
    setSending(true);
    setError(null);
    setMessage("");
    try {
      const result = await jsonRequest<MentorTurn>("/api/personal-intelligence/mentor", {
        method: "POST",
        body: JSON.stringify({ subjectEntityId: subject.id, message: text, privacyScope, thinkDeeper }),
      });
      const id = result.sessionId || crypto.randomUUID();
      setTurns((current) => [...current, {
        id,
        user: text,
        assistant: result.response,
        contextSummary: result.contextSummary,
        thinkDeeper,
      }]);
      setCandidates((current) => [
        ...result.memoryCandidates
          .filter((candidate) => candidate.persistence === "CONFIRM" || candidate.persistence === "AUTO")
          .map((candidate, index) => ({ ...candidate, id: `${id}:${index}`, status: "pending" as const })),
        ...current,
      ]);
    } catch (failure) {
      setMessage(text);
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSending(false);
    }
  }

  async function saveMemory(candidate: CandidateState, privateOnly = false) {
    if (!subject) return;
    setSavingCandidate(candidate.id);
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
          privacyLevel: privateOnly ? "private" : candidate.privacyLevel,
          sourceExcerpt: candidate.statement,
        }),
      });
      setCandidates((current) => current.map((item) => item.id === candidate.id ? { ...item, status: "saved" } : item));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSavingCandidate(null);
    }
  }

  function discardMemory(id: string) {
    setCandidates((current) => current.map((item) => item.id === id ? { ...item, status: "discarded" } : item));
  }

  return <main className="mx-auto max-w-[1280px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><BrainCircuit size={17} /> Personal Intelligence</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">What is worth your attention today?</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Privat Alpha. Mentoren bruker kontrollert personlig kontekst, viser hva den brukte og lagrer nye minner bare etter eksplisitt valg.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-black">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800"><ShieldCheck size={14} /> Owner only</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700"><Lock size={14} /> {privacyScope}</span>
        </div>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}

    <section className="grid gap-3 md:grid-cols-3">
      <TodayCard label="ONE THING" item={today?.oneThing || null} />
      <TodayCard label="WORTH KNOWING" item={today?.learning || null} />
      <TodayCard label="CONTINUE" item={today?.secondary?.[0] || null} />
    </section>

    {today?.warnings?.length ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
      {today.warnings.map((warning) => <div key={warning}>{warning}</div>)}
    </section> : null}

    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <div className="text-sm font-black text-slate-950">Mentor</div>
            <div className="mt-1 text-xs text-slate-500">{loading ? "Initialiserer…" : subject ? `Klar for ${subject.display_name}` : "Ikke tilgjengelig"}</div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPrivacyScope((value) => value === "private" ? "internal" : "private")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">{privacyScope === "private" ? "Privat" : "Intern"}</button>
            <button type="button" onClick={() => setThinkDeeper((value) => !value)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black ${thinkDeeper ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-700"}`}><Sparkles size={14} /> Think Deeper {thinkDeeper ? "ON" : "OFF"}</button>
          </div>
        </div>

        <div className="min-h-[360px] space-y-5 p-5">
          {!turns.length && <div className="py-12 text-center text-sm text-slate-500">Spør om noe du vil forstå, tenke gjennom eller beslutte.</div>}
          {turns.map((turn) => <article key={turn.id} className="space-y-3">
            <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-slate-950 px-4 py-3 text-sm leading-6 text-white">{turn.user}</div>
            <div className="max-w-[94%] rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-800 whitespace-pre-wrap">
              {turn.assistant}
              <div className="mt-3 border-t border-slate-200 pt-3">
                <button type="button" onClick={() => setExpandedContext(expandedContext === turn.id ? null : turn.id)} className="inline-flex items-center gap-1.5 text-xs font-black text-cyan-700"><Eye size={14} /> Hvorfor dette?</button>
                {expandedContext === turn.id && <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                  <div><strong>Claims:</strong> {turn.contextSummary.claimsUsed.length ? turn.contextSummary.claimsUsed.map((claim) => `${claim.predicate} (${confidenceLabel(claim.confidence)})`).join(", ") : "ingen"}</div>
                  <div className="mt-1"><strong>Mål:</strong> {turn.contextSummary.goalsUsed.length ? turn.contextSummary.goalsUsed.map((goal) => goal.title).join(", ") : "ingen"}</div>
                  <div className="mt-1"><strong>Privacy scope:</strong> {turn.contextSummary.privacyLevels.join(", ")}</div>
                  <div className="mt-1"><strong>Analyse:</strong> {turn.thinkDeeper ? "Think Deeper" : "Normal"}</div>
                </div>}
              </div>
            </div>
          </article>)}
        </div>

        <form onSubmit={sendMessage} className="border-t border-slate-100 p-4">
          <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2">
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} placeholder="Ask, think, speak or reflect…" className="min-h-[54px] flex-1 resize-none border-0 bg-transparent p-2 text-sm outline-none" />
            <button disabled={!subject || sending || !message.trim()} className="self-end rounded-xl bg-slate-950 p-3 text-white disabled:opacity-40">{sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button>
          </div>
        </form>
      </div>

      <aside className="space-y-4">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-slate-950">Possible memories</div>
              <div className="mt-1 text-xs text-slate-500">Ingen kandidat lagres uten et valg.</div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{pendingCandidates.length}</span>
          </div>
          <div className="mt-4 space-y-3">
            {!pendingCandidates.length && <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Ingen ventende memory candidates.</div>}
            {pendingCandidates.map((candidate) => <div key={candidate.id} className="rounded-2xl border border-slate-200 p-3">
              <div className="text-xs font-black text-slate-400">{candidate.type} · {confidenceLabel(candidate.confidence)}</div>
              <div className="mt-1 text-sm font-bold text-slate-900">{candidate.statement}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{candidate.reason}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={savingCandidate === candidate.id} onClick={() => void saveMemory(candidate)} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-2.5 py-2 text-xs font-black text-white"><Save size={13} /> Husk</button>
                <button type="button" disabled={savingCandidate === candidate.id} onClick={() => void saveMemory(candidate, true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black text-slate-700"><Lock size={13} /> Privat</button>
                <button type="button" onClick={() => discardMemory(candidate.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black text-slate-500"><Trash2 size={13} /> Dropp</button>
              </div>
            </div>)}
          </div>
        </section>
      </aside>
    </section>
  </main>;
}
