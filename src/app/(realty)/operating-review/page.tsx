"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  History,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { ExecutiveBriefing } from "@/lib/revenue/executive-briefing";
import type {
  OperatingDecisionStatus,
  OperatingDecisionView,
  OperatingReviewJournal,
  OperatingReviewTimelineEvent,
  OperatingReviewView,
} from "@/lib/revenue/operating-review";

const STATUS_LABELS: Record<OperatingDecisionStatus, string> = {
  OPEN: "Ikke avklart",
  ACTION_PLANNED: "Handling planlagt",
  DEFERRED: "Utsatt",
  ESCALATED: "Eskalert",
  COMPLETED: "Fullført",
  NO_ACTION: "Ingen handling",
};

const EVENT_LABELS: Record<OperatingReviewTimelineEvent["type"], string> = {
  REVIEW_CAPTURED: "Gjennomgang startet",
  REVIEW_REFRESHED: "Snapshot oppdatert",
  DECISION_UPDATED: "Beslutning registrert",
  REVIEW_NOTE_ADDED: "Møtenotat lagt til",
  REVIEW_COMPLETED: "Gjennomgang fullført",
  REVIEW_REOPENED: "Gjennomgang gjenåpnet",
};

function dateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Madrid",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function money(value: number | null) {
  if (value === null) return null;
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function reviewStateClass(state: OperatingReviewView["state"]) {
  if (state === "CRITICAL") return "border-red-800/70 bg-red-950/30 text-red-100";
  if (state === "ATTENTION") return "border-amber-800/60 bg-amber-950/25 text-amber-100";
  return "border-emerald-800/60 bg-emerald-950/25 text-emerald-100";
}

function decisionClass(decision: OperatingDecisionView) {
  if (decision.overdue) return "border-red-800/70 bg-red-950/20";
  if (decision.severity === "CRITICAL") return "border-red-900/60 bg-red-950/15";
  if (decision.severity === "HIGH") return "border-amber-900/60 bg-amber-950/15";
  return "border-slate-800 bg-slate-900/60";
}

