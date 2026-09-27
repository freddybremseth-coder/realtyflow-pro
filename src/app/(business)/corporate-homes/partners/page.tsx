"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, Handshake, Loader2, Mail, RefreshCw, Search } from "lucide-react";

type OutreachDraft = {
  key: string;
  dayOffset: number;
  subject: string;
  body: string;
};

type Partner = {
  id: string;
  company_name: string;
  organization_number?: string | null;
  domain?: string | null;
  partner_type: string;
  city?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  status: string;
  fit_score: number;
  fit_tier: string;
  fit_reasons: string[];
  evidence_gaps: string[];
  referral_angle?: string | null;
  source_url?: string | null;
  next_action?: string | null;
  updated_at?: string | null;
};

const typeLabel: Record<string, string> = {
  accounting_tax: "Regnskap / skatt",
  legal: "Juridisk",
  management_consulting: "Bedriftsrådgivning",
  hr_recruitment: "HR / rekruttering",
  business_membership: "Nærings- / medlemsorganisasjon",
  corporate_travel: "Bedriftsreise",
  wealth_advisory: "Finansiell rådgivning",
  other: "Annet",
};

export default function CorporatePartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [draftsByPartner, setDraftsByPartner] = useState<Record<string, OutreachDraft[]>>({});
  const [draftLoadingId, setDraftLoadingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/partners", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente partnerkøen.");
      setPartners(body?.partners || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente partnerkøen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return partners.filter((partner) => {
      if (type !== "all" && partner.partner_type !== type) return false;
      if (!normalized) return true;
      return [
        partner.company_name,
        partner.industry,
        partner.city,
        partner.organization_number,
        partner.referral_angle,
      ].filter(Boolean).join(" ").toLowerCase().includes(normalized);
    });
  }, [partners, query, type]);

  async function loadDrafts(partnerId: string) {
    if (draftsByPartner[partnerId]) {
      setDraftsByPartner((current) => {
        const next = { ...current };
        delete next[partnerId];
        return next;
      });
      return;
    }

    setDraftLoadingId(partnerId);
    setError("");
    try {
      const response = await fetch(`/api/corporate-homes/partners/${encodeURIComponent(partnerId)}/outreach-drafts`, {
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente e-postutkast.");
      setDraftsByPartner((current) => ({ ...current, [partnerId]: body?.drafts || [] }));
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : "Kunne ikke hente e-postutkast.");
    } finally {
      setDraftLoadingId(null);
    }
  }

  async function copyDraft(partnerId: string, draft: OutreachDraft) {
    const value = `Emne: ${draft.subject}\n\n${draft.body}`;
    await navigator.clipboard.writeText(value);
    const key = `${partnerId}:${draft.key}`;
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((current) => current === key ? "" : current), 1800);
  }

  async function discover() {
    setDiscovering(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/corporate-homes/partners/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke kjøre partnerdiscovery.");
      const result = body?.result || {};
      setNotice(result?.reason === "target_reached"
        ? "Målet på 100 partnerbedrifter er nådd."
        : `${Number(result?.created || 0)} nye partnerbedrifter ble lagt til.`);
      await load();
    } catch (discoverError) {
      setError(discoverError instanceof Error ? discoverError.message : "Kunne ikke kjøre partnerdiscovery.");
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1550px] space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link href="/corporate-homes" className="inline-flex items-center gap-1 text-xs font-black text-cyan-800 hover:underline">
              <ArrowLeft size={13} /> Corporate Homes
            </Link>
            <div className="mt-4 flex items-center gap-2 text-sm font-black uppercase tracking-[0.13em] text-teal-800">
              <Handshake size={18} /> Partnerkanal
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Henvisningspartnere</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
              Norske virksomheter som kan introdusere Zen Corporate Homes til egne bedriftskunder eller medlemmer.
              Køen inneholder bare offentlig selskapsdata fra Brønnøysundregistrene.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void discover()} disabled={discovering} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50">
              {discovering ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Finn flere
            </button>
            <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Oppdater
            </button>
          </div>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
      {notice && <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{notice}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_300px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Søk på navn, bransje, by eller organisasjonsnummer"
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-900"
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
          >
            <option value="all">Alle partnersegmenter</option>
            {Object.entries(typeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((partner) => (
          <article key={partner.id} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-amber-700">{typeLabel[partner.partner_type] || partner.partner_type}</div>
                <h2 className="mt-1 text-lg font-black text-slate-950">{partner.company_name}</h2>
                <div className="mt-1 text-xs text-slate-500">
                  {[partner.city, partner.employee_count ? `${partner.employee_count} ansatte` : null].filter(Boolean).join(" · ") || "Størrelse/lokasjon må vurderes"}
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${partner.fit_tier === "A" ? "bg-emerald-100 text-emerald-900" : partner.fit_tier === "B" ? "bg-cyan-100 text-cyan-900" : "bg-slate-100 text-slate-700"}`}>
                {partner.fit_tier} · {partner.fit_score}
              </span>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-700">{partner.referral_angle || "Henvisningsvinkel må vurderes."}</p>

            <div className="mt-4 space-y-1.5 text-xs leading-5 text-slate-600">
              {(partner.fit_reasons || []).slice(0, 3).map((reason) => <div key={reason}>✓ {reason}</div>)}
              {(partner.evidence_gaps || []).slice(0, 2).map((gap) => <div key={gap} className="text-amber-800">Mangler: {gap}</div>)}
            </div>

            <div className="mt-auto flex flex-wrap gap-3 pt-5">
              {partner.domain && (
                <a href={partner.domain} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-cyan-800 hover:underline">
                  Nettside <ExternalLink size={12} />
                </a>
              )}
              {partner.source_url && (
                <a href={partner.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-slate-600 hover:underline">
                  Brønnøysund <ExternalLink size={12} />
                </a>
              )}
              <button
                type="button"
                onClick={() => void loadDrafts(partner.id)}
                disabled={draftLoadingId === partner.id}
                className="inline-flex items-center gap-1 text-xs font-black text-amber-800 hover:underline disabled:opacity-50"
              >
                {draftLoadingId === partner.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                {draftsByPartner[partner.id] ? "Skjul utkast" : "Vis e-postutkast"}
              </button>
            </div>

            {draftsByPartner[partner.id]?.length ? (
              <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                  Kun utkast · ingen automatisk utsendelse
                </div>
                {draftsByPartner[partner.id].map((draft) => {
                  const key = `${partner.id}:${draft.key}`;
                  return (
                    <div key={draft.key} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-wide text-teal-800">Dag {draft.dayOffset}</div>
                          <div className="mt-1 text-sm font-black text-slate-950">{draft.subject}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void copyDraft(partner.id, draft)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                        >
                          {copiedKey === key ? <Check size={12} /> : <Copy size={12} />}
                          {copiedKey === key ? "Kopiert" : "Kopier"}
                        </button>
                      </div>
                      <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-5 text-slate-600">{draft.body}</pre>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </article>
        ))}
      </section>

      {!loading && visible.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Ingen partnerbedrifter matcher filteret ennå.
        </div>
      )}

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <strong>Guardrail:</strong> denne køen inneholder ingen personnavn, personlige e-postadresser eller telefonnumre.
        Kontaktpersoner skal først identifiseres eller berikes etter eksplisitt godkjenning.
      </section>
    </div>
  );
}
