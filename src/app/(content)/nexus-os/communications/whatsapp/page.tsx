"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type ReadinessCheck = {
  id: string;
  label: string;
  ok: boolean;
  required: boolean;
  detail: string;
};

type ReadinessPayload = {
  generatedAt: string;
  readiness: {
    status: "READY" | "PARTIAL" | "BLOCKED";
    inboundReady: boolean;
    outboundReady: boolean;
    autoReplyEnabled: boolean;
    checks: ReadinessCheck[];
    missingRequired: string[];
    missingOptional: string[];
  };
};

type RuntimePayload = {
  generatedAt: string;
  sourceHealthy: boolean;
  sourceErrors: string[];
  health: {
    status?: string;
    lastWebhookAt?: string | null;
    webhookRuns24h?: number;
    webhookFailures24h?: number;
    webhookPartial24h?: number;
    persistedMessages24h?: number;
    unresolvedReferrals?: number;
    overdueWhatsAppWorkItems?: number;
  };
};

function statusClasses(status: string) {
  if (status === "READY") return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (status === "PARTIAL") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-rose-300 bg-rose-50 text-rose-950";
}

function fmt(value?: string | null) {
  if (!value) return "Ingen";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("nb-NO");
}

export default function WhatsAppReadinessPage() {
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null);
  const [runtime, setRuntime] = useState<RuntimePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [readinessRes, runtimeRes] = await Promise.all([
        fetch("/api/nexus/whatsapp/readiness", { cache: "no-store" }),
        fetch("/api/nexus/whatsapp/runtime-health", { cache: "no-store" }),
      ]);
      const readinessBody = await readinessRes.json().catch(() => ({}));
      const runtimeBody = await runtimeRes.json().catch(() => ({}));
      if (!readinessRes.ok) throw new Error(readinessBody?.error || `Readiness HTTP ${readinessRes.status}`);
      if (!runtimeRes.ok) throw new Error(runtimeBody?.error || `Runtime HTTP ${runtimeRes.status}`);
      setReadiness(readinessBody);
      setRuntime(runtimeBody);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const state = readiness?.readiness;
  const missing = state?.checks.filter((check) => !check.ok) || [];

  return <div className="mx-auto max-w-[1400px] space-y-6 p-4 text-slate-950 sm:p-6">
    <header className="rounded-3xl border border-emerald-800 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl">
      <div className="text-xs font-black uppercase tracking-[.22em] text-emerald-200">Nexus OS · WhatsApp</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">WhatsApp Readiness</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-200">
            Her ser du hvorfor «WhatsApp lead capture» er blokkert, hvilke deler som mangler og om webhooken faktisk har mottatt meldinger.
            Ingen hemmelige nøkler vises i denne flaten.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">
          {loading ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 inline h-4 w-4" />}
          Oppdater
        </button>
      </div>
    </header>

    {error && <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-950">
      <AlertTriangle className="mr-2 inline h-4 w-4" />{error}
    </div>}

    {state && <section className={`rounded-2xl border p-5 shadow-sm ${statusClasses(state.status)}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wider">Samlet status</div>
          <div className="mt-1 text-2xl font-black">{state.status}</div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center text-xs font-bold">
          <div className="rounded-xl bg-white/70 px-3 py-2"><div>Inbound</div><div className="mt-1">{state.inboundReady ? "KLAR" : "BLOKKERT"}</div></div>
          <div className="rounded-xl bg-white/70 px-3 py-2"><div>Outbound</div><div className="mt-1">{state.outboundReady ? "KLAR" : "IKKE KLAR"}</div></div>
          <div className="rounded-xl bg-white/70 px-3 py-2"><div>Auto-reply</div><div className="mt-1">{state.autoReplyEnabled ? "PÅ" : "AV"}</div></div>
        </div>
      </div>
    </section>}

    <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-black">Konfigurasjon</h2>
      <p className="mt-1 text-sm text-slate-600">
        Inbound krever webhook verify token, Meta app secret og kobling mellom WhatsApp-telefonnummer og riktig RealtyFlow-brand.
        Access token og Graph-versjon kreves først når automatisk utgående svar er aktivert.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(state?.checks || []).map((check) => <article key={check.id}
          className={`rounded-xl border p-4 ${check.ok ? "border-emerald-200 bg-emerald-50" : check.required ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-start gap-3">
            {check.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${check.required ? "text-rose-700" : "text-amber-700"}`} />}
            <div>
              <div className="font-black">{check.label}</div>
              <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{check.required ? "Påkrevd" : "Valgfri nå"} · {check.ok ? "OK" : "Mangler"}</div>
              <p className="mt-2 text-sm leading-6 text-slate-700">{check.detail}</p>
            </div>
          </div>
        </article>)}
      </div>
    </section>

    {missing.length > 0 && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
      <h2 className="text-lg font-black text-amber-950">Neste handling</h2>
      <p className="mt-2 text-sm leading-6 text-amber-950">
        Legg inn de manglende WhatsApp/Meta-verdiene i produksjonsmiljøet og konfigurer Meta webhook til
        <code className="mx-1 rounded bg-white px-1.5 py-0.5">/api/integrations/whatsapp/meta</code>.
        Når Meta-verifiseringen er fullført, trykker du «Oppdater» her. Alerten forsvinner automatisk når inbound er klar.
      </p>
      <div className="mt-3 text-sm font-semibold text-amber-950">Mangler nå: {missing.map((item) => item.label).join(", ")}.</div>
    </section>}

    <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-800" /><h2 className="text-xl font-black">Runtime siste 24 timer</h2></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Siste webhook", fmt(runtime?.health?.lastWebhookAt)],
          ["Webhook-kjøringer", runtime?.health?.webhookRuns24h ?? 0],
          ["Lagrede meldinger", runtime?.health?.persistedMessages24h ?? 0],
          ["Uavklarte referrals", runtime?.health?.unresolvedReferrals ?? 0],
        ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase text-slate-500">{label}</div>
          <div className="mt-2 text-lg font-black text-slate-950">{String(value)}</div>
        </div>)}
      </div>
      {runtime && !runtime.sourceHealthy && <p className="mt-4 text-sm font-semibold text-rose-700">Runtime-data har kildefeil: {runtime.sourceErrors.join(" · ")}</p>}
    </section>
  </div>;
}
