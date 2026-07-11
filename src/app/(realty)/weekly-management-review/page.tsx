"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  History,
  RefreshCw,
  Save,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import type {
  WeeklyIssueStatus,
  WeeklyIssueView,
  WeeklyManagementJournal,
  WeeklyManagementReviewView,
  WeeklyManagementSnapshot,
} from "@/lib/revenue/weekly-management-review";

const STATUS_LABELS: Record<WeeklyIssueStatus, string> = {
  OPEN: "Ikke avklart",
  MONITOR: "Følg med",
  CORRECTIVE_ACTION: "Korrigerende handling",
  ESCALATED: "Eskalert",
  RESOLVED: "Løst",
  ACCEPTED_RISK: "Akseptert risiko",
};

function dateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Madrid", dateStyle: "medium", timeStyle: "short" }).format(date);
}

function dateOnly(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeZone: "Europe/Madrid" }).format(date);
}

function money(value: number | null) {
  if (value === null) return null;
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function percentage(value: number | null) {
  return value === null ? "Ikke nok data" : `${value}%`;
}

function delta(value: number | null, suffix = " pp") {
  if (value === null) return "Ingen sammenligning";
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function issueClass(issue: WeeklyIssueView) {
  if (issue.overdue || issue.severity === "CRITICAL") return "border-red-800/70 bg-red-950/20";
  if (issue.severity === "HIGH") return "border-amber-800/60 bg-amber-950/15";
  return "border-slate-800 bg-slate-900/60";
}

function IssueEditor({
  issue,
  disabled,
  saving,
  onSave,
}: {
  issue: WeeklyIssueView;
  disabled: boolean;
  saving: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [status, setStatus] = useState<WeeklyIssueStatus>(issue.status);
  const [note, setNote] = useState(issue.note || "");
  const [followupAt, setFollowupAt] = useState(issue.followupAt || "");
  const [responsibleEmail, setResponsibleEmail] = useState(issue.responsibleEmail || "");

  useEffect(() => {
    setStatus(issue.status);
    setNote(issue.note || "");
    setFollowupAt(issue.followupAt || "");
    setResponsibleEmail(issue.responsibleEmail || "");
  }, [issue]);

  const requiresDate = status === "MONITOR" || status === "CORRECTIVE_ACTION";
  return (
    <article className={`rounded-2xl border p-5 ${issueClass(issue)}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>{issue.type.replaceAll("_", " ")}</span>
            <span>{issue.source}</span>
            <span>{issue.severity}</span>
            <span className={issue.overdue ? "text-red-300" : ""}>{STATUS_LABELS[issue.status]}</span>
          </div>
          <h3 className="font-semibold text-slate-100">{issue.title}</h3>
          <p className="mt-1 text-sm font-medium text-slate-300">{issue.subject}</p>
          <p className="mt-2 text-sm text-slate-400">{issue.detail}</p>
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
            <strong>Anbefalt ledelsesbeslutning:</strong> {issue.recommendedAction}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            {issue.appearances > 0 && <span>{issue.appearances} forekomster</span>}
            {issue.deferrals > 0 && <span>{issue.deferrals} utsettelser</span>}
            {issue.daysOpen !== null && <span>{issue.daysOpen} dager synlig</span>}
            {issue.amountEur !== null && <span className="font-semibold text-emerald-300">{money(issue.amountEur)}</span>}
            {issue.updatedAt && <span>Sist vurdert {dateTime(issue.updatedAt)} av {issue.updatedBy}</span>}
            <Link href={issue.href} className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300">Åpne arbeidsflate <ArrowRight size={13}/></Link>
          </div>
        </div>

        {!disabled && (
          <div className="w-full shrink-0 space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 xl:w-[360px]">
            <label className="block text-xs font-medium text-slate-400">
              Ukekonklusjon
              <select value={status} onChange={(event) => setStatus(event.target.value as WeeklyIssueStatus)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block text-xs font-medium text-slate-400">
                Oppfølgingsdato{requiresDate ? " *" : ""}
                <input type="date" value={followupAt} onChange={(event) => setFollowupAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"/>
              </label>
              <label className="block text-xs font-medium text-slate-400">
                Journalansvarlig
                <input type="email" value={responsibleEmail} onChange={(event) => setResponsibleEmail(event.target.value)} placeholder="navn@firma.no" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"/>
              </label>
            </div>
            <label className="block text-xs font-medium text-slate-400">
              Ledelsesnotat
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"/>
            </label>
            <p className="text-[11px] text-slate-600">Journalansvar endrer ikke CRM-eier, oppgaveeier eller teamtildeling.</p>
            <button
              onClick={() => onSave({ action: "UPDATE_ISSUE", issueId: issue.id, issueFingerprint: issue.fingerprint, status, note, followupAt: followupAt || null, responsibleEmail: responsibleEmail || null })}
              disabled={saving || (requiresDate && !followupAt)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={15}/> Lagre konklusjon
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export default function WeeklyManagementReviewPage() {
  const [journal, setJournal] = useState<WeeklyManagementJournal | null>(null);
  const [currentSnapshot, setCurrentSnapshot] = useState<WeeklyManagementSnapshot | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [weekNote, setWeekNote] = useState("");

  const load = async (preferredId?: string | null) => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/revenue/command/weekly-management-review", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Kunne ikke hente ukentlig ledelsesgjennomgang.");
      setLoading(false);
      return;
    }
    const nextJournal = body.journal as WeeklyManagementJournal;
    setJournal(nextJournal);
    setCurrentSnapshot(body.currentSnapshot || null);
    setWarning(body.operatingReviewWarning || null);
    setCanWrite(Boolean(body.canWrite));
    const candidate = preferredId || selectedId || nextJournal.currentReviewId || nextJournal.reviews[0]?.id || null;
    setSelectedId(nextJournal.reviews.some((review) => review.id === candidate) ? candidate : nextJournal.reviews[0]?.id || null);
    setLoading(false);
  };

  useEffect(() => { void load(null); }, []);
  const selected = useMemo(() => journal?.reviews.find((review) => review.id === selectedId) || null, [journal, selectedId]);

  const post = async (payload: Record<string, unknown>, successText: string, preferredId?: string | null) => {
    setSaving(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/revenue/command/weekly-management-review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Ukereview-handlingen kunne ikke lagres.");
    else {
      setMessage(body.unchanged ? "Ingen endring var nødvendig." : successText);
      await load(preferredId || body.reviewId || body.event?.reviewId || selectedId);
    }
    setSaving(false);
  };

  if (loading && !journal) return <div className="p-8 text-slate-400">Laster ukentlig ledelsesgjennomgang…</div>;

  const summaryCards: Array<{ label: string; value: number | string; icon: typeof History }> = journal ? [
    { label: "Ukesgjennomganger", value: journal.summary.reviews, icon: History },
    { label: "Åpne flaskehalser", value: journal.summary.openIssues, icon: Target },
    { label: "Aktive tiltak", value: journal.summary.activeActions, icon: CalendarClock },
    { label: "Forfalte tiltak", value: journal.summary.overdueActions, icon: AlertTriangle },
  ] : [];

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary-400"><BarChart3 size={18}/> Weekly Management Review</div>
            <h1 className="text-3xl font-bold">Beslutningsutfall og ukentlig fremdrift</h1>
            <p className="mt-2 max-w-3xl text-slate-400">Mål hva som ble løst, hva som ble utsatt, og hvor beslutningsflyten stopper—uten å endre den underliggende saken automatisk.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/operating-review" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><BookOpenCheck size={15}/> Daglig beslutningsjournal</Link>
            <button onClick={() => void load(selectedId)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><RefreshCw size={15}/> Oppdater</button>
          </div>
        </header>

        {error && <div className="rounded-xl border border-red-700/60 bg-red-950/40 p-4 text-red-200"><AlertTriangle className="mr-2 inline" size={17}/>{error}</div>}
        {message && <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-4 text-emerald-200"><CheckCircle2 className="mr-2 inline" size={17}/>{message}</div>}
        {warning && <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4 text-sm text-amber-200">Operating Review-data har en advarsel: {warning}</div>}

        {journal && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex items-center justify-between text-slate-500"><span className="text-xs uppercase tracking-wide">{label}</span><Icon size={17}/></div>
                  <p className="mt-2 text-2xl font-bold text-slate-100">{value}</p>
                </div>
              ))}
            </section>

            {!journal.currentReviewId && currentSnapshot && canWrite && (
              <section className="rounded-2xl border border-primary-800/50 bg-primary-950/20 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="font-semibold text-primary-100">Start ukesgjennomgang for {dateOnly(currentSnapshot.weekStart)}–{dateOnly(currentSnapshot.weekEnd)}</h2>
                    <p className="mt-1 text-sm text-slate-400">Snapshotet inneholder {currentSnapshot.metrics.uniqueDecisions} unike beslutninger og {currentSnapshot.issues.length} prioriterte flaskehalser.</p>
                  </div>
                  <button onClick={() => post({ action: "CAPTURE_WEEK" }, "Ukesgjennomgangen er startet.")} disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50">Start ukesgjennomgang</button>
                </div>
              </section>
            )}

            <div className="grid gap-6 xl:grid-cols-[280px,minmax(0,1fr)]">
              <aside className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-300">Historikk</h2>
                {journal.reviews.length === 0 && <div className="rounded-xl border border-slate-800 p-4 text-sm text-slate-500">Ingen ukesgjennomganger er lagret ennå.</div>}
                {journal.reviews.map((review) => (
                  <button key={review.id} onClick={() => setSelectedId(review.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === review.id ? "border-primary-600 bg-primary-950/30" : "border-slate-800 bg-slate-900/60 hover:border-slate-700"}`}>
                    <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{dateOnly(review.weekStart)}</span><span className={`text-[10px] uppercase ${review.completed ? "text-emerald-400" : "text-amber-400"}`}>{review.completed ? "Fullført" : "Åpen"}</span></div>
                    <p className="mt-1 text-xs text-slate-500">{review.capturedRole} · {review.issues.length} flaskehalser</p>
                    <p className="mt-2 text-xs text-slate-400">{review.metrics.completionRate === null ? "Ingen beslutningsdata" : `${review.metrics.completionRate}% løst`}</p>
                  </button>
                ))}
              </aside>

              <main className="min-w-0 space-y-6">
                {!selected && <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-500">Velg eller start en ukesgjennomgang.</div>}
                {selected && <WeeklyReviewContent review={selected} canWrite={canWrite} saving={saving} weekNote={weekNote} setWeekNote={setWeekNote} post={post}/>} 
              </main>
            </div>
          </>
        )}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-400" size={18}/><p>Ukesreviewen er append-only beslutningsstøtte. Den oppretter ikke oppgaver, endrer ikke CRM-eier, flytter ikke pipeline, registrerer ikke betaling og sender ingen kunde- eller teamkommunikasjon.</p></div>
        </section>
      </div>
    </div>
  );
}

