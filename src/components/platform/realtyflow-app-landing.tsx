import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { REALTYFLOW_APPS, REALTYFLOW_PLATFORM, type RealtyFlowAppId } from "@/lib/realtyflow-apps";

export function RealtyFlowAppLanding({ appId }: { appId: RealtyFlowAppId | "platform" }) {
  const app = appId === "platform"
    ? REALTYFLOW_PLATFORM
    : REALTYFLOW_APPS.find((item) => item.id === appId);

  if (!app) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-7 text-slate-100">
      <header className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">RealtyFlow · {app.label}</p>
        <h1 className="mt-2 text-3xl font-bold">{app.navLabel}</h1>
        <p className="mt-3 max-w-3xl text-slate-300">{app.description}</p>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">{app.promise}</p>
      </header>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Arbeidsflater</h2>
            <p className="mt-1 text-sm text-slate-500">Eksisterende funksjoner brukes videre mens modulene flyttes inn i den nye appstrukturen.</p>
          </div>
          <Link href="/workspaces" className="text-sm font-medium text-cyan-300 hover:underline">Bytt app</Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {app.links.map((item) => (
            <Link key={item.href} href={item.href} className="group rounded-2xl border border-slate-700 bg-slate-900/70 p-5 transition hover:border-cyan-500 hover:bg-slate-900">
              <h3 className="font-semibold text-white">{item.label}</h3>
              <p className="mt-2 min-h-[42px] text-sm text-slate-400">{item.description}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-cyan-300">
                Åpne <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
