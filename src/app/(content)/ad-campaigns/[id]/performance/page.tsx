"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, BarChart3, Copy, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Evidence = "none" | "limited" | "moderate" | "strong";
type Metrics = { impressions:number; clicks:number; landings:number; ctas:number; formSubmits:number; leads:number; qualified:number; viewings:number; offers:number; sales:number; commissionEur:number };
type Economics = {
  available:boolean; spendAvailable:boolean; currencies:string[]; rawSpendByCurrency:Record<string,number>; singleCurrency:string|null; comparableRawSpend:number|null; spendEur:number|null; fullyNormalizedToEur:boolean;
  paidImpressions:number; paidClicks:number; paidLandings:number; cpc:number|null; cpl:number|null; cpql:number|null; cpsale:number|null; roasOnCommission:number|null;
  state:"not_imported"|"delivery_only"|"mixed_currency_unresolved"|"comparable";
};
type Insight = { value:string; creatives:number; metrics:Metrics; evidence:Evidence; status:"observe"|"promising"; economics:{ comparable:boolean; spend:number|null; currency:string|null; spendEur:number|null; cpl:number|null; cpql:number|null } };
type CreativeRow = {
  id:string; tracking_code:string|null; concept_group:string|null; variant_index:number|null; angle:string|null; mood:string|null; creative_format:string|null; hook_family:string|null;
  image_url:string|null; thumbnail_url:string|null; provider:string|null; model:string|null; generation_type:string; parent_creative_id:string|null; evidence:Evidence; metrics:Metrics; economics:Economics;
  rates:{ ctrPct:number|null; landingToLeadPct:number|null; clickToLeadPct:number|null; qualifiedLeadPct:number|null; leadToSalePct:number|null };
  attribution:{ canonicalCreativeId:string; trackingCode:string|null; utm:Record<string,string>|null };
};
type Payload = {
  campaign:{ id:string; name:string; product_name:string; growth_goal:string; status:string };
  generatedAt:string; metrics:Metrics; economics:Economics; creativeCount:number; attributedCreativeTouchpoints:number; unattributedCampaignTouchpoints:number; paidMediaRows:number; note:string;
  insights:{ hookFamily:Insight[]; concept:Insight[]; format:Insight[]; provider:Insight[]; language:Insight[] };
  creatives:CreativeRow[];
};

const evidenceStyle:Record<Evidence,string> = {
  none:"border-slate-300 bg-slate-100 text-slate-700",
  limited:"border-amber-300 bg-amber-50 text-amber-900",
  moderate:"border-cyan-300 bg-cyan-50 text-cyan-900",
  strong:"border-emerald-300 bg-emerald-50 text-emerald-900",
};

