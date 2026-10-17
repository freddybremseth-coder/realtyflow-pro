"use client";

import { useEffect, useRef, useState } from "react";
import { assessAltovenaLeadPoll } from "@/lib/altovena/lead-attention-assessment";

type LeadTask = {
  id: string;
  title: string;
  status: "TO_DO" | "IN_PROGRESS" | "REVIEW";
  priority: "MEDIUM" | "HIGH" | "CRITICAL";
  contactId: string | null;
  createdAt: string | null;
  dueDate: string | null;
  nextAction: string | null;
};
type Props = { onOpenLeads: (contactId?: string) => void; canManage: boolean };

export function AltovenaLeadAttention({ onOpenLeads, canManage }: Props) {
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const previousSuccessfulIds=useRef<Set<string>|null>(null);
  const [newArrivals,setNewArrivals]=useState(0);
  const [capped,setCapped]=useState(false);
  const [totalOpen,setTotalOpen]=useState(0);
  const [overdueNotStarted,setOverdueNotStarted]=useState(0);
  const [backgroundCheck,setBackgroundCheck]=useState<{
    state:"disabled"|"no_scan"|"recent"|"stale";
    lastScanAt:string|null;
    pending:number|null;
  }|null>(null);
  const [backgroundError,setBackgroundError]=useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingTaskId, setPendingTaskId] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [lastChecked, setLastChecked] = useState("");
  useEffect(() => {
    const tick = () => { if (!document.hidden) setRefresh(current => current + 1); };
    const onVisible = () => { if (!document.hidden) tick(); };
    const timer = window.setInterval(tick, 60000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Avoid flashing a full loading state during background refresh.
    if (refresh === 0) setLoading(true);
    setError("");
    fetch("/api/workspaces/altovena/lead-tasks", { cache: "no-store", signal: controller.signal })
      .then(async res => {
        if (!res.ok) throw new Error(res.status === 403
          ? "Ingen tilgang til Altovena-leads." : "Kunne ikke hente henvendelser.");
        return res.json();
      })
      .then(body => {
        if (body.ok !== true || body.brand !== "altovena" || !Array.isArray(body.tasks) ||
            !Number.isSafeInteger(body.totalOpen) || body.totalOpen < 0 ||
            !Number.isSafeInteger(body.overdueNotStarted) || body.overdueNotStarted < 0)
          throw new Error("Ugyldig svar fra Altovena-oppfølging.");
        if (!controller.signal.aborted) {
          const nextTasks=(body.tasks as LeadTask[]).slice(0,40);
          const nextIds=new Set(nextTasks.map(task=>task.id));
          const assessment=assessAltovenaLeadPoll({
            previousIds:previousSuccessfulIds.current,
            tasks:nextTasks,capped:body.capped===true,nowMs:Date.now(),
          });
          previousSuccessfulIds.current=nextIds;
          if(assessment.newArrivals>0)setNewArrivals(current=>current+assessment.newArrivals);
          setCapped(assessment.mightHaveMore);
          // Server-side exact counts include older leads beyond the 40-row display cap.
          // A failed count request is shown as an error, never as zero outstanding.
          setTotalOpen(body.totalOpen);
          setOverdueNotStarted(body.overdueNotStarted);
          setTasks(nextTasks);
          setLastChecked(new Date().toLocaleTimeString("nb-NO",{hour:"2-digit",minute:"2-digit"}));
        }
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error
          ? cause.message : "Henvendelser er utilgjengelige.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  useEffect(()=>{
    const controller=new AbortController();
    setBackgroundError("");
    fetch("/api/workspaces/altovena/lead-alert-status",{
      cache:"no-store",signal:controller.signal,
    }).then(async res=>{
      const body=await res.json().catch(()=>null);
      if(!res.ok || body?.ok!==true || body?.brand!=="altovena" ||
         !["disabled","no_scan","recent","stale"].includes(body.state) ||
         body.deliveryEnabled!==false)
        throw Error("Bakgrunnsvarsler kan ikke bekreftes.");
      return body;
    }).then(body=>{
      if(!controller.signal.aborted)setBackgroundCheck({
        state:body.state,lastScanAt:body.lastScanAt,pending:body.pending,
      });
    }).catch(()=>{
      if(!controller.signal.aborted)setBackgroundError("Bakgrunnskontrollens status er utilgjengelig.");
    });
    return ()=>controller.abort();
  },[refresh]);

  async function updateTask(taskId: string, nextStatus: "IN_PROGRESS" | "DONE") {
    if (!canManage || pendingTaskId) return;
    setActionError(""); setPendingTaskId(taskId);
    try {
      const res = await fetch("/api/workspaces/altovena/lead-tasks", {
        method: "PATCH", cache: "no-store", credentials: "same-origin",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({id:taskId,status:nextStatus}),
      });
      const body = await res.json();
      if (!res.ok || body.ok !== true || body.brand !== "altovena" ||
          body.task?.id !== taskId || body.task?.status !== nextStatus)
        throw new Error("Status kunne ikke oppdateres. Oppdater listen og prøv igjen.");
      if (nextStatus === "DONE") setTasks(current => current.filter(task => task.id !== taskId));
      else setTasks(current => current.map(task => task.id === taskId
        ? {...task,status:nextStatus} : task));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Endring kunne ikke lagres.");
      setRefresh(current => current + 1);
    } finally { setPendingTaskId(""); }
  }
  const overdue = overdueNotStarted;

  return <section aria-label="Altovena – oppfølging av nye henvendelser"
    className="rounded-2xl border border-cyan-900/60 bg-slate-900/70 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">ALTOVENA · HENVENDELSER</p>
        <h3 className="mt-1 text-xl font-semibold" aria-live="polite">
          {loading ? "Henter oppfølgingsoppgaver…" : error ? "Oppfølging må kontrolleres" :
            totalOpen === 0 ? "Ingen åpne webhenvendelser" : totalOpen + " henvendelser til oppfølging"}
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          Bare Altovena. Oppdateres automatisk hvert minutt når fanen er aktiv.
          Ingen e-post eller pushvarsler er aktivert.
        </p>
        {lastChecked && <p className="mt-1 text-xs text-slate-500">Sist sjekket kl. {lastChecked}</p>}
        <p className="mt-2 text-xs text-slate-400" role="status">
          {backgroundError || (!backgroundCheck
            ? "Kontrollerer bakgrunnsvarsler…"
            : backgroundCheck.state==="disabled"
              ? "Bakgrunnsskanner er deaktivert; varsler oppdateres bare når appen er åpen."
              : backgroundCheck.state==="no_scan"
              ? "Bakgrunnsskanner er konfigurert, men ingen vellykket kjøring er registrert."
              : backgroundCheck.state==="stale"
              ? "Bakgrunnsskannerens siste kjøring er forsinket. Kontroller driftsstatus."
              : "Bakgrunnsskanner: sist kjørt "+new Date(backgroundCheck.lastScanAt!).toLocaleString("nb-NO")+
                " · "+backgroundCheck.pending+" interne, åpne varsler." )}
        </p>
      </div>
      <button type="button" onClick={() => setRefresh(current => current + 1)}
        className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-cyan-200">Oppdater</button>
    </div>
    {!error && !loading && newArrivals>0 && <div role="status"
      className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-700/70 bg-cyan-950/30 p-3 text-sm text-cyan-100">
      <span>{newArrivals} {newArrivals===1?"ny henvendelse er":"nye henvendelser er"} oppdaget mens denne siden har vært åpen. Kontroller oppfølgingen.</span>
      <button type="button" onClick={()=>setNewArrivals(0)}
        className="rounded-md border border-cyan-700 px-3 py-1 text-xs">Skjul beskjed</button>
    </div>}
    {!error && !loading && capped && <p role="status"
      className="mt-3 rounded-lg border border-amber-700/70 bg-amber-950/30 p-3 text-sm text-amber-200">
      Listen har nådd grensen på 40 oppgaver. Du ser de nyeste; totalt {totalOpen} åpne.
      Varselet om 24 timer inkluderer også eldre oppgaver som ikke vises her.
    </p>}
    {!error && !loading && overdue > 0 && <p role="status"
      className="mt-3 rounded-lg border border-amber-700/70 bg-amber-950/40 p-3 text-sm font-medium text-amber-200">
      {overdue} {overdue === 1 ? "henvendelse har" : "henvendelser har"} vært uten startet oppfølging i minst 24 timer.
      Dette inkluderer også henvendelser utenfor de 40 nyeste. Kontroller oppfølgingen i CRM.
    </p>}
    {error && <p role="alert" className="mt-3 text-sm text-amber-300">{error}</p>}
    {actionError && <p role="alert" className="mt-3 text-sm text-amber-300">{actionError}</p>}
    {!loading && !error && tasks.length > 0 && <div className="mt-4 space-y-2">
      {tasks.slice(0, 8).map(task => <div key={task.id}
        className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
        <div>
          <p className="font-medium">{task.title}</p>
          <p className="mt-1 text-xs text-slate-400">{task.nextAction || "Vurder forespørselen og svar personlig."}</p>
          <p className="mt-1 text-xs text-slate-500">
            Status: {task.status === "TO_DO" ? "Ny" : task.status === "REVIEW" ? "Til gjennomgang" : "Under arbeid"}
            {task.dueDate ? " · Frist: " + task.dueDate : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setNewArrivals(0); onOpenLeads(task.contactId || undefined); }}
            className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-200">
            {task.contactId ? "Åpne kundekort" : "Åpne CRM"}
          </button>
          {canManage && task.status !== "IN_PROGRESS" &&
            <button type="button" disabled={Boolean(pendingTaskId)}
              onClick={() => void updateTask(task.id,"IN_PROGRESS")}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">
              Start oppfølging
            </button>}
          {canManage && <button type="button" disabled={Boolean(pendingTaskId)}
            onClick={() => void updateTask(task.id,"DONE")}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">
            Marker oppfølging utført
          </button>}
        </div>
      </div>)}
      {tasks.length > 8 && <p className="text-xs text-slate-400">
        Viser de åtte nyeste av {totalOpen} åpne oppgaver i oversikten. Bruk CRM for full oversikt.
      </p>}
    </div>}
    <p className="mt-3 text-xs text-slate-500">
      Statusknappene endrer kun intern oppgave, ikke kundestatus og sender ingen melding.
    </p>
  </section>;
}
