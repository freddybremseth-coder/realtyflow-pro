"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BrainCircuit, CheckCircle2, CircleHelp, Loader2 } from "lucide-react";

type MeSummary = {
  activeClaims: number;
  uncertainClaims: number;
  activeGoals: number;
  knowledgeTopics: number;
  masteryRecords: number;
  candidateObservations: number;
  decisions: number;
  mentorSessions: number;
  onboardingState: "empty" | "learning";
};

type MeResponse = { ok: boolean; summary: MeSummary };

const steps = [
  { href: "/personal-intelligence/orient", title: "1. Orient", body: "Svar på noen få konkrete spørsmål og bekreft bare det du faktisk vil at systemet skal huske." },
  { href: "/personal-intelligence/interview", title: "2. Interview", body: "Bygg mer dybde om erfaring, verdier, nysgjerrighet og fremtid uten automatiske personlighetsslutninger." },
  { href: "/personal-intelligence/map", title: "3. Map", body: "Legg inn knowledge domains og topics du vil lære eller utvikle. Mapping betyr ikke mastery." },
  { href: "/personal-intelligence", title: "4. Mentor", body: "Ta første Mentor-turn når du har gitt systemet nok eksplisitt kontekst til å være nyttig." },
];

export default function StartPage() {
  const [summary, setSummary] = useState<MeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/personal-intelligence/me", { credentials: "same-origin", cache: "no-store" });
        const body = await response.json().catch(() => ({})) as Partial<MeResponse> & { error?: string };
        if (!response.ok) throw new Error(body.error || `ME status failed (${response.status})`);
        if (active) setSummary(body.summary || null);
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const empty = summary?.onboardingState === "empty";

  return <main className="mx-auto max-w-[1100px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><BrainCircuit size={17} /> Start Here</div>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Teach the system enough to become useful.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Personal Intelligence skal ikke gjette hvem du er. Første oppgave er derfor å gi systemet noen eksplisitte, korrigerbare signaler — uten fake seed-data, auto-profilering eller skjulte writes.</p>
    </header>

    {loading && <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500"><Loader2 className="mr-2 inline animate-spin" size={16} /> Leser Alpha-status…</section>}
    {error && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-900">{error}</section>}

    {summary && <section className={`rounded-3xl border p-5 ${empty ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex items-center gap-2 text-sm font-black text-slate-950">{empty ? <CircleHelp size={18} /> : <CheckCircle2 size={18} />} {empty ? "Personal Intelligence is ready, but has almost no evidence yet." : "Personal Intelligence has begun learning from explicit evidence."}</div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-xl bg-white/80 p-3"><strong>{summary.activeClaims}</strong><br/>active claims</div>
        <div className="rounded-xl bg-white/80 p-3"><strong>{summary.activeGoals}</strong><br/>active goals</div>
        <div className="rounded-xl bg-white/80 p-3"><strong>{summary.knowledgeTopics}</strong><br/>knowledge topics</div>
        <div className="rounded-xl bg-white/80 p-3"><strong>{summary.mentorSessions}</strong><br/>mentor sessions</div>
      </div>
    </section>}

    <section className="grid gap-4 md:grid-cols-2">
      {steps.map((step) => <Link key={step.href} href={step.href} className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:border-cyan-300">
        <div className="flex items-center justify-between gap-3"><div className="text-base font-black text-slate-950">{step.title}</div><ArrowRight size={17} className="text-cyan-700 transition group-hover:translate-x-1" /></div>
        <p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>
      </Link>)}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
      Dette er en navigasjons- og statusflate. Den skriver ikke claims, goals, topics, mastery eller observations. Hvert varig signal krever fortsatt den eksisterende eksplisitte brukerflyten på den relevante siden.
    </section>
  </main>;
}
