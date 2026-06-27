"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, Rocket, WalletCards } from "lucide-react";

type SaasApp = {
  id: string;
  slug: string;
  name: string;
  status?: string;
  mrr?: number;
  arr?: number;
  total_revenue?: number;
  total_users?: number;
  active_users_30d?: number;
  active_subscriptions?: number;
  currency?: string;
};

type SaasResponse = {
  apps?: SaasApp[];
  totals?: {
    totalApps?: number;
    liveApps?: number;
    totalUsers?: number;
    totalMRR?: number;
    totalRevenue?: number;
  };
};

type DemoSitesResponse = {
  summary?: {
    totalOrders?: number;
    activeOrders?: number;
    paidOrders?: number;
    bookedSetupRevenue?: number;
    activeMrr?: number;
    setupCosts?: number;
    monthlyCosts?: number;
    netSetup?: number;
    netMrr?: number;
    arr?: number;
  };
};

function formatNok(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function SaasSubscriptionOverview() {
  const [saas, setSaas] = useState<SaasResponse | null>(null);
  const [demoSites, setDemoSites] = useState<DemoSitesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [saasRes, demoRes] = await Promise.allSettled([
          fetch("/api/saas", { cache: "no-store" }).then((res) => res.json()),
          fetch("/api/saas/demosites", { cache: "no-store" }).then((res) => res.json()),
        ]);

        if (!isMounted) return;
        setSaas(saasRes.status === "fulfilled" ? saasRes.value : null);
        setDemoSites(demoRes.status === "fulfilled" ? demoRes.value : null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const demoSummary = demoSites?.summary || {};
  const apps = saas?.apps || [];
  const chatGeniusApps = apps.filter((app) => app.status !== "archived");
  const activeSubscriptions = apps.reduce((sum, app) => sum + Number(app.active_subscriptions || 0), 0);
  const totalMrr = Number(saas?.totals?.totalMRR || 0);
  const totalRevenue = Number(saas?.totals?.totalRevenue || 0);
  const demoMrr = Number(demoSummary.activeMrr || 0);
  const demoSetup = Number(demoSummary.bookedSetupRevenue || 0);
  const demoNetMrr = Number(demoSummary.netMrr || 0);
  const demoArr = Number(demoSummary.arr || 0);

  const bestSignal = useMemo(() => {
    if (demoMrr > 0) return "DemoSites bygger forutsigbar månedlig inntekt.";
    if (demoSetup > 0) return "DemoSites har registrert oppstartsinntekter.";
    return "Klar for første DemoSites-bestilling og MRR-sporing.";
  }, [demoMrr, demoSetup]);

  return (
    <Card className="border-violet-500/30 bg-gradient-to-r from-violet-500/10 via-slate-900/60 to-cyan-500/10">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/20 text-violet-200">
              <Rocket size={22} />
            </div>
            <div>
              <CardTitle className="text-lg text-white">SaaS & abonnement — lukket backend i RealtyFlow</CardTitle>
              <p className="text-xs text-slate-400">
                RealtyFlow er admin, CRM, økonomi og endringer. Offentlige kunder skal til ChatGenius-landingssider.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <Link href="/saas">Åpne SaaS</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/demosites">DemoSites CRM</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href="https://chatgenius.pro/demosites/" target="_blank" rel="noopener noreferrer">
                Offentlig landingsside <ExternalLink className="ml-2" size={14} />
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="animate-spin" size={16} /> Henter SaaS- og abonnementsdata ...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
              <div className="rounded-xl bg-slate-950/40 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">SaaS apps</p>
                <p className="text-2xl font-bold text-white">{Number(saas?.totals?.totalApps || chatGeniusApps.length)}</p>
              </div>
              <div className="rounded-xl bg-slate-950/40 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Aktive abonnement</p>
                <p className="text-2xl font-bold text-cyan-300">{activeSubscriptions || Number(demoSummary.activeOrders || 0)}</p>
              </div>
              <div className="rounded-xl bg-slate-950/40 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Total MRR</p>
                <p className="text-2xl font-bold text-emerald-300">{formatNok(totalMrr || demoMrr)}</p>
              </div>
              <div className="rounded-xl bg-slate-950/40 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">ARR</p>
                <p className="text-2xl font-bold text-emerald-300">{formatNok(demoArr || totalMrr * 12)}</p>
              </div>
              <div className="rounded-xl bg-slate-950/40 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Oppstart</p>
                <p className="text-2xl font-bold text-amber-300">{formatNok(demoSetup || totalRevenue)}</p>
              </div>
              <div className="rounded-xl bg-slate-950/40 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Netto MRR</p>
                <p className="text-2xl font-bold text-violet-200">{formatNok(demoNetMrr || demoMrr)}</p>
              </div>
              <div className="rounded-xl bg-slate-950/40 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">DemoSites ordre</p>
                <p className="text-2xl font-bold text-white">{Number(demoSummary.totalOrders || 0)}</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-violet-100">
                  <WalletCards size={16} /> Abonnementstrakt
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  Bestilling og endringer gjøres i RealtyFlow. Kunder ser markedsføring og priser på ChatGenius, men får ikke tilgang til backend.
                </p>
                <p className="mt-2 text-xs text-emerald-200">{bestSignal}</p>
              </div>
              <div className="grid gap-2 rounded-xl border border-slate-700/60 bg-slate-950/30 p-4 md:grid-cols-3">
                {chatGeniusApps.slice(0, 3).map((app) => (
                  <div key={app.id} className="rounded-lg bg-slate-900/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-white">{app.name}</p>
                      <Badge variant="secondary" className="text-[10px]">{app.status || "app"}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">MRR: {formatNok(Number(app.mrr || 0))}</p>
                    <p className="text-xs text-slate-500">Kunder: {Number(app.active_subscriptions || app.active_users_30d || app.total_users || 0)}</p>
                  </div>
                ))}
                {chatGeniusApps.length === 0 && (
                  <p className="text-sm text-slate-400 md:col-span-3">Ingen SaaS-apper er registrert ennå.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
