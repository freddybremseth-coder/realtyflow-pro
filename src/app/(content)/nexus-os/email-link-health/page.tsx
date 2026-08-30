"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Link2, Loader2, Mail, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { EmailLinkApprovalButton } from "@/components/nexus/email-link-approval-button";

type IdentityEvidenceType = "crm_contact" | "external_domain" | "public_mailbox" | "outbound_unmatched" | "conflict" | "system_notification" | "unknown";
type ReviewPriority = "high" | "medium" | "low";

interface HealthItem {
  state: "linked" | "exact_candidate" | "ambiguous" | "unlinked";
  confidence: "HIGH" | "NONE";
  reason: string;
  identityEvidence: { type: IdentityEvidenceType; domain?: string | null; reason: string };
  reviewPriority: { priority: ReviewPriority; reason: string };
  message: { id: string; brandId?: string | null; direction?: string | null; subject: string; aiIntent?: string | null; occurredAt?: string | null };
  candidates: Array<{ id: string; name: string; email?: string | null; brandId?: string | null }>;
}

interface HealthResponse {
  summary: {
    messages: number;
    totalMessages: number;
    excludedNonCrm: number;
    excludedSystemNotifications: number;
    excludedOwnAddresses: number;
    linked: number;
    exactCandidates: number;
    ambiguous: number;
    unlinked: number;
    safeCoveragePercent: number;
    reviewPriorityTotal: number;
    reviewPriorityHigh: number;
    reviewPriorityMedium: number;
    reviewPriorityLow: number;
  };
  items: HealthItem[];
}

const STATE_LABELS: Record<HealthItem["state"], string> = {
  linked: "Allerede koblet",
  exact_candidate: "Sikker kandidat",
  ambiguous: "Tvetydig",
  unlinked: "Ikke koblet",
};

const STATE_CLASSES: Record<HealthItem["state"], string> = {
  linked: "bg-emerald-100 text-emerald-800",
  exact_candidate: "bg-cyan-100 text-cyan-800",
  ambiguous: "bg-amber-100 text-amber-900",
  unlinked: "bg-slate-200 text-slate-700",
};

const IDENTITY_LABELS: Record<IdentityEvidenceType, string> = {
  crm_contact: "CRM-identitet",
  external_domain: "Eksternt domene",
  public_mailbox: "Offentlig e-postkonto",
  outbound_unmatched: "Outbound uten CRM-match",
  conflict: "Identitetskonflikt",
  system_notification: "Systemvarsel",
  unknown: "Ukjent motpart",
};

const IDENTITY_CLASSES: Record<IdentityEvidenceType, string> = {
  crm_contact: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  external_domain: "bg-violet-50 text-violet-800 ring-violet-200",
  public_mailbox: "bg-blue-50 text-blue-800 ring-blue-200",
  outbound_unmatched: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  conflict: "bg-amber-50 text-amber-900 ring-amber-200",
  system_notification: "bg-slate-100 text-slate-700 ring-slate-200",
  unknown: "bg-slate-100 text-slate-700 ring-slate-200",
};

const PRIORITY_LABELS: Record<ReviewPriority, string> = {
  high: "Høy review",
  medium: "Medium review",
  low: "Lav review",
};

const PRIORITY_CLASSES: Record<ReviewPriority, string> = {
  high: "bg-rose-100 text-rose-900 ring-rose-200",
  medium: "bg-amber-100 text-amber-900 ring-amber-200",
  low: "bg-slate-100 text-slate-700 ring-slate-200",
};

const PRIORITY_ORDER: Record<ReviewPriority, number> = { high: 0, medium: 1, low: 2 };

