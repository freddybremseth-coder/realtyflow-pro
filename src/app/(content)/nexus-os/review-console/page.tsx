"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, CircleHelp, FilePenLine, Loader2, RefreshCw, ShieldCheck, ThumbsDown, ThumbsUp } from "lucide-react";

type ReviewKind = "final_send" | "shortlist" | "buyer_criteria" | "buyer_intake" | "no_match";
type ReviewAction = "approve_send" | "reject" | "edit" | "ask_customer_clarification";
type ReviewItem = {
  id: string;
  kind: ReviewKind;
  title: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  updatedAt: string | null;
  brandId: string;
  recommendation: string;
  uncertainty: string[];
  actions: ReviewAction[];
  nextAction: string;
  reviewHref: string;
  customer: { id: string | null; name: string | null; email: string | null; pipelineStatus: string | null; propertyInterest: string | null; pipelineValue: number | null };
  buyerProfile: { id: string; status: string; version: number; purchaseReadiness: string | null; budgetAmount: number | null; budgetCurrency: string; summary: string | null; criteria: Array<{ type: unknown; key: unknown; value: unknown; sourceText: unknown; confidence: number | null; customerConfirmed: boolean }> } | null;
  match: { analyzed: number; status: string; bestScore: number | null };
  shortlist: Array<{ id: string; reference: unknown; title: unknown; location: unknown; price: number | null; rank: number; score: number; dataQualityScore: number; reasons: string[]; concerns: string[]; questionsToVerify: string[]; reviewStatus: unknown; publicUrl: unknown }>;
  presentation: { id: string; status: unknown; title: unknown; content: unknown } | null;
  draft: { id: string; status: unknown; subject: unknown; bodyText: unknown; language: unknown } | null;
  policy: { actionType: string; policyClass: string; status: string; ready: boolean; blockers: string[]; warnings: string[]; requiresFreshPreflight: boolean };
  replyPreview: string | null;
  noMatchCriteria: string[];
};
type Payload = { summary?: { total: number; highPriority: number; finalSend: number; blocked: number }; items?: ReviewItem[]; error?: string };

const KIND_LABEL: Record<ReviewKind, string> = {
  final_send: "Sluttkontroll og send",
  shortlist: "Shortlist",
  buyer_criteria: "Kriterietolkning",
  buyer_intake: "Buyer Intake",
  no_match: "Ingen treff",
};

