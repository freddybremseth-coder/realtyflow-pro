"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Inbox, Loader2, MailWarning, Megaphone, RefreshCw, ShieldCheck } from "lucide-react";
import { buildNexusInbox, summarizeNexusInbox, type NexusInboxItem, type NexusInboxSource } from "@/lib/nexus-inbox";
import type { SocialAutopilotRow } from "@/lib/social-autopilot";

type OsPayload = { attention?: Array<{ id: string; severity: "high" | "medium" | "low"; title: string; detail: string; href: string }> };
type ApprovalPayload = { items?: Array<{ id: string; title: string; summary: string | null; ready: boolean; blocker: string | null; ageDays: number; customerName: string; reviewHref: string }> };
type MarketingPayload = { rows?: SocialAutopilotRow[] };
type EmailIdentityPayload = { items?: Array<{
  state: "linked" | "exact_candidate" | "ambiguous" | "unlinked";
  reviewPriority: { priority: "high" | "medium" | "low"; reason: string };
  identityEvidence: { domain?: string | null };
  message: { id: string; subject: string };
}> };
type Filter = "all" | NexusInboxSource;

async function getJson<T>(url: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `${url} feilet (${response.status})`);
    return { data: body as T, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function tone(item: NexusInboxItem) {
  if (item.priority === "critical") return "border-rose-200 bg-rose-50";
  if (item.priority === "high") return "border-amber-200 bg-amber-50";
  if (item.priority === "medium") return "border-sky-200 bg-sky-50";
  return "border-slate-200 bg-white";
}

function sourceLabel(source: NexusInboxSource) {
  if (source === "approval") return "Approval";
  if (source === "marketing") return "Marketing";
  if (source === "email_identity") return "Email identity";
  return "System";
}

export default function NexusInboxPage() {
  const [items, setItems] = useState<NexusInboxItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [os, approvals, marketing, emailIdentity] = await Promise.all([
      getJson<OsPayload>("/api/os/status"),
      getJson<ApprovalPayload>("/api/approvals"),
      getJson<MarketingPayload>("/api/marketing/readiness"),
      getJson<EmailIdentityPayload>("/api/nexus/email-link-health"),
    ]);
    setErrors([os.error, approvals.error, marketing.error, emailIdentity.error].filter((value): value is string => Boolean(value)));
    setItems(buildNexusInbox({
      attention: os.data?.attention ?? [],
      approvals: approvals.data?.items ?? [],
      marketingRows: marketing.data?.rows ?? [],
      emailIdentityReviews: (emailIdentity.data?.items ?? []).map((item) => ({
        id: item.message.id,
        subject: item.message.subject,
        priority: item.reviewPriority.priority,
        reason: item.reviewPriority.reason,
        state: item.state,
        domain: item.identityEvidence.domain ?? null,
      })),
    }));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarizeNexusInbox(items), [items]);
  const visible = useMemo(() => filter === "all" ? items : items.filter((item) => item.source === filter), [filter, items]);
  const tabs: Array<[Filter, string, number]> = [
    ["all", "Alle", summary.total],
    ["approval", "Approvals", summary.approvals],
    ["email_identity", "Email identity", summary.emailIdentity],
    ["marketing", "Marketing", summary.marketing],
    ["system", "System", summary.system],
  ];

  return <main className="mx-auto max-w-[1350px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Inbox size={16} /> Nexus Inbox</div>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Beslutninger som trenger et menneske</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Én read-only triageflate over OS Attention, Approval Queue, Marketing Readiness og høyprioritert Email Link-review. Nexus Inbox flytter ikke godkjenninger, kobler ikke CRM-identiteter og utfører ingen handlinger selv.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</button>
      </div>
    </header>

    {errors.length > 0 && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><div className="flex gap-2"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><b>Én eller flere kilder kunne ikke leses.</b><div className="mt-1 text-rose-800">{errors.join(" · ")}</div></div></div></section>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[["Totalt", summary.total, Inbox], ["Kritisk", summary.critical, AlertTriangle], ["Approvals", summary.approvals, ShieldCheck], ["Email identity", summary.emailIdentity, MailWarning], ["Marketing", summary.marketing, Megaphone]].map(([label, value, Icon]) => {
        const Comp = Icon as typeof Inbox;
        return <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Comp size={19} className="text-cyan-700" /><div className="mt-3 text-3xl font-black text-slate-950">{String(value)}</div><div className="text-sm font-semibold text-slate-500">{String(label)}</div></div>;
      })}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap gap-2">{tabs.map(([id, label, count]) => <button key={id} onClick={() => setFilter(id)} className={`rounded-xl px-4 py-2 text-sm font-black ${filter === id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>{label} <span className="ml-1 opacity-60">{count}</span></button>)}</div>
    </section>

    <section className="space-y-3">
      {visible.map((item) => <Link key={item.id} href={item.href} className={`block rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tone(item)}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><span>{sourceLabel(item.source)}</span><span>·</span><span>{item.priority}</span>{item.blocked && <span className="rounded-full bg-white/70 px-2 py-0.5 text-slate-600">blocked</span>}</div>
            <h2 className="mt-2 text-lg font-black text-slate-950">{item.title}</h2>
            {item.customerName && <div className="mt-1 text-xs font-bold text-slate-500">{item.customerName}</div>}
            <p className="mt-2 text-sm leading-6 text-slate-700">{item.reason}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">{item.actionLabel}<ArrowRight size={14} /></div>
        </div>
      </Link>)}
      {!loading && visible.length === 0 && errors.length === 0 && <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><CheckCircle2 size={20} className="mt-0.5" /><div><div className="font-black">Ingen beslutninger i denne køen</div><div className="mt-1 text-sm text-emerald-800">Det finnes ingen elementer fra de valgte kildene som trenger menneskelig oppmerksomhet nå.</div></div></div>}
    </section>

    <div className="text-xs leading-5 text-slate-500">Email identity-elementer er kun read-only review-signaler. AI-intent kan prioritere en melding, men er aldri koblingsevidens. Snooze, dismiss og direkte execute legges først til når vi har eksplisitt, auditerbar action-state.</div>
  </main>;
}
