"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, SearchCheck } from "lucide-react";
import type { SEOControlReport } from "@/services/agents/seo-control-report";

type SeoBrief = {
  actions?: Array<{ requiresApproval: boolean }>;
  connectionSummary?: { readable: number; registered: number; measured: number };
  controlReport?: SEOControlReport | null;
  seoPilot?: { websiteChangesPublished: number | null } | null;
  lastGoogleReadAt?: string | null;
};

/** Read-only bridge: detailed diagnostics and rollback controls stay in Growth Hub. */
export function MorningBriefSeoSummary() {
  const [data, setData] = useState<SeoBrief | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/agents/seo-priorities", { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("SEO status unavailable");
        return await response.json() as SeoBrief;
      })
      .then(result => { if (active) { setData(result); setState("ready"); } })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);

  const actions = data?.actions ?? [];
  const ownerActions = actions.filter(item => item.requiresApproval).length;
  const systemFollowups = actions.filter(item => !item.requiresApproval).length;
  const audits = data?.controlReport?.sites ?? [];
  const incomplete = audits.filter(site =>
    site.incomplete || !site.visibilityDiagnostic || site.visibilityDiagnostic.incomplete).length;
  const findings = audits.reduce((count, site) => count + (site.visibilityDiagnostic?.issues?.length ?? 0), 0);
  const google = data?.connectionSummary;

  return <section aria-label="Sam SEO – kort oppsummering" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
          <SearchCheck size={17} /> Sam SEO og Nexus Visibility
        </div>
        <h2 className="mt-2 text-lg font-black text-slate-950">SEO – kort status</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Google-målinger, tekniske signaler og eventuelle beslutninger. Full analyse og publiseringskontroller ligger i Growth Hub.
        </p>
      </div>
      <Link href="/growth-hub" className="inline-flex items-center gap-1 text-sm font-bold text-cyan-700 hover:underline">
        Åpne full SEO-rapport <ArrowRight size={16} />
      </Link>
    </div>

    {state === "loading" && <p role="status" className="mt-4 text-sm text-slate-600">Henter SEO-status…</p>}
    {state === "error" && <p role="status" className="mt-4 text-sm text-amber-800">
      SEO-status kunne ikke hentes nå. Åpne Growth Hub for siste tilgjengelige rapport.
    </p>}
    {state === "ready" && <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-lg bg-slate-50 p-3">
        <div className="text-2xl font-bold text-slate-950">{ownerActions}</div>
        <div className="text-xs text-slate-600">SEO-beslutninger som krever deg</div>
      </div>
      <div className="rounded-lg bg-slate-50 p-3">
        <div className="text-2xl font-bold text-slate-950">{systemFollowups}</div>
        <div className="text-xs text-slate-600">Oppfølginger Sam undersøker</div>
      </div>
      <div className="rounded-lg bg-slate-50 p-3">
        <div className="text-2xl font-bold text-slate-950">{google ? google.readable + "/" + google.registered : "Ukjent"}</div>
        <div className="text-xs text-slate-600">Google-nettsteder med lesetilgang</div>
      </div>
      <div className="rounded-lg bg-slate-50 p-3">
        <div className="text-2xl font-bold text-slate-950">
          {data?.controlReport ? findings + " funn" : "Ukjent"}
        </div>
        <div className="text-xs text-slate-600">
          Begrenset teknisk utvalg{data?.controlReport && incomplete > 0 ? " · " + incomplete + " ufullstendige" : ""}
        </div>
      </div>
    </div>}
    {state === "ready" && <p className="mt-3 text-xs text-slate-500">
      Dette er et avgrenset kontrollutvalg, ikke et SEO-friskstempel eller publiseringsgodkjenning.
      {data?.lastGoogleReadAt ? " Sist lest: " + new Date(data.lastGoogleReadAt).toLocaleString("nb-NO") + "." : ""}
      {typeof data?.seoPilot?.websiteChangesPublished === "number"
        ? " Bekreftede publiseringer i siste syklus: " + data.seoPilot.websiteChangesPublished + "." : ""}
    </p>}
  </section>;
}