function money(value: number | null, currency = "EUR") {
  if (value === null) return "Ikke registrert";
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function text(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

function badge(priority: ReviewItem["priority"]) {
  return priority === "HIGH" ? "border-rose-200 bg-rose-50 text-rose-800" : priority === "LOW" ? "border-slate-200 bg-slate-50 text-slate-700" : "border-amber-200 bg-amber-50 text-amber-800";
}

export default function FreddyReviewConsolePage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"all" | ReviewKind>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/nexus/review-console?limit=100", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json() as Payload;
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setItems(Array.isArray(body.items) ? body.items : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke laste Freddy Review Console.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => filter === "all" ? items : items.filter((item) => item.kind === filter), [filter, items]);
  const counts = useMemo(() => ({
    total: items.length,
    high: items.filter((item) => item.priority === "HIGH").length,
    final: items.filter((item) => item.kind === "final_send").length,
    blocked: items.filter((item) => item.policy.blockers.length > 0).length,
  }), [items]);

  async function finalDecision(item: ReviewItem, decision: "approve" | "reject") {
    if (savingId) return;
    let rejectionReason = "";
    if (decision === "approve") {
      const accepted = window.confirm("Godkjenne sluttresultatet? Dette autoriserer automatisk utsending bare etter en ny, grønn send-preflight.");
      if (!accepted) return;
    } else {
      const reason = window.prompt("Hvorfor avvises sluttresultatet? Utkastet kanselleres og ingen utsending autoriseres.");
      if (!reason || reason.trim().length < 3) return;
      rejectionReason = reason.trim();
    }
    setSavingId(item.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/nexus/presentation-reviews", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decision === "approve"
          ? { workItemId: item.id, decision, explicitApproval: true }
          : { workItemId: item.id, decision, reason: rejectionReason }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Beslutningen kunne ikke lagres.");
      setNotice(decision === "approve"
        ? "Godkjent. Nexus kjører fersk send-preflight; ved blokkering sendes ingenting."
        : "Avvist. E-postutkastet er kansellert og all sendautorisasjon er fjernet.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Beslutningen kunne ikke lagres.");
    } finally {
      setSavingId(null);
    }
  }

  return <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><ShieldCheck size={16} /> Freddy Review Console</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Én kø for beslutningene som faktisk trenger deg</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Kunde, Buyer Profile, match, shortlist, presentasjon, e-postutkast og policy vises i samme sak. Godkjenning av utsending går alltid via eksisterende preflight, suppression og audit.</p>
        </div>
        <button onClick={() => void load()} disabled={loading || Boolean(savingId)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Oppdater</button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {[{ label: "Beslutninger", value: counts.total }, { label: "Høy prioritet", value: counts.high }, { label: "Klare for sluttkontroll", value: counts.final }, { label: "Synlige blokkere", value: counts.blocked }].map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-2xl font-black text-slate-950">{stat.value}</div><div className="mt-1 text-xs font-bold text-slate-500">{stat.label}</div></div>)}
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900"><AlertTriangle className="mr-2 inline" size={17} />{error}</div>}
    {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900"><CheckCircle2 className="mr-2 inline" size={17} />{notice}</div>}

    <div className="flex gap-2 overflow-x-auto pb-1">
      {(["all", "final_send", "shortlist", "buyer_criteria", "buyer_intake", "no_match"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-black ${filter === value ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{value === "all" ? "Alle" : KIND_LABEL[value]}{value !== "all" ? ` · ${items.filter((item) => item.kind === value).length}` : ""}</button>)}
    </div>

    {loading && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-600"><Loader2 className="mr-2 inline animate-spin" size={18} />Laster beslutningsgrunnlag…</div>}
    {!loading && visible.length === 0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center text-sm font-bold text-emerald-900">Ingen åpne beslutninger i dette filteret.</div>}

    <section className="space-y-5">
      {visible.map((item) => <article key={item.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-black uppercase text-cyan-800">{KIND_LABEL[item.kind]}</span><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${badge(item.priority)}`}>{item.priority}</span><span className="text-xs text-slate-500">{item.brandId || "ukjent brand"}</span></div>
              <h2 className="mt-3 text-xl font-black text-slate-950">{item.customer.name || item.customer.email || item.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{item.nextAction}</p>
            </div>
            <div className={`rounded-2xl border px-4 py-3 text-xs font-bold ${item.policy.blockers.length ? "border-rose-200 bg-rose-50 text-rose-900" : item.kind === "final_send" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
              <div>{item.policy.policyClass} · {item.policy.status}</div>
              <div className="mt-1 font-normal">{item.policy.requiresFreshPreflight ? "Fersk sikkerhetssjekk kreves" : "Menneskelig beslutning kreves"}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-3 sm:p-6">
          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">Kunde og Buyer Profile</div>
            <div className="mt-3 text-sm font-black text-slate-950">{item.customer.name || "Ukjent kunde"}</div>
            <div className="mt-1 text-xs text-slate-500">{item.customer.email || "Ingen e-post"} · {item.customer.pipelineStatus || "ukjent stage"}</div>
            {item.buyerProfile ? <div className="mt-4 space-y-1 text-xs text-slate-700"><div><b>Profil:</b> v{item.buyerProfile.version} · {item.buyerProfile.status}</div><div><b>Kjøpsklarhet:</b> {item.buyerProfile.purchaseReadiness || "ukjent"}</div><div><b>Budsjett:</b> {money(item.buyerProfile.budgetAmount, item.buyerProfile.budgetCurrency)}</div><div className="pt-1 leading-5">{item.buyerProfile.summary || "Ingen profilsammendrag."}</div></div> : <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Ingen godkjent Buyer Profile er knyttet til saken.</div>}
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">Match og shortlist</div>
            <div className="mt-3 flex gap-5"><div><div className="text-2xl font-black">{item.match.bestScore ?? "–"}</div><div className="text-[10px] font-bold uppercase text-slate-500">Beste score</div></div><div><div className="text-2xl font-black">{item.shortlist.length}</div><div className="text-[10px] font-bold uppercase text-slate-500">Kandidater</div></div><div><div className="text-2xl font-black">{item.match.analyzed}</div><div className="text-[10px] font-bold uppercase text-slate-500">Analysert</div></div></div>
            <div className="mt-3 text-xs font-bold text-slate-600">{item.match.status}</div>
            {item.shortlist.slice(0, 4).map((candidate) => <div key={candidate.id} className="mt-3 rounded-xl bg-slate-50 p-3"><div className="text-sm font-black text-slate-900">#{candidate.rank} {text(candidate.title || candidate.reference || "Bolig")}</div><div className="mt-1 text-xs text-slate-600">Score {candidate.score} · datakvalitet {candidate.dataQualityScore} · {text(candidate.location)}</div>{candidate.reasons[0] && <div className="mt-2 text-xs text-emerald-800">{candidate.reasons[0]}</div>}{[...candidate.concerns, ...candidate.questionsToVerify][0] && <div className="mt-1 text-xs text-amber-800">Usikkerhet: {[...candidate.concerns, ...candidate.questionsToVerify][0]}</div>}</div>)}
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">Anbefaling og usikkerhet</div>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-800">{item.recommendation}</p>
            {item.uncertainty.map((value) => <div key={value} className="mt-2 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><CircleHelp size={15} className="shrink-0" />{value}</div>)}
            {item.policy.blockers.map((value) => <div key={value} className="mt-2 flex gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-900"><AlertTriangle size={15} className="shrink-0" />{value}</div>)}
          </section>
        </div>

        {(item.buyerProfile?.criteria.length || item.replyPreview || item.noMatchCriteria.length) ? <details className="border-t border-slate-100 px-5 py-4 sm:px-6"><summary className="cursor-pointer text-sm font-black text-slate-800">Vis kriterier og kundeevidens</summary><div className="mt-3 grid gap-2 md:grid-cols-2">{item.buyerProfile?.criteria.map((criterion, index) => <div key={`${text(criterion.key)}-${index}`} className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700"><b>{text(criterion.key)}:</b> {text(criterion.value)}{criterion.sourceText ? <div className="mt-1 text-slate-500">Evidence: {text(criterion.sourceText)}</div> : null}</div>)}{item.noMatchCriteria.map((criterion) => <div key={criterion} className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">{criterion}</div>)}</div>{item.replyPreview && <div className="mt-3 rounded-xl bg-cyan-50 p-3 text-sm text-cyan-950"><b>Kundesvar:</b> {item.replyPreview}</div>}</details> : null}

        {(item.presentation || item.draft) && <details className="border-t border-slate-100 px-5 py-4 sm:px-6"><summary className="cursor-pointer text-sm font-black text-slate-800">Vis presentasjon og e-postutkast</summary>{item.presentation && <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-700">{JSON.stringify(item.presentation.content, null, 2)}</pre>}{item.draft && <div className="mt-3 rounded-xl border border-slate-200 p-4"><div className="text-xs font-black uppercase text-slate-500">E-postutkast · {text(item.draft.status)}</div><div className="mt-2 font-black text-slate-950">{text(item.draft.subject)}</div><pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{text(item.draft.bodyText)}</pre></div>}</details>}

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
          {item.actions.includes("approve_send") && <button onClick={() => void finalDecision(item, "approve")} disabled={Boolean(savingId)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{savingId === item.id ? <Loader2 size={16} className="animate-spin" /> : <ThumbsUp size={16} />}Godkjenn send</button>}
          {item.kind === "final_send" && item.actions.includes("reject") && <button onClick={() => void finalDecision(item, "reject")} disabled={Boolean(savingId)} className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-black text-rose-800 disabled:opacity-50"><ThumbsDown size={16} />Avvis</button>}
          {item.actions.includes("edit") && <Link href={item.reviewHref} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-800"><FilePenLine size={16} />Rediger / review</Link>}
          {item.actions.includes("ask_customer_clarification") && <Link href={item.customer.id ? `/customers/${encodeURIComponent(item.customer.id)}` : item.reviewHref} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300 bg-white px-4 py-2.5 text-sm font-black text-cyan-900"><CircleHelp size={16} />Be kunden avklare</Link>}
          {item.kind !== "final_send" && item.actions.includes("reject") && <Link href={item.reviewHref} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-black text-rose-800"><ThumbsDown size={16} />Avvis i review</Link>}
          <Link href={item.reviewHref} className="ml-auto inline-flex items-center gap-1 text-xs font-black text-slate-600">Åpne full sak <ChevronRight size={15} /></Link>
        </div>
      </article>)}
    </section>
  </main>;
}
