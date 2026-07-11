"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FileClock,
  FolderLock,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STATUS_LABELS: Record<string, string> = {
  MISSING: "Mangler",
  REQUESTED: "Forespurt",
  RECEIVED: "Mottatt",
  REVIEWED: "Gjennomgått",
  NOT_APPLICABLE: "Ikke relevant",
};
const ROLE_LABELS: Record<string, string> = {
  BUYER: "Kjøper",
  SELLER: "Selger",
  LAWYER: "Advokat",
  ADVISOR: "Rådgiver",
  BANK: "Bank",
  NOTARY: "Notarius",
  OTHER: "Annen",
};
const PHASE_LABELS: Record<string, string> = {
  RESERVATION: "Reservasjon",
  IDENTITY: "Identitet",
  LEGAL: "Juridisk",
  FINANCE: "Finans",
  SIGNING: "Signering",
  HANDOVER: "Overtakelse",
};

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value || 0);
}

function dateLabel(value?: string | null) {
  if (!value) return "Ikke satt";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value));
}

function riskClass(risk: string) {
  return risk === "HIGH" ? "bg-red-500/15 text-red-300" : risk === "MEDIUM" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300";
}

function statusClass(status: string) {
  if (status === "REVIEWED" || status === "NOT_APPLICABLE") return "bg-emerald-500/15 text-emerald-300";
  if (status === "RECEIVED") return "bg-cyan-500/15 text-cyan-300";
  if (status === "REQUESTED") return "bg-amber-500/15 text-amber-300";
  return "bg-red-500/15 text-red-300";
}

