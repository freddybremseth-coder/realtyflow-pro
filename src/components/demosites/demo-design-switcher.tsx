/**
 * Floating design switcher on public DemoSites previews.
 *
 * The original layouts stay available. Signature 2026 concepts are grouped
 * separately so sellers can jump directly to the five premium compositions.
 */
import { ChevronDown, Shuffle, Sparkles } from "lucide-react";
import {
  DEMO_SITE_LAYOUTS,
  DEMO_SITE_SIGNATURE_LAYOUTS,
  DEMO_SITE_STYLES,
  nextDemoSiteDesign,
  type DemoSiteDesign,
} from "@/lib/demosites-design";

type DemoDesignSwitcherProps = {
  basePath: string;
  design: DemoSiteDesign;
};

function hrefFor(basePath: string, design: DemoSiteDesign) {
  return `${basePath}?layout=${design.layout}&style=${design.style}`;
}

export function DemoDesignSwitcher({ basePath, design }: DemoDesignSwitcherProps) {
  const next = nextDemoSiteDesign(design);
  const classicLayouts = DEMO_SITE_LAYOUTS.filter((layout) => layout.group === "classic");
  const current = DEMO_SITE_LAYOUTS.find((layout) => layout.id === design.layout);

  return (
    <details className="group fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 text-white shadow-2xl shadow-black/40 backdrop-blur-2xl">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-cyan-400 text-slate-950">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Designstudio</span>
            <span className="block truncate text-sm font-black">{current?.label || "Velg uttrykk"}</span>
          </span>
        </span>
        <ChevronDown className="h-5 w-5 text-slate-400 transition group-open:rotate-180" />
      </summary>

      <div className="border-t border-white/10 p-3">
        <a
          href={hrefFor(basePath, next)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-3 text-sm font-black text-slate-950 transition hover:scale-[1.01]"
        >
          <Shuffle className="h-4 w-4" /> Vis neste kuraterte uttrykk
        </a>

        <div className="mt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300">Signature 2026</p>
          <div className="grid grid-cols-2 gap-1.5">
            {DEMO_SITE_SIGNATURE_LAYOUTS.map((layout) => (
              <a
                key={layout.id}
                href={hrefFor(basePath, { ...design, layout: layout.id })}
                title={layout.description}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  design.layout === layout.id
                    ? "border-fuchsia-300 bg-fuchsia-400/20 text-white"
                    : "border-white/10 bg-white/[0.045] text-slate-300 hover:border-white/20 hover:bg-white/[0.08]"
                }`}
              >
                <span className="block text-xs font-black">{layout.label}</span>
                <span className="mt-1 block line-clamp-2 text-[9px] leading-3.5 text-slate-500">{layout.description}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Klassiske layouts</p>
          <div className="flex flex-wrap gap-1.5">
            {classicLayouts.map((layout) => (
              <a
                key={layout.id}
                href={hrefFor(basePath, { ...design, layout: layout.id })}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  design.layout === layout.id ? "bg-emerald-400 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {layout.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Typografi og stemning</p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_SITE_STYLES.map((style) => (
              <a
                key={style.id}
                href={hrefFor(basePath, { ...design, style: style.id })}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  design.style === style.id ? "bg-cyan-300 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {style.label}
              </a>
            ))}
          </div>
        </div>

        <p className="mt-3 text-[10px] leading-4 text-slate-500">
          Valgt URL kan deles direkte med kunden. Lagre konseptet i Oppsett når det skal bli den endelige siden.
        </p>
      </div>
    </details>
  );
}
