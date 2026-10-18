"use client";

import { useEffect, useState } from "react";

type Alert = {
  id: string;
  kind: "NOT_STARTED_15M" | "NOT_STARTED_24H" | "IN_PROGRESS_48H";
  createdAt: string;
  readAt: string | null;
  contactId: string | null;
};
type Props = { onOpenLeads: (contactId?: string) => void };
const description: Record<Alert["kind"], string> = {
  NOT_STARTED_15M: "Ikke fulgt opp etter 15 minutter",
  NOT_STARTED_24H: "Ikke fulgt opp etter 24 timer",
  IN_PROGRESS_48H: "Oppfølging står stille etter 48 timer",
};

export function AltovenaOperatorInbox({onOpenLeads}: Props) {
  const [alerts,setAlerts]=useState<Alert[]>([]);
  const [total,setTotal]=useState(0);
  const [unread,setUnread]=useState(0);
  const [enabled,setEnabled]=useState(false);
  const [busy,setBusy]=useState("");
  const [showMore,setShowMore]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [deliveryPreview,setDeliveryPreview]=useState<{state:"disabled"|"prepared_only";
    prepared:number;cancelled:number}|null>(null);
  const [deliveryStatusError,setDeliveryStatusError]=useState("");

  useEffect(()=>{
    const tick=()=>{if(!document.hidden)setRefresh(x=>x+1);};
    const id=window.setInterval(tick,60000);
    const focus=()=>tick();
    const visible=()=>{if(!document.hidden)tick();};
    window.addEventListener("focus",focus);
    document.addEventListener("visibilitychange",visible);
    return ()=>{
      window.clearInterval(id);
      window.removeEventListener("focus",focus);
      document.removeEventListener("visibilitychange",visible);
    };
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    setError("");
    fetch("/api/workspaces/altovena/operator-alerts",{cache:"no-store",signal:controller.signal})
      .then(async response=>{
        const body=await response.json().catch(()=>null);
        if(!response.ok || body?.ok!==true || body.brand!=="altovena" ||
          body.externalDelivery!==false || !Array.isArray(body.alerts) ||
          !Number.isSafeInteger(body.totalPending) ||
          !Number.isSafeInteger(body.unreadTotal) ||
          typeof body.enabled!=="boolean")
          throw new Error("Varslingssenteret er ikke tilgjengelig.");
        return body;
      }).then(body=>{
        if(controller.signal.aborted)return;
        setAlerts(body.alerts as Alert[]);
        setTotal(body.totalPending);
        setUnread(body.unreadTotal);
        setEnabled(body.enabled);
      }).catch(cause=>{
        if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Kunne ikke hente varsler.");
      }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[refresh]);

  useEffect(()=>{
    const controller=new AbortController();
    setDeliveryStatusError("");
    fetch("/api/workspaces/altovena/delivery-preflight-status",{
      cache:"no-store",signal:controller.signal,
    }).then(async response=>{
      const body=await response.json().catch(()=>null);
      if(!response.ok || body?.ok!==true || body.brand!=="altovena" ||
         !["disabled","prepared_only"].includes(body.state) ||
         body.emailSent!==false || !Number.isSafeInteger(body.prepared) ||
         !Number.isSafeInteger(body.cancelled) ||
         body.prepared<0 || body.cancelled<0)
        throw Error("Leveringsforberedelse kan ikke bekreftes.");
      return body;
    }).then(body=>{
      if(!controller.signal.aborted)setDeliveryPreview({
        state:body.state,prepared:body.prepared,cancelled:body.cancelled,
      });
    }).catch(()=>{
      if(!controller.signal.aborted)setDeliveryStatusError(
        "Status for e-postforberedelse er ikke tilgjengelig.");
    });
    return ()=>controller.abort();
  },[refresh]);

  async function markRead(id:string){
    if(busy)return;
    setBusy(id);setError("");
    try {
      const response=await fetch("/api/workspaces/altovena/operator-alerts",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id}),
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok || data?.ok!==true || data?.brand!=="altovena" ||
        data?.id!==id || typeof data?.readAt!=="string")
        throw new Error("Lesebekreftelsen kunne ikke lagres.");
      // Await another authoritative read; a click changes only this operator's
      // read receipt, never the shared lead status or another person's inbox.
      setRefresh(current=>current+1);
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Lesebekreftelsen feilet.");
    }finally{setBusy("");}
  }

  return <section aria-label="Altovena – internt varslingssenter"
    className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-3 sm:p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h4 className="text-base font-semibold text-slate-100">Mitt varslingssenter</h4>
        <p className="mt-1 text-xs text-slate-400">
          {loading?"Henter varslene…":error?"Status må kontrolleres":
            !enabled?"Ikke aktivert":
            `${unread} uleste av ${total} aktive varsler`}
        </p>
      </div>
      <button type="button" onClick={()=>setRefresh(x=>x+1)}
        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-cyan-200">
        Oppdater
      </button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-amber-300">{error}</p>}
    {!error && !loading && !enabled && <p className="mt-3 text-sm text-slate-400">
      Personlige lesekvitteringer og varselvisning blir tilgjengelig etter sikker aktivering.
    </p>}
    {!error && !loading && enabled && alerts.length===0 && <p className="mt-3 text-sm text-slate-400">
      Ingen aktive varsler. Ingen e-post eller push er sendt.
    </p>}
    {!error && !loading && enabled && alerts.length>0 &&
      <div className="mt-3 space-y-2">
        {alerts.slice(0,showMore?20:6).map(alert=><div key={alert.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 p-3">
          <div>
            <p className="text-sm font-medium text-slate-100">{description[alert.kind]}</p>
            <p className="mt-1 text-xs text-slate-400">
              {new Date(alert.createdAt).toLocaleString("nb-NO")} ·
              {alert.readAt?" Sett av deg":" Ulest for deg"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={()=>onOpenLeads(alert.contactId||undefined)}
              className="rounded-lg border border-cyan-700 px-2.5 py-1.5 text-xs text-cyan-200">
              {alert.contactId?"Åpne kundekort":"Åpne CRM"}
            </button>
            {!alert.readAt && <button type="button" disabled={Boolean(busy)}
              onClick={()=>void markRead(alert.id)}
              className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs text-slate-200 disabled:opacity-50">
              {busy===alert.id?"Lagrer…":"Marker som lest"}
            </button>}
          </div>
        </div>)}
        {alerts.length>6 && <button type="button"
          onClick={()=>setShowMore(value=>!value)}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-cyan-200">
          {showMore?"Vis færre varsler":"Vis flere varsler"}
        </button>}
        {total>alerts.length && <p className="text-xs text-slate-400">
          Viser de {alerts.length} høyest prioriterte av {total} aktive varsler.
          Uleste varsler prioriteres. Marker som lest for å få frem flere.
        </p>}
      </div>}
    <p className="mt-3 text-xs text-slate-400" role="status">
      {deliveryStatusError || (!deliveryPreview
        ? "Kontrollerer e-postforberedelse…"
        : deliveryPreview.state==="disabled"
          ? "E-postforberedelse er deaktivert. Ingen e-post er sendt."
          : "Kun forberedt: "+deliveryPreview.prepared+
            " e-postkandidater til deg. "+deliveryPreview.cancelled+
            " kansellert. Ingen e-post er sendt.")}
    </p>
    <p className="mt-3 text-xs text-slate-500">
      En lesekvittering er personlig og avslutter ikke en kundeoppgave. Varsler
      vises i appen; e-post og push er ikke aktivert.
    </p>
  </section>;
}
