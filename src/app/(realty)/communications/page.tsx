"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  CommunicationBrand,
  CommunicationDraftStatus,
  CommunicationItem,
  CommunicationPriority,
  CommunicationWorkspace,
} from "@/lib/revenue/communications";

const BRAND_LABELS: Record<CommunicationBrand, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
};

type Filter = "all" | "draft" | "ready" | "blocked" | "approved" | "manual" | "cancelled";

function dateLabel(value: string | null) {
  if (!value) return "Ikke registrert";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("nb-NO", { dateStyle: "medium", timeStyle: "short" });
}

function priorityClass(priority: CommunicationPriority) {
  if (priority === "HIGH") return "border-red-500/35 bg-red-500/10 text-red-200";
  if (priority === "MEDIUM") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  return "border-slate-600 bg-slate-800 text-slate-300";
}

function statusClass(status: CommunicationDraftStatus) {
  if (status === "APPROVED") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  if (status === "CANCELLED") return "border-slate-600 bg-slate-800 text-slate-400";
  return "border-cyan-500/35 bg-cyan-500/10 text-cyan-200";
}

function statusLabel(status: CommunicationDraftStatus) {
  if (status === "APPROVED") return "Godkjent";
  if (status === "CANCELLED") return "Avsluttet";
  return "Utkast";
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
    <Icon size={19} className="text-cyan-300" />
    <p className="mt-3 text-[10px] font-semibold uppercase text-slate-500">{label}</p>
    <strong className="mt-1 block text-2xl text-white">{value}</strong>
  </article>;
}