function dateLabel(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "Ukjent dato" : new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function EmailLinkHealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | HealthItem["state"]>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | ReviewPriority>("all");
  const [search, setSearch] = useState("");
  const [targetMessageId, setTargetMessageId] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/nexus/email-link-health", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Email Link Health.");
      setData(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente Email Link Health.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTargetMessageId(params.get("messageId")?.trim() || "");
    void load();
  }, []);

  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.items || [])
      .filter((item) => {
        if (targetMessageId && item.message.id !== targetMessageId) return false;
        if (filter !== "all" && item.state !== filter) return false;
        if (priorityFilter !== "all" && item.reviewPriority.priority !== priorityFilter) return false;
        if (!query) return true;
        return [item.message.id, item.message.subject, item.message.brandId, item.message.aiIntent, item.reason, item.identityEvidence.domain, item.identityEvidence.reason, item.reviewPriority.reason, IDENTITY_LABELS[item.identityEvidence.type], PRIORITY_LABELS[item.reviewPriority.priority], ...item.candidates.flatMap((candidate) => [candidate.name, candidate.email, candidate.brandId])]
          .filter(Boolean).join(" ").toLowerCase().includes(query);
      })
      .sort((a, b) => PRIORITY_ORDER[a.reviewPriority.priority] - PRIORITY_ORDER[b.reviewPriority.priority]);
  }, [data, filter, priorityFilter, search, targetMessageId]);

  return <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Link2 className="h-4 w-4" /> Email Link Health</div>
          <h2 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Koble inbox til riktig kunde uten å gjette</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Bare eksisterende CRM-ID eller eksakt e-postadresse kan bli en sikker kandidat. Review-prioritet hjelper deg å se hva som bør vurderes først, men brukes aldri som koblingsevidens.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Oppdater</button>
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <div className="flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4" /> Kontrollert kobling</div>
        <p className="mt-1">«Godkjenn kobling» vises bare for én entydig eksakt kandidat. AI-intent som `inquiry` og `follow_up` kan løfte review-prioriteten, men kan aldri alene koble en melding til CRM.</p>
      </div>

      {targetMessageId ? <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 lg:flex-row lg:items-center lg:justify-between">
        <div><span className="font-black">Fokusert review:</span> viser bare meldingen valgt fra Nexus Inbox.</div>
        <div className="flex flex-wrap gap-2">
          <Link href="/nexus-os/inbox" className="inline-flex w-fit rounded-xl bg-violet-800 px-3 py-2 text-xs font-black text-white hover:bg-violet-900">Tilbake til Nexus Inbox</Link>
          <Link href="/nexus-os/email-link-health" className="inline-flex w-fit rounded-xl border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-800 hover:bg-violet-100">Vis hele Email Link Health</Link>
        </div>
      </div> : null}

      {data?.summary.excludedNonCrm ? <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950">
        Nexus analyserer {data.summary.messages} CRM-relevante meldinger av {data.summary.totalMessages} totalt. {data.summary.excludedSystemNotifications} kjente systemvarsler og {data.summary.excludedOwnAddresses} meldinger fra aktive egne brand-adresser er ekskludert fra dekningstallet, men rådataene beholdes.
      </div> : null}

      {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div> : null}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5 xl:grid-cols-9">
        {[
          ["Rå meldinger", data?.summary.totalMessages ?? 0],
          ["CRM-relevante", data?.summary.messages ?? 0],
          ["Systemvarsler", data?.summary.excludedSystemNotifications ?? 0],
          ["Egne adresser", data?.summary.excludedOwnAddresses ?? 0],
          ["Koblet", data?.summary.linked ?? 0],
          ["Sikre kandidater", data?.summary.exactCandidates ?? 0],
          ["Tvetydige", data?.summary.ambiguous ?? 0],
          ["Ikke koblet", data?.summary.unlinked ?? 0],
          ["Sikker dekning", `${data?.summary.safeCoveragePercent ?? 0}%`],
        ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-2xl font-black text-slate-950">{value}</div><div className="mt-1 text-xs font-bold text-slate-500">{label}</div></div>)}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Review totalt", data?.summary.reviewPriorityTotal ?? 0, "border-slate-200 bg-white"],
          ["Høy review", data?.summary.reviewPriorityHigh ?? 0, "border-rose-200 bg-rose-50"],
          ["Medium review", data?.summary.reviewPriorityMedium ?? 0, "border-amber-200 bg-amber-50"],
          ["Lav review", data?.summary.reviewPriorityLow ?? 0, "border-slate-200 bg-slate-50"],
        ].map(([label, value, className]) => <div key={String(label)} className={`rounded-2xl border p-4 ${className}`}><div className="text-2xl font-black text-slate-950">{value}</div><div className="mt-1 text-xs font-bold text-slate-600">{label}</div></div>)}
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søk emne, brand, intent, domene, prioritet eller kontakt…" className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-cyan-500" /></div>
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1">{([
            ["all", "Alle status"], ["linked", "Koblet"], ["exact_candidate", "Sikker kandidat"], ["ambiguous", "Tvetydig"], ["unlinked", "Ikke koblet"],
          ] as const).map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-black ${filter === key ? "bg-cyan-700 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{label}</button>)}</div>
          <div className="flex gap-2 overflow-x-auto pb-1">{([
            ["all", "Alle prioriteter"], ["high", "Høy"], ["medium", "Medium"], ["low", "Lav"],
          ] as const).map(([key, label]) => <button key={key} onClick={() => setPriorityFilter(key)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-black ${priorityFilter === key ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{label}</button>)}</div>
        </div>
      </div>
    </section>

    <section className="mt-5 space-y-3">
      {loading && !data ? <div className="flex items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white p-10 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Analyserer inbox …</div> : null}
      {!loading && items.length === 0 ? <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500">{targetMessageId ? "Den valgte meldingen finnes ikke lenger i den CRM-relevante review-køen." : "Ingen meldinger matcher dette filteret."}</div> : null}
      {items.map((item) => <article id={`message-${item.message.id}`} key={item.message.id} className={`rounded-3xl border bg-white p-5 shadow-sm sm:p-6 ${targetMessageId === item.message.id ? "border-violet-300 ring-2 ring-violet-100" : "border-slate-200"}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${PRIORITY_CLASSES[item.reviewPriority.priority]}`}>{PRIORITY_LABELS[item.reviewPriority.priority]}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${STATE_CLASSES[item.state]}`}>{STATE_LABELS[item.state]}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${IDENTITY_CLASSES[item.identityEvidence.type]}`}>{IDENTITY_LABELS[item.identityEvidence.type]}{item.identityEvidence.domain ? ` · ${item.identityEvidence.domain}` : ""}</span>
              <span className="text-xs font-bold text-slate-500">{item.message.brandId || "brand ukjent"}</span><span className="text-xs text-slate-400">{item.message.direction || "retning ukjent"}</span>
            </div>
            <h3 className="mt-3 text-base font-black text-slate-950 sm:text-lg">{item.message.subject}</h3>
            <p className="mt-1 text-xs text-slate-500">{dateLabel(item.message.occurredAt)}{item.message.aiIntent ? ` · intent: ${item.message.aiIntent}` : ""}</p>
            <p className="mt-3 text-sm text-slate-700">{item.reason}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">Review-prioritet: {item.reviewPriority.reason}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Identitetsevidens: {item.identityEvidence.reason}</p>
          </div>
          <Mail className="h-5 w-5 shrink-0 text-slate-400" />
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">CRM-kandidat</div>
          {item.candidates.length ? <div className="mt-2 space-y-2">{item.candidates.map((candidate) => <div key={candidate.id} className="flex flex-col gap-3 rounded-xl bg-white p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-black text-slate-900">{candidate.name}</div><div className="text-xs text-slate-500">{candidate.email || "ingen e-post"} · {candidate.brandId || "brand ukjent"}</div></div><div className="flex flex-wrap items-center gap-2"><Link href={`/customers?contactId=${encodeURIComponent(candidate.id)}`} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-cyan-700 hover:bg-slate-50">Åpne Customer 360</Link>{item.state === "exact_candidate" && item.candidates.length === 1 ? <EmailLinkApprovalButton messageId={item.message.id} contactId={candidate.id} contactName={candidate.name} onApproved={() => void load()} /> : null}</div></div>)}</div> : <div className="mt-2 flex items-center gap-2 text-sm text-slate-500"><AlertTriangle className="h-4 w-4" />Ingen sikker CRM-kandidat.</div>}
        </div>
      </article>)}
    </section>
  </main>;
}