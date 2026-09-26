"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CircleHelp,
  Copy,
  ExternalLink,
  Mail,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { corporateOutreachTemplates, personalizeCorporateOutreach } from "@/lib/corporate-outreach";

type Brief = {
  title: string;
  generatedAt: string;
  fit: {
    tier: string;
    score: number;
    reasons: string[];
    gaps: string[];
  };
  company: {
    name: string;
    organizationNumber?: string | null;
    industry?: string | null;
    city?: string | null;
    size: string;
    website?: string | null;
    sourceUrl?: string | null;
    status: string;
    facts: string[];
  };
  workingModel: { label: string; rationale: string };
  buyingCommittee: string[];
  discoveryQuestions: string[];
  boardChecklist: Array<{ label: string; status: string; note: string }>;
  nextStep: string;
  guardrails: string[];
};

type Prospect = {
  id: string;
  converted_contact_id?: string | null;
  status?: string | null;
};

export default function CorporateProspectBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [contacts, setContacts] = useState<Array<Record<string, any>>>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("initial");
  const [copyNotice, setCopyNotice] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/corporate-homes/prospects/${encodeURIComponent(id)}/brief`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente beslutningsgrunnlaget.");
      setBrief(body?.brief || null);
      setProspect(body?.prospect || null);
      setContacts(body?.contacts || []);
      setWarnings(body?.warnings || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente beslutningsgrunnlaget.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const verifiedContacts = useMemo(
    () => contacts.filter((contact) => ["VERIFIED", "CONTACT_READY"].includes(String(contact.status || "").toUpperCase())),
    [contacts],
  );

  const primaryContact = useMemo(
    () => verifiedContacts.find((contact) => contact.is_primary) || verifiedContacts[0] || null,
    [verifiedContacts],
  );

  const outreach = useMemo(() => {
    const template = corporateOutreachTemplates.find((item) => item.key === selectedTemplate) || corporateOutreachTemplates[0];
    const firstName = String(primaryContact?.name || "").trim().split(/\s+/)[0] || null;
    return personalizeCorporateOutreach(template, { firstName, companyName: brief.company.name });
  }, [brief.company.name, primaryContact, selectedTemplate]);

  async function copyOutreach() {
    const text = `Emne: ${outreach.subject}\n\n${outreach.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice("Kopiert til utklippstavlen.");
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
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Loader2 size={16} className="animate-spin" /> Henter Corporate Homes-dossier …</div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link href="/corporate-homes/prospects" className="mb-3 inline-flex items-center gap-1 text-xs font-black text-cyan-800 hover:underline">
              <ArrowLeft size={14} /> Prospektmotor
            </Link>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
              <FileText size={16} /> Corporate Homes beslutningsgrunnlag
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{brief.company.name}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-teal-50 px-3 py-1.5 font-black text-teal-900">Fit {brief.fit.tier} · {brief.fit.score}/100</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">{brief.company.status}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">{brief.company.size}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {prospect?.converted_contact_id && (
              <Link href={`/customers?contactId=${encodeURIComponent(prospect.converted_contact_id)}&tab=all`} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-900">
                <CheckCircle2 size={16} /> Åpne CRM
              </Link>
            )}
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
              <RefreshCw size={16} /> Oppdater
            </button>
          </div>
        </div>
      </header>

      {warnings.map((warning) => <div key={warning} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{warning}</div>)}

      <section className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
            <Building2 size={16} /> Dokumenterte fakta
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {brief.company.facts.map((fact) => <div key={fact} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-800">{fact}</div>)}
          </div>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            {brief.company.website && <a href={brief.company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-cyan-800 hover:underline">Nettsted <ExternalLink size={14} /></a>}
            {brief.company.sourceUrl && <a href={brief.company.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-cyan-800 hover:underline">Registerkilde <ExternalLink size={14} /></a>}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-amber-300">Arbeidsmodell</div>
          <h2 className="mt-2 text-2xl font-black">{brief.workingModel.label}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">{brief.workingModel.rationale}</p>
          <div className="mt-6 rounded-2xl bg-white/5 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-slate-400">Neste steg</div>
            <p className="mt-2 text-sm leading-6 text-slate-100">{brief.nextStep}</p>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
            <CheckCircle2 size={16} /> Hvorfor den matcher
          </div>
          <div className="mt-4 space-y-2">
            {brief.fit.reasons.length ? brief.fit.reasons.map((reason) => <div key={reason} className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-950">{reason}</div>) : <p className="text-sm text-slate-500">Ingen dokumenterte fit-signaler ennå.</p>}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-800">
            <CircleHelp size={16} /> Må avklares
          </div>
          <div className="mt-4 space-y-2">
            {brief.fit.gaps.length ? brief.fit.gaps.map((gap) => <div key={gap} className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-950">{gap}</div>) : <p className="text-sm text-slate-500">Ingen store datagap registrert.</p>}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
            <Users size={16} /> Buying committee
          </div>
          <div className="mt-4 space-y-2">
            {brief.buyingCommittee.map((role) => <div key={role} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800">{role}</div>)}
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><UserRound size={14} /> Verifiserte kontakter</div>
            <div className="mt-2 text-2xl font-black text-slate-950">{verifiedContacts.length}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Persondata legges bare til via godkjent eller manuelt verifisert kilde.</p>
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Discovery-møte</div>
          <h2 className="mt-2 text-xl font-black text-slate-950">Spørsmål som må besvares før boligmatching</h2>
          <ol className="mt-5 space-y-3">
            {brief.discoveryQuestions.map((question, index) => (
              <li key={question} className="flex gap-3 rounded-2xl border border-slate-200 p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-800 text-xs font-black text-white">{index + 1}</span>
                <span className="text-sm leading-6 text-slate-700">{question}</span>
              </li>
            ))}
          </ol>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Styre-/ledercase</div>
        <h2 className="mt-2 text-xl font-black text-slate-950">Beslutningspunkter</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {brief.boardChecklist.map((item) => (
            <article key={item.label} className="rounded-2xl border border-slate-200 p-4">
              <div className="font-bold text-slate-950">{item.label}</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.note}</p>
              <span className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">{item.status}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
              <Mail size={16} /> Godkjent norsk kontaktsekvens
            </div>
            <h2 className="mt-2 text-xl font-black text-slate-950">Klargjør riktig e-post før kontakt</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Tekstene er godkjent for Zen Corporate Homes. RealtyFlow sender ikke automatisk fra denne visningen;
              meldingen kopieres for kontrollert første kontakt og oppfølging.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {corporateOutreachTemplates.map((template) => (
              <button
                key={template.key}
                onClick={() => setSelectedTemplate(template.key)}
                className={`rounded-xl px-3 py-2 text-xs font-bold ${selectedTemplate === template.key ? "bg-teal-800 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
              >
                {template.dayOffset === 0 ? "Første e-post" : `Dag ${template.dayOffset}`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">Mottakergrunnlag</div>
            <div className="mt-3 text-sm font-bold text-slate-950">{primaryContact?.name || "Ingen verifisert kontakt valgt ennå"}</div>
            <div className="mt-1 text-xs text-slate-500">{primaryContact?.title || primaryContact?.buying_role || "Beslutningstakerrolle må verifiseres"}</div>
            {primaryContact?.email && <div className="mt-2 text-xs font-semibold text-cyan-900">{primaryContact.email}</div>}
            <div className="mt-4 rounded-xl bg-white p-3 text-xs leading-5 text-slate-600">
              {primaryContact
                ? "Bruk verifisert kontaktinformasjon og kontroller at personen fortsatt har relevant rolle før utsendelse."
                : "Finn og verifiser beslutningstaker før første kontakt. Ikke send til generiske eller usikre persondata automatisk."}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500">Emne</div>
              <div className="mt-1 font-bold text-slate-950">{outreach.subject}</div>
            </div>
            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap p-4 font-sans text-sm leading-6 text-slate-700">{outreach.body}</pre>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 p-4">
              <button onClick={() => void copyOutreach()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
                <Copy size={16} /> Kopier e-post
              </button>
              {copyNotice && <span className="text-xs font-semibold text-emerald-800">{copyNotice}</span>}
              <span className="text-xs text-slate-500">Ingen automatisk utsendelse.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-cyan-50 p-5 sm:p-6">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-900">
          <ShieldCheck size={16} /> Guardrails
        </div>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-cyan-950">
          {brief.guardrails.map((guardrail) => <li key={guardrail}>• {guardrail}</li>)}
        </ul>
      </section>
    </div>
  );
}
