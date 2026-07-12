"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Lightbulb,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Wrench,
} from "lucide-react";
import {
  IMPROVEMENT_ACTION_TYPES,
  IMPROVEMENT_STATUSES,
  ROOT_CAUSE_CATEGORIES,
  type ContinuousImprovementRegister,
  type ImprovementActionType,
  type ImprovementStatus,
  type ImprovementView,
  type RootCauseCategory,
} from "@/lib/revenue/continuous-improvement";

const STATUS_LABELS: Record<ImprovementStatus, string> = {
  OPEN: "Åpen",
  DIAGNOSING: "Analyserer rotårsak",
  ACTION_PLANNED: "Tiltak planlagt",
  IN_PROGRESS: "Tiltak pågår",
  VERIFYING: "Verifiserer effekt",
  EFFECTIVE: "Dokumentert effektivt",
  INEFFECTIVE: "Ikke effektivt",
  ACCEPTED_RISK: "Akseptert risiko",
};

const ROOT_LABELS: Record<RootCauseCategory, string> = {
  UNKNOWN: "Ikke fastslått",
  PROCESS: "Prosess",
  CAPACITY: "Kapasitet",
  OWNERSHIP: "Ansvar/eierskap",
  DATA_QUALITY: "Datakvalitet",
  SYSTEM_TOOLING: "System/verktøy",
  DEPENDENCY: "Avhengighet",
  DECISION_AUTHORITY: "Beslutningsmyndighet",
  SKILL_KNOWLEDGE: "Kompetanse/kunnskap",
  EXTERNAL: "Ekstern årsak",
};

const ACTION_LABELS: Record<ImprovementActionType, string> = {
  UNSET: "Ikke valgt",
  STANDARDIZE_PROCESS: "Standardiser prosess",
  CLARIFY_OWNERSHIP: "Avklar ansvar",
  IMPROVE_DATA: "Forbedre data",
  AUTOMATE_SAFELY: "Trygg automatisering",
  TRAINING: "Opplæring",
  CAPACITY_CHANGE: "Endre kapasitet",
  ESCALATE_DEPENDENCY: "Eskaler avhengighet",
  OTHER: "Annet",
};

const EFFECT_LABELS = {
  NOT_ENOUGH_DATA: "Ikke nok data",
  IMPROVING: "Forbedres",
  UNCHANGED: "Uendret",
  WORSENING: "Forverres",
  RESOLVED: "Ikke gjentatt",
} as const;

type ResponseBody = {
  register: ContinuousImprovementRegister | null;
  weeklyWarning?: string | null;
  user?: { email: string; role: string };
  canWrite?: boolean;
  error?: string;
};

type FormState = {
  status: ImprovementStatus;
  rootCauseCategory: RootCauseCategory;
  rootCauseStatement: string;
  actionType: ImprovementActionType;
  actionPlan: string;
  dueAt: string;
  ownerEmail: string;
  successMetric: string;
  targetValue: string;
  evidenceNote: string;
};

function formFrom(item: ImprovementView): FormState {
  return {
    status: item.status,
    rootCauseCategory: item.rootCauseCategory,
    rootCauseStatement: item.rootCauseStatement || "",
    actionType: item.actionType,
    actionPlan: item.actionPlan || "",
    dueAt: item.dueAt || "",
    ownerEmail: item.ownerEmail || "",
    successMetric: item.successMetric || "",
    targetValue: item.targetValue || "",
    evidenceNote: "",
  };
}

function percentage(value: number | null) {
  return value === null ? "–" : `${value}%`;
}

