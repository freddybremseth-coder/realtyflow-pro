import Link from "next/link";
import { ArrowRight, Banknote, Clapperboard, Megaphone, Settings, Users } from "lucide-react";
import type { RealtyFlowAppDefinition } from "@/lib/platform-apps";

const iconMap = { Users, Megaphone, Clapperboard, Banknote, Settings };

export function PlatformAppPage({ app }: { app: RealtyFlowAppDefinition }) {
  const Icon = iconMap[app.icon];
  return (
    <div className="mx-auto max-w-6xl space-y-7 text-slate-100">
      <header className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 md:p-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
          <Icon size={15} /> RealtyFlow
        </div>
        <h1 className="text-3xl font-bold md:text-4xl">{app.label}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 md:text-base">{app.description}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {app.modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:-translate-y-0.5 hover:border-cyan-500/50 hover:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-100">{module.label}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{module.description}</p>
              </div>
              <ArrowRight className="mt-1 shrink-0 text-slate-600 transition group-hover:translate-x-1 group-hover:text-cyan-300" size={17} />
            </div>
          </Link>
        ))}
      </section>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-sm text-slate-400">
        Dette er et arbeidsområde over eksisterende RealtyFlow-funksjoner. Data, kunder, merkevarer og Nexus-signaler forblir i Shared Core mens modulene flyttes gradvis inn i en tydeligere struktur.
      </div>
    </div>
  );
}
