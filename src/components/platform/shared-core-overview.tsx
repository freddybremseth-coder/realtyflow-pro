import { CheckCircle2, CircleDashed, Layers3 } from "lucide-react";
import { SHARED_CORE_DOMAINS, sharedCoreProgress, type SharedCoreStatus } from "@/lib/shared-core/registry";

const statusText: Record<SharedCoreStatus, string> = {
  canonical: "Kanonisk",
  extracting: "Under samling",
  planned: "Planlagt",
};

export function SharedCoreOverview() {
  const progress = sharedCoreProgress();

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-950/60 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <Layers3 size={18} />
            <span className="text-xs font-bold uppercase tracking-[0.16em]">Shared Core</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">Én felles motor under arbeidsappene</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Sales, Marketing, Content og Finance eier arbeidsflytene. Shared Core eier de gjenbrukbare data- og tjenestekontraktene, slik at Olivia, Family og Re-Master kan kobles inn uten nye siloer.
          </p>
        </div>
        <div className="grid min-w-[260px] grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-3">
            <div className="text-xl font-bold text-emerald-300">{progress.canonical}</div>
            <div className="mt-1 text-slate-500">kanoniske</div>
          </div>
          <div className="rounded-2xl border border-cyan-900/50 bg-cyan-950/20 p-3">
            <div className="text-xl font-bold text-cyan-300">{progress.extracting}</div>
            <div className="mt-1 text-slate-500">samles</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xl font-bold text-slate-300">{progress.planned}</div>
            <div className="mt-1 text-slate-500">planlagt</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {SHARED_CORE_DOMAINS.map((domain) => {
          const canonical = domain.status === "canonical";
          const Icon = canonical ? CheckCircle2 : CircleDashed;
          return (
            <div key={domain.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-white">{domain.label}</h3>
                  <p className="mt-1 text-xs text-slate-500">{domain.canonicalService}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                  <Icon size={12} className={canonical ? "text-emerald-400" : "text-cyan-400"} />
                  {statusText[domain.status]}
                </span>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <p className="text-slate-400"><span className="text-slate-500">System of record:</span> {domain.systemOfRecord}</p>
                <p className="text-slate-400"><span className="text-slate-500">Kilder:</span> {domain.sources.join(" · ")}</p>
                <p className="leading-6 text-slate-300">{domain.nextStep}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
