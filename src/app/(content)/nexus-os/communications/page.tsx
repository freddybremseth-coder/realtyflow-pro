"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Inbox,
  Loader2,
  Mail,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
  chatgenius: "ChatGenius.pro",
  donaanna: "Doña Anna",
  freddyb: "Freddy Bremseth",
  freddypublishing: "Freddy Publishing",
  remasterfreddy: "Re-Master Freddy",
};

type Provider = "hostinger" | "gmail" | "custom";

type InboxRow = {
  id: string;
  brand_id: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  ai_summary: string | null;
  ai_urgency: string | null;
  is_read: boolean;
  has_draft_reply: boolean;
  received_at: string | null;
  score: number;
  draft: null | {
    id: string;
    subject: string;
    body_text: string;
    confidence: number | null;
    status: string;
    created_at: string;
  };
  ownerFocus: unknown;
};

type EmailAccount = {
  id: string;
  brand_id: string;
  email_address: string;
  health_status?: string;
  health_message?: string | null;
  consecutive_failures?: number | null;
  last_fetched_at?: string | null;
  auto_fetch_paused_by_system?: boolean;
  needsReconnect?: boolean;
  imap_host?: string | null;
  imap_port?: number | null;
  imap_secure?: boolean | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_secure?: boolean | null;
};

type Data = {
  generatedAt: string;
  summary: Record<string, any>;
  runtime: Array<Record<string, any>>;
  emailAccounts: EmailAccount[];
  ownerFocus: unknown[];
  inbox: InboxRow[];
  policy: unknown;
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" });
}

function urgencyClass(value: string | null) {
  const urgency = String(value || "").toLowerCase();
  if (["critical", "urgent", "high"].includes(urgency)) return "bg-rose-100 text-rose-900";
  if (["medium", "normal"].includes(urgency)) return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-800";
}

function healthStyle(status: string | undefined) {
  const value = String(status || "unknown");
  if (value === "healthy") return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (value === "paused") return "border-rose-300 bg-rose-50 text-rose-950";
  if (value === "degraded") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-slate-300 bg-slate-50 text-slate-950";
}

function healthLabel(status: string | undefined) {
  const value = String(status || "unknown");
  if (value === "healthy") return "Frisk";
  if (value === "paused") return "Pauset";
  if (value === "degraded") return "Degradert";
  return "Ukjent";
}

function inferProvider(account: EmailAccount): Provider {
  const address = String(account.email_address || "").toLowerCase();
  const imapHost = String(account.imap_host || "").toLowerCase();
  if (address.endsWith("@gmail.com") || imapHost === "imap.gmail.com") return "gmail";
  if (imapHost === "imap.hostinger.com") return "hostinger";
  return "custom";
}

