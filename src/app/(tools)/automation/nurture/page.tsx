"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Send, FlaskConical, AlertCircle, Users, ShieldAlert, RefreshCw, Loader2, Play } from "lucide-react";

interface NurtureEvent {
  id: string;
  brand_id: string;
  sequence_id: string;
  step_id: string;
  status: string;
  subject: string;
  dry_run: boolean;
  error?: string | null;
  created_at: string;
  sent_at?: string | null;
  contacts?: { name?: string; email?: string } | null;
}

interface Overview {
  counts: { sent: number; dryRun: number; failed: number; enrolled: number; pausedSpam: number };
  events: NurtureEvent[];
}

function formatDate(value?: string | null) {
  if (!value) return "–";
  return new Date(value).toLocaleString("nb-NO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    sent: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    dry_run: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    failed: "bg-red-500/15 text-red-400 border-red-500/30",
    skipped: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    queued: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  };
  const label: Record<string, string> = {
    sent: "Sendt",
    dry_run: "Dry-run",
    failed: "Feilet",
    skipped: "Hoppet over",
    queued: "I kø",
  };
  return <Badge className={`border ${map[status] || map.skipped}`}>{label[status] || status}</Badge>;
}

export default function NurtureOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/nurture/overview", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runDryRun = async (brand?: string) => {
    setRunning(brand || "alle");
    setMessage(null);
    try {
      const url = `/api/nurture/run?dry=1${brand ? `&brand=${brand}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) {
        setMessage(j.error || "Kunne ikke kjøre dry-run.");
        return;
      }
      if (j.skipped) {
        const why = j.reason ? ` (${j.reason})` : "";
        setMessage(
          `Hoppet over${why}. Nødbryteren CRON_SAFE_MODE er på – sett env-variabelen ` +
            `CRON_SAFE_MODE_ALLOW_PATHS=/api/cron/lead-nurture i Vercel for å kjøre denne cronen.`,
        );
      } else {
        setMessage(
          `Dry-run ${brand || "alle"}: skannet ${j.scanned}, kvalifiserte ${j.eligible}, planlagt ${
            (j.planned || []).length
          }, flagget spam ${j.flaggedSpam}.`
        );
      }
      await load();
    } catch {
      setMessage("Kunne ikke kjøre dry-run.");
    } finally {
      setRunning(null);
    }
  };

  const c = data?.counts;
  const cards = [
    { label: "Sendt", value: c?.sent ?? 0, icon: Send, color: "text-emerald-400" },
    { label: "Planlagt (dry-run)", value: c?.dryRun ?? 0, icon: FlaskConical, color: "text-cyan-400" },
    { label: "Feilet", value: c?.failed ?? 0, icon: AlertCircle, color: "text-red-400" },
    { label: "Innmeldte leads", value: c?.enrolled ?? 0, icon: Users, color: "text-violet-400" },
    { label: "Pauset (spam)", value: c?.pausedSpam ?? 0, icon: ShieldAlert, color: "text-amber-400" },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Mail className="text-cyan-400" /> Lead Nurture
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Automatisk oppfølging av leads. Velkomst (zeneco) + reaktivering av sovende (soleada).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Oppdater
          </Button>
          <Button onClick={() => runDryRun("soleada")} disabled={running !== null}>
            {running === "soleada" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Dry-run Soleada
          </Button>
          <Button variant="outline" onClick={() => runDryRun()} disabled={running !== null}>
            {running === "alle" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Dry-run alle
          </Button>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
          {message}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">{card.label}</span>
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <div className="text-3xl font-semibold mt-2">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Siste hendelser</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="text-slate-400 text-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Laster…
            </div>
          ) : !data?.events.length ? (
            <div className="text-slate-400 text-sm">
              Ingen hendelser ennå. Kjør en dry-run for å se hvilke leads som ville blitt fulgt opp.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-400 border-b border-white/10">
                  <tr>
                    <th className="text-left font-medium py-2 pr-4">Dato</th>
                    <th className="text-left font-medium py-2 pr-4">Lead</th>
                    <th className="text-left font-medium py-2 pr-4">Merke</th>
                    <th className="text-left font-medium py-2 pr-4">Steg</th>
                    <th className="text-left font-medium py-2 pr-4">Emne</th>
                    <th className="text-left font-medium py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e) => (
                    <tr key={e.id} className="border-b border-white/5">
                      <td className="py-2 pr-4 text-slate-400 whitespace-nowrap">{formatDate(e.created_at)}</td>
                      <td className="py-2 pr-4">
                        <div className="font-medium">{e.contacts?.name || "(ukjent)"}</div>
                        <div className="text-slate-500 text-xs">{e.contacts?.email}</div>
                      </td>
                      <td className="py-2 pr-4 text-slate-300">{e.brand_id}</td>
                      <td className="py-2 pr-4 text-slate-300">{e.step_id}</td>
                      <td className="py-2 pr-4 text-slate-300 max-w-[260px] truncate">{e.subject}</td>
                      <td className="py-2">
                        {statusBadge(e.status)}
                        {e.error && <div className="text-red-400 text-xs mt-1 max-w-[200px] truncate">{e.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