function WeeklyReviewContent({
  review,
  canWrite,
  saving,
  weekNote,
  setWeekNote,
  post,
}: {
  review: WeeklyManagementReviewView;
  canWrite: boolean;
  saving: boolean;
  weekNote: string;
  setWeekNote: (value: string) => void;
  post: (payload: Record<string, unknown>, successText: string, preferredId?: string | null) => Promise<void>;
}) {
  const metrics = review.metrics;
  const metricCards: Array<{ label: string; value: string | number; detail: string; icon: typeof Target }> = [
    { label: "Løsningsgrad", value: percentage(metrics.completionRate), detail: `${metrics.decisionsResolved} av ${metrics.uniqueDecisions} unike beslutninger`, icon: CheckCircle2 },
    { label: "Beslutningsdekning", value: percentage(metrics.decisionCoverageRate), detail: `${metrics.decisionsRecorded} med registrert utfall`, icon: Target },
    { label: "Forfalte oppfølginger", value: metrics.overdueFollowups, detail: `${metrics.activeFollowups} aktive oppfølginger`, icon: AlertTriangle },
    { label: "Gjentatte utsettelser", value: metrics.repeatedDeferrals, detail: `${metrics.averageActiveAgeDays ?? 0} dager gjennomsnittlig alder`, icon: CalendarClock },
  ];

  return (
    <>
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-slate-500"><span>{review.capturedRole}</span><span>Revisjon {review.revision}</span><span>{review.completed ? "Fullført" : "Åpen"}</span></div>
            <h2 className="mt-2 text-xl font-semibold">Uke {dateOnly(review.weekStart)}–{dateOnly(review.weekEnd)}</h2>
            <p className="mt-1 text-sm text-slate-400">Snapshot opprettet {dateTime(review.capturedAt)} av {review.capturedBy}.</p>
          </div>
          {canWrite && review.weekStart === review.weekStart && (
            <div className="flex flex-wrap gap-2">
              {!review.completed && <button onClick={() => post({ action: "REFRESH_WEEK", reviewId: review.id }, "Ukesanalysen er oppdatert.", review.id)} disabled={saving} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"><RefreshCw className="mr-2 inline" size={14}/>Oppdater analyse</button>}
              {review.completed
                ? <button onClick={() => post({ action: "REOPEN_WEEK", reviewId: review.id, note: weekNote }, "Ukesgjennomgangen er gjenåpnet.", review.id)} disabled={saving} className="rounded-lg border border-amber-700 px-3 py-2 text-sm text-amber-200 hover:bg-amber-950/30 disabled:opacity-50">Gjenåpne</button>
                : <button onClick={() => post({ action: "COMPLETE_WEEK", reviewId: review.id, note: weekNote }, "Ukesgjennomgangen er fullført.", review.id)} disabled={saving || review.openIssues > 0} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">Fullfør uke</button>}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(({ label, value, detail, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-slate-500"><span className="text-xs uppercase tracking-wide">{label}</span><Icon size={17}/></div>
            <p className="mt-2 text-2xl font-bold">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"><p className="text-xs uppercase text-slate-500">Løsningsgrad mot forrige uke</p><p className="mt-2 text-lg font-semibold">{delta(review.comparison.completionRateDelta)}</p></div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"><p className="text-xs uppercase text-slate-500">Forfall mot forrige uke</p><p className="mt-2 text-lg font-semibold">{delta(review.comparison.overdueFollowupsDelta, "")}</p></div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"><p className="text-xs uppercase text-slate-500">Utsettelser mot forrige uke</p><p className="mt-2 text-lg font-semibold">{delta(review.comparison.repeatedDeferralsDelta, "")}</p></div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-4 flex items-center gap-2"><TrendingUp size={17} className="text-primary-400"/><h2 className="font-semibold">Arbeidsområder</h2></div>
        {review.bySource.length === 0 ? <p className="text-sm text-slate-500">Ingen beslutninger er registrert for uken.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="pb-3">Område</th><th className="pb-3">Beslutninger</th><th className="pb-3">Løst</th><th className="pb-3">Aktive</th><th className="pb-3">Forfalt</th><th className="pb-3">Utsettelser</th><th className="pb-3">Løsningsgrad</th></tr></thead><tbody>{review.bySource.map((row) => <tr key={row.id} className="border-t border-slate-800"><td className="py-3 font-medium">{row.label}</td><td>{row.decisions}</td><td>{row.resolved}</td><td>{row.active}</td><td>{row.overdue}</td><td>{row.repeatedDeferrals}</td><td>{percentage(row.completionRate)}</td></tr>)}</tbody></table></div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between"><div><h2 className="text-lg font-semibold">Prioriterte flaskehalser</h2><p className="text-sm text-slate-500">{review.openIssues} uten konklusjon · {review.conclusionCoverageRate}% dekket</p></div></div>
        {review.issues.length === 0 && <div className="rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-6 text-emerald-200"><CheckCircle2 className="mr-2 inline" size={18}/>Ingen regelbaserte flaskehalser ble funnet i ukens beslutningshistorikk.</div>}
        {review.issues.map((issue) => <IssueEditor key={`${issue.id}:${issue.fingerprint}`} issue={issue} disabled={!canWrite || review.completed} saving={saving} onSave={(payload) => post({ ...payload, reviewId: review.id }, "Ukekonklusjonen er lagret.", review.id)}/>)}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="font-semibold">Ledelsesnotat og avslutning</h2>
        <textarea value={weekNote} onChange={(event) => setWeekNote(event.target.value)} maxLength={1000} rows={3} placeholder="Kort intern oppsummering av ukens viktigste læring eller beslutning…" className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"/>
        {canWrite && !review.completed && <button onClick={async () => { await post({ action: "ADD_WEEK_NOTE", reviewId: review.id, note: weekNote }, "Ledelsesnotatet er lagret.", review.id); setWeekNote(""); }} disabled={saving || !weekNote.trim()} className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"><Save className="mr-2 inline" size={14}/>Lagre notat</button>}
        {review.notes.length > 0 && <div className="mt-4 space-y-2">{review.notes.map((note) => <div key={note.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><p className="text-sm text-slate-300">{note.note}</p><p className="mt-1 text-xs text-slate-600">{dateTime(note.at)} · {note.actorEmail}</p></div>)}</div>}
      </section>
    </>
  );
}
