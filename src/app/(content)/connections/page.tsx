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
  const totalConnected = rows.reduce((sum, row) => sum + row.channels.length, 0);
  const brandsFullyMeta = rows.filter(row => row.channels.some(c => c.platform === "facebook") && row.channels.some(c => c.platform === "instagram")).length;
  const brandsYoutube = rows.filter(row => row.channels.some(c => c.platform === "youtube")).length;

  const connectMeta = (brandId: string) => {
    const url = new URL("/api/oauth/facebook", window.location.origin);
    url.searchParams.set("brand_id", brandId);
    url.searchParams.set("return_to", "/connections");
    window.location.href = url.toString();
  };

  const connectYoutube = (brandId: string) => {
    const url = new URL("/api/oauth/google", window.location.origin);
    url.searchParams.set("brand_id", brandId);
    url.searchParams.set("return_to", "/connections");
    url.searchParams.set("service", "youtube");
    window.location.href = url.toString();
  };

  return <div className="mx-auto max-w-[1500px] space-y-6 p-6">
    <header className="rounded-3xl border border-cyan-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-7 text-white shadow-xl">
      <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Nexus OS · Connections</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Channel Connections</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">To enkle provider-tilkoblinger per brand: Meta kobler Facebook-siden og linket Instagram Business-konto i samme flow; Google kobler riktig YouTube-kanal. RealtyFlow håndterer brand-binding, tokens og retur til appen.</p>
        </div>
        <button onClick={load} disabled={loading} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{loading ? "Oppdaterer…" : "Oppdater status"}</button>
      </div>
    </header>

    <section className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-black text-slate-500">CONNECTED CHANNELS</div><div className="mt-1 text-3xl font-black">{totalConnected}</div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-black text-slate-500">META COMPLETE</div><div className="mt-1 text-3xl font-black">{brandsFullyMeta}/{OWNED_GROWTH_BRANDS.length}</div><div className="text-xs text-slate-500">brand med både Facebook + Instagram</div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-black text-slate-500">YOUTUBE</div><div className="mt-1 text-3xl font-black">{brandsYoutube}/{OWNED_GROWTH_BRANDS.length}</div><div className="text-xs text-slate-500">brand med YouTube koblet</div></div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-xl font-black text-slate-900">Brands & providers</h2>
        <p className="mt-1 text-sm text-slate-500">Du trenger ikke koble Instagram separat. Meta-flowen finner Facebook Page og linket Instagram Business-konto i samme prosess.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="p-4">Brand</th><th className="p-4">Meta · Facebook + Instagram</th><th className="p-4">Google · YouTube</th><th className="p-4">Growth plan</th></tr>
          </thead>
          <tbody>{OWNED_GROWTH_BRANDS.map((brand) => {
            const state = rowByBrand.get(brand.id);
            const meta = (state?.channels ?? []).filter(c => c.platform === "facebook" || c.platform === "instagram");
            const facebook = meta.filter(c => c.platform === "facebook");
            const instagram = meta.filter(c => c.platform === "instagram");
            const youtube = (state?.channels ?? []).filter(c => c.platform === "youtube");
            return <tr key={brand.id} className="border-t border-slate-100 align-top">
              <td className="p-4">
                <div className="font-black text-slate-900">{brand.name}</div>
                <a href={brand.website} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-bold text-cyan-700">{brand.website.replace(/^https?:\/\//, "")}</a>
                {state?.error && <div className="mt-2 text-xs text-rose-600">{state.error}</div>}
              </td>
              <td className="p-4">
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${facebook.length ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>Facebook {facebook.length ? "✓" : "—"}</span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${instagram.length ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>Instagram {instagram.length ? "✓" : "—"}</span>
                </div>
                {meta.map(c => <div key={c.id} className="mt-2 text-xs text-slate-700"><b>{c.display_name}</b><span className="ml-2 text-slate-400">{c.platform}</span></div>)}
                <button onClick={() => connectMeta(brand.id)} className={`mt-3 rounded-lg px-3 py-2 text-xs font-black ${meta.length ? "border border-slate-300 bg-white text-slate-800" : "bg-blue-700 text-white"}`}>{meta.length ? "Koble Meta på nytt" : "Koble Meta"}</button>
              </td>
              <td className="p-4">
                {youtube.length ? <>{youtube.map(c => <div key={c.id}><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase text-emerald-800">YouTube connected</span><div className="mt-2 text-xs text-slate-700"><b>{c.display_name}</b></div></div>)}</> : <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500">Not connected</span>}
                <button onClick={() => connectYoutube(brand.id)} className={`mt-3 block rounded-lg px-3 py-2 text-xs font-black ${youtube.length ? "border border-slate-300 bg-white text-slate-800" : "bg-red-700 text-white"}`}>{youtube.length ? "Koble YouTube på nytt" : "Koble YouTube"}</button>
              </td>
              <td className="p-4 text-xs text-slate-600"><div className="font-bold text-slate-800">{brand.plannedChannels.join(" · ")}</div><div className="mt-2">{brand.notes}</div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>

    <section className="grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4"><b>1. Velg brand</b><div className="mt-1 text-sm text-slate-500">Hver provider-binding tilhører eksplisitt ett brand.</div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><b>2. Koble provider</b><div className="mt-1 text-sm text-slate-500">Meta én gang for Facebook + Instagram. Google én gang for YouTube.</div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><b>3. Nexus tar over</b><div className="mt-1 text-sm text-slate-500">Etter tilkobling kan Director, publishing, measurement og learning bruke den canonical kanalen.</div></div>
    </section>

    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><b>Canonical:</b> `social_channels + oauth_tokens`. Gamle `social_accounts` brukes ikke lenger til publishing eller engagement tracking og kan ikke lenger skrives gjennom legacy API.</div>
  </div>;
}
