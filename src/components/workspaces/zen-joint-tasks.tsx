"use client";

import { useEffect, useState } from "react";

type Contact = { id: string; name: string | null };
type JointTask = {
  id: string; contact_id: string; title: string; status: "open" | "done";
  due_on: string | null; created_at: string; created_by_email: string | null;
  finished_by_email: string | null;
};

const endpoint = "/api/workspaces/zeneco/joint-tasks";
const closingSteps = [
  "Bekreft boligvalg og avklar åpne spørsmål",
  "Bekreft reservasjon og neste milepæl",
  "Kontroller at nødvendige dokumenter er mottatt",
  "Avtal dato og plan for overtakelse",
  "Bekreft overtakelse og videre oppfølging",
] as const;
const dueStatus = (value: string | null) => {
  if (!value) return "none";
  const today = new Date();
  const todayLocal = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  return value < todayLocal ? "overdue" : value === todayLocal ? "today" : "future";
};

/**
 * Separate NEW-only task ledger. It never calls the global /api/revenue/execution,
 * /api/internal-alerts or /api/customers routes, and cannot import old work_items.
 */
export function ZenJointTasks({
  contacts,
  canWrite,
  selectedContactId,
  hideContactSelector = false,
  closingMode = false,
}: {
  contacts: Contact[];
  canWrite: boolean;
  selectedContactId?: string;
  hideContactSelector?: boolean;
  closingMode?: boolean;
}) {
  const [contactId, setContactId] = useState(selectedContactId || "");
  const [tasks, setTasks] = useState<JointTask[]>([]);
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const selected = contacts.find(contact => contact.id === contactId);
  const activeId = selected?.id || "";
  const completed = tasks.filter(task => task.status === "done").length;
  const outstanding = tasks.length - completed;
  const overdue = tasks.filter(task => task.status === "open" && dueStatus(task.due_on) === "overdue").length;

  useEffect(() => {
    if (selectedContactId === undefined) return;
    setContactId(selectedContactId);
    setTasks([]);
    setNotice("");
    setError("");
    setTitle("");
    setDueOn("");
  }, [selectedContactId]);

  useEffect(() => {
    if (!activeId) { setTasks([]); setLoading(false); return; }
    const abort = new AbortController();
    setLoading(true); setError("");
    fetch(endpoint + "?contactId=" + encodeURIComponent(activeId), {
      cache: "no-store", signal: abort.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(response.status === 403
        ? "Du har ikke tilgang til felles oppgaver for denne kunden."
        : "Kunne ikke hente felles oppgaver.");
      return response.json();
    }).then(body => {
      if (!abort.signal.aborted) setTasks(Array.isArray(body.tasks) ? body.tasks : []);
    }).catch(cause => {
      if (!abort.signal.aborted) { setTasks([]); setError(cause instanceof Error ? cause.message : "Ukjent feil."); }
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [activeId, revision]);

  async function createTask() {
    if (!canWrite || !activeId || busy || title.trim().length < 3) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: activeId, title: title.trim(), dueOn: dueOn || null }),
      });
      if (!response.ok) throw new Error(response.status === 404
        ? "Kunden er ikke lenger godkjent for felles oppgaver."
        : response.status === 403 ? "Du har ikke rettighet til å opprette oppgaver."
        : "Oppgaven kunne ikke opprettes.");
      setTitle(""); setDueOn(""); setNotice("Felles oppgave opprettet."); setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kunne ikke opprette oppgaven."); }
    finally { setBusy(false); }
  }

  async function finishTask(taskId: string) {
    if (!canWrite || !activeId || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: activeId, taskId, status: "done" }),
      });
      if (!response.ok) throw new Error(response.status === 404
        ? "Oppgaven eller felleskundens godkjenning er ikke lenger aktiv."
        : response.status === 403 ? "Du har ikke rettighet til å fullføre oppgaver."
        : "Oppgaven kunne ikke fullføres.");
      setNotice("Oppgaven er fullført."); setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kunne ikke oppdatere oppgaven."); }
    finally { setBusy(false); }
  }

  return <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Felles oppgaver · Zen Eco Homes</h2>
      <p className="text-sm text-slate-400">
        Bare nye oppgaver knyttet til kunder som Freddy har godkjent for samarbeidet.
        Eldre CRM-oppgaver, meldinger, vedlegg og interne notater vises ikke.
        Oppgaver sender ingen kundemeldinger automatisk.
      </p>
    </header>
    {!hideContactSelector && <label className="block space-y-2 text-sm" htmlFor="joint-task-contact">
      <span>Velg godkjent felleskunde</span>
      <select id="joint-task-contact" value={activeId} onChange={event => {
        setContactId(event.target.value); setTasks([]); setNotice(""); setTitle("");
      }} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2">
        <option value="">Velg kunde…</option>
        {contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name || contact.id}</option>)}
      </select>
    </label>}
    {!contacts.length && <p className="text-sm text-amber-300">Ingen godkjente felleskunder på denne CRM-siden. Åpne eller søk etter en kunde først.</p>}
    {activeId && closingMode && <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/15 p-4">
      <h3 className="font-semibold text-cyan-200">Fremdrift mot overtakelse</h3>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-lg bg-slate-950 p-2"><span className="block text-xl font-semibold">{completed}</span>Fullført</div>
        <div className="rounded-lg bg-slate-950 p-2"><span className="block text-xl font-semibold">{outstanding}</span>Åpne</div>
        <div className="rounded-lg bg-slate-950 p-2"><span className="block text-xl font-semibold text-amber-300">{overdue}</span>Forfalt</div>
      </div>
      {tasks.length > 0 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800" aria-label={`${completed} av ${tasks.length} oppgaver fullført`}>
        <div className="h-full bg-emerald-500" style={{ width: `${Math.round(completed * 100 / tasks.length)}%` }} />
      </div>}
      {canWrite && <div className="mt-4">
        <p className="text-xs text-slate-400">Forslag til oppgaver. Velg ett steg og opprett det nedenfor med frist. Ingen oppgaver opprettes automatisk.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {closingSteps.filter(step => !tasks.some(task => task.title === step)).map(step => <button key={step} type="button"
            onClick={() => setTitle(step)} className="rounded-lg border border-cyan-800 px-3 py-2 text-left text-xs text-cyan-200 hover:bg-cyan-950/50">{step}</button>)}
        </div>
      </div>}
    </div>}
    {activeId && canWrite && <form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={event => {
      event.preventDefault(); void createTask();
    }}>
      <div className="space-y-2">
        <label className="block text-sm" htmlFor="joint-task-title">Ny oppgave (ingen kundemelding)</label>
        <input id="joint-task-title" value={title} onChange={event => setTitle(event.target.value)}
          maxLength={160} required minLength={3} disabled={busy}
          placeholder="Avtal visning eller avklar tomteønske"
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
        <label className="block text-sm" htmlFor="joint-task-due">Frist (valgfritt)</label>
        <input id="joint-task-due" type="date" value={dueOn} onChange={event => setDueOn(event.target.value)}
          disabled={busy} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
      </div>
      <button type="submit" disabled={busy || title.trim().length < 3}
        className="self-end rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        Opprett oppgave
      </button>
    </form>}
    {activeId && loading && <p className="text-sm text-slate-400">Henter felles oppgaver…</p>}
    {error && <p role="alert" className="rounded-lg border border-rose-800 p-3 text-sm text-rose-300">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
    {activeId && !loading && <div className="space-y-2" aria-label="Nye fellesoppgaver">
      {!tasks.length && <p className="text-sm text-slate-400">Ingen nye felles oppgaver registrert for denne kunden.</p>}
      {tasks.map(task => <article key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950 p-3">
        <div className="min-w-0 flex-1">
          <div className={task.status === "done" ? "text-sm text-slate-400 line-through" : "text-sm font-medium"}>{task.title}</div>
          <p className="mt-1 text-xs text-slate-400">Frist: {task.due_on || "Ingen"} · {task.status === "done" ? "Fullført" : "Åpen"}
            {task.created_by_email ? ` · Opprettet av: ${task.created_by_email}` : ""}</p>
          {task.status === "open" && dueStatus(task.due_on) === "overdue" && <p className="mt-1 text-xs font-semibold text-amber-300">Forfalt – må følges opp</p>}
          {task.status === "open" && dueStatus(task.due_on) === "today" && <p className="mt-1 text-xs font-semibold text-cyan-200">Frist i dag</p>}
        </div>
        {task.status === "open" && canWrite && <button type="button" disabled={busy}
          onClick={() => void finishTask(task.id)}
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">Fullfør</button>}
      </article>)}
    </div>}
  </section>;
}