function date(value: string | null) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00Z`));
}

function dateTime(value: string | null) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ContinuousImprovementPage() {
  const [body, setBody] = useState<ResponseBody>({ register: null });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [journalNote, setJournalNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const load = async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/revenue/command/continuous-improvement", { cache: "no-store" });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Kunne ikke hente forbedringsregisteret.");
      setBody(next);
      const improvements: ImprovementView[] = next.register?.improvements || [];
      const id = preferredId && improvements.some((item) => item.id === preferredId)
        ? preferredId
        : selectedId && improvements.some((item) => item.id === selectedId)
          ? selectedId
          : improvements[0]?.id || null;
      setSelectedId(id);
      const selected = improvements.find((item) => item.id === id) || null;
      setForm(selected ? formFrom(selected) : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ukjent feil");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const register = body.register;
  const selected = useMemo(() => register?.improvements.find((item) => item.id === selectedId) || null, [register, selectedId]);
  const visibleImprovements = useMemo(() => register?.improvements.filter((item) => showClosed || !item.closed) || [], [register, showClosed]);

  useEffect(() => { if (selected) setForm(formFrom(selected)); }, [selectedId]);

  const post = async (payload: Record<string, unknown>, success: string, preferredId?: string | null) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/revenue/command/continuous-improvement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Handlingen kunne ikke lagres.");
      setMessage(success);
      await load(preferredId || result.event?.improvementId || result.improvementId || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ukjent feil");
    } finally {
      setSaving(false);
    }
  };

  const saveImprovement = async () => {
    if (!selected || !form) return;
    await post({
      action: "UPDATE_IMPROVEMENT",
      improvementId: selected.id,
      ...form,
      note: form.evidenceNote,
    }, "Forbedringstiltaket er oppdatert.", selected.id);
  };

  if (loading && !register) return <div className="p-8 text-slate-400">Laster forbedringsregister…</div>;

  const summaryCards = register ? [
    { label: "Aktive tiltak", value: register.summary.active, icon: Wrench },
    { label: "Forfalt", value: register.summary.overdue, icon: AlertTriangle },
    { label: "Verifiserer", value: register.summary.verifying, icon: BarChart3 },
    { label: "Nye kandidater", value: register.summary.suggestedCandidates, icon: Lightbulb },
  ] : [];

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary-400"><TrendingUp size={18}/> Continuous Improvement</div>
            <h1 className="text-3xl font-bold">Rotårsak og kontinuerlig forbedring</h1>
            <p className="mt-2 max-w-3xl text-slate-400">Koble gjentatte flaskehalser til dokumentert rotårsak, kontrollert tiltak og målbar effekt over flere uker.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/weekly-management-review" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><BarChart3 size={15}/> Ukentlig ledelsesreview</Link>
            <button onClick={() => void load(selectedId)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"><RefreshCw size={15}/> Oppdater</button>
          </div>
        </header>

        {error && <div className="rounded-xl border border-red-700/60 bg-red-950/40 p-4 text-red-200"><AlertTriangle className="mr-2 inline" size={17}/>{error}</div>}
        {message && <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-4 text-emerald-200"><CheckCircle2 className="mr-2 inline" size={17}/>{message}</div>}
        {body.weeklyWarning && <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4 text-sm text-amber-200">Ukesdata har en advarsel: {body.weeklyWarning}</div>}

        {register && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex items-center justify-between text-slate-500"><span className="text-xs uppercase tracking-wide">{label}</span><Icon size={17}/></div>
                  <p className="mt-2 text-2xl font-bold">{value}</p>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><h2 className="font-semibold">Foreslåtte forbedringskandidater</h2><p className="text-sm text-slate-500">Kun regelbasert tilbakevendende eller langvarig friksjon.</p></div>
                <span className="text-xs text-slate-500">{register.candidates.filter((item) => !item.existingImprovementId).length} nye</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {register.candidates.filter((item) => !item.existingImprovementId).slice(0, 8).map((candidate) => (
                  <div key={candidate.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase text-slate-500">{candidate.role} · {candidate.source}</p><h3 className="mt-1 font-medium">{candidate.subject}</h3></div><span className={`text-xs ${candidate.severity === "CRITICAL" ? "text-red-400" : candidate.severity === "HIGH" ? "text-amber-400" : "text-slate-400"}`}>{candidate.severity}</span></div>
                    <p className="mt-2 text-sm text-slate-400">{candidate.detail}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500"><span>{candidate.occurrenceWeeks} uker</span><span>{candidate.totalOccurrences} forekomster</span><span>{candidate.repeatedDeferrals} utsettelser</span><span>{percentage(candidate.occurrenceRate)} frekvens</span></div>
                    {body.canWrite && <button onClick={() => post({ action: "CREATE_IMPROVEMENT", candidateId: candidate.id }, "Forbedringstiltaket er opprettet.")} disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50">Start rotårsaksanalyse <ArrowRight size={14}/></button>}
                  </div>
                ))}
                {register.candidates.every((item) => item.existingImprovementId) && <div className="text-sm text-slate-500">Ingen nye kandidater. Eksisterende mønstre er allerede koblet til registeret.</div>}
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[300px,minmax(0,1fr)]">
              <aside className="space-y-3">
                <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-300">Forbedringsregister</h2><label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)}/> Vis lukkede</label></div>
                {visibleImprovements.length === 0 && <div className="rounded-xl border border-slate-800 p-4 text-sm text-slate-500">Ingen forbedringstiltak er opprettet.</div>}
                {visibleImprovements.map((item) => (
                  <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === item.id ? "border-primary-600 bg-primary-950/30" : "border-slate-800 bg-slate-900/60 hover:border-slate-700"}`}>
                    <div className="flex items-start justify-between gap-2"><span className="text-sm font-medium">{item.subject}</span>{item.overdue && <AlertTriangle size={14} className="text-red-400"/>}</div>
                    <p className="mt-1 text-xs text-slate-500">{item.role} · {STATUS_LABELS[item.status]}</p>
                    <p className="mt-2 text-xs text-slate-400">Målt trend: {EFFECT_LABELS[item.effect.trend]}</p>
                  </button>
                ))}
              </aside>

              <main className="min-w-0">
                {!selected || !form ? <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-500">Velg eller opprett et forbedringstiltak.</div> : (
                  <div className="space-y-5">
                    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div><div className="flex flex-wrap gap-2 text-xs uppercase text-slate-500"><span>{selected.role}</span><span>{selected.source}</span><span>{selected.severity}</span><span>{selected.closed ? "Lukket" : "Aktiv"}</span></div><h2 className="mt-2 text-xl font-semibold">{selected.subject}</h2><p className="mt-2 text-sm text-slate-400">{selected.detail}</p></div>
                        <Link href={selected.href} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Åpne kilde <ArrowRight size={14}/></Link>
                      </div>
                    </section>

                    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <Metric label="Baseline-frekvens" value={percentage(selected.baseline.occurrenceRate)} detail={`${selected.baseline.occurrenceWeeks}/${selected.baseline.observedWeeks} uker`} icon={Target}/>
                      <Metric label="Etter tiltak" value={percentage(selected.effect.postRate)} detail={`${selected.effect.postOccurrenceWeeks}/${selected.effect.postObservedWeeks} uker`} icon={BarChart3}/>
                      <Metric label="Målt trend" value={EFFECT_LABELS[selected.effect.trend]} detail={selected.effect.detail} icon={selected.effect.trend === "WORSENING" ? TrendingDown : TrendingUp}/>
                      <Metric label="Frist" value={date(selected.dueAt)} detail={selected.overdue ? "Forfalt" : selected.ownerEmail || "Ingen journalansvarlig"} icon={ClipboardList}/>
                    </section>

                    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                      <h2 className="font-semibold">Rotårsak, tiltak og verifisering</h2>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ImprovementStatus })} disabled={!body.canWrite || selected.closed} className="input"><option value="OPEN">Åpen</option>{IMPROVEMENT_STATUSES.filter((value) => value !== "OPEN").map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select></Field>
                        <Field label="Rotårsakskategori"><select value={form.rootCauseCategory} onChange={(e) => setForm({ ...form, rootCauseCategory: e.target.value as RootCauseCategory })} disabled={!body.canWrite || selected.closed} className="input">{ROOT_CAUSE_CATEGORIES.map((value) => <option key={value} value={value}>{ROOT_LABELS[value]}</option>)}</select></Field>
                        <Field label="Rotårsaksbeskrivelse" wide><textarea value={form.rootCauseStatement} onChange={(e) => setForm({ ...form, rootCauseStatement: e.target.value })} maxLength={1500} rows={3} disabled={!body.canWrite || selected.closed} className="input" placeholder="Beskriv hvorfor mønsteret oppstår, ikke bare symptomet."/></Field>
                        <Field label="Tiltakstype"><select value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value as ImprovementActionType })} disabled={!body.canWrite || selected.closed} className="input">{IMPROVEMENT_ACTION_TYPES.map((value) => <option key={value} value={value}>{ACTION_LABELS[value]}</option>)}</select></Field>
                        <Field label="Journalansvarlig"><input type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} disabled={!body.canWrite || selected.closed} className="input" placeholder="navn@firma.no"/></Field>
                        <Field label="Korrigerende tiltak" wide><textarea value={form.actionPlan} onChange={(e) => setForm({ ...form, actionPlan: e.target.value })} maxLength={2000} rows={3} disabled={!body.canWrite || selected.closed} className="input" placeholder="Hva skal endres, og hvordan skal det gjennomføres?"/></Field>
                        <Field label="Frist"><input type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} disabled={!body.canWrite || selected.closed} className="input"/></Field>
                        <Field label="Suksessmål"><input value={form.successMetric} onChange={(e) => setForm({ ...form, successMetric: e.target.value })} maxLength={500} disabled={!body.canWrite || selected.closed} className="input" placeholder="Eksempel: forekomstrate per uke"/></Field>
                        <Field label="Målverdi"><input value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} maxLength={300} disabled={!body.canWrite || selected.closed} className="input" placeholder="Eksempel: under 25 %"/></Field>
                        <Field label="Dokumentasjon ved effektkonklusjon" wide><textarea value={form.evidenceNote} onChange={(e) => setForm({ ...form, evidenceNote: e.target.value })} maxLength={1000} rows={2} disabled={!body.canWrite || selected.closed} className="input" placeholder="Brukes når annen dokumentasjon enn uketrenden støtter konklusjonen."/></Field>
                      </div>
                      {body.canWrite && !selected.closed && <button onClick={saveImprovement} disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"><Save size={15}/> Lagre kontrollert oppdatering</button>}
                    </section>

                    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                      <h2 className="font-semibold">Forbedringsnotater og avslutning</h2>
                      <textarea value={journalNote} onChange={(e) => setJournalNote(e.target.value)} maxLength={1000} rows={3} className="input mt-3" placeholder="Kort intern læring, observasjon eller beslutning…"/>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {body.canWrite && <button onClick={async () => { await post({ action: "ADD_IMPROVEMENT_NOTE", improvementId: selected.id, note: journalNote }, "Notatet er lagret.", selected.id); setJournalNote(""); }} disabled={saving || !journalNote.trim()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">Legg til notat</button>}
                        {body.canWrite && !selected.closed && <button onClick={() => post({ action: "CLOSE_IMPROVEMENT", improvementId: selected.id, note: journalNote }, "Forbedringstiltaket er lukket.", selected.id)} disabled={saving || !["EFFECTIVE", "INEFFECTIVE", "ACCEPTED_RISK"].includes(selected.status)} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">Lukk tiltak</button>}
                        {body.canWrite && selected.closed && <button onClick={() => post({ action: "REOPEN_IMPROVEMENT", improvementId: selected.id, note: journalNote }, "Forbedringstiltaket er gjenåpnet.", selected.id)} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-amber-700 px-3 py-2 text-sm text-amber-200 hover:bg-amber-950/30"><RotateCcw size={14}/> Gjenåpne</button>}
                      </div>
                      {selected.notes.length > 0 && <div className="mt-4 space-y-2">{selected.notes.slice(0, 8).map((note) => <div key={note.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><p className="text-sm text-slate-300">{note.note}</p><p className="mt-1 text-xs text-slate-600">{note.actorEmail} · {dateTime(note.at)}</p></div>)}</div>}
                    </section>
                  </div>
                )}
              </main>
            </div>
          </>
        )}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-400" size={18}/><p>Registeret er append-only beslutningsstøtte. Journalansvar er ikke CRM-tildeling, og målt trend viser tidsmessig utvikling—ikke bevist årsakssammenheng. Ingen oppgaver, pipeline-endringer, betalinger eller meldinger opprettes automatisk.</p></div>
        </section>
      </div>
      <style jsx>{`.input{width:100%;border-radius:.5rem;border:1px solid rgb(51 65 85);background:rgb(2 6 23);padding:.6rem .75rem;font-size:.875rem;color:rgb(241 245 249)}.input:disabled{opacity:.55}`}</style>
    </div>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: typeof Target }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><div className="flex items-center justify-between text-slate-500"><span className="text-xs uppercase tracking-wide">{label}</span><Icon size={17}/></div><p className="mt-2 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}
