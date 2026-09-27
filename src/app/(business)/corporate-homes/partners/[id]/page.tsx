"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CircleHelp,
  Copy,
  ExternalLink,
  Handshake,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type Brief = {
  title: string;
  generatedAt: string;
  company: {
    name: string;
    organizationNumber?: string | null;
    website?: string | null;
    sourceUrl?: string | null;
    city?: string | null;
    industry?: string | null;
    employeeCount?: number | null;
    status: string;
  };
  fit: {
    tier: string;
    score: number;
    reasons: string[];
    gaps: string[];
  };
  partner: {
    type: string;
    label: string;
    referralAngle: string;
    valueProposition: string[];
    discoveryQuestions: string[];
  };
  recommendedMotion: string[];
  email: {
    subject: string;
    body: string;
  };
  outreachSequence: Array<{
    key: string;
    dayOffset: number;
    subject: string;
    body: string;
  }>;
  guardrails: string[];
};

export default function CorporatePartnerBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/partners/" + encodeURIComponent(id) + "/brief", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente partnerdossieret.");
      setBrief(body?.brief || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente partnerdossieret.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyEmail(step: { key: string; subject: string; body: string }) {
    const text = "Emne: " + step.subject + "\n\n" + step.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice(step.key + " kopiert.");
      window.setTimeout(() => setCopyNotice(""), 2200);
    } catch {
      setCopyNotice("Kunne ikke kopiere automatisk.");
    }
  }

  if (loading || !brief) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        {error ? (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <Loader2 size={16} className="animate-spin" /> Henter partnerdossier …
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link href="/corporate-homes/partners" className="mb-3 inline-flex items-center gap-1 text-xs font-black text-cyan-800 hover:underline">
              <ArrowLeft size={14} /> Partnerkø
            </Link>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
              <Handshake size={16} /> Zen Corporate Homes · partnerdossier
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{brief.company.name}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className={"rounded-full px-3 py-1.5 font-black " + (brief.fit.tier === "A" ? "bg-emerald-100 text-emerald-900" : "bg-cyan-100 text-cyan-900")}>
                Fit {brief.fit.tier} · {brief.fit.score}/100
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">{brief.partner.label}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">{brief.company.status}</span>
            </div>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
            <RefreshCw size={16} /> Oppdater
          </button>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}

      <section className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
            <Building2 size={16} /> Selskapsgrunnlag
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Info label="Bransje" value={brief.company.industry || "Ikke oppgitt"} />
            <Info label="Lokasjon" value={brief.company.city || "Ikke oppgitt"} />
            <Info label="Ansatte" value={brief.company.employeeCount ? String(brief.company.employeeCount) : "Ikke oppgitt"} />
            <Info label="Organisasjonsnummer" value={brief.company.organizationNumber || "Ikke oppgitt"} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            {brief.company.website && (
              <a href={brief.company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-cyan-800 hover:underline">
                Nettsted <ExternalLink size={14} />
              </a>
            )}
            {brief.company.sourceUrl && (
              <a href={brief.company.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-slate-600 hover:underline">
                Registerkilde <ExternalLink size={14} />
              </a>
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-amber-300">Anbefalt partnervinkel</div>
          <h2 className="mt-2 text-2xl font-black">{brief.partner.label}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">{brief.partner.referralAngle}</p>
          <div className="mt-6 space-y-2">
            {brief.partner.valueProposition.map((item) => (
              <div key={item} className="rounded-2xl bg-white/5 px-4 py-3 text-sm leading-6 text-slate-200">✓ {item}</div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
            <CheckCircle2 size={16} /> Hvorfor den passer
          </div>
          <div className="mt-4 space-y-2">
            {brief.fit.reasons.length ? brief.fit.reasons.map((reason) => (
              <div key={reason} className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-950">{reason}</div>
            )) : <p className="text-sm text-slate-500">Ingen fit-grunner registrert.</p>}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-800">
            <CircleHelp size={16} /> Må avklares
          </div>
          <div className="mt-4 space-y-2">
            {brief.fit.gaps.length ? brief.fit.gaps.map((gap) => (
              <div key={gap} className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-950">{gap}</div>
            )) : <p className="text-sm text-slate-500">Ingen store selskapsdatagap registrert.</p>}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Samarbeidssamtale</div>
          <h2 className="mt-2 text-xl font-black text-slate-950">Tre spørsmål før vi går videre</h2>
          <ol className="mt-5 space-y-3">
            {brief.partner.discoveryQuestions.map((question, index) => (
              <li key={question} className="flex gap-3 rounded-2xl border border-slate-200 p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-800 text-xs font-black text-white">{index + 1}</span>
                <span className="text-sm leading-6 text-slate-700">{question}</span>
              </li>
            ))}
          </ol>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Anbefalt arbeidsflyt</div>
          <h2 className="mt-2 text-xl font-black text-slate-950">Fra partner-fit til kontrollert kontakt</h2>
          <ol className="mt-5 space-y-3">
            {brief.recommendedMotion.map((item, index) => (
              <li key={item} className="flex gap-3 rounded-2xl bg-slate-50 p-4">
                <span className="font-black text-amber-700">0{index + 1}</span>
                <span className="text-sm leading-6 text-slate-700">{item}</span>
              </li>
            ))}
          </ol>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
            <Mail size={16} /> Norsk partnersekvens
          </div>
          <h2 className="mt-2 text-xl font-black text-slate-950">Dag 0 · 7 · 21 — kun utkast</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Sekvensen har sporbare lenker til den norske partnersiden. Riktig kontaktperson skal identifiseres og kontrolleres før første kontakt. Det er ingen automatisk utsendelse.
          </p>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {brief.outreachSequence.map((step) => (
            <article key={step.key} className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-teal-800">Dag {step.dayOffset}</div>
                <div className="mt-1 font-bold text-slate-950">{step.subject}</div>
              </div>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap p-4 font-sans text-xs leading-5 text-slate-700">{step.body}</pre>
              <div className="border-t border-slate-200 p-3">
                <button onClick={() => void copyEmail(step)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white">
                  <Copy size={14} /> Kopier utkast
                </button>
              </div>
            </article>
          ))}
        </div>
        {copyNotice && <div className="mt-3 text-xs font-bold text-emerald-800">{copyNotice}</div>}
      </section>

      <section className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-900">
          <ShieldCheck size={16} /> Guardrails
        </div>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-cyan-950">
          {brief.guardrails.map((item) => <li key={item}>• {item}</li>)}
        </ul>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-950">{value}</div>
    </div>
  );
}
