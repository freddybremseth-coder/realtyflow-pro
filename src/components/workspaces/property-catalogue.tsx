"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Search } from "lucide-react";

type Property = {
  id: string;
  ref: string | null;
  title: string | null;
  town: string | null;
  location: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_m2: number | null;
  plot_size: number | null;
  property_type: string | null;
};
const price = (value: number | null) => value == null
  ? "Pris på forespørsel"
  : new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

export function WorkspacePropertyCatalogue({ brandKey }: { brandKey: string }) {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Property[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const abort = new AbortController();
    setBusy(true); setError("");
    fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/properties?page=${page}&q=${encodeURIComponent(query)}`,
      { cache: "no-store", signal: abort.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(
          res.status === 403 ? "Du har ikke tilgang til eiendomskatalogen i dette arbeidsområdet."
            : "Eiendomskatalogen er ikke tilgjengelig ennå.");
        return body;
      })
      .then((body) => {
        setItems(Array.isArray(body.properties) ? body.properties : []);
        setHasMore(body.hasMore === true);
      })
      .catch((cause) => {
        if (!abort.signal.aborted) {
          setItems([]); setHasMore(false);
          setError(cause instanceof Error ? cause.message : "Kunne ikke laste.");
        }
      })
      .finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [brandKey, page, query]);

  return (
    <section className="space-y-5">
      <div><h2 className="text-xl font-semibold">Eiendommer · offentlig katalog</h2>
        <p className="mt-1 text-sm text-slate-400">Søk i publiserte boliger på tvers av områder. Interne opplysninger, upubliserte boliger og redigering er ikke tilgjengelig her ennå.</p></div>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(term.trim()); }}>
        <label className="relative flex-1"><Search className="absolute left-3 top-3 text-slate-500" size={18} />
          <input value={term} maxLength={80} onChange={(event) => setTerm(event.target.value)}
            placeholder="By, bolig, referanse…" className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-10 pr-3 text-sm" />
        </label>
        <button type="submit" className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">Søk</button>
      </form>
      {busy && <p className="text-sm text-slate-400">Laster boliger…</p>}
      {error && <p role="alert" className="rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-amber-100">{error}</p>}
      {!busy && !error && <div className="grid gap-3 md:grid-cols-2">
        {items.map(item => <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-start gap-3"><Building2 size={22} className="mt-1 shrink-0 text-cyan-400" />
            <div><h3 className="font-semibold">{item.title || item.property_type || "Bolig"}</h3>
              <p className="text-xs text-slate-400">{item.town || item.location || "Ukjent område"} · {item.ref || "Uten referanse"}</p></div></div>
          <p className="mt-3 text-lg font-semibold text-cyan-300">{price(item.price)}</p>
          <p className="mt-1 text-sm text-slate-300">{item.bedrooms ?? "–"} soverom · {item.bathrooms ?? "–"} bad · {item.area_m2 ?? "–"} m² bolig{item.plot_size != null ? ` · ${item.plot_size} m² tomt` : ""}</p>
        </article>)}
        {items.length === 0 && <p className="text-sm text-slate-400">Ingen publiserte boliger ble funnet for søket.</p>}
      </div>}
      {!error && !busy && <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40"><ChevronLeft size={16} /> Forrige</button>
        <span className="text-xs text-slate-400">Side {page}</span>
        <button type="button" onClick={() => setPage(p => p + 1)} disabled={!hasMore || page >= 100}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">Neste <ChevronRight size={16} /></button>
      </div>}
    </section>
  );
}
