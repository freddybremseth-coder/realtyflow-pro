"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Database, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";

type Task = {
  id:string;brandId:string;brandKey:string;status:string;version:number;
  actionType:string;evidenceCount:number;qualityReviewed:boolean;
  preflightPassed:boolean;reviewDecision:string|null;reviewExpiresAt:string|null;
  reserved:boolean;createdAt:string;updatedAt:string;
  events:Array<{type:string;at:string}>;
};
type BoardState = {kind:"loading"|"ready"|"disabled"|"unavailable";message:string;tasks:Task[]};
const STATUS:Record<string,string>={
  draft:"Utkast",researching:"Under analyse",review_required:"Trenger vurdering",
  approved:"Godkjent",rejected:"Avvist",executing:"Reservert",
  completed:"Fullført",failed:"Feilet",cancelled:"Avbrutt",
};
const EVENT:Record<string,string>={
  proposal_created:"Forslag registrert",
  proposal_approved:"Godkjent av medarbeider",
  proposal_rejected:"Avvist av medarbeider",
};
const fmt=(date:string|null)=>date?new Date(date).toLocaleString("nb-NO",{
  day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",
}):"Ikke registrert";

export default function NexusTaskBoardPage(){
  const [board,setBoard]=useState<BoardState>({kind:"loading",message:"Henter oppdragsstatus…",tasks:[]});
  const [brand,setBrand]=useState("all");
  const [status,setStatus]=useState("all");
  const [selected,setSelected]=useState<string|null>(null);
  const load=useCallback(async()=>{
    setBoard({kind:"loading",message:"Henter oppdragsstatus…",tasks:[]});
    try{
      const response=await fetch("/api/nexus/task-board",{cache:"no-store",credentials:"same-origin"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ready!==true||!Array.isArray(data.tasks)){
        setBoard({kind:response.status===503&&data.state==="disabled"?"disabled":"unavailable",
          message:String(data.message||"Oppdragsoversikten er ikke tilgjengelig. Ingen oppdrag er lest eller endret."),tasks:[]});
        return;
      }
      setBoard({kind:"ready",message:"",tasks:data.tasks as Task[]});
    }catch{
      setBoard({kind:"unavailable",message:"Kunne ikke hente oppdragsstatus. Ingen oppdrag er endret.",tasks:[]});
    }
  },[]);
  useEffect(()=>{void load()},[load]);
  const brands=useMemo(()=>[...new Map(board.tasks.map(t=>[t.brandId,{id:t.brandId,key:t.brandKey}])).values()]
    .sort((a,b)=>a.key.localeCompare(b.key)),[board.tasks]);
  const visible=useMemo(()=>board.tasks.filter(t=>
    (brand==="all"||t.brandId===brand)&&(status==="all"||t.status===status)),[board.tasks,brand,status]);
  const focused=visible.find(t=>t.id===selected)||null;
  const pending=board.tasks.filter(t=>t.status==="review_required").length;
  const approved=board.tasks.filter(t=>t.status==="approved").length;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold text-white">
            <ClipboardCheck size={25} className="text-cyan-400"/> Nexus · Agentoppdrag
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Intern oversikt over dokumentasjon, menneskelig vurdering og oppdragsstatus.
            Denne siden er kun for lesing: den kan ikke godkjenne, sende, publisere eller starte agenter.
          </p>
        </div>
        <Button variant="outline" onClick={()=>void load()} disabled={board.kind==="loading"}>
          <RefreshCw size={16} className="mr-2"/> Oppdater
        </Button>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Kun for eier</Badge>
        <Badge variant="outline">Ingen utførelsesknapper</Badge>
        <Badge variant="outline">Produksjonsaktivering separat</Badge>
      </div>
      {board.kind!=="ready" ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-6">
            {board.kind==="loading"?<Database size={22} className="text-slate-400"/>:<AlertTriangle size={22} className="text-amber-400"/>}
            <div className="space-y-1">
              <p className="font-medium text-slate-100">
                {board.kind==="loading"?"Henter data":board.kind==="disabled"?"Ikke aktivert":"Tilkobling utilgjengelig"}
              </p>
              <p className="text-sm text-slate-400">{board.message}</p>
              {board.kind!=="loading"&&(
                <p className="text-xs text-slate-500">Ingen eksempeldata vises som om de var virkelige oppdrag.</p>
              )}
            </div>
          </CardContent>
        </Card>
      ):(
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Oppdragstall">
            {[
              {label:"Oppdrag (siste 50)",count:board.tasks.length},
              {label:"Trenger vurdering",count:pending},
              {label:"Godkjente, ikke reservert",count:approved},
            ].map(item=>(
              <Card key={item.label}><CardContent className="p-4">
                <p className="text-2xl font-semibold text-white">{item.count}</p>
                <p className="text-xs text-slate-400">{item.label}</p>
              </CardContent></Card>
            ))}
          </section>
          <div className="flex flex-wrap gap-3">
            <label className="space-y-1 text-sm text-slate-400">
              <span className="block">Merkevare</span>
              <select aria-label="Filtrer på merkevare" className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-100"
                value={brand} onChange={e=>{setBrand(e.target.value);setSelected(null)}}>
                <option value="all">Alle merkevarer</option>
                {brands.map(b=><option key={b.id} value={b.id}>{b.key}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm text-slate-400">
              <span className="block">Status</span>
              <select aria-label="Filtrer på status" className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-100"
                value={status} onChange={e=>{setStatus(e.target.value);setSelected(null)}}>
                <option value="all">Alle statuser</option>
                {Object.entries(STATUS).map(([key,label])=><option key={key} value={key}>{label}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader><CardTitle>Oppdrag · {visible.length}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {visible.length===0&&<p className="text-sm text-slate-400">Ingen oppdrag matcher filtrene.</p>}
                {visible.map(t=>(
                  <button key={t.id} type="button" onClick={()=>setSelected(t.id)}
                    aria-pressed={focused?.id===t.id}
                    className="w-full rounded-lg border border-slate-700 p-4 text-left hover:border-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-white">{t.actionType.replaceAll("_"," ")}</span>
                      <Badge variant="outline">{STATUS[t.status]||t.status}</Badge>
                    </div>
                    <p className="mt-1 break-all text-xs text-slate-400">{t.brandKey} · {t.id}</p>
                    <p className="mt-2 text-xs text-slate-500">Oppdatert {fmt(t.updatedAt)} · Versjon {t.version}</p>
                  </button>
                ))}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Dokumentasjon og kontroll</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {!focused&&<p className="text-slate-400">Velg et oppdrag for å se kontrollgrunnlag og hendelser.</p>}
                {focused&&(
                  <>
                    <p className="break-all text-xs text-slate-500">{focused.id}</p>
                    <dl className="space-y-2 text-slate-300">
                      <div className="flex justify-between gap-3"><dt>Kildehenvisninger</dt><dd>{focused.evidenceCount}</dd></div>
                      <div className="flex justify-between gap-3"><dt>Kvalitetskontroll</dt><dd>{focused.qualityReviewed?"Registrert":"Mangler"}</dd></div>
                      <div className="flex justify-between gap-3"><dt>Sikkerhetssjekk</dt><dd>{focused.preflightPassed?"Markert":"Ikke fullført"}</dd></div>
                      <div className="flex justify-between gap-3"><dt>Beslutning</dt><dd>{focused.reviewDecision||"Venter"}</dd></div>
                      <div className="flex justify-between gap-3"><dt>Godkjenning utløper</dt><dd>{fmt(focused.reviewExpiresAt)}</dd></div>
                      <div className="flex justify-between gap-3"><dt>Oppdrag reservert</dt><dd>{focused.reserved?"Ja":"Nei"}</dd></div>
                    </dl>
                    <div className="border-t border-slate-800 pt-3">
                      <h2 className="mb-2 flex items-center gap-2 font-medium text-slate-200"><ShieldCheck size={16}/> Hendelseslogg</h2>
                      {focused.events.length===0?<p className="text-slate-500">Ingen hendelser registrert.</p>:(
                        <ol className="space-y-2">
                          {focused.events.map((event,i)=>(
                            <li key={i} className="border-l border-slate-600 pl-3 text-slate-300">
                              {EVENT[event.type]||event.type}<span className="block text-xs text-slate-500">{fmt(event.at)}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">Hendelser vises som lagrede databaseoppføringer, ikke som et bevis på ekstern utførelse.</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
