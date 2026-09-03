"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, BrainCircuit, CheckCircle2, Loader2, RefreshCw, Send } from "lucide-react";
import { DictationButton } from "@/components/personal-intelligence/dictation-button";

type Mastery = {
  exposure: number | null;
  understanding: number | null;
  retention: number | null;
  transfer: number | null;
  confidence: number | null;
  interest: number | null;
  evidenceStrength: number | null;
  lastAssessedAt: string | null;
  nextReviewAt: string | null;
};

type Topic = {
  id: string;
  name: string;
  description: string | null;
  domain: { id: string; name: string } | null;
  difficultyBand: number | null;
  mastery: Mastery | null;
  review: { reason: string; dueAt: string; priority: number; status: string } | null;
  priorityScore: number;
};

type Lesson = {
  hook: string;
  explanation: string;
  example: string;
  connection: string;
  checkQuestion: string;
  teachBackPrompt: string;
  depthReason: string;
};

type Assessment = {
  understoodConcepts: string[];
  missingConcepts: string[];
  misconceptions: string[];
  clarityScore: number;
  transferSignal: number;
  feedback: string;
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

function evidenceLabel(mastery: Mastery | null) {
  if (!mastery) return "Prior knowledge unknown";
  if (mastery.evidenceStrength == null) return "Some history, evidence strength unknown";
  if (mastery.evidenceStrength >= 0.75) return "Stronger evidence base";
  if (mastery.evidenceStrength >= 0.4) return "Moderate evidence base";
  return "Limited evidence base";
}

function percent(value: number | null | undefined) {
  return value == null ? "Unknown" : `${Math.round(value * 100)}% evidence signal`;
}

export default function LearnPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [teachBack, setTeachBack] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTopics() {
    setLoadingTopics(true);
    setError(null);
    try {
      const result = await jsonRequest<{ ok: boolean; topics: Topic[] }>("/api/personal-intelligence/learning/topics");
      setTopics(result.topics);
      if (selectedTopic) {
        const refreshed = result.topics.find((topic) => topic.id === selectedTopic.id);
        if (refreshed) setSelectedTopic(refreshed);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setLoadingTopics(false);
    }
  }

  useEffect(() => { void loadTopics(); }, []);

  const domains = useMemo(() => Array.from(new Set(topics.map((topic) => topic.domain?.name).filter(Boolean))) as string[], [topics]);

  async function startTopic(topic: Topic) {
    setStarting(true);
    setError(null);
    setSelectedTopic(topic);
    setSessionId(null);
    setLesson(null);
    setTeachBack("");
    setAssessment(null);
    try {
      const session = await jsonRequest<{ ok: boolean; session: { id: string } }>("/api/personal-intelligence/learning/session", {
        method: "POST",
        body: JSON.stringify({ topicId: topic.id, inputMode: "text", teachingMode: "professor" }),
      });
      const lessonResult = await jsonRequest<{ ok: boolean; sessionId: string; lesson: Lesson }>("/api/personal-intelligence/learning/lesson", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.session.id }),
      });
      setSessionId(lessonResult.sessionId);
      setLesson(lessonResult.lesson);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setStarting(false);
    }
  }

  async function submitTeachBack() {
    if (!sessionId || teachBack.trim().length < 20 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await jsonRequest<{ ok: boolean; assessment: Assessment }>("/api/personal-intelligence/learning/teach-back", {
        method: "POST",
        body: JSON.stringify({ sessionId, transcript: teachBack.trim() }),
      });
      setAssessment(result.assessment);
      await loadTopics();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="mx-auto max-w-[1280px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-700"><BrainCircuit size={17} /> LEARN · Professor</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Learn for understanding, not completion.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Velg et tema. Professoren tilpasser dybden etter den evidensen som faktisk finnes. Ukjent forkunnskap behandles som ukjent — aldri som lav kunnskap.</p>
        </div>
        <button type="button" onClick={() => void loadTopics()} disabled={loadingTopics} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"><RefreshCw size={14} className={loadingTopics ? "animate-spin" : ""} /> Refresh</button>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}

    <section className="grid gap-5 lg:grid-cols-[390px_minmax(0,1fr)]">
      <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-slate-950">Knowledge topics</div>
            <div className="mt-1 text-xs text-slate-500">{topics.length} topics · {domains.length} domains</div>
          </div>
          <BookOpen size={18} className="text-emerald-700" />
        </div>

        <div className="mt-4 max-h-[68vh] space-y-2 overflow-y-auto pr-1">
          {loadingTopics && <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500"><Loader2 size={18} className="mx-auto mb-2 animate-spin" />Loading topics…</div>}
          {!loadingTopics && !topics.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">Ingen knowledge topics er tilgjengelige ennå. LEARN oppretter ikke falske demo-topics; katalogen vil fylle seg når kunnskapskartet har faktiske topics.</div>}
          {topics.map((topic) => <button key={topic.id} type="button" onClick={() => void startTopic(topic)} disabled={starting} className={`w-full rounded-2xl border p-3 text-left transition ${selectedTopic?.id === topic.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-black text-slate-900">{topic.name}</div>
              {topic.review && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-800">Review</span>}
            </div>
            <div className="mt-1 text-[11px] font-bold text-slate-400">{topic.domain?.name || "Unclassified"} · {evidenceLabel(topic.mastery)}</div>
            {topic.description && <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{topic.description}</div>}
          </button>)}
        </div>
      </aside>

      <section className="min-w-0 space-y-4">
        {!selectedTopic && <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <BookOpen size={32} className="mx-auto text-slate-300" />
          <h2 className="mt-4 text-xl font-black text-slate-900">Choose something worth understanding.</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Professoren bruker topic, difficulty og eksisterende mastery-evidence for å velge riktig inngangsnivå.</p>
        </div>}

        {selectedTopic && <>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{selectedTopic.domain?.name || "Knowledge"}</div>
            <h2 className="mt-2 text-2xl font-black text-slate-950">{selectedTopic.name}</h2>
            {selectedTopic.description && <p className="mt-2 text-sm leading-6 text-slate-600">{selectedTopic.description}</p>}
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Understanding</div><div className="mt-1 text-xs font-bold text-slate-700">{percent(selectedTopic.mastery?.understanding)}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Retention</div><div className="mt-1 text-xs font-bold text-slate-700">{percent(selectedTopic.mastery?.retention)}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Transfer</div><div className="mt-1 text-xs font-bold text-slate-700">{percent(selectedTopic.mastery?.transfer)}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Evidence</div><div className="mt-1 text-xs font-bold text-slate-700">{percent(selectedTopic.mastery?.evidenceStrength)}</div></div>
            </div>
            <div className="mt-2 text-[11px] text-slate-400">These are evidence signals, not a score of you as a person and not a declaration of mastery.</div>
          </section>

          {starting && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center text-sm font-semibold text-emerald-900"><Loader2 size={20} className="mx-auto mb-2 animate-spin" />Professor prepares the lesson…</div>}

          {lesson && !starting && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Why this depth</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{lesson.depthReason}</p>
            {lesson.hook && <><h3 className="mt-5 text-sm font-black uppercase tracking-wide text-emerald-700">Hook</h3><p className="mt-2 text-base leading-7 text-slate-800">{lesson.hook}</p></>}
            <h3 className="mt-5 text-sm font-black uppercase tracking-wide text-emerald-700">Core idea</h3>
            <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-800">{lesson.explanation}</div>
            {lesson.example && <><h3 className="mt-5 text-sm font-black uppercase tracking-wide text-emerald-700">Example</h3><div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-800">{lesson.example}</div></>}
            {lesson.connection && <><h3 className="mt-5 text-sm font-black uppercase tracking-wide text-emerald-700">Connection</h3><div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-800">{lesson.connection}</div></>}
            <div className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50 p-4"><div className="text-xs font-black uppercase text-cyan-800">Check</div><div className="mt-2 text-sm font-semibold leading-6 text-cyan-950">{lesson.checkQuestion}</div></div>
          </section>}

          {lesson && !assessment && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-black text-slate-950">Teach it back</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{lesson.teachBackPrompt}</p>
            <textarea value={teachBack} onChange={(event) => setTeachBack(event.target.value)} rows={7} className="mt-4 w-full resize-y rounded-2xl border border-slate-200 p-4 text-sm leading-6 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100" placeholder="Explain it in your own words…" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><DictationButton disabled={submitting} onTranscript={(text) => setTeachBack((current) => current.trim() ? `${current.trim()} ${text}` : text)} onError={setError} /><span className="text-[11px] text-slate-400">Speak your teach-back; edit before submitting.</span></div>
              <button type="button" onClick={() => void submitTeachBack()} disabled={submitting || teachBack.trim().length < 20} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40">{submitting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Evaluate teach-back</button>
            </div>
          </section>}

          {assessment && <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-emerald-950"><CheckCircle2 size={18} /> Teach-back evidence recorded</div>
            <p className="mt-3 text-sm leading-7 text-emerald-950">{assessment.feedback}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-white/80 p-3"><div className="text-[10px] font-black uppercase text-emerald-700">Understood</div><div className="mt-2 text-xs leading-5 text-slate-700">{assessment.understoodConcepts.length ? assessment.understoodConcepts.join(" · ") : "No concepts confidently identified yet."}</div></div>
              <div className="rounded-2xl bg-white/80 p-3"><div className="text-[10px] font-black uppercase text-amber-700">Missing</div><div className="mt-2 text-xs leading-5 text-slate-700">{assessment.missingConcepts.length ? assessment.missingConcepts.join(" · ") : "No material gaps identified."}</div></div>
              <div className="rounded-2xl bg-white/80 p-3"><div className="text-[10px] font-black uppercase text-rose-700">Misconceptions</div><div className="mt-2 text-xs leading-5 text-slate-700">{assessment.misconceptions.length ? assessment.misconceptions.join(" · ") : "No clear misconceptions identified."}</div></div>
            </div>
            <div className="mt-3 text-[11px] font-semibold text-emerald-800">This is learning evidence. It does not automatically declare the topic mastered.</div>
          </section>}
        </>}
      </section>
    </section>
  </main>;
}
