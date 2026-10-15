"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, CheckCircle2, ChevronRight,
  CircleHelp, Clock3, ExternalLink, FileSearch, Globe2, LayoutGrid, LockKeyhole,
  RefreshCw, Search, ShieldCheck, Sparkles, Workflow, AlertTriangle,
  Monitor, PlayCircle, SlidersHorizontal
} from "lucide-react";
import {
  buildVisibilityProduct, VISIBILITY_DEMO, VISIBILITY_BRANDS,
  type VisibilitySource, type VisibilitySite, type VisibilityFinding
} from "@/lib/visibility-product";

type Tab = "overview" | "sites" | "findings" | "measurement" | "workflow" | "product";
const tabItems: Array<{id: Tab; label: string; icon: typeof LayoutGrid}> = [
  {id:"overview",label:"Oversikt",icon:LayoutGrid},
  {id:"sites",label:"Nettsteder",icon:Globe2},
  {id:"findings",label:"Funn og tiltak",icon:FileSearch},
  {id:"measurement",label:"Måling",icon:BarChart3},
  {id:"workflow",label:"Arbeidsflyt",icon:Workflow},
  {id:"product",label:"Produktet",icon:Sparkles},
];
const int = (v: number) => new Intl.NumberFormat("nb-NO").format(v);
const date = (s: string | null | undefined) => {
  if(!s || !Number.isFinite(Date.parse(s)))return "Ukjent";
  return new Date(s).toLocaleDateString("nb-NO",{day:"2-digit",month:"short",year:"numeric"});
};
const tone=(kind:string)=>kind==="blocked"||kind==="high"?"border-rose-200 bg-rose-50 text-rose-800":kind==="aged"||kind==="medium"?"border-amber-200 bg-amber-50 text-amber-800":"border-slate-200 bg-slate-50 text-slate-700";
const statusText=(site:VisibilitySite)=>site.incomplete?"Ufullstendig":site.technical==="aged"?"Eldre data":site.technical==="unknown"?"Ukjent grunnlag":(site.issues??0)>0?"Funn registrert":"Avgrenset kontroll";