export default function CommunicationsPage() {
  const [workspace, setWorkspace] = useState<CommunicationWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [brand, setBrand] = useState<CommunicationBrand | "all">("all");
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const [bodies, setBodies] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/revenue/communications", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente kommunikasjonskøen.");
      const next = body?.workspace || null;
      setWorkspace(next);
      const nextSubjects: Record<string, string> = {};
      const nextBodies: Record<string, string> = {};
      for (const item of next?.items || []) {
        nextSubjects[item.id] = item.subject;
        nextBodies[item.id] = item.bodyText;
      }
      setSubjects(nextSubjects);
      setBodies(nextBodies);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente kommunikasjonskøen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => (workspace?.items || []).filter((item) => {
    if (brand !== "all" && item.brandId !== brand) return false;
    if (filter === "draft") return item.status === "DRAFT";
    if (filter === "ready") return item.approvalReady;
    if (filter === "blocked") return item.status === "DRAFT" && !item.approvalReady;
    if (filter === "approved") return item.status === "APPROVED";
    if (filter === "manual") return Boolean(item.manualSend.emailLoggedAt || item.manualSend.whatsappLoggedAt);
    if (filter === "cancelled") return item.status === "CANCELLED";
    return true;
  }), [workspace?.items, brand, filter]);

  async function act(item: CommunicationItem, action: string, extra: Record<string, unknown> = {}, busyAction = action) {
    const requiresConfirmation = ["APPROVE_DRAFT", "CANCEL_DRAFT", "LOG_MANUAL_SEND"].includes(action);
    if (requiresConfirmation) {
      const message = action === "APPROVE_DRAFT"
        ? "Godkjenne og fryse dette utkastet? Det blir ikke sendt."
        : action === "CANCEL_DRAFT"
          ? "Avslutte dette utkastet? En ny versjon må opprettes for videre arbeid."
          : `Bekrefter du at ${String(extra.channel || "meldingen").toLowerCase()} allerede er sendt manuelt utenfor RealtyFlow?`;
      if (!window.confirm(message)) return;
    }
    setBusy(`${item.id}-${busyAction}`);
    setFeedback("");
    try {
      const payload = {
        action,
        draftId: item.id,
        explicitApproval: requiresConfirmation,
        ...extra,
      };
      const response = await fetch("/api/revenue/communications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const blockers = Array.isArray(body?.blockers) ? ` ${body.blockers.join(" ")}` : "";
        throw new Error(`${body?.error || "Handlingen feilet."}${blockers}`);
      }
      setFeedback(
        action === "UPDATE_DRAFT"
          ? "Utkastet er lagret som ren tekst. Ingen melding ble sendt."
          : action === "APPROVE_DRAFT"
            ? "Utkastet er godkjent og fryst. Ingen melding ble sendt."
            : action === "CANCEL_DRAFT"
              ? "Utkastet er avsluttet. Ingen melding ble sendt."
              : body?.duplicate
                ? "Denne manuelle utsendingen var allerede registrert."
                : "Den eksterne, manuelle utsendingen er registrert i kundetidslinjen.",
      );
      await load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Handlingen feilet.");
    } finally {
      setBusy(null);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} er kopiert. Ingen melding ble sendt.`);
    } catch {
      setFeedback("Nettleseren kunne ikke kopiere teksten. Marker og kopier den manuelt.");
    }
  }

  function openEmail(item: CommunicationItem) {
    if (!item.recipientEmail || !item.manualEmailReady) return;
    const url = `mailto:${item.recipientEmail}?subject=${encodeURIComponent(item.subject)}&body=${encodeURIComponent(item.bodyText)}`;
    window.location.href = url;
  }

  function openWhatsApp(item: CommunicationItem) {
    if (!item.whatsappNumber || !item.manualWhatsAppReady) return;
    window.open(`https://wa.me/${item.whatsappNumber}?text=${encodeURIComponent(item.whatsappCopy)}`, "_blank", "noopener,noreferrer");
  }

  const filters: Array<[Filter, string]> = [
    ["all", "Alle"],
    ["draft", "Utkast"],
    ["ready", "Klar for godkjenning"],
    ["blocked", "Blokkert"],
    ["approved", "Godkjent"],
    ["manual", "Manuelt sendt"],
    ["cancelled", "Avsluttet"],
  ];

  if (loading && !workspace) return <div className="flex min-h-[50vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Bygger kommunikasjonskø …</div>;

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-300"><ShieldCheck size={17} /> Freddy Revenue OS</div>
        <h1 className="text-3xl font-bold text-white">Controlled Communications</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">Rediger, kontroller og godkjenn kundeutkast. RealtyFlow åpner bare din egen e-post- eller WhatsApp-klient og sender aldri automatisk.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link href="/approvals">Approval Center</Link></Button>
        <Button asChild variant="outline"><Link href="/customers">Kunder</Link></Button>
        <Button onClick={load} disabled={loading}>{loading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <RefreshCw size={15} className="mr-2" />}Oppdater</Button>
      </div>
    </header>

    <div className="flex gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4 text-sm text-slate-300">
      <ShieldCheck size={20} className="shrink-0 text-cyan-300" />
      <div><strong className="text-white">Hard sikkerhetsgrense:</strong> Ingen SMTP-, Gmail-, WhatsApp- eller SMS-leverandør kalles. Godkjenning sender ingenting. «Manuelt sendt» kan bare logges etter at du bekrefter en ekstern handling.</div>
    </div>

    {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
    {feedback && <div className="flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"><CheckCircle2 size={17} />{feedback}</div>}
    {workspace?.warnings.map((warning) => <div key={warning} className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200">{warning}</div>)}

    {workspace && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
      <Metric label="Alle utkast" value={workspace.summary.total} icon={Mail} />
      <Metric label="Utkast" value={workspace.summary.drafts} icon={Save} />
      <Metric label="Klar" value={workspace.summary.readyForApproval} icon={CheckCircle2} />
      <Metric label="Blokkert" value={workspace.summary.blockedDrafts} icon={AlertTriangle} />
      <Metric label="Godkjent" value={workspace.summary.approved} icon={ShieldCheck} />
      <Metric label="E-post klar" value={workspace.summary.manualEmailReady} icon={Mail} />
      <Metric label="WhatsApp klar" value={workspace.summary.manualWhatsAppReady} icon={MessageCircle} />
      <Metric label="Logget sendt" value={workspace.summary.manuallyLogged} icon={Send} />
    </section>}

    <div className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/50 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-2">{filters.map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`rounded-full border px-3 py-1.5 text-xs ${filter === id ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-400"}`}>{label}</button>)}</div>
      <select value={brand} onChange={(event) => setBrand(event.target.value as CommunicationBrand | "all")} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
        <option value="all">Alle brands</option>
        {Object.entries(BRAND_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </div>

    {visible.length === 0 ? <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen utkast i dette filteret.</div> : <section className="space-y-5">
      {visible.map((item) => <article key={item.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityClass(item.priority)}`}>{item.priority}</span>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
              <span className="text-xs text-slate-500">{item.brandLabel}</span>
              <span className="text-xs text-slate-600">{item.ageDays} dag(er)</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-white">{item.customerName}</h2>
            <p className="mt-1 text-sm text-slate-400">{item.recipientEmail || "Ingen gyldig e-post"} · {item.recipientPhone || "Ingen telefon"}</p>
            <p className="mt-1 text-xs text-slate-600">Oppdatert {dateLabel(item.updatedAt)}{item.approvedAt ? ` · godkjent ${dateLabel(item.approvedAt)}` : ""}</p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Kjøperprofil", item.dependencies.profileApproved],
                ["Shortlist", item.dependencies.shortlistApproved],
                ["Presentasjon", item.dependencies.presentationApproved],
                ["Samme brand", item.dependencies.sameBrand],
                ["Kontakt koblet", item.dependencies.contactLinked],
              ].map(([label, ok]) => <div key={String(label)} className={`rounded-lg border p-2 text-xs ${ok ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-200" : "border-red-500/25 bg-red-500/5 text-red-200"}`}>{ok ? <CheckCircle2 size={13} className="mr-1 inline" /> : <XCircle size={13} className="mr-1 inline" />}{label}</div>)}
            </div>

            {item.status === "DRAFT" ? <div className="mt-5 space-y-3">
              <label className="block"><span className="mb-1 block text-xs font-medium text-slate-400">Emne</span><input value={subjects[item.id] ?? item.subject} onChange={(event) => setSubjects((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={512} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" /></label>
              <label className="block"><span className="mb-1 block text-xs font-medium text-slate-400">E-posttekst</span><textarea value={bodies[item.id] ?? item.bodyText} onChange={(event) => setBodies((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={12000} rows={10} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-relaxed text-slate-100" /></label>
            </div> : <div className="mt-5 rounded-lg border border-slate-700 bg-slate-950/40 p-4"><p className="text-xs font-semibold uppercase text-slate-500">{item.subject}</p><pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">{item.bodyText}</pre></div>}

            {item.approvalBlockers.length > 0 && <div className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 p-3"><p className="text-xs font-semibold uppercase text-red-300">Blokkeringer</p>{item.approvalBlockers.map((value) => <p key={value} className="mt-1 text-sm text-red-100/80">• {value}</p>)}</div>}
            {item.preflightWarnings.length > 0 && <details className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3"><summary className="cursor-pointer text-xs font-semibold uppercase text-amber-300">Preflight-varsler · {item.preflightWarnings.length}</summary>{item.preflightWarnings.map((value) => <p key={value} className="mt-2 text-sm text-amber-100/75">• {value}</p>)}</details>}
            {item.propertyLinks.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{item.propertyLinks.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200">{link.title}<ExternalLink size={12} className="ml-1" /></a>)}</div>}
            <div className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3"><p className="text-[10px] font-semibold uppercase text-cyan-300">Anbefalt neste steg</p><p className="mt-1 text-sm text-slate-200">{item.recommendedAction}</p></div>
          </div>

          <div className="w-full space-y-3 xl:w-[25rem]">
            {item.status === "DRAFT" && <div className="rounded-xl border border-slate-700 bg-slate-950/35 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Redigering og godkjenning</p>
              <div className="mt-3 grid gap-2">
                <Button variant="outline" disabled={Boolean(busy)} onClick={() => void act(item, "UPDATE_DRAFT", { subject: subjects[item.id] ?? item.subject, bodyText: bodies[item.id] ?? item.bodyText, language: item.language })}>{busy === `${item.id}-UPDATE_DRAFT` ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}Lagre utkast</Button>
                <Button disabled={Boolean(busy) || !item.approvalReady} onClick={() => void act(item, "APPROVE_DRAFT")}>{busy === `${item.id}-APPROVE_DRAFT` ? <Loader2 size={14} className="mr-2 animate-spin" /> : <ShieldCheck size={14} className="mr-2" />}Godkjenn uten å sende</Button>
                <Button variant="outline" disabled={Boolean(busy)} onClick={() => void act(item, "CANCEL_DRAFT")}>Avslutt utkast</Button>
              </div>
            </div>}

            {item.status === "APPROVED" && <>
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-300"><Mail size={15} /> Manuell e-post</p>
                <p className="mt-2 text-xs text-slate-400">{item.recipientEmail || "Gyldig e-post mangler"}</p>
                <div className="mt-3 grid gap-2">
                  <Button disabled={!item.manualEmailReady} onClick={() => openEmail(item)}><ExternalLink size={14} className="mr-2" />Åpne e-postklient</Button>
                  <Button variant="outline" onClick={() => void copyText(`Emne: ${item.subject}\n\n${item.bodyText}`, "E-postutkastet")}><Clipboard size={14} className="mr-2" />Kopier e-post</Button>
                  <Button variant="outline" disabled={Boolean(busy) || !item.manualEmailReady || Boolean(item.manualSend.emailLoggedAt)} onClick={() => void act(item, "LOG_MANUAL_SEND", { channel: "EMAIL" }, "LOG_EMAIL")}>{busy === `${item.id}-LOG_EMAIL` ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Send size={14} className="mr-2" />}{item.manualSend.emailLoggedAt ? `Logget ${dateLabel(item.manualSend.emailLoggedAt)}` : "Marker e-post sendt manuelt"}</Button>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-300"><MessageCircle size={15} /> Avledet WhatsApp-kopi</p>
                <p className="mt-2 text-xs text-slate-400">Teksten er avledet fra det godkjente e-postutkastet og må kontrolleres før bruk.</p>
                <textarea readOnly value={item.whatsappCopy} rows={8} className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs leading-relaxed text-slate-300" />
                <div className="mt-3 grid gap-2">
                  <Button disabled={!item.manualWhatsAppReady} onClick={() => openWhatsApp(item)}><ExternalLink size={14} className="mr-2" />Åpne WhatsApp</Button>
                  <Button variant="outline" onClick={() => void copyText(item.whatsappCopy, "WhatsApp-kopien")}><Clipboard size={14} className="mr-2" />Kopier WhatsApp</Button>
                  <Button variant="outline" disabled={Boolean(busy) || !item.manualWhatsAppReady || Boolean(item.manualSend.whatsappLoggedAt)} onClick={() => void act(item, "LOG_MANUAL_SEND", { channel: "WHATSAPP" }, "LOG_WHATSAPP")}>{busy === `${item.id}-LOG_WHATSAPP` ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Send size={14} className="mr-2" />}{item.manualSend.whatsappLoggedAt ? `Logget ${dateLabel(item.manualSend.whatsappLoggedAt)}` : "Marker WhatsApp sendt manuelt"}</Button>
                </div>
              </div>

              <Button variant="outline" disabled={Boolean(busy)} onClick={() => void act(item, "CANCEL_DRAFT")}>Avslutt godkjent utkast</Button>
            </>}

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {item.customerHref && <Button asChild variant="outline"><Link href={item.customerHref}>Customer 360 <ArrowRight size={14} className="ml-2" /></Link></Button>}
              <Button asChild variant="outline"><Link href={item.reviewHref}>Lead Intelligence <ArrowRight size={14} className="ml-2" /></Link></Button>
            </div>
          </div>
        </div>
      </article>)}
    </section>}
  </div>;
}