export default function NexusCommunicationsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [brand, setBrand] = useState("all");
  const [repair, setRepair] = useState<EmailAccount | null>(null);
  const [provider, setProvider] = useState<Provider>("hostinger");
  const [repairEmail, setRepairEmail] = useState("");
  const [repairPassword, setRepairPassword] = useState("");
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairMessage, setRepairMessage] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [imapSecure, setImapSecure] = useState(true);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  async function load(options?: { quiet?: boolean }) {
    if (!options?.quiet) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/nexus/communications", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setData(body);
      setLastLoadedAt(new Date().toISOString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (!options?.quiet) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load({ quiet: true }), 30_000);
    const onFocus = () => void load({ quiet: true });
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  async function analyze(emailId: string) {
    setBusy(emailId);
    setError("");
    try {
      const response = await fetch("/api/email/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: emailId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      await load({ quiet: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  function openRepair(account: EmailAccount) {
    setRepair(account);
    setRepairEmail(account.email_address || "");
    const inferred = inferProvider(account);
    setProvider(inferred);
    setRepairPassword("");
    setRepairMessage("");
    setImapHost(account.imap_host || "");
    setImapPort(String(account.imap_port || 993));
    setImapSecure(account.imap_secure ?? true);
    setSmtpHost(account.smtp_host || "");
    setSmtpPort(String(account.smtp_port || 465));
    setSmtpSecure(account.smtp_secure ?? true);
  }

  function chooseProvider(nextProvider: Provider) {
    setProvider(nextProvider);
    if (nextProvider === "hostinger") {
      setImapHost("imap.hostinger.com");
      setImapPort("993");
      setImapSecure(true);
      setSmtpHost("smtp.hostinger.com");
      setSmtpPort("465");
      setSmtpSecure(true);
    } else if (nextProvider === "gmail") {
      setImapHost("imap.gmail.com");
      setImapPort("993");
      setImapSecure(true);
      setSmtpHost("smtp.gmail.com");
      setSmtpPort("465");
      setSmtpSecure(true);
    }
  }

  async function reconnect() {
    if (!repair) return;
    setRepairBusy(true);
    setRepairMessage("");
    try {
      const payload: Record<string, unknown> = {
        accountId: repair.id,
        provider,
        emailAddress: repairEmail,
        password: repairPassword,
      };
      if (provider === "custom") {
        Object.assign(payload, {
          imapHost,
          imapPort: Number(imapPort),
          imapSecure,
          smtpHost,
          smtpPort: Number(smtpPort),
          smtpSecure,
        });
      }

      const response = await fetch("/api/nexus/communications/email-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setRepairMessage("Tilkoblingen er testet og aktivert.");
      setRepairPassword("");
      await load({ quiet: true });
      window.setTimeout(() => setRepair(null), 900);
    } catch (caught) {
      setRepairMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRepairBusy(false);
    }
  }

  const brands = useMemo(
    () => Array.from(new Set((data?.inbox || []).map((row) => row.brand_id))).sort(),
    [data],
  );
  const rows = useMemo(
    () => (brand === "all" ? data?.inbox || [] : (data?.inbox || []).filter((row) => row.brand_id === brand)),
    [data, brand],
  );
  const runtime = (key: string) => data?.runtime.find((item) => item.control_key === key)?.enabled;
  const autoDraftConfig = data?.runtime.find((item) => item.control_key === "cron:/api/cron/email-auto-draft")?.config;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 text-slate-950 sm:p-6">
      <header className="rounded-3xl border border-cyan-800 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl">
        <div className="text-xs font-black uppercase tracking-[.22em] text-cyan-200">Nexus OS · Communications</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-white">Communications Director</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-200">Prioritert innboks, AI-analyse, svarutkast, nurture og kontohelse. Nexus forbereder arbeidet 24/7; sending styres separat av Runtime og Autonomy.</p>
            <p className="mt-2 text-xs text-cyan-100">Status sist hentet: {fmtDate(lastLoadedAt)}</p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">
            {loading ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 inline h-4 w-4" />}
            {loading ? "Oppdaterer" : "Oppdater"}
          </button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-rose-400 bg-rose-50 p-4 text-sm font-semibold text-rose-950"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Innboks", data?.summary?.inbox ?? "—", Inbox],
          ["Ulest", data?.summary?.unread ?? "—", Mail],
          ["Uten utkast", data?.summary?.withoutDraft ?? "—", Sparkles],
          [">24t uten svar", data?.summary?.unreplied24h ?? "—", Clock3],
          ["Kontoer med feil", data?.summary?.unhealthyEmailAccounts ?? "—", AlertTriangle],
          ["Nurture sent 30d", data?.summary?.nurture30d?.sent ?? 0, CheckCircle2],
        ].map(([label, value, Icon]: any) => <div key={label} className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><Icon className="h-5 w-5 text-cyan-800" /><div className="mt-3 text-xs font-bold uppercase text-slate-600">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>)}
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        {[
          ["Email ingest", runtime("cron:/api/cron/email-ingest"), null],
          ["AI Auto-draft", runtime("cron:/api/cron/email-auto-draft"), `Batch ${autoDraftConfig?.max_per_run ?? "—"}`],
          ["Nurture LIVE", runtime("feature:nurture_live"), null],
          ["Routine auto-reply", runtime("feature:routine_email_reply_live"), null],
        ].map(([label, enabled, detail]) => <div key={String(label)} className="rounded-2xl border border-slate-300 bg-white p-5"><div className="text-xs font-black uppercase text-slate-600">{label}</div><div className={`mt-2 text-lg font-black ${enabled ? "text-emerald-800" : "text-slate-600"}`}>{enabled ? "PÅ" : "AV"}</div>{detail && <div className="mt-2 text-sm text-slate-600">{detail}</div>}</div>)}
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">E-postkontoer</h2>
        <p className="mt-1 text-sm text-slate-600">Reparer kontoer her. Nexus tester IMAP før credential lagres. Bruk Custom / Other når domenet ikke ligger hos Hostinger eller Gmail.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(data?.emailAccounts || []).map((account) => <div key={account.id} className={`rounded-xl border p-4 ${healthStyle(account.health_status)}`}><div className="flex items-start justify-between gap-3"><div><div className="font-black">{BRAND_LABELS[account.brand_id] || account.brand_id}</div><div className="mt-1 text-xs opacity-80">{account.email_address}</div>{account.imap_host && <div className="mt-1 text-[11px] opacity-70">IMAP: {account.imap_host}</div>}</div><span className="rounded-full border border-current/20 bg-white/70 px-2 py-1 text-[10px] font-black uppercase">{healthLabel(account.health_status)}</span></div><div className="mt-3 text-xs opacity-80">Sist hentet: {fmtDate(account.last_fetched_at)}</div>{account.health_message && <div className="mt-3 rounded-lg border border-current/20 bg-white/70 p-2 text-xs font-semibold">{account.health_message}</div>}<div className="mt-2 text-xs opacity-80">Feil på rad: {Number(account.consecutive_failures || 0)}</div>{(account.needsReconnect || account.health_status !== "healthy") && <button onClick={() => openRepair(account)} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white"><Wrench className="h-3.5 w-3.5" />Koble/reparer</button>}{account.auto_fetch_paused_by_system && <div className="mt-2 flex items-center gap-1 text-xs font-black"><PauseCircle className="h-3.5 w-3.5" />Auto-fetch stoppet av Nexus</div>}</div>)}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 p-5"><div><h2 className="text-xl font-black">Prioritert innboks</h2><p className="mt-1 text-sm text-slate-600">Ulest, urgency, svartid og Owner Focus løfter prioriteten.</p></div><select value={brand} onChange={(event) => setBrand(event.target.value)} className="rounded-xl border border-slate-400 bg-white px-3 py-2 text-sm font-semibold"><option value="all">Alle brands</option>{brands.map((item) => <option key={item} value={item}>{BRAND_LABELS[item] || item}</option>)}</select></div>
        <div className="divide-y divide-slate-200">{rows.length === 0 ? <div className="p-8 text-center text-sm text-slate-600">Ingen meldinger.</div> : rows.map((row) => <article key={row.id} className="p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black text-white">Score {row.score}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${urgencyClass(row.ai_urgency)}`}>{row.ai_urgency || "uanalysert"}</span>{row.ownerFocus ? <span className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-[10px] font-black text-fuchsia-900">OWNER FOCUS</span> : null}</div><h3 className="mt-3 text-lg font-black">{row.subject || "(uten emne)"}</h3><div className="mt-1 text-sm text-slate-700">{row.from_name || row.from_address} · {BRAND_LABELS[row.brand_id] || row.brand_id} · {fmtDate(row.received_at)}</div>{row.ai_summary && <p className="mt-3 text-sm leading-6 text-slate-800">{row.ai_summary}</p>}{row.draft && <details className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3"><summary className="cursor-pointer text-sm font-black text-emerald-950">Svarutkast · confidence {row.draft.confidence == null ? "—" : `${Math.round(Number(row.draft.confidence) * 100)}%`}</summary><div className="mt-3 whitespace-pre-wrap text-sm text-slate-800"><b>{row.draft.subject}</b>{"\n\n"}{row.draft.body_text}</div></details>}</div><button onClick={() => void analyze(row.id)} disabled={busy === row.id} className="shrink-0 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{busy === row.id ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 inline h-4 w-4" />}{row.has_draft_reply ? "Analyser på nytt" : "Analyser + lag utkast"}</button></div></article>)}</div>
      </section>

      <div className="flex gap-3 rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-sm text-cyan-950"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><b>Standard:</b> Nexus kan forberede og lære 24/7. Autonom sending krever separat policy og skal ikke aktiveres av reconnect.</div></div>

      {repair && <div className="fixed inset-0 z-[90] flex items-end bg-slate-950/70 p-3 sm:items-center sm:justify-center"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 text-slate-950 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black uppercase text-cyan-800">Nexus e-post reconnect</div><h3 className="mt-1 text-xl font-black">{BRAND_LABELS[repair.brand_id] || repair.brand_id}</h3><div className="text-sm text-slate-600">Eksisterende passord vises aldri. Kontoen lagres først etter vellykket IMAP-test.</div></div><button onClick={() => setRepair(null)} className="rounded-lg border border-slate-300 p-2"><X className="h-4 w-4" /></button></div><div className="mt-5 space-y-4"><label className="block"><span className="text-xs font-black uppercase text-slate-600">Provider</span><select value={provider} onChange={(event) => chooseProvider(event.target.value as Provider)} className="mt-1 w-full rounded-xl border border-slate-400 bg-white px-3 py-2.5"><option value="hostinger">Hostinger</option><option value="gmail">Gmail / Google Workspace</option><option value="custom">Custom / Other</option></select></label><label className="block"><span className="text-xs font-black uppercase text-slate-600">E-postadresse</span><input value={repairEmail} onChange={(event) => setRepairEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-400 px-3 py-2.5" /></label>{provider === "custom" && <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4"><div className="mb-3 text-sm font-black text-cyan-950">Egen mailserver</div><div className="grid gap-3 sm:grid-cols-2"><label className="block sm:col-span-2"><span className="text-xs font-black uppercase text-slate-600">IMAP host</span><input value={imapHost} onChange={(event) => setImapHost(event.target.value)} placeholder="imap.example.com" className="mt-1 w-full rounded-xl border border-slate-400 bg-white px-3 py-2" /></label><label className="block"><span className="text-xs font-black uppercase text-slate-600">IMAP port</span><input type="number" value={imapPort} onChange={(event) => setImapPort(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-400 bg-white px-3 py-2" /></label><label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={imapSecure} onChange={(event) => setImapSecure(event.target.checked)} /><span className="text-sm font-semibold">IMAP SSL/TLS</span></label><label className="block sm:col-span-2"><span className="text-xs font-black uppercase text-slate-600">SMTP host</span><input value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} placeholder="smtp.example.com" className="mt-1 w-full rounded-xl border border-slate-400 bg-white px-3 py-2" /></label><label className="block"><span className="text-xs font-black uppercase text-slate-600">SMTP port</span><input type="number" value={smtpPort} onChange={(event) => setSmtpPort(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-400 bg-white px-3 py-2" /></label><label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={smtpSecure} onChange={(event) => setSmtpSecure(event.target.checked)} /><span className="text-sm font-semibold">SMTP SSL/TLS</span></label></div></div>}<label className="block"><span className="text-xs font-black uppercase text-slate-600">Passord / app-passord</span><input type="password" autoComplete="new-password" value={repairPassword} onChange={(event) => setRepairPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-400 px-3 py-2.5" /></label>{repair.brand_id === "soleada" && provider === "hostinger" && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">Soleada-adressen finnes ikke i Hostinger-mailkontoen Nexus er koblet til. Velg Custom / Other hvis Soleada bruker en annen leverandør.</div>}{repairMessage && <div className={`rounded-xl border p-3 text-sm font-semibold ${repairMessage.startsWith("Tilkoblingen er") ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-rose-300 bg-rose-50 text-rose-950"}`}>{repairMessage}</div>}<button onClick={() => void reconnect()} disabled={repairBusy || !repairPassword || !repairEmail || (provider === "custom" && (!imapHost || !smtpHost))} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{repairBusy ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Tester tilkobling…</> : "Test og aktiver"}</button></div></div></div>}
    </div>
  );
}