function Metric({value,label,foot}: {value:string|number; label:string;foot?:string}){
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40">
    <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</div>
    <div className="mt-2 text-3xl font-black tabular-nums tracking-tight text-slate-950">{value}</div>
    {foot && <div className="mt-2 text-xs leading-5 text-slate-500">{foot}</div>}
  </div>;
}
function Empty({title,body}:{title:string;body:string}){
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white/75 px-6 py-10 text-center">
    <CircleHelp className="mx-auto text-slate-400" size={28}/>
    <div className="mt-3 font-bold text-slate-800">{title}</div><p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">{body}</p>
  </div>;
}
function SiteTile({site,onClick}:{site:VisibilitySite;onClick:()=>void}){
  return <button type="button" onClick={onClick}
    className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm shadow-slate-200/40 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">
    <div className="flex items-start justify-between gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-800"><Globe2 size={21}/></span>
      <ChevronRight size={18} className="text-slate-400 transition group-hover:translate-x-1"/>
    </div>
    <h3 className="mt-4 text-base font-bold text-slate-950">{site.name}</h3>
    <p className="text-xs text-slate-500">{site.domain}</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <span className={"rounded-full border px-2.5 py-1 text-[11px] font-semibold "+tone(site.technical==="aged"?"aged":site.incomplete?"medium":"")}>{statusText(site)}</span>
      {site.publisher==="blocked" && <span className={"rounded-full border px-2.5 py-1 text-[11px] font-semibold "+tone("blocked")}>Publisering blokkert</span>}
    </div>
    <div className="mt-5 flex justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
      <span>{site.pagesChecked===null?"Ukjent sideutvalg":int(site.pagesChecked)+" sider i utvalg"}</span>
      <span>{site.issues===null?"Ukjente funn":site.issues+" funn"}</span>
    </div>
  </button>;
}
const steps=[
  {n:"01",title:"Koble til",desc:"Koble til bekreftet nettsted og Google Search Console. Kontroller tilganger og eierskap.",state:"Lesetilgang finnes"},
  {n:"02",title:"Observer",desc:"Sam henter et avgrenset teknisk utvalg og separate søkemålinger. Kilde og tidspunkt lagres.",state:"I bruk"},
  {n:"03",title:"Prioriter",desc:"Vurder tekniske signaler, manglende data og blokkert publisering hver for seg.",state:"I bruk"},
  {n:"04",title:"Godkjenn endring",desc:"Dokumenter mål-URL, faktagrunnlag, ansvar og eksplisitt endringsgodkjenning.",state:"Planlagt P1"},
  {n:"05",title:"Publiser og kontroller",desc:"Utfør avgrensede endringer, verifiser offentlig resultat og tilby rollback.",state:"Planlagt P1"},
  {n:"06",title:"Mål effekten",desc:"Følg sammenlignbare GSC-perioder, GA4-hendelser og kvalifiserte leads.",state:"Delvis / planlagt"},
];
export function VisibilityProductConsole(){
  const [tab,setTab]=useState<Tab>("overview");
  const [mode,setMode]=useState<"live"|"demo">("live");
  const [brand,setBrand]=useState("all");
  const [source,setSource]=useState<VisibilitySource|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const fetchLive=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      const response=await fetch("/api/agents/seo-priorities",{credentials:"same-origin",cache:"no-store"});
      if(!response.ok)throw new Error(response.status===401||response.status===403?"Denne interne visningen krever eiertilgang.":`SEO-kilden svarte med HTTP ${response.status}.`);
      const body=await response.json() as VisibilitySource;
      setSource(body);
    }catch(e){setSource(null);setError(e instanceof Error?e.message:"Kunne ikke hente data.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void fetchLive();},[fetchLive]);
  const data=mode==="demo"?VISIBILITY_DEMO:source;
  const product=useMemo(()=>buildVisibilityProduct(data??{}),[data]);
  const sites=useMemo(()=>product.sites.filter(s=>brand==="all"||s.id===brand),[product,brand]);
  const findings=useMemo(()=>product.findings.filter(f=>brand==="all"||f.brandId===brand),[product,brand]);
  const detail=useMemo(()=>sites.find(s=>s.id===selected)??null,[sites,selected]);
  const measured=sites.filter(s=>s.metric);
  const clicks=measured.reduce((sum,s)=>sum+(s.metric?.totals?.currentClicks??0),0);
  const impressions=measured.reduce((sum,s)=>sum+(s.metric?.totals?.currentImpressions??0),0);
  const blocked=sites.filter(s=>s.publisher==="blocked").length;
  const pending=sites.filter(s=>s.incomplete||s.technical!=="observed").length;
  const noData=mode==="live"&&!loading&&!data;

  return <div className="mx-auto max-w-[1560px] text-slate-950">
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#f5f7f8] shadow-xl shadow-slate-900/5">
      <div className="relative overflow-hidden bg-[#10282e] px-6 py-7 text-white sm:px-9">
        <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl"/>
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-teal-300/30 bg-teal-400/10"><Activity size={18}/></span>
              Nexus Product Suite
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Visibility<span className="text-teal-300">.</span></h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">En egen arbeidsflate for teknisk SEO, Google-målinger og dokumenterte undersøkelser. AEO/GEO og full effektmåling er neste produktfase.</p>
            <p className="mt-2 text-xs text-slate-400">Produktprototype i RealtyFlow · reelle målinger fra Sam når tilgjengelig · ingen automatisk publisering</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/growth-hub" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Sam SEO <ExternalLink size={15}/></Link>
            <Link href="/nexus-os/morning-brief" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Morning Brief <ArrowUpRight size={15}/></Link>
          </div>
        </div>
      </div>
      <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="Datamodus">
            <button type="button" onClick={()=>setMode("live")} aria-pressed={mode==="live"}
              className={"rounded-lg px-3 py-2 text-xs font-bold transition "+(mode==="live"?"bg-white text-slate-950 shadow-sm":"text-slate-600 hover:text-slate-900")}>
              <Activity size={14} className="mr-1 inline"/> Virkelige data</button>
            <button type="button" onClick={()=>setMode("demo")} aria-pressed={mode==="demo"}
              className={"rounded-lg px-3 py-2 text-xs font-bold transition "+(mode==="demo"?"bg-white text-slate-950 shadow-sm":"text-slate-600 hover:text-slate-900")}>
              <PlayCircle size={14} className="mr-1 inline"/> Produktdemo</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-600" htmlFor="visibility-product-brand">Nettside</label>
            <select id="visibility-product-brand" value={brand} onChange={e=>{setBrand(e.target.value);setSelected(null);}}
              className="min-w-[180px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="all">Alle nettsteder</option>
              {product.sites.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}
            </select>
            <button type="button" onClick={()=>void fetchLive()} aria-label="Hent siste lagrede data" title="Hent siste lagrede data (ingen ny offentlig skanning)"
              className="rounded-xl border border-slate-300 bg-white p-2.5 text-slate-700 transition hover:bg-slate-50"><RefreshCw size={16}/></button>
          </div>
        </div>
        {mode==="demo" && <div role="status" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs font-semibold text-blue-900">
          Produktdemo: alle tall og avvik nedenfor er illustrasjoner. Ingenting lagres, godkjennes eller publiseres.
        </div>}
        {mode==="live"&&loading&&<p role="status" className="mt-3 text-sm text-slate-600">Henter eksisterende kontrollrapporter og GSC-målinger …</p>}
        {mode==="live"&&error&&<p role="alert" className="mt-3 text-sm text-amber-800">{error} Du kan bruke «Produktdemo» til å prøve grensesnittet.</p>}
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 sm:px-7" role="tablist" aria-label="Nexus Visibility produktmoduler">
        {tabItems.map(t=>{const Icon=t.icon;return <button type="button" role="tab" aria-selected={tab===t.id} key={t.id}
          onClick={()=>{setTab(t.id);setSelected(null);}}
          className={"inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition "+(tab===t.id?"bg-teal-50 text-teal-900":"text-slate-500 hover:bg-slate-50 hover:text-slate-900")}>
          <Icon size={17}/>{t.label}</button>;})}
      </div>
      <div className="space-y-6 p-4 sm:p-8">
        {noData&&tab!=="workflow"&&tab!=="product"&&<Empty title="Ingen kontroller tilgjengelig" body="Live-data kunne ikke hentes eller er ikke lagret. Produktdemonstrasjonen viser hele grensesnittet med illustrative data. Ingen live-status blir erstattet av demotall."/>}
        {(!noData||tab==="workflow"||tab==="product")&&<>
          {tab==="overview"&&<>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-2xl font-extrabold">Din synlighet, samlet</h2><p className="mt-1 text-sm text-slate-600">Bare dokumenterte observasjoner. Ingen poengscore som later som alt er kontrollert.</p></div>
              <span className="text-xs font-semibold text-slate-500">{mode==="demo"?"EKSEMPELDATA": "Sist lagrede kontroller"} · {date(data?.controlReport?.checkedAt)}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric value={sites.length} label="Nettsteder" foot="Tilgjengelige i valgt utvalg"/>
              <Metric value={findings.length} label="Undersøkelsesforslag" foot="Ikke automatiske publiseringsoppgaver"/>
              <Metric value={blocked} label="Publiseringsblokkeringer" foot="Basert på sist registrerte status"/>
              <Metric value={pending} label="Mangelfulle / eldre kontroller" foot="Nytt bevis kreves før beslutning"/>
            </div>
            <div className="grid gap-5 xl:grid-cols-3">
              <div className="space-y-4 xl:col-span-2">
                <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Nettstedene dine</h3><button onClick={()=>setTab("sites")} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700">Alle nettsteder <ArrowRight size={16}/></button></div>
                {sites.length?<div className="grid gap-3 md:grid-cols-2">{sites.slice(0,4).map(s=><SiteTile key={s.id} site={s} onClick={()=>{setSelected(s.id);setTab("sites");}}/>)}</div>:<Empty title="Ingen nettsteder" body="Ingen teknisk audit, måledata eller publiseringsstatus er hentet."/>}
              </div>
              <div className="space-y-4">
                <h3 className="text-lg font-bold">Neste undersøkelser</h3>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  {findings.length?findings.slice(0,4).map(f=><button key={f.id} onClick={()=>{setTab("findings");setSelected(null);}} className="flex w-full gap-3 border-b border-slate-100 py-3 text-left last:border-b-0">
                    <span className={"mt-1 h-2.5 w-2.5 shrink-0 rounded-full "+(f.priority==="high"?"bg-rose-500":"bg-amber-400")}/>
                    <span><strong className="block text-sm">{f.title}</strong><small className="mt-1 block text-slate-500">{VISIBILITY_BRANDS[f.brandId]?.name??f.brandId} · {f.evidenceAge==="AGED"?"Eldre funn":f.evidenceAge==="UNKNOWN"?"Kontrolltid ukjent":"Registrert"}</small></span>
                  </button>):<p className="text-sm text-slate-600">Ingen klassifiserte undersøkelser i lagrede data. Det er ikke bevis på at nettstedene er feilfrie.</p>}
                </div>
                <div className="rounded-2xl bg-[#153e42] p-5 text-white"><ShieldCheck size={22} className="text-teal-300"/>
                  <h4 className="mt-3 font-bold">Kontrollerte endringer</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-300">Kvalitetsporten er skrivebeskyttet. URL-spesifikk godkjenning, publisering og rollback er neste fase.</p>
                  <button onClick={()=>setTab("workflow")} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-200">Se arbeidsflyten <ArrowRight size={16}/></button>
                </div>
              </div>
            </div>
          </>}
          {tab==="sites"&&<>
            <div><h2 className="text-2xl font-extrabold">Nettsteder og tekniske kontroller</h2><p className="mt-1 text-sm text-slate-600">Velg et nettsted for kontrollhistorikk, funn og publiseringsstatus.</p></div>
            {sites.length?<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sites.map(s=><SiteTile key={s.id} site={s} onClick={()=>setSelected(s.id)}/>)}</div>:<Empty title="Ingen registrerte nettsteder" body="Koble til godkjente nettsteder gjennom Sam SEO for å hente reelle observasjoner."/>}
            {detail&&<section aria-label="Nettstedsdetaljer" className="rounded-2xl border-2 border-teal-200 bg-white p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Nettstedsdetaljer</p><h3 className="mt-1 text-xl font-extrabold">{detail.name}</h3><p className="mt-1 text-sm text-slate-600">{detail.domain}</p></div>
                <button onClick={()=>setSelected(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Lukk detaljer</button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Metric value={detail.pagesChecked??"—"} label="Sider kontrollert" foot="Begrenset utvalg"/>
                <Metric value={detail.issues??"Ukjent"} label="Tekniske funn" foot="Observerte signaler"/>
                <Metric value={date(detail.checkedAt)} label="Kontrolltid" foot={detail.technical==="aged"?"Eldre enn ti dager":detail.technical==="unknown"?"Ukjent dato":"Registrert kontroll"}/>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4"><h4 className="font-bold">Kildegrunnlag</h4><p className="mt-2 text-sm text-slate-600">Teknisk: {statusText(detail)}. Publisering: {detail.publisher==="unknown"?"Ikke dokumentert":detail.publisher}.</p>
                  {detail.publisherReason&&<p className="mt-2 text-sm text-slate-600">{detail.publisherReason}</p>}</div>
                <div className="rounded-xl bg-slate-50 p-4"><h4 className="font-bold">Kontrollerte sidebaner</h4><p className="mt-2 break-words text-sm text-slate-600">{detail.sampledPaths.length?detail.sampledPaths.slice(0,8).join(" · "):"Sideutvalg ikke dokumentert"}</p></div>
              </div>
              {detail.technicalFindings.length>0&&<div className="mt-5 space-y-2"><h4 className="font-bold">Registrerte funn</h4>{detail.technicalFindings.map((issue,i)=><p key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><strong>{issue.code.replaceAll("_"," ")}</strong> · {issue.evidence}</p>)}</div>}
            </section>}
          </>}
          {tab==="findings"&&<>
            <div><h2 className="text-2xl font-extrabold">Funn, dokumentasjon og neste steg</h2><p className="mt-1 text-sm text-slate-600">Undersøkelsesforslag er ikke bekreftede feil eller godkjente publiseringer.</p></div>
            {findings.length?<div className="space-y-3">{findings.map(f=><article key={f.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={"rounded-full border px-2.5 py-1 text-xs font-bold "+tone(f.priority)}>{f.priority==="high"?"Høy kontrollprioritet":f.priority==="medium"?"Undersøk":"Datagrunnlag mangler"}</span>
                  <span className="text-xs font-semibold text-slate-500">{VISIBILITY_BRANDS[f.brandId]?.name??f.brandId}</span>
                </div>
                <span className="text-xs text-slate-500">{f.evidenceAge==="AGED"?"Eldre grunnlag":f.evidenceAge==="UNKNOWN"?"Kontrolltid ukjent":"Kontroll "+date(f.updatedAt)}</span>
              </div>
              <h3 className="mt-3 font-bold">{f.title}</h3><p className="mt-2 text-sm text-slate-700"><strong>Observasjon: </strong>{f.detail}</p>
              <div className="mt-4 rounded-xl bg-teal-50 p-4 text-sm leading-6 text-teal-950"><strong>Neste kontroll: </strong>{f.nextStep}</div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>Type: {f.category==="publishing"?"Publiseringskilde":f.category==="missing-data"?"Datakvalitet":"Teknisk SEO"}</span>
                <span>Ansvar: Sam / systemundersøkelse</span>
                <span>Ingen automatisk publisering</span>
              </div>
            </article>)}</div>:<Empty title="Ingen klassifiserte funn" body="Ingen forslag finnes i det lagrede utvalget. Dette betyr ikke at en full SEO-audit er bestått."/>}
          </>}
          {tab==="measurement"&&<>
            <div><h2 className="text-2xl font-extrabold">Synlighet og måling</h2><p className="mt-1 text-sm text-slate-600">Verifiserte Google Search Console-data. Ingen estimerte AI-siteringer, leads eller plasseringer.</p></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric value={measured.length} label="Nettsteder målt" foot="Google Search Console"/>
              <Metric value={int(clicks)} label="Google-klikk" foot="Sum av målte nettsteder i vist periode"/>
              <Metric value={int(impressions)} label="Søkevisninger" foot="Ikke visninger fra SoMe eller AI-svar"/>
            </div>
            {measured.length?<div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold">Google-data per nettsted</h3><div className="mt-4 space-y-5">
                {measured.map(s=>{const c=s.metric?.totals?.currentClicks??0;const max=Math.max(...measured.map(x=>x.metric?.totals?.currentClicks??0),1);
                  return <div key={s.id}><div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><strong>{s.name}</strong><span className="text-slate-600">{int(c)} klikk · {int(s.metric?.totals?.currentImpressions??0)} visninger</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-500" style={{width:Math.min(100,c/max*100)+"%"}}/></div>
                    <div className="mt-1 text-xs text-slate-500">Periode: {s.metric?.period?.currentStart??"Ukjent"}–{s.metric?.period?.currentEnd??"Ukjent"} · oppdatert {date(s.metric?.collectedAt)}</div>
                  </div>})}
              </div></div>:<Empty title="Ingen Google-målinger i dette utvalget" body="Teknisk kontroll kan fortsatt være gjennomført, men den kan ikke erstatte reelle søkedata."/>}
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5"><h3 className="font-bold">Neste måleledd</h3><p className="mt-2 text-sm text-slate-600">GA4-hendelser → skjema → CRM-kvalifiserte henvendelser → reell effekt. Dette er produktplanen, ikke ferdig målt attribusjon i dagens Visibility.</p></div>
          </>}
          {tab==="workflow"&&<>
            <div><h2 className="text-2xl font-extrabold">Slik arbeider Nexus Visibility</h2><p className="mt-1 text-sm text-slate-600">Produktreisen fra tilkobling til dokumenterte beslutninger. Aktiv funksjonalitet og planlagte steg er merket separat.</p></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{steps.map(s=><article key={s.n} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3"><span className="text-2xl font-black text-teal-700">{s.n}</span><span className={"rounded-full px-2 py-1 text-xs font-semibold "+(s.state==="I bruk"?"bg-teal-50 text-teal-900":"bg-slate-100 text-slate-700")}>{s.state}</span></div>
              <h3 className="mt-4 font-bold">{s.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{s.desc}</p>
            </article>)}</div>
            <div className="rounded-2xl bg-[#153e42] p-6 text-white"><LockKeyhole size={24} className="text-teal-300"/><h3 className="mt-3 text-lg font-bold">Menneskelig kontroll for risikofylte endringer</h3><p className="mt-2 text-sm leading-6 text-slate-300">Endringer i skatt, jus, finans, globale nettstedinnstillinger og publisering krever fremtidig dokumentert godkjenning og faktisk URL-preflight. En grønn SEO-observasjon er aldri publiseringstillatelse.</p></div>
          </>}
          {tab==="product"&&<>
            <div><h2 className="text-2xl font-extrabold">Fra intern modul til eget produkt</h2><p className="mt-1 text-sm text-slate-600">Denne skjermen er produktprototypen. Den neste versjonen må ha kundeadministrasjon, merkevareisolasjon og egen godkjenningsflyt.</p></div>
            <div className="grid gap-4 lg:grid-cols-3">
              {[
                {icon:Monitor,title:"Egen produktidentitet",text:"Samlet navigasjon for nettsteder, diagnostikk, funn, måling og arbeidsflyt. Klar for UX-evaluering her i RealtyFlow.",state:"Prototype"},
                {icon:ShieldCheck,title:"Sikker kundeisolasjon",text:"Uavhengige kundekontoer, abonnement, tillatelser, database-RLS, kvoter og GDPR må ferdigstilles før salg.",state:"Må bygges"},
                {icon:SlidersHorizontal,title:"Arbeidsflyt og kontroll",text:"Tildeling, endringsforslag, versjonssporing, godkjenning, publikasjon, URL-etterkontroll og rollback.",state:"P1/P2"},
              ].map(item=>{const Icon=item.icon;return <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                <Icon className="text-teal-800" size={26}/><div className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">{item.state}</div><h3 className="mt-2 font-bold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p></article>})}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6"><h3 className="font-bold">Arkitekturprinsipp</h3><p className="mt-2 text-sm leading-6 text-slate-600">Nexus Visibility skal kunne selges selvstendig, men dele trygg tjenestelogikk med RealtyFlow/Nexus. Kundeavgrensning skjer på server, ikke bare i UI. Ingen separate CRM-siloer eller åpne tverrmerkedata.</p>
              <Link className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-teal-800" href="/growth-hub">Se dagens operative SEO-funksjoner <ArrowRight size={16}/></Link>
            </div>
          </>}
        </>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500">
        <span>Nexus Visibility · produktprototype · begrenset datakilde</span>
        <span className="inline-flex items-center gap-1.5"><LockKeyhole size={13}/> Kun intern eiertilgang · ingen publisering fra denne flaten</span>
      </div>
    </div>
  </div>;
}
