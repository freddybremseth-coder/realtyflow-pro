"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clipboard, ExternalLink, FileText, Loader2, Plus, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Source = {
  label: string;
  url: string;
  note?: string;
};

type AdvisorPlaybook = {
  id: string;
  brand_id?: string;
  title: string;
  topic?: string;
  region?: string;
  status?: string;
  confidence?: string;
  summary?: string;
  customer_message?: string;
  internal_notes?: string;
  checklist?: string[];
  sources?: Source[];
  tags?: string[];
  next_review_at?: string;
  synthetic?: boolean;
};

export default function AdvisorPlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<AdvisorPlaybook[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableNotReady, setTableNotReady] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const [emptyDatabase, setEmptyDatabase] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function loadPlaybooks() {
    setLoading(true);
    try {
      const res = await fetch("/api/advisor-playbooks", { cache: "no-store" });
      const data = await res.json();
      setPlaybooks(data.playbooks || []);
      setTableNotReady(Boolean(data.tableNotReady));
      setSynthetic(Boolean(data.synthetic));
      setEmptyDatabase(Boolean(data.emptyDatabase));
    } catch (err) {
      console.error("Could not load advisor playbooks:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlaybooks();
  }, []);

  async function seedPlaybooks() {
    setSaving(true);
    try {
      for (const playbook of playbooks.filter((item) => item.synthetic || item.id.startsWith("seed-"))) {
        await fetch("/api/advisor-playbooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(playbook),
        });
      }
      await loadPlaybooks();
    } finally {
      setSaving(false);
    }
  }

  async function pushTask(playbook: AdvisorPlaybook) {
    await fetch("/api/work-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Rådgivertekst: ${playbook.title}`,
        description: playbook.summary,
        brand_id: playbook.brand_id || "zeneco",
        source_type: "brand",
        source_id: playbook.id,
        assigned_agent: "sales",
        priority: "HIGH",
        ai_score: 82,
        next_action: "Bruk playbooken i kundedialog, men avklar konkrete juridiske spørsmål med lokal advokat/gestor.",
        metadata: { topic: playbook.topic, region: playbook.region },
      }),
    });
  }

  async function copyMessage(playbook: AdvisorPlaybook) {
    const text = playbook.customer_message || "";
    await navigator.clipboard.writeText(text);
    setCopied(playbook.id);
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <FileText className="text-cyan-400" size={28} />
            Rådgiver Playbooks
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Verifiserte rådgivertekster, sjekklister og kilder for tryggere kundedialog.
          </p>
        </div>
        {synthetic && (
          <Button onClick={seedPlaybooks} disabled={saving || tableNotReady}>
            {saving ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Plus className="mr-2" size={16} />}
            Lagre seed-playbooks
          </Button>
        )}
      </div>

      {tableNotReady && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Kjør migrasjonen `20260505130000_advisor_playbooks.sql` for å lagre playbooks permanent.
        </div>
      )}

      {emptyDatabase && !tableNotReady && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
          Tabellen er klar, men tom. Klikk `Lagre seed-playbooks` for å lagre første verifiserte rådgivertekst i Supabase.
        </div>
      )}

      <Card className="border-cyan-500/20 bg-cyan-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-cyan-300" size={20} />
            <div>
              <p className="text-sm font-medium text-white">Juridisk trygghetslinje</p>
              <p className="mt-1 text-sm text-slate-300">
                Playbooks er salgs- og rådgiverstøtte, ikke juridisk rådgivning. Bruk dem til å forklare hovedbildet,
                og send konkrete saker videre til advokat/gestor når kjøper skal beslutte utleie, kontraktstype eller lisens.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      ) : (
        <div className="space-y-4">
          {playbooks.map((playbook) => (
            <Card key={playbook.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{playbook.title}</CardTitle>
                      <Badge variant={playbook.confidence === "verified" ? "success" : "warning"} className="text-[10px]">
                        {playbook.confidence || "needs_review"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{playbook.region || "global"}</Badge>
                    </div>
                    {playbook.summary && <p className="mt-2 text-sm text-slate-400">{playbook.summary}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => copyMessage(playbook)}>
                      <Clipboard className="mr-2" size={14} />
                      {copied === playbook.id ? "Kopiert" : "Kopier kundetekst"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => pushTask(playbook)}>
                      Send til HUB
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {playbook.customer_message && (
                  <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Kundetekst</p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{playbook.customer_message}</p>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Sjekkliste</p>
                    <ul className="space-y-2">
                      {(playbook.checklist || []).map((item) => (
                        <li key={item} className="flex gap-2 text-sm text-slate-300">
                          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={15} />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Kilder</p>
                    <div className="space-y-2">
                      {(playbook.sources || []).map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-lg border border-slate-700/40 bg-slate-900/60 p-3 text-sm hover:border-cyan-500/30"
                        >
                          <span className="flex items-center gap-2 font-medium text-slate-200">
                            {source.label}
                            <ExternalLink size={13} />
                          </span>
                          {source.note && <span className="mt-1 block text-xs text-slate-500">{source.note}</span>}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                {playbook.internal_notes && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-300">Internt notat</p>
                    <p className="text-sm text-amber-100/90">{playbook.internal_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
