/**
 * Floating design switcher on the public demo preview. Pure links (server
 * component): each click re-renders the page with ?layout=&style= params,
 * so the customer — or the seller in a meeting — can flip through curated
 * looks in seconds. The share-URL keeps the chosen design.
 */
import { Shuffle } from "lucide-react";
import {
  DEMO_SITE_LAYOUTS,
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

  return (
    <div className="fixed bottom-4 right-4 z-40 w-64 rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur">
      <a
        href={hrefFor(basePath, next)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-bold text-slate-950 transition-transform hover:scale-[1.02]"
      >
        <Shuffle className="h-4 w-4" /> Prøv en annen stil
      </a>
      <div className="mt-3 space-y-2">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Layout</p>
          <div className="flex flex-wrap gap-1">
            {DEMO_SITE_LAYOUTS.map((layout) => (
              <a
                key={layout.id}
                href={hrefFor(basePath, { ...design, layout: layout.id })}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  design.layout === layout.id ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {layout.label}
              </a>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Stil</p>
          <div className="flex flex-wrap gap-1">
            {DEMO_SITE_STYLES.map((style) => (
              <a
                key={style.id}
                href={hrefFor(basePath, { ...design, style: style.id })}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  design.style === style.id ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {style.label}
              </a>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">Slik kan siden din se ut — velg stilen du liker best.</p>
    </div>
  );
}
