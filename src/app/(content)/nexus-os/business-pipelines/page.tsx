import Link from "next/link";
import { ArrowRight, Boxes, CheckCircle2, GitBranch, ShieldCheck } from "lucide-react";
import {
  BRAND_BUSINESS_BINDINGS,
  BUSINESS_PIPELINES,
  type BusinessPipelineId,
} from "@/lib/business-pipeline-registry";
import { OWNED_GROWTH_BRANDS } from "@/lib/marketing/brand-registry";

function brandsForPipeline(pipelineId: BusinessPipelineId) {
  return BRAND_BUSINESS_BINDINGS
    .filter((binding) => binding.pipelineId === pipelineId)
    .map((binding) => ({
      binding,
      brand: OWNED_GROWTH_BRANDS.find((brand) => brand.id === binding.brandId) ?? null,
    }));
}

export default function BusinessPipelinesPage() {
  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-xl">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-300"><GitBranch size={24} /></div>
        <div>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Nexus Business Architecture</div>
          <h1 className="mt-2 text-3xl font-black">Ett operativsystem. Flere forskjellige pipelines.</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Nexus sammenligner arbeid på tvers, men bolig, bøker, AI-tjenester, rådgivning, commerce og media beholder egne kundereiser, stages, signaler og Next Best Actions.</p>
        </div>
      </div>
    </header>

    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
      <div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0" /><div><div className="font-black">Felles lifecycle er kun et sammenligningslag</div><p className="mt-1 text-sm leading-6 text-emerald-800">Awareness → engagement → qualification → consideration → conversion → delivery → retention brukes for porteføljeoversikt. Den erstatter aldri domenesteg som visning, prøvelest, demo, tilbud eller discovery call.</p></div></div>
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      {BUSINESS_PIPELINES.map((pipeline) => {
        const brands = brandsForPipeline(pipeline.id);
        return <article key={pipeline.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="text-xs font-black uppercase tracking-wider text-cyan-700">{pipeline.valueModel.replaceAll("_", " ")}</div><h2 className="mt-1 text-xl font-black text-slate-950">{pipeline.name}</h2><div className="mt-1 text-sm text-slate-500">{pipeline.customerLabel} · {pipeline.opportunityLabel}</div></div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-600">{pipeline.stages.length} stages</span>
          </div>

          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 size={15} className="mr-2 inline" /><b>Suksess:</b> {pipeline.successEvent}</div>

          <div className="mt-5">
            <div className="text-xs font-black uppercase tracking-wider text-slate-400">Brands</div>
            <div className="mt-2 flex flex-wrap gap-2">{brands.length > 0 ? brands.map(({ binding, brand }) => <span key={binding.brandId} className={`rounded-full border px-2.5 py-1 text-xs font-bold ${binding.role === "umbrella" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-cyan-200 bg-cyan-50 text-cyan-900"}`}>{brand?.name ?? binding.brandId} · {binding.role}</span>) : <span className="text-sm text-slate-400">Ingen brand-binding ennå</span>}</div>
          </div>

          <div className="mt-5 space-y-2">
            <div className="text-xs font-black uppercase tracking-wider text-slate-400">Pipeline</div>
            {pipeline.stages.map((stage, index) => <div key={stage.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start gap-3"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">{index + 1}</div><div><div className="flex flex-wrap items-center gap-2"><b className="text-sm text-slate-950">{stage.label}</b><span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-black uppercase text-slate-500">{stage.phase}</span></div><div className="mt-1 text-xs leading-5 text-slate-600">{stage.objective}</div><div className="mt-2 text-xs font-semibold text-slate-800">Neste: {stage.defaultNextAction}</div></div></div>
            </div>)}
          </div>
        </article>;
      })}
    </section>

    <section className="grid gap-3 md:grid-cols-3">
      <Link href="/nexus-os/today" className="rounded-xl border border-slate-200 bg-white p-4 font-black text-slate-900 hover:bg-slate-50"><Boxes size={16} className="mr-2 inline text-cyan-700" />Nexus Today <ArrowRight size={15} className="ml-2 inline" /></Link>
      <Link href="/nexus-os/inbox" className="rounded-xl border border-slate-200 bg-white p-4 font-black text-slate-900 hover:bg-slate-50">Nexus Inbox <ArrowRight size={15} className="ml-2 inline" /></Link>
      <Link href="/nexus-os/brand-brain" className="rounded-xl border border-slate-200 bg-white p-4 font-black text-slate-900 hover:bg-slate-50">Brand & Channel Brain <ArrowRight size={15} className="ml-2 inline" /></Link>
    </section>
  </main>;
}