export default function ClosingPackPage() {
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("all");
  const [phase, setPhase] = useState("all");
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/revenue/closing-pack", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke hente closing-pakker");
      setPayload(data);
      setSelectedId((current) => current || data.deals?.[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ukjent feil");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deals = useMemo(() => {
    const rows = payload?.deals || [];
    if (filter === "risk") return rows.filter((deal: any) => deal.risk === "HIGH");
    if (filter === "overdue") return rows.filter((deal: any) => deal.overdueCount > 0);
    if (filter === "complete") return rows.filter((deal: any) => deal.completionPercent === 100);
    if (filter === "negotiation") return rows.filter((deal: any) => deal.stage === "NEGOTIATION");
    if (filter === "won") return rows.filter((deal: any) => deal.stage === "WON");
    return rows;
  }, [payload, filter]);

  const selected = (payload?.deals || []).find((deal: any) => deal.id === selectedId) || deals[0] || null;
  const visibleDocuments = (selected?.documents || []).filter((document: any) => phase === "all" || document.phase === phase);

  useEffect(() => {
    if (!selected) return;
    const next: Record<string, any> = {};
    for (const document of selected.documents) {
      next[document.id] = {
        status: document.status,
        responsibleRole: document.responsibleRole,
        dueDate: document.dueDate || "",
        documentUrl: document.documentUrl || "",
        note: document.note || "",
      };
    }
    setEdits(next);
  }, [selected?.id, selected?.documents]);

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch("/api/revenue/closing-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Handling mislyktes");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ukjent feil");
    } finally {
      setBusy("");
    }
  }

  if (loading && !payload) {
    return <div className="flex min-h-[50vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Laster closing-pakker…</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white"><FolderLock className="h-6 w-6 text-cyan-400" /> Deal Documents & Closing Pack</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">Intern kompletthetskontroll for dokumenter og frister. RealtyFlow utfører ingen juridisk vurdering og lagrer bare dokumentstatus og eksterne HTTPS-lenker.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Oppdater</Button>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Handler", payload?.summary?.totalDeals || 0, FileCheck2],
          ["Høy risiko", payload?.summary?.highRisk || 0, ShieldAlert],
          ["Forfalte dokumenter", payload?.summary?.overdueDocuments || 0, FileClock],
          ["Mangler", payload?.summary?.missingDocuments || 0, AlertTriangle],
          ["Komplette pakker", payload?.summary?.fullyReviewed || 0, CheckCircle2],
          ["Handelsverdi", money(payload?.summary?.pipelineValue || 0), FolderLock],
        ].map(([label, value, Icon]: any) => (
          <Card key={label} className="border-slate-800 bg-slate-950/60"><CardContent className="p-4"><Icon className="mb-2 h-4 w-4 text-cyan-400" /><div className="text-xl font-semibold text-white">{value}</div><div className="text-xs text-slate-500">{label}</div></CardContent></Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["all", "Alle"], ["risk", "Høy risiko"], ["overdue", "Forfalt"], ["negotiation", "Forhandling"], ["won", "Vunnet"], ["complete", "100 % komplett"],
        ].map(([id, label]) => <Button key={id} size="sm" variant={filter === id ? "default" : "outline"} onClick={() => setFilter(id)}>{label}</Button>)}
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit border-slate-800 bg-slate-950/60">
          <CardHeader><CardTitle className="text-base text-white">Aktive handler</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {deals.length === 0 && <p className="text-sm text-slate-500">Ingen handler i dette filteret.</p>}
            {deals.map((deal: any) => (
              <button key={deal.id} onClick={() => setSelectedId(deal.id)} className={`w-full rounded-lg border p-3 text-left transition ${selected?.id === deal.id ? "border-cyan-500/60 bg-cyan-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-700"}`}>
                <div className="flex items-start justify-between gap-2"><div className="font-medium text-white">{deal.name}</div><Badge className={riskClass(deal.risk)}>{deal.risk}</Badge></div>
                <div className="mt-1 text-xs text-slate-400">{deal.stage === "WON" ? "Vunnet / overtakelse" : "Forhandling / reservasjon"} · {money(deal.value)}</div>
                <div className="mt-3 h-1.5 overflow-hidden rounded bg-slate-800"><div className="h-full bg-cyan-400" style={{ width: `${deal.completionPercent}%` }} /></div>
                <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{deal.completionPercent}% komplett</span><span>{deal.overdueCount} forfalt</span></div>
              </button>
            ))}
          </CardContent>
        </Card>

        {selected ? (
          <div className="space-y-4">
            <Card className="border-slate-800 bg-slate-950/60">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2"><h2 className="text-xl font-semibold text-white">{selected.name}</h2><Badge className={riskClass(selected.risk)}>{selected.risk}</Badge></div>
                    <p className="mt-1 text-sm text-slate-400">{selected.propertyInterest || "Bolig ikke registrert"} · {money(selected.value)} · Neste oppfølging: {dateLabel(selected.nextFollowupAt)}</p>
                    <p className="mt-2 text-xs text-slate-500">Sist intern pack review: {dateLabel(selected.lastPackReviewAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline"><Link href={selected.href}>Customer 360 <ExternalLink className="ml-2 h-4 w-4" /></Link></Button>
                    <Button variant="outline" disabled={busy === "review"} onClick={() => {
                      if (!window.confirm("Registrere at hele pakken er gjennomgått internt? Dette er ikke juridisk godkjenning.")) return;
                      post({ action: "REVIEW_PACK", contactId: selected.id }, "review");
                    }}>{busy === "review" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />} Logg pack review</Button>
                  </div>
                </div>
                {selected.criticalBlockers.length > 0 && <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100"><strong>Kritiske mangler:</strong> {selected.criticalBlockers.join(", ")}</div>}
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              {["all", "RESERVATION", "IDENTITY", "LEGAL", "FINANCE", "SIGNING", "HANDOVER"].map((id) => <Button key={id} size="sm" variant={phase === id ? "default" : "outline"} onClick={() => setPhase(id)}>{id === "all" ? "Alle faser" : PHASE_LABELS[id]}</Button>)}
            </div>

            <div className="space-y-3">
              {visibleDocuments.map((document: any) => {
                const edit = edits[document.id] || {};
                const key = `save:${document.id}`;
                return (
                  <Card key={document.id} className={`border-slate-800 bg-slate-950/60 ${document.overdue ? "ring-1 ring-red-500/40" : ""}`}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div><CardTitle className="text-base text-white">{document.label}</CardTitle><p className="mt-1 text-sm text-slate-400">{document.description}</p></div>
                        <div className="flex gap-2"><Badge className={statusClass(document.status)}>{STATUS_LABELS[document.status]}</Badge>{document.required && <Badge variant="outline">Obligatorisk</Badge>}{document.overdue && <Badge className="bg-red-500/15 text-red-300">Forfalt</Badge>}</div>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
                      <label className="text-xs text-slate-400">Status<select className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white" value={edit.status || "MISSING"} onChange={(event) => setEdits((current) => ({ ...current, [document.id]: { ...edit, status: event.target.value } }))}>{Object.entries(STATUS_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                      <label className="text-xs text-slate-400">Ansvarlig<select className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white" value={edit.responsibleRole || document.defaultResponsible} onChange={(event) => setEdits((current) => ({ ...current, [document.id]: { ...edit, responsibleRole: event.target.value } }))}>{Object.entries(ROLE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                      <label className="text-xs text-slate-400">Frist<Input className="mt-1" type="date" value={edit.dueDate || ""} onChange={(event) => setEdits((current) => ({ ...current, [document.id]: { ...edit, dueDate: event.target.value } }))} /></label>
                      <label className="text-xs text-slate-400 xl:col-span-2">Sikker dokumentlenke (HTTPS)<div className="mt-1 flex gap-2"><Input value={edit.documentUrl || ""} placeholder="https://drive.google.com/…" onChange={(event) => setEdits((current) => ({ ...current, [document.id]: { ...edit, documentUrl: event.target.value } }))} />{document.documentUrl && <Button asChild size="icon" variant="outline"><a href={document.documentUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>}</div></label>
                      <label className="text-xs text-slate-400 lg:col-span-2 xl:col-span-4">Internt notat<Input className="mt-1" value={edit.note || ""} maxLength={1000} placeholder="Ikke legg inn passnummer eller sensitive detaljer her" onChange={(event) => setEdits((current) => ({ ...current, [document.id]: { ...edit, note: event.target.value } }))} /></label>
                      <div className="flex items-end"><Button className="w-full" disabled={busy === key} onClick={() => post({ action: "UPDATE_DOCUMENT", contactId: selected.id, documentId: document.id, ...edit }, key)}>{busy === key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Lagre status</Button></div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : <Card className="border-slate-800 bg-slate-950/60"><CardContent className="p-8 text-center text-slate-500">Ingen aktiv closing-pakke.</CardContent></Card>}
      </div>
    </div>
  );
}
