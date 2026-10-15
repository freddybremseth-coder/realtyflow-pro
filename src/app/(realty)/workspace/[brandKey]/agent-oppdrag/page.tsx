"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck, RefreshCcw, ShieldCheck } from "lucide-react";

type Entry={
  id:string;brandId:string;brandKey:string;status:string;
  version:number;actionType:string;evidenceCount:number;
  qualityReviewed:boolean;preflightPassed:boolean;
  reviewDecision:string|null;reviewExpiresAt:string|null;
  reserved:boolean;events:Array<{type:string;at:string}>;
};
const LABELS:Record<string,string>={
  draft:"Utkast",researching:"Analyseres",review_required:"Trenger gjennomgang",
  approved:"Godkjent",rejected:"Avvist",executing:"Reservert",
  completed:"Fullført",failed:"Feilet",cancelled:"Avbrutt",
};
const pretty=(value:string)=>value.replaceAll("_"," ");
const timestamp=(value:string|null)=>value?new Date(value).toLocaleString("nb-NO",{
  day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"
}):"Ikke registrert";

export default function WorkspaceNexusTaskBoard({params}:{params:{brandKey:string}}){
  const brandKey=params.brandKey;
  const valid=["zeneco","pinosoecolife"].includes(brandKey);
  const [state,setState]=useState<"loading"|"ready"|"disabled"|"denied"|"unavailable">("loading");
  const [tasks,setTasks]=useState<Entry[]>([]);
  const [message,setMessage]=useState("");
  const [selected,setSelected]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    if(!valid){setState("denied");setMessage("Ukjent merkevare.");return;}
    setState("loading");setTasks([]);setSelected(null);
    try{
      const response=await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/nexus-task-board`,{
        cache:"no-store",credentials:"same-origin"
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok || body.ok!==true || !Array.isArray(body.tasks)){
        setState(response.status===403?"denied":response.status===503?"disabled":"unavailable");
        setMessage(response.status===403
          ?"Du har ikke tilgang til agentoppdrag for denne merkevaren."
          :"Nexus-oppdragsoversikten er ikke aktivert for denne merkevaren.");
        return;
      }
      if(body.brand!==brandKey || body.readOnly!==true ||
        body.tasks.some((item:Entry)=>item.brandKey!==brandKey)){
        throw new Error("BRAND_SCOPE_MISMATCH");
      }
      setTasks(body.tasks as Entry[]);
      setState("ready");
    }catch{
      setState("unavailable");setMessage("Oppdragsdata er ikke tilgjengelige. Ingen oppdrag er endret.");
    }
  },[brandKey,valid]);
  useEffect(()=>{void refresh()},[refresh]);
  const chosen=tasks.find(t=>t.id===selected)||null;
  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-cyan-400">Nexus / {brandKey}</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-white">
          <ClipboardCheck size={24}/> Agentoppdrag
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Oppdragsstatus og menneskelige beslutninger for denne merkevaren.
          Kun lesing; ingen godkjenning, utsendelse, publisering eller utførelse her.
        </p>
      </div>
      <Button variant="outline" onClick={()=>void refresh()} disabled={state==="loading"}>
        <RefreshCcw size={16} className="mr-2"/> Oppdater
      </Button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">Merkevareavgrenset</Badge>
      <Badge variant="outline">Skrivebeskyttet</Badge>
      <Badge variant="outline">Ingen agentutførelse</Badge>
    </div>
    {state!=="ready"?(
      <Card><CardContent className="space-y-2 p-6">
        <p className="font-medium text-slate-200">{state==="loading"?"Henter status…":message}</p>
        {state!=="loading"&&<p className="text-sm text-slate-400">
          Ingen eksempeloppdrag brukes som erstatning for reelle data.
        </p>}
        <Link href={`/workspace/${brandKey}`} className="inline-block text-sm text-cyan-400 underline">
          Tilbake til arbeidsområdet
        </Link>
      </CardContent></Card>
    ):(
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Oppdrag ({tasks.length}, maksimalt 50)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {!tasks.length&&<p className="text-sm text-slate-400">Ingen registrerte oppdrag for denne merkevaren.</p>}
            {tasks.map(task=><button key={task.id} type="button"
              onClick={()=>setSelected(task.id)} aria-pressed={selected===task.id}
              className="w-full rounded-lg border border-slate-700 p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="font-medium text-white">{pretty(task.actionType)}</strong>
                <Badge variant="outline">{LABELS[task.status]||task.status}</Badge>
              </div>
              <p className="mt-2 break-all text-xs text-slate-500">ID {task.id} · Versjon {task.version}</p>
            </button>)}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Kontrollgrunnlag</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!chosen?<p className="text-slate-400">Velg et oppdrag for å se registrerte kontroller.</p>:(
              <>
                <dl className="space-y-2 text-slate-300">
                  <div className="flex justify-between gap-2"><dt>Kildehenvisninger</dt><dd>{chosen.evidenceCount}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Kvalitetskontroll</dt><dd>{chosen.qualityReviewed?"Registrert":"Mangler"}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Preflight</dt><dd>{chosen.preflightPassed?"Markert":"Mangler"}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Beslutning</dt><dd>{chosen.reviewDecision||"Venter"}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Utløpsdato</dt><dd>{timestamp(chosen.reviewExpiresAt)}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Reservert</dt><dd>{chosen.reserved?"Ja":"Nei"}</dd></div>
                </dl>
                <h2 className="flex items-center gap-2 border-t border-slate-700 pt-3 font-medium">
                  <ShieldCheck size={16}/> Registrert historikk
                </h2>
                <ol className="space-y-2 text-slate-400">
                  {chosen.events.map((event,index)=><li key={index}>
                    {pretty(event.type)} <span className="text-xs text-slate-500">{timestamp(event.at)}</span>
                  </li>)}
                </ol>
                {!chosen.events.length&&<p className="text-slate-500">Ingen hendelser registrert.</p>}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    )}
  </div>;
}