function DecisionEditor({
  decision,
  disabled,
  saving,
  onSave,
}: {
  decision: OperatingDecisionView;
  disabled: boolean;
  saving: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [status, setStatus] = useState<OperatingDecisionStatus>(decision.status);
  const [note, setNote] = useState(decision.note || "");
  const [followupAt, setFollowupAt] = useState(decision.followupAt || "");
  const [responsibleEmail, setResponsibleEmail] = useState(decision.responsibleEmail || "");

  useEffect(() => {
    setStatus(decision.status);
    setNote(decision.note || "");
    setFollowupAt(decision.followupAt || "");
    setResponsibleEmail(decision.responsibleEmail || "");
  }, [decision]);

  const requiresDate = status === "ACTION_PLANNED" || status === "DEFERRED";

  return (
    <article className={`rounded-2xl border p-5 ${decisionClass(decision)}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>{decision.source}</span>
            <span>{decision.severity}</span>
            <span className={decision.overdue ? "text-red-300" : ""}>{STATUS_LABELS[decision.status]}</span>
            {decision.followupAt && <span>Oppfølging {decision.followupAt}</span>}
          </div>
          <h3 className="font-semibold text-slate-100">{decision.title}</h3>
          <p className="mt-1 text-sm font-medium text-slate-300">{decision.subject}</p>
          <p className="mt-2 text-sm text-slate-400">{decision.detail}</p>
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
            <strong>Anbefalt handling:</strong> {decision.recommendedAction}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            {decision.amountEur !== null && <span className="font-semibold text-emerald-300">{money(decision.amountEur)}</span>}
            {decision.updatedAt && <span>Sist registrert {dateTime(decision.updatedAt)} av {decision.updatedBy}</span>}
            <Link href={decision.href} className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300">
              Åpne arbeidsflate <ArrowRight size={13}/>
            </Link>
          </div>
        </div>

        {!disabled && (
          <div className="w-full shrink-0 space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 xl:w-[360px]">
            <label className="block text-xs font-medium text-slate-400">
              Konklusjon
              <select value={status} onChange={(event) => setStatus(event.target.value as OperatingDecisionStatus)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
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
              Beslutningsnotat
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"/>
            </label>
            <p className="text-[11px] text-slate-600">Journalansvarlig dokumenterer ansvar i denne gjennomgangen. Det endrer ikke CRM- eller teamtildeling.</p>
            <button
              onClick={() => onSave({
                action: "UPDATE_DECISION",
                decisionId: decision.id,
                decisionFingerprint: decision.fingerprint,
                status,
                note,
                followupAt: followupAt || null,
                responsibleEmail: responsibleEmail || null,
              })}
              disabled={saving || (requiresDate && !followupAt)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={15}/> Lagre beslutning
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export default function OperatingReviewPage() {
  const [journal, setJournal] = useState<OperatingReviewJournal | null>(null);
  const [currentBriefing, setCurrentBriefing] = useState<ExecutiveBriefing | null>(null);
  const [briefingWarning, setBriefingWarning] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reviewNote, setReviewNote] = useState("");

  const load = async (preferredId?: string | null) => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/revenue/command/operating-review", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Kunne ikke hente beslutningsjournalen.");
      setLoading(false);
      return;
    }
    const nextJournal = body.journal as OperatingReviewJournal;
    setJournal(nextJournal);
    setCurrentBriefing(body.currentBriefing || null);
    setBriefingWarning(body.currentBriefingWarning || null);
    setCanWrite(Boolean(body.canWrite));
    const candidate = preferredId || selectedId || nextJournal.todayReviewId || nextJournal.reviews[0]?.id || null;
    setSelectedId(nextJournal.reviews.some((review) => review.id === candidate) ? candidate : nextJournal.reviews[0]?.id || null);
    setLoading(false);
  };

  useEffect(() => { void load(null); }, []);

  const selected = useMemo(() => journal?.reviews.find((review) => review.id === selectedId) || null, [journal, selectedId]);

  const post = async (payload: Record<string, unknown>, successText: string, preferredId?: string | null) => {
    setSaving(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/revenue/command/operating-review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Journalhandlingen kunne ikke lagres.");
    else {
      setMessage(body.unchanged ? "Ingen endring var nødvendig." : successText);
      await load(preferredId || body.reviewId || body.event?.reviewId || selectedId);
    }
    setSaving(false);
  };

  if (loading && !journal) return <div className="p-8 text-slate-400">Laster beslutningsjournal…</div>;

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary-400"><BookOpenCheck size={18}/> Operating Review</div>
            <h1 className="text-3xl font-bold">Historikk og beslutningsjournal</h1>
            <p className="mt-2 max-w-3xl text-slate-400">Dokumenter hva som ble vurdert, hvilken manuell beslutning som ble tatt og når oppfølgingen skal kontrolleres.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/executive-briefing" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><ClipboardCheck size={15}/> Dagens briefing</Link>
            <button onClick={() => void load(selectedId)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><RefreshCw size={15}/> Oppdater</button>
          </div>
        </header>

        {error && <div className="rounded-xl border border-red-700/60 bg-red-950/40 p-4 text-red-200"><AlertTriangle className="mr-2 inline" size={17}/>{error}</div>}
        {message && <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-4 text-emerald-200"><CheckCircle2 className="mr-2 inline" size={17}/>{message}</div>}
        {briefingWarning && <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4 text-sm text-amber-200">Dagens briefing kunne ikke oppdateres: {briefingWarning}. Historikken er fortsatt tilgjengelig.</div>}

        {journal && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Gjennomganger", journal.summary.reviews, History],
                ["Ikke avklart", journal.summary.undecidedDecisions, ClipboardCheck],
                ["Aktiv oppfølging", journal.summary.outstandingFollowups, CalendarClock],
                ["Forfalt oppfølging", journal.summary.overdueFollowups, AlertTriangle],
              ].map(([label, value, Icon]) => (
                <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                  <div className="flex items-center justify-between"><span className="text-sm text-slate-400">{String(label)}</span><Icon size={17} className="text-slate-500"/></div>
                  <div className="mt-2 text-2xl font-bold">{String(value)}</div>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-medium text-primary-400">Dagens operative grunnlag</div>
                  <h2 className="mt-1 text-xl font-semibold">{currentBriefing?.headline || "Dagens briefing er ikke tilgjengelig"}</h2>
                  {currentBriefing && <p className="mt-2 text-sm text-slate-400">{currentBriefing.decisions.length} prioriterte beslutninger · status {currentBriefing.state} · generert {dateTime(currentBriefing.generatedAt)}</p>}
                </div>
                {canWrite && currentBriefing && (
                  journal.todayReviewId ? (
                    <button onClick={() => post({ action: "REFRESH_REVIEW", reviewId: journal.todayReviewId }, "Dagens snapshot ble oppdatert.", journal.todayReviewId)} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"><RefreshCw size={15}/> Oppdater dagens snapshot</button>
                  ) : (
                    <button onClick={() => post({ action: "CAPTURE_REVIEW" }, "Dagens gjennomgang ble startet.")} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"><BookOpenCheck size={15}/> Start dagens gjennomgang</button>
                  )
                )}
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[280px,minmax(0,1fr)]">
              <aside className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-300"><History size={16}/> Gjennomgangshistorikk</div>
                {journal.reviews.length === 0 && <div className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">Ingen gjennomganger er lagret ennå.</div>}
                {journal.reviews.map((review) => (
                  <button key={review.id} onClick={() => setSelectedId(review.id)} className={`w-full rounded-xl border p-4 text-left transition ${selectedId === review.id ? "border-primary-500 bg-primary-950/25" : "border-slate-800 bg-slate-900/60 hover:border-slate-700"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-200">{review.reviewDate}</span>
                      {review.completed ? <CheckCircle2 size={15} className="text-emerald-400"/> : <Clock3 size={15} className="text-amber-400"/>}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{review.capturedRole} · revisjon {review.revision}</div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400"><span>{review.recordedDecisions}/{review.decisions.length} avklart</span><span>{review.decisionCoveragePercent}%</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800"><div className="h-full bg-primary-500" style={{ width: `${review.decisionCoveragePercent}%` }}/></div>
                    {review.overdueFollowups > 0 && <div className="mt-2 text-xs font-medium text-red-300">{review.overdueFollowups} forfalt</div>}
                  </button>
                ))}
              </aside>

              <main className="min-w-0 space-y-5">
                {!selected && <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-500">Velg eller start en gjennomgang.</div>}
                {selected && (
                  <>
                    <section className={`rounded-2xl border p-6 ${reviewStateClass(selected.state)}`}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{selected.reviewDate} · {selected.capturedRole} · revisjon {selected.revision}</div>
                          <h2 className="mt-2 text-2xl font-bold">{selected.headline}</h2>
                          <p className="mt-2 text-sm opacity-75">Snapshot {dateTime(selected.capturedAt)} av {selected.capturedBy}. Sist oppdatert {dateTime(selected.lastUpdatedAt)}.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg border border-current/20 px-3 py-2 text-sm font-semibold">{selected.completed ? "Gjennomgang fullført" : `${selected.undecided} ikke avklart`}</span>
                          {selected.overdueFollowups > 0 && <span className="rounded-lg bg-red-950/50 px-3 py-2 text-sm font-semibold text-red-200">{selected.overdueFollowups} forfalt</span>}
                        </div>
                      </div>
                    </section>

                    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-500">Beslutninger</div><div className="mt-1 text-xl font-semibold">{selected.decisions.length}</div></div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-500">Avklart</div><div className="mt-1 text-xl font-semibold">{selected.recordedDecisions}</div></div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-500">Oppfølging</div><div className="mt-1 text-xl font-semibold">{selected.outstandingFollowups}</div></div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-500">Agenda</div><div className="mt-1 text-xl font-semibold">{selected.agenda.length}</div></div>
                    </section>

                    <section className="space-y-3">
                      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Beslutninger</h2><span className="text-xs text-slate-500">Snapshot-fingerprint {selected.fingerprint}</span></div>
                      {selected.decisions.length === 0 && <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-5 text-sm text-emerald-200">Briefingen inneholdt ingen prioriterte beslutninger.</div>}
                      {selected.decisions.map((decision) => (
                        <DecisionEditor
                          key={`${selected.id}:${decision.id}:${decision.fingerprint}`}
                          decision={decision}
                          disabled={!canWrite || selected.completed}
                          saving={saving}
                          onSave={(payload) => post({ ...payload, reviewId: selected.id }, "Beslutningen ble registrert.", selected.id)}
                        />
                      ))}
                    </section>

                    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                      <div className="flex items-center gap-2"><UserRound size={17} className="text-primary-400"/><h2 className="font-semibold">Møtenotater og avslutning</h2></div>
                      {selected.notes.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {selected.notes.map((note) => <div key={note.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm"><div className="text-xs text-slate-500">{dateTime(note.at)} · {note.actorEmail}</div><p className="mt-1 text-slate-300">{note.note}</p></div>)}
                        </div>
                      )}
                      {canWrite && (
                        <div className="mt-4 space-y-3">
                          <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={1000} rows={3} placeholder="Skriv et møtenotat eller en avsluttende kommentar…" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"/>
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => post({ action: "ADD_REVIEW_NOTE", reviewId: selected.id, note: reviewNote }, "Møtenotatet ble lagret.", selected.id).then(() => setReviewNote(""))} disabled={saving || !reviewNote.trim()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"><Save size={14}/> Lagre notat</button>
                            {selected.completed ? (
                              <button onClick={() => post({ action: "REOPEN_REVIEW", reviewId: selected.id, note: reviewNote }, "Gjennomgangen ble gjenåpnet.", selected.id).then(() => setReviewNote(""))} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"><RefreshCw size={14}/> Gjenåpne</button>
                            ) : (
                              <button onClick={() => post({ action: "COMPLETE_REVIEW", reviewId: selected.id, note: reviewNote }, "Gjennomgangen ble fullført.", selected.id).then(() => setReviewNote(""))} disabled={saving || selected.undecided > 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 size={14}/> Fullfør gjennomgang</button>
                            )}
                          </div>
                          {!selected.completed && selected.undecided > 0 && <p className="text-xs text-amber-300">Alle beslutninger må ha en registrert konklusjon før gjennomgangen kan fullføres.</p>}
                        </div>
                      )}
                    </section>
                  </>
                )}
              </main>
            </div>

            {journal.recentEvents.length > 0 && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="flex items-center gap-2"><History size={17} className="text-primary-400"/><h2 className="font-semibold">Siste journalhendelser</h2></div>
                <div className="mt-4 divide-y divide-slate-800">
                  {journal.recentEvents.slice(0, 12).map((event) => (
                    <div key={event.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                      <div><span className="font-medium text-slate-200">{EVENT_LABELS[event.type]}</span><span className="text-slate-500"> · {event.reviewDate} · {event.reviewRole}</span>{event.status && <span className="text-slate-400"> · {STATUS_LABELS[event.status]}</span>}<div className="mt-1 text-xs text-slate-500">{event.actorEmail}{event.note ? ` · ${event.note}` : ""}</div></div>
                      <span className="shrink-0 text-xs text-slate-600">{dateTime(event.at)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
              <div className="flex items-center gap-2 text-slate-200"><ShieldCheck size={17} className="text-emerald-400"/><strong>Sikkerhetsgrenser</strong></div>
              <p className="mt-2">Journalen er append-only og snapshots genereres på serveren. Registrering her sender ingen kundemeldinger, oppretter ingen oppgaver, endrer ingen kalenderavtaler, flytter ingen pipeline og tildeler ingen CRM-ansvarlig.</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
