"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Play, Clock, CheckCircle, AlertCircle, Loader2, RefreshCw, Database } from "lucide-react";

interface AutomationRule {
  id: string;
  name: string;
  trigger_type: string;
  conditions?: Record<string, unknown>;
  actions?: Array<Record<string, unknown>>;
  status: "active" | "paused" | "disabled";
  last_run_at?: string | null;
  next_run_at?: string | null;
  failure_count?: number | null;
  synthetic?: boolean;
}

interface AutomationRun {
  id: string;
  status: "running" | "success" | "error" | "cancelled";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string | null;
  started_at?: string;
  finished_at?: string | null;
}

interface AutomationLog {
  id: string;
  action: string;
  agent_name?: string | null;
  status: "success" | "error";
  details?: Record<string, unknown>;
  created_at: string;
}

function formatDate(value?: string | null) {
  if (!value) return "Aldri";
  return new Date(value).toLocaleString("nb-NO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionSummary(rule: AutomationRule) {
  const first = rule.actions?.[0];
  if (!first) return "Ingen handling definert";
  if (first.type === "run_endpoint") return String(first.path || "Kjør endpoint");
  if (first.type === "push_top_publishing_recommendations") return "Send beste Publishing-anbefalinger til HUB";
  return String(first.type || "Handling");
}

export default function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [synthetic, setSynthetic] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function loadAutomations() {
    setLoading(true);
    try {
      const res = await fetch("/api/automation/rules", { cache: "no-store" });
      const data = await res.json();
      setRules(data.rules || []);
      setRuns(data.runs || []);
      setLogs(data.logs || []);
      setSynthetic(Boolean(data.synthetic));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Kunne ikke hente automasjoner.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAutomations();
  }, []);

  async function seedRules() {
    setStatus(null);
    const res = await fetch("/api/automation/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed" }),
    });
    const data = await res.json().catch(() => ({}));
    setStatus(res.ok ? `${data.seeded || 0} automasjoner lagret i Supabase.` : data.error || "Kunne ikke lagre automasjoner.");
    await loadAutomations();
  }

  async function runRule(rule: AutomationRule) {
    setRunningId(rule.id);
    setStatus(null);
    const res = await fetch("/api/automation/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run", id: rule.id }),
    });
    const data = await res.json().catch(() => ({}));
    setStatus(res.ok ? `${rule.name} kjørt.` : data.error || `${rule.name} feilet.`);
    setRunningId(null);
    await loadAutomations();
  }

  const stats = useMemo(() => {
    const active = rules.filter((rule) => rule.status === "active").length;
    const successes = [...runs, ...logs].filter((item) => item.status === "success").length;
    const errors = [...runs, ...logs].filter((item) => item.status === "error").length;
    return { active, successes, errors };
  }, [rules, runs, logs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Zap className="text-amber-400" size={28} />
            Automasjon
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Ekte jobb-motor for Victoria: publisering, engagement, vekstanalyse og Publishing Hub.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadAutomations}>
            <RefreshCw size={16} className="mr-2" />
            Oppdater
          </Button>
          {synthetic && (
            <Button onClick={seedRules}>
              <Database size={16} className="mr-2" />
              Lagre standard-automasjoner
            </Button>
          )}
        </div>
      </div>

      {status && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {status}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Aktive regler", value: stats.active, icon: Play, color: "text-emerald-400" },
          { label: "Vellykkede kjøringer", value: stats.successes, icon: CheckCircle, color: "text-emerald-400" },
          { label: "Feil som må sjekkes", value: stats.errors, icon: AlertCircle, color: "text-red-400" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon size={24} className={stat.color} />
              <div>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap size={18} />
            Automasjonsregler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="flex flex-col gap-3 rounded-lg bg-slate-800/50 p-4 md:flex-row md:items-center">
              <div className="flex-1 min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-slate-200">{rule.name}</p>
                  <Badge variant={rule.status === "active" ? "success" : "secondary"} className="text-[10px]">
                    {rule.status === "active" ? "Aktiv" : "Pauset"}
                  </Badge>
                  {rule.synthetic && <Badge variant="outline" className="text-[10px]">Seed</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>Trigger: {rule.trigger_type}</span>
                  <span>Handling: {actionSummary(rule)}</span>
                  <span>Sist: {formatDate(rule.last_run_at)}</span>
                  {Number(rule.failure_count || 0) > 0 && <span className="text-red-400">Feil: {rule.failure_count}</span>}
                </div>
              </div>
              <Button size="sm" onClick={() => runRule(rule)} disabled={runningId === rule.id}>
                {runningId === rule.id ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Play size={14} className="mr-2" />}
                Kjør nå
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock size={18} />
            Kjøringslogg
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...runs, ...logs].slice(0, 20).map((item, index) => {
            const ok = item.status === "success";
            const title = "action" in item ? item.action : String(item.input?.name || "Automasjon");
            const payload = "details" in item ? item.details : (item as AutomationRun).output;
            const detail = "error" in item && item.error ? item.error : JSON.stringify(payload || {}).slice(0, 160);
            const time = "created_at" in item ? item.created_at : item.finished_at || item.started_at;
            return (
              <div key={`${"id" in item ? item.id : index}-${index}`} className="flex items-center gap-4 rounded-lg bg-slate-800/50 p-3">
                {ok ? (
                  <CheckCircle size={18} className="shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle size={18} className="shrink-0 text-red-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200">{title}</p>
                  <p className="truncate text-xs text-slate-500">{detail}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-500">{formatDate(time)}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
