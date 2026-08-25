"use client";

import { useEffect, useMemo, useState } from "react";
import { OWNED_GROWTH_BRANDS } from "@/lib/marketing/brand-registry";

type Channel = {
  id: string;
  brand_id: string;
  platform: string;
  external_id: string;
  display_name: string;
  has_token: boolean;
  token_expires_at: string | null;
};

type BrandChannels = { brandId: string; channels: Channel[]; error?: string };

const PLATFORMS = ["instagram", "facebook", "youtube"] as const;

type Platform = (typeof PLATFORMS)[number];

function providerLabel(platform: Platform) {
  if (platform === "youtube") return "Google / YouTube";
  return "Meta";
}

export default function ChannelConnectionsPage() {
  const [rows, setRows] = useState<BrandChannels[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await Promise.all(OWNED_GROWTH_BRANDS.map(async (brand) => {
      try {
        const res = await fetch(`/api/oauth/channels?brand_id=${encodeURIComponent(brand.id)}`, { cache: "no-store", credentials: "same-origin" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        return { brandId: brand.id, channels: (body.channels ?? []) as Channel[] };
      } catch (e) {
        return { brandId: brand.id, channels: [], error: e instanceof Error ? e.message : String(e) };
      }
    }));
    setRows(data);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const rowByBrand = useMemo(() => new Map(rows.map((r) => [r.brandId, r])), [rows]);

  const connect = (brandId: string, platform: Platform) => {
    const url = new URL(platform === "youtube" ? "/api/oauth/google" : "/api/oauth/facebook", window.location.origin);
    url.searchParams.set("brand_id", brandId);
    url.searchParams.set("return_to", "/connections");
    if (platform === "youtube") url.searchParams.set("service", "youtube");
    window.location.href = url.toString();
  };

  return <div className="mx-auto max-w-[1500px] space-y-6 p-6">
    <header className="rounded-3xl border border-cyan-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-7 text-white shadow-xl">
      <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Nexus OS · Connections</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Channel Connections</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Én enkel plass for å koble YouTube, Facebook og Instagram til riktig brand. RealtyFlow håndterer brand-binding, tokenlagring og kanalvalg. Google/Meta kan fortsatt kreve sin egen sikre samtykkeskjerm.</p>
        </div>
        <button onClick={load} disabled={loading} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{loading ? "Oppdaterer…" : "Oppdater status"}</button>
      </div>
    </header>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-xl font-black text-slate-900">Brands & kanaler</h2>
        <p className="mt-1 text-sm text-slate-500">Instagram kobles via Meta/Facebook Page. Én Meta-tilkobling kan derfor opprette både Facebook og den linkede Instagram Business-kontoen.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="p-4">Brand</th>{PLATFORMS.map((p) => <th key={p} className="p-4">{p}</th>)}<th className="p-4">Plan</th></tr>
          </thead>
          <tbody>{OWNED_GROWTH_BRANDS.map((brand) => {
            const state = rowByBrand.get(brand.id);
            return <tr key={brand.id} className="border-t border-slate-100 align-top">
              <td className="p-4">
                <div className="font-black text-slate-900">{brand.name}</div>
                <a href={brand.website} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-bold text-cyan-700">{brand.website.replace(/^https?:\/\//, "")}</a>
                {state?.error && <div className="mt-2 text-xs text-rose-600">{state.error}</div>}
              </td>
              {PLATFORMS.map((platform) => {
                const matches = (state?.channels ?? []).filter((c) => c.platform === platform);
                const connected = matches.length > 0;
                return <td key={platform} className="p-4">
                  {connected ? <div>
                    <div className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase text-emerald-800">Connected</div>
                    {matches.map((c) => <div key={c.id} className="mt-2 text-xs text-slate-700"><b>{c.display_name}</b><div className="text-slate-400">{c.external_id}</div></div>)}
                    <button onClick={() => connect(brand.id, platform)} className="mt-3 text-xs font-bold text-cyan-700">Koble på nytt</button>
                  </div> : <div>
                    <div className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">Not connected</div>
                    <button onClick={() => connect(brand.id, platform)} className="mt-3 block rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white">Koble {providerLabel(platform)}</button>
                  </div>}
                </td>;
              })}
              <td className="p-4 text-xs text-slate-600"><div className="font-bold text-slate-800">{brand.plannedChannels.join(" · ")}</div><div className="mt-2">{brand.notes}</div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>

    <section className="grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4"><b>1. Velg brand</b><div className="mt-1 text-sm text-slate-500">Ingen global konto. Hver kanal bindes eksplisitt til riktig merkevare.</div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><b>2. Trykk Koble</b><div className="mt-1 text-sm text-slate-500">RealtyFlow starter riktig Google- eller Meta-flow og sender deg tilbake hit.</div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><b>3. Nexus tar over</b><div className="mt-1 text-sm text-slate-500">Etter tilkobling kan Growth OS bruke kanalen med approval, måling og læring.</div></div>
    </section>
  </div>;
}