function Metric({label,value}:{label:string;value:string|number}) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 text-xl font-black text-slate-950">{value}</div></div>; }
function pct(value:number|null){ return value == null ? "—" : `${value.toFixed(2)}%`; }
function money(value:number|null,currency:string|null){ return value==null?"—":`${currency||""} ${value.toFixed(2)}`.trim(); }
function InsightGroup({title,rows}:{title:string;rows:Insight[]}) { return <div><h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">{title}</h3><div className="space-y-2">{rows.slice(0,5).map((row)=><div key={row.value} className={`rounded-xl border p-3 ${row.status==="promising"?"border-emerald-300 bg-emerald-50":"border-slate-200 bg-slate-50"}`}><div className="flex items-center justify-between gap-2"><div className="font-black text-slate-900">{row.value.replace(/_/g," ")}</div><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${evidenceStyle[row.evidence]}`}>{row.status} · {row.evidence}</span></div><div className="mt-1 text-[11px] text-slate-600">{row.creatives} creatives · {row.metrics.leads} leads · {row.metrics.qualified} qualified · {row.metrics.sales} sales{row.economics.comparable?` · CPQL ${money(row.economics.cpql,row.economics.currency)}`:""}</div></div>)}</div></div>; }

export default function CreativePerformancePage(){
  const {id}=useParams<{id:string}>();
  const [data,setData]=useState<Payload|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [busy,setBusy]=useState(""); const [notice,setNotice]=useState("");
  const load=useCallback(async()=>{ setLoading(true); setError(""); try{ const r=await fetch(`/api/ad-campaigns/${id}/performance?channel=instagram`,{cache:"no-store"}); const b=await r.json().catch(()=>({})); if(!r.ok) throw new Error(b.error||`Performance feilet (${r.status})`); setData(b); }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);} },[id]);
  useEffect(()=>{void load();},[load]);

  const evidenceCounts=useMemo(()=>{const c={none:0,limited:0,moderate:0,strong:0}; for(const row of data?.creatives||[]) c[row.evidence]+=1; return c;},[data]);
  const createVariants=async(row:CreativeRow,mode:"winner"|"manual",count:number)=>{ setBusy(row.id); setError(""); setNotice(""); try{ const r=await fetch(`/api/ad-campaigns/${id}/creatives/${row.id}/variants`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode,count})}); const b=await r.json().catch(()=>({})); if(!r.ok) throw new Error(b.error||"Kunne ikke lage varianter"); setNotice(`${b.created||0} ${mode==="winner"?"evidensbaserte":"manuelle"} varianter er lagt i kø som pending drafts. Ingenting er publisert.`); await load(); }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy("");} };

  const econ=data?.economics;
  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 text-slate-950 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/ad-campaigns/${id}`} className="inline-flex items-center gap-1 text-xs font-black text-cyan-800"><ArrowLeft className="h-3.5 w-3.5"/>Til kampanjen</Link><h1 className="mt-2 flex items-center gap-2 text-2xl font-black"><BarChart3 className="h-6 w-6 text-cyan-700"/>Creative Intelligence</h1><p className="mt-1 text-sm text-slate-600">{data?.campaign?.name||"Kampanje"} · mål: {data?.campaign?.growth_goal?.replace(/_/g," ")||"ukjent"}</p></div><Button variant="outline" onClick={()=>void load()} disabled={loading} className="gap-2"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>Oppdater</Button></div>
    {error&&<div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-900"><AlertCircle className="mr-2 inline h-4 w-4"/>{error}</div>}
    {notice&&<div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{notice}</div>}
    <Card><CardHeader><CardTitle>Campaign funnel</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><Metric label="Impressions" value={data?.metrics.impressions??"—"}/><Metric label="Clicks" value={data?.metrics.clicks??"—"}/><Metric label="Leads" value={data?.metrics.leads??"—"}/><Metric label="Qualified" value={data?.metrics.qualified??"—"}/><Metric label="Sales" value={data?.metrics.sales??"—"}/><Metric label="Commission" value={data?`€${Math.round(data.metrics.commissionEur).toLocaleString("nb-NO")}`:"—"}/></div><div className="mt-4 flex flex-wrap gap-2 text-xs"><Badge variant="outline">{data?.attributedCreativeTouchpoints??0} creative-attribuerte touchpoints</Badge><Badge variant="outline">{data?.unattributedCampaignTouchpoints??0} campaign-touchpoints uten creative</Badge><Badge variant="outline">Strong {evidenceCounts.strong}</Badge><Badge variant="outline">Moderate {evidenceCounts.moderate}</Badge><Badge variant="outline">Limited {evidenceCounts.limited}</Badge></div><p className="mt-3 text-xs text-slate-500">{data?.note}</p></CardContent></Card>

    <Card><CardHeader><CardTitle>Paid media economics</CardTitle></CardHeader><CardContent>{!econ||econ.state==="not_imported"?<div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Spend-data er ikke importert.</strong><p className="mt-1 text-xs leading-5">Dette betyr ukjent kostnad — ikke €0. RealtyFlow erklærer derfor ingen økonomisk vinner eller ROAS ennå.</p></div>:<><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><Metric label="Spend" value={econ.spendEur!=null?`€${econ.spendEur.toFixed(2)}`:money(econ.comparableRawSpend,econ.singleCurrency)}/><Metric label="Paid impressions" value={econ.paidImpressions}/><Metric label="Paid clicks" value={econ.paidClicks}/><Metric label="CPC" value={money(econ.cpc,econ.singleCurrency)}/><Metric label="CPQL" value={money(econ.cpql,econ.singleCurrency)}/><Metric label="ROAS commission" value={econ.roasOnCommission==null?"—":`${econ.roasOnCommission.toFixed(2)}x`}/></div>{econ.state==="mixed_currency_unresolved"&&<p className="mt-3 text-xs font-semibold text-rose-700">Flere valutaer uten full FX-normalisering. Økonomisk sammenligning er sperret.</p>}</>}</CardContent></Card>

    <Card><CardHeader><CardTitle>Hook & Creative Laboratory</CardTitle></CardHeader><CardContent><p className="mb-4 text-xs leading-5 text-slate-600">Dette er mønstre, ikke fasit. `Promising` krever moderat/sterk samlet evidens; mindre samples står som `observe`.</p><div className="grid gap-5 lg:grid-cols-3"><InsightGroup title="Hook families" rows={data?.insights?.hookFamily||[]}/><InsightGroup title="Formater" rows={data?.insights?.format||[]}/><InsightGroup title="Providers" rows={data?.insights?.provider||[]}/></div></CardContent></Card>

    <div className="space-y-3">{loading&&!data?<div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>Laster creative performance…</div>:(data?.creatives||[]).map((row,index)=><Card key={row.id}><CardContent className="grid gap-4 p-4 lg:grid-cols-[130px_1fr_auto] lg:items-center"><div className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">{row.thumbnail_url||row.image_url?<img src={row.thumbnail_url||row.image_url||""} alt={row.angle||row.concept_group||"Creative"} className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center text-xs text-slate-400">Ikke generert</div>}</div><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black text-slate-400">#{index+1}</span><span className="font-black">{row.angle||row.concept_group||row.id}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${evidenceStyle[row.evidence]}`}>{row.evidence} evidence</span>{row.generation_type!=="original"&&<Badge variant="outline">{row.generation_type.replace(/_/g," ")}</Badge>}</div><div className="mt-1 text-xs text-slate-500">Hook: {row.hook_family||"unclassified"} · {row.creative_format||"format ukjent"} · {row.provider||"provider ukjent"}</div><div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6"><Metric label="Clicks" value={row.metrics.clicks}/><Metric label="Leads" value={row.metrics.leads}/><Metric label="Qualified" value={row.metrics.qualified}/><Metric label="Viewings" value={row.metrics.viewings}/><Metric label="Offers" value={row.metrics.offers}/><Metric label="Sales" value={row.metrics.sales}/></div><div className="mt-2 text-[11px] text-slate-500">CTR {pct(row.rates.ctrPct)} · click→lead {pct(row.rates.clickToLeadPct)} · qualified/lead {pct(row.rates.qualifiedLeadPct)} · lead→sale {pct(row.rates.leadToSalePct)}</div><div className="mt-1 text-[11px] text-slate-500">Paid economics: {row.economics.state==="not_imported"?"ikke importert":`CPL ${money(row.economics.cpl,row.economics.singleCurrency)} · CPQL ${money(row.economics.cpql,row.economics.singleCurrency)} · ROAS ${row.economics.roasOnCommission==null?"—":`${row.economics.roasOnCommission.toFixed(2)}x`}`}</div>{row.attribution.trackingCode&&<div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500"><Copy className="h-3 w-3"/><code>{row.attribution.trackingCode}</code></div>}</div><div className="flex min-w-[180px] flex-col gap-2"><Button size="sm" disabled={busy===row.id||!["moderate","strong"].includes(row.evidence)} onClick={()=>void createVariants(row,"winner",5)} className="gap-2"><Sparkles className="h-3.5 w-3.5"/>Lag 5 vinner-varianter</Button><Button size="sm" variant="outline" disabled={busy===row.id} onClick={()=>void createVariants(row,"manual",5)}>Lag 5 manuelle hypoteser</Button>{!["moderate","strong"].includes(row.evidence)&&<p className="text-[10px] leading-4 text-slate-500">Winner cloning låses opp ved moderate/strong evidence. Manual lager kun pending hypoteser.</p>}</div></CardContent></Card>)}</div>
  </div>;
}
