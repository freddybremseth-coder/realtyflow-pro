"use client";

import { useEffect, useMemo, useState } from "react";

type Bucket = "1-10" | "11-20" | "21-50" | "51+";
type Row = { query: string; page: string; clicks: number; impressions: number; ctr: number; position: number; bucket: Bucket };
type Inventory = {
  collectedAt: string; period: { start: string; end: string };
  rows: Row[]; bucketCounts: Record<Bucket, number>;
  dataQuality: { truncated: boolean; sampled: boolean; note: string };
};
const buckets: Array<Bucket | "all"> = ["all", "1-10", "11-20", "21-50", "51+"];
const fmt = (value: number) => new Intl.NumberFormat("nb-NO").format(value);

export function VisibilityGoogleRankings({ brandId }: { brandId: string }) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bucket, setBucket] = useState<Bucket | "all">("all");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setInventory(null); setError(null); setLoading(true); setBucket("all"); setQuery(""); setOffset(0);
    fetch("/api/agents/seo-search-console?brand=" + encodeURIComponent(brandId) + "&view=rankings", {
      cache: "no-store", credentials: "same-origin", signal: controller.signal,
    }).then(async response => {
      const data = await response.json() as { inventory?: Inventory; error?: string };
      if (!response.ok || !data.inventory) throw new Error(data.error || "Kunne ikke hente Google-rangeringer.");
      return data.inventory;
    }).then(setInventory).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Ukjent feil");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [brandId, revision]);
  const filtered = useMemo(() => (inventory?.rows || []).filter(row =>
    (bucket === "all" || row.bucket === bucket) &&
    (row.query.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
      row.page.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  ), [inventory, bucket, query]);
  const displayed = filtered.slice(offset, offset + 50);
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-label="Google-rangeringer">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-bold text-slate-950">Google-rangeringer · 90 dager</h3>
        <p className="mt-1 text-sm text-slate-600">Faktiske Search Console-observasjoner. Posisjon er gjennomsnitt i Google, ikke garantert plass i et bestemt søk.</p>
      </div>
      <button type="button" onClick={() => setRevision(n => n + 1)} disabled={loading}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50">Oppdater måling</button>
    </div>
    {loading && <p role="status" className="mt-4 text-sm">Henter målinger fra Google …</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    {inventory && <>
      <p className="mt-3 text-xs text-slate-500">Periode: {inventory.period.start}–{inventory.period.end} · hentet {new Date(inventory.collectedAt).toLocaleString("nb-NO")}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        {buckets.map(b => <button key={b} type="button" aria-pressed={bucket === b}
          onClick={() => { setBucket(b); setOffset(0); }}
          className={"rounded-xl border px-3 py-3 text-left text-sm " + (bucket === b ? "border-teal-500 bg-teal-50" : "border-slate-200")}>
          <span className="block font-semibold">{b === "all" ? "Alle" : b}</span>
          <strong className="mt-1 block text-xl">{fmt(b === "all" ? inventory.rows.length : inventory.bucketCounts[b])}</strong>
        </button>)}
      </div>
      <label htmlFor="visibility-ranking-search" className="mt-4 block text-xs font-semibold text-slate-700">Søk etter søkeord eller landingsside</label>
      <input id="visibility-ranking-search" value={query} onChange={event => { setQuery(event.target.value); setOffset(0); }}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="For eksempel Finestrat, boligkjøp, guide …"/>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs text-slate-600"><tr>
            <th scope="col" className="p-2">Søkeord / side</th><th scope="col" className="p-2 text-right">Posisjon</th>
            <th scope="col" className="p-2 text-right">Visninger</th><th scope="col" className="p-2 text-right">Klikk</th>
            <th scope="col" className="p-2 text-right">CTR</th>
          </tr></thead>
          <tbody>{displayed.map((row, index) => <tr key={row.query + "|" + row.page + "|" + index} className="border-b border-slate-100">
            <td className="p-2"><div className="font-medium text-slate-900">{row.query}</div><div className="max-w-sm truncate text-xs text-slate-500" title={row.page}>{row.page}</div></td>
            <td className="p-2 text-right tabular-nums">{row.position.toFixed(1)}</td>
            <td className="p-2 text-right tabular-nums">{fmt(row.impressions)}</td>
            <td className="p-2 text-right tabular-nums">{fmt(row.clicks)}</td>
            <td className="p-2 text-right tabular-nums">{(row.ctr * 100).toFixed(1)} %</td>
          </tr>)}</tbody>
        </table>
        {!displayed.length && <p className="py-5 text-sm text-slate-500">Ingen treff for filtrene.</p>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600">
        <span>Viser {filtered.length ? offset + 1 : 0}–{Math.min(offset + 50, filtered.length)} av {fmt(filtered.length)} registrerte kombinasjoner</span>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - 50))}>Forrige</button>
          <button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={offset + 50 >= filtered.length} onClick={() => setOffset(n => n + 50)}>Neste</button>
        </div>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">{inventory.dataQuality.note} {inventory.dataQuality.truncated ? "Uttrekket nådde grensen på 10 000 rader; listen er ufullstendig." : ""}</p>
    </>}
  </section>;
}
