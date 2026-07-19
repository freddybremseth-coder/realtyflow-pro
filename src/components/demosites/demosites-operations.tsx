"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, CircleAlert, ExternalLink, Globe2, Loader2, RefreshCw, ServerCog } from "lucide-react";

type Check = { configured: boolean; connected: boolean; message: string };
type Infrastructure = {
  checked_at: string;
  stripe: Check & { webhook_configured: boolean; checkout_ready: boolean };
  vercel: Check;
  hostinger: Check;
  domains: { automatic_subdomains_ready: boolean; custom_domains_ready: boolean; rootDomain: string };
  history: { successful_payment_events: number; published_events: number; last_payment_at: string | null; end_to_end_proven: boolean };
};
type DnsRecord = { type: string; name: string; value: string; purpose?: string };
type DomainResponse = {
  status?: string;
  site_slug?: string | null;
  custom_domain?: string | null;
  production_url?: string | null;
  domain?: { ok?: boolean; configured?: boolean; verified?: boolean; dnsRecords?: DnsRecord[]; verification?: unknown[]; error?: string } | null;
  error?: string;
};

function Status({ label, check }: { label: string; check: Check }) {
  const good = check.connected;
  return (
    <div className={`rounded-xl border p-4 ${good ? "border-emerald-500/25 bg-emerald-500/10" : "border-amber-500/25 bg-amber-500/10"}`}>
      <div className="flex items-center gap-2 text-sm font-bold text-white">
        {good ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <CircleAlert className="h-4 w-4 text-amber-300" />}
        {label}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-300">{check.message}</p>
    </div>
  );
}

function InfrastructurePanel() {
  const [data, setData] = useState<Infrastructure | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/saas/demosites/infrastructure", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Kunne ikke kontrollere infrastrukturen.");
      setData(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kunne ikke kontrollere infrastrukturen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => void load(), []);

  return (
    <section className="mb-6 rounded-2xl border border-slate-700 bg-slate-900/80 p-5 text-white">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-cyan-200"><ServerCog className="h-4 w-4" /> Produksjonskontroll</div>
          <h2 className="mt-2 text-xl font-black">Stripe, Vercel, Hostinger og publisering</h2>
          <p className="mt-1 text-sm text-slate-400">Aktiv API-kontroll uten å vise nøkler eller hemmeligheter.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-600 px-4 text-sm font-bold text-slate-200 hover:bg-white/5 disabled:opacity-50">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Kontroller nå
        </button>
      </div>
      {error && <div className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div>}
      {data && (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Status label="Stripe API" check={data.stripe} />
            <Status label="Vercel prosjekt/domener" check={data.vercel} />
            <Status label="Hostinger DNS" check={data.hostinger} />
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><strong className="text-white">Stripe-webhook</strong><p className="mt-1 text-slate-400">{data.stripe.webhook_configured ? "Konfigurert" : "Mangler"}</p></div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><strong className="text-white">Automatiske subdomener</strong><p className="mt-1 text-slate-400">{data.domains.automatic_subdomains_ready ? "Klart" : "Ikke klart"}</p></div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><strong className="text-white">Betaling → publisering</strong><p className="mt-1 text-slate-400">{data.history.end_to_end_proven ? "Bekreftet i historikken" : "Ikke testet med gjennomført betaling ennå"}</p></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Betalinger registrert: {data.history.successful_payment_events} · publiseringer: {data.history.published_events}</p>
        </>
      )}
    </section>
  );
}

function DomainManager({ orderId }: { orderId: string }) {
  const [data, setData] = useState<DomainResponse | null>(null);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/saas/demosites/custom-domain?order_id=${encodeURIComponent(orderId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Kunne ikke hente domeneoppsettet.");
      setData(body);
      setDomain(body.custom_domain || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kunne ikke hente domeneoppsettet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => void load(), [orderId]);

  async function connect() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/saas/demosites/custom-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, custom_domain: domain }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Kunne ikke koble domenet.");
      setMessage(body.domain?.configured ? "Domenet er koblet til og aktivt." : "Domenet er lagt til. Legg inn DNS-postene nedenfor og kontroller igjen.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kunne ikke koble domenet.");
    } finally {
      setSaving(false);
    }
  }

  const records = data?.domain?.dnsRecords || [];
  return (
    <section className="mb-6 rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-500/10 via-slate-900/90 to-cyan-500/10 p-5 text-white">
      <div className="flex items-center gap-2 text-sm font-bold text-teal-200"><Globe2 className="h-4 w-4" /> Kundens eget domene</div>
      <h2 className="mt-2 text-xl font-black">Vis nettsiden på kundens normale URL</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Skriv inn domenet som skal stå i adressefeltet, helst <strong>www.bedriften.no</strong>. Dette er direkte DNS-routing med SSL – ikke cloaking, iframe eller maskering.</p>
      {loading ? <Loader2 className="mt-4 h-5 w-5 animate-spin text-teal-200" /> : (
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="www.bedriften.no" className="h-11 rounded-xl border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-teal-400" />
          <button type="button" onClick={connect} disabled={saving || !domain.trim()} className="inline-flex h-11 items-center justify-center rounded-xl bg-teal-500 px-5 text-sm font-black text-slate-950 hover:bg-teal-400 disabled:opacity-50">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe2 className="mr-2 h-4 w-4" />} Koble domene
          </button>
        </div>
      )}
      {data?.status && data.status !== "deployed" && <p className="mt-3 text-xs text-amber-200">Domenet kan kobles til når Stripe-betalingen er bekreftet og siden har status publisert.</p>}
      {message && <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div>}
      {error && <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div>}
      {records.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-700">
          <div className="grid grid-cols-[70px_90px_minmax(0,1fr)] bg-slate-950 px-3 py-2 text-xs font-bold text-slate-400"><span>Type</span><span>Navn</span><span>Verdi</span></div>
          {records.map((record, index) => <div key={`${record.type}-${record.name}-${index}`} className="grid grid-cols-[70px_90px_minmax(0,1fr)] border-t border-slate-700 bg-slate-900/60 px-3 py-3 text-xs"><span>{record.type}</span><span>{record.name}</span><code className="break-all text-teal-200">{record.value}</code></div>)}
        </div>
      )}
      {data?.production_url && <a href={data.production_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center text-sm font-bold text-teal-200 hover:text-teal-100">Åpne aktiv nettside <ExternalLink className="ml-2 h-4 w-4" /></a>}
    </section>
  );
}

export function DemoSitesOperations() {
  const pathname = usePathname();
  const orderId = useMemo(() => pathname.match(/\/demosites\/setup\/([^/?#]+)/)?.[1] || "", [pathname]);
  if (pathname === "/demosites" || pathname === "/demosites/") return <InfrastructurePanel />;
  if (orderId) return <DomainManager orderId={orderId} />;
  return null;
}
