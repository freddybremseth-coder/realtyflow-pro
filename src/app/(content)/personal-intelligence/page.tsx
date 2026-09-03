"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  Lock,
  MessageCircle,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

type PrivacyLevel = "public" | "internal" | "private" | "sensitive" | "restricted";
type MemoryPersistence = "AUTO" | "CONFIRM" | "SESSION_ONLY" | "REJECT";
type MemoryCandidateType = "fact" | "goal" | "preference" | "belief" | "interest" | "decision" | "action" | "reflection_insight";

type Subject = {
  id: string;
  display_name: string;
  canonical_name: string;
  privacy_level: PrivacyLevel;
  status: string;
};

type MemoryCandidate = {
  type: MemoryCandidateType;
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
  savedPrivacy?: PrivacyLevel;
};

async function postJson<T>(url: string, payload?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
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

function typeLabel(type: MemoryCandidateType) {
  const labels: Record<MemoryCandidateType, string> = {
    fact: "Fakta",
    goal: "Mål",
    preference: "Preferanse",
    belief: "Oppfatning",
    interest: "Interesse",
    decision: "Beslutning",
    action: "Handling",
    reflection_insight: "Refleksjon",
  };
  return labels[type];
}

export default function PersonalIntelligencePage() {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [message, setMessage] = useState("");
  const [thinkDeeper, setThinkDeeper] = useState(false);
  const [privacyScope, setPrivacyScope] = useState<"internal" | "private">("private");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [candidates, setCandidates] = useState<CandidateState[]>([]);
  const [savingCandidateId, setSavingCandidateId] = useState<string | null>(null);
  const [expandedContextId, setExpandedContextId] = useState<string | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await postJson<{ ok: boolean; subject: Subject }>("/api/personal-intelligence/bootstrap");
        if (!cancelled) setSubject(result.subject);
      } catch (bootstrapFailure) {
        if (!cancelled) setBootstrapError(bootstrapFailure instanceof Error ? bootstrapFailure.message : String(bootstrapFailure));
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns.length]);

  const pendingCandidates = useMemo(() => candidates.filter((candidate) => candidate.status === "pending"), [candidates]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || !subject || sending) return;

    setSending(true);
    setError(null);
    setMessage("");
    try {
      const result = await postJson<MentorTurn>("/api/personal-intelligence/mentor", {
        subjectEntityId: subject.id,
        message: text,
        privacyScope,
        thinkDeeper,
      });
      const turnId = result.sessionId || crypto.randomUUID();
      setTurns((current) => [
        ...current,
        {
          id: turnId,
          user: text,
          assistant: result.response,
          contextSummary: result.contextSummary,
          thinkDeeper,
        },
      ]);
      setCandidates((current) => [
        ...result.memoryCandidates
          .filter((candidate) => candidate.persistence === "CONFIRM" || candidate.persistence === "AUTO")
          .map((candidate, index) => ({ ...candidate, id: `${turnId}:${index}`, status: "pending" as const })),
        ...current,
      ]);
    } catch (sendFailure) {
      setMessage(text);
      setError(sendFailure instanceof Error ? sendFailure.message : String(sendFailure));
    } finally {
      setSending(false);
    }
  }

  async function saveCandidate(candidate: CandidateState, forcePrivate = false) {
    if (!subject || candidate.status !== "pending") return;
    setSavingCandidateId(candidate.id);
    setError(null);
    const targetPrivacy: PrivacyLevel = forcePrivate ? "private" : candidate.privacyLevel;
    try {
      await postJson("/api/personal-intelligence/memory/confirm", {
        subjectEntityId: subject.id,
        predicate: candidate.predicate,
        statement: candidate.statement,
        claimType: candidate.type,
        confidence: candidate.confidence,
        privacyLevel: targetPrivacy,
        sourceExcerpt: candidate.statement,
      });
      setCandidates((current) => current.map((item) => item.id === candidate.id
        ? { ...item, status: "saved", savedPrivacy: targetPrivacy }
        : item));
    } catch (saveFailure) {
      setError(saveFailure instanceof Error ? saveFailure.message : String(saveFailure));
    } finally {
      setSavingCandidateId(null);
    }
  }

  function discardCandidate(id: string) {
    setCandidates((current) => current.map((item) => item.id === id ? { ...item, status: "discarded" } : item));
  }

  return (
    <main className="mx-auto max-w-[1180px] space-y-5 p-4 sm:p-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700">
              <BrainCircuit size={17} /> Personal Intelligence
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Hva er verdt oppmerksomheten din?</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Privat mentor-alpha. Den bruker bare autorisert personlig kontekst, viser hva den faktisk brukte, og lagrer ikke nye personlige minner uten kontroll.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800"><ShieldCheck size={14} /> Owner only</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700"><Lock size={14} /> {privacyScope === "private" ? "Privat kontekst" : "Intern kontekst"}</span>
          </div>
        </div>
      </header>

      {bootstrapError && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <strong>Mentoren kunne ikke initialiseres.</strong><div className="mt-1">{bootstrapError}</div>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[1fr_330px]">
        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-slate-950"><MessageCircle size={17} className="text-cyan-700" /> Samtale</div>
                <div className="mt-1 text-xs text-slate-500">{subject ? `Klar for ${subject.display_name}` : bootstrapping ? "Initialiserer…" : "Ikke tilgjengelig"}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrivacyScope((current) => current === "private" ? "internal" : "private")}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  {privacyScope === "private" ? "Privat" : "Intern"}
                </button>
                <button
                  type="button"
                  onClick={() => setThinkDeeper((current) => !current)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition ${thinkDeeper ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  <Sparkles size={14} /> Think Deeper {thinkDeeper ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>

          <div className="max-h-[58vh] min-h-[390px] space-y-5 overflow-y-auto p-5">
            {turns.length === 0 && !bootstrapping && !bootstrapError && (
              <div className="mx-auto max-w-xl py-14 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700"><BrainCircuit size={28} /></div>
                <h2 className="mt-4 text-xl font-black text-slate-950">Ikke en tom chatbot</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Start med noe du vil forstå, tenke gjennom eller beslutte. Mentoren henter bare den minste relevante personlige konteksten.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {["Hva bør jeg fokusere på nå?", "Lær meg noe som er relevant for meg.", "Utfordre en antakelse jeg har."].map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => setMessage(suggestion)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:border-cyan-300 hover:bg-cyan-50">{suggestion}</button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn) => {
              const expanded = expandedContextId === turn.id;
              return (
                <article key={turn.id} className="space-y-3">
                  <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-slate-950 px-4 py-3 text-sm leading-6 text-white">{turn.user}</div>
                  <div className="max-w-[94%] rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-800 whitespace-pre-wrap">
                    {turn.assistant}
                    <div className="mt-4 border-t border-slate-200 pt-3">
                      <button type="button" onClick={() => setExpandedContextId(expanded ? null : turn.id)} className="inline-flex items-center gap-1.5 text-xs font-black text-cyan-700">
                        <Eye size={14} /> Hvorfor dette? {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      {expanded && (
                        <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 sm:grid-cols-2">
                          <div>
                            <div className="font-black uppercase tracking-wide text-slate-400">Claims brukt</div>
                            <div className="mt-2 space-y-1.5">
                              {turn.contextSummary.claimsUsed.length ? turn.contextSummary.claimsUsed.map((claim) => (
                                <div key={claim.id}><strong className="text-slate-700">{claim.predicate}</strong> · {confidenceLabel(claim.confidence)}</div>
                              )) : <div>Ingen lagrede claims brukt.</div>}
                            </div>
                          </div>
                          <div>
                            <div className="font-black uppercase tracking-wide text-slate-400">Mål brukt</div>
                            <div className="mt-2 space-y-1.5">
                              {turn.contextSummary.goalsUsed.length ? turn.contextSummary.goalsUsed.map((goal) => (
                                <div key={goal.id}><strong className="text-slate-700">{goal.title}</strong> · {goal.status}</div>
                              )) : <div>Ingen lagrede mål brukt.</div>}
                            </div>
                          </div>
                          <div className="sm:col-span-2 text-[11px] text-slate-400">Privacy scope tillot: {turn.contextSummary.privacyLevels.join(", ")}. {turn.thinkDeeper ? "Think Deeper var aktivert." : "Normal analyse."}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            <div ref={conversationEndRef} />
          </div>

          <form onSubmit={sendMessage} className="border-t border-slate-100 p-4 sm:p-5">
            {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{error}</div>}
            <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-cyan-300 focus-within:ring-2 focus-within:ring-cyan-100">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                disabled={!subject || sending}
                rows={3}
                placeholder="Spør, tenk, lær eller reflekter…"
                className="w-full resize-none border-0 bg-transparent px-2 py-2 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60"
              />
              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <div className="text-[11px] text-slate-400">Enter sender · Shift+Enter gir ny linje</div>
                <button type="submit" disabled={!subject || !message.trim() || sending} className="inline-flex items-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">
                  {sending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Send size={16} className="mr-2" />}Send
                </button>
              </div>
            </div>
          </form>
        </div>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div><div className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">Memory control</div><h2 className="mt-1 text-lg font-black text-slate-950">Verdt å huske?</h2></div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{pendingCandidates.length}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Mentoren kan foreslå minner, men du bestemmer hva som blir permanent.</p>

            <div className="mt-4 space-y-3">
              {pendingCandidates.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500">Ingen nye minnekandidater venter på beslutning.</div>
              )}
              {pendingCandidates.map((candidate) => (
                <div key={candidate.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black uppercase text-cyan-800">{typeLabel(candidate.type)}</span>
                    <span className="text-[10px] font-bold text-slate-400">{confidenceLabel(candidate.confidence)}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-5 text-slate-800">{candidate.statement}</p>
                  {candidate.reason && <p className="mt-2 text-xs leading-5 text-slate-500">{candidate.reason}</p>}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button type="button" disabled={savingCandidateId === candidate.id} onClick={() => void saveCandidate(candidate)} className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-950 px-2 py-2 text-[11px] font-black text-white disabled:opacity-50"><Save size={12} /> Husk</button>
                    <button type="button" disabled={savingCandidateId === candidate.id} onClick={() => void saveCandidate(candidate, true)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-[11px] font-black text-slate-700 disabled:opacity-50"><Lock size={12} /> Privat</button>
                    <button type="button" disabled={savingCandidateId === candidate.id} onClick={() => discardCandidate(candidate.id)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-[11px] font-black text-slate-500 disabled:opacity-50"><Trash2 size={12} /> Dropp</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-slate-950"><Check size={16} className="text-emerald-600" /> Alpha-prinsipper</div>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
              <li>• Think Deeper gir bredere analyse, ikke bredere privacy-tilgang.</li>
              <li>• «Hvorfor dette?» viser kontekst, ikke skjult resonnering.</li>
              <li>• Nye minner lagres bare etter eksplisitt valg i denne UI-en.</li>
              <li>• Operative handlinger i RealtyFlow utføres ikke automatisk her.</li>
            </ul>
          </section>
        </aside>
      </section>
    </main>
  );
}
