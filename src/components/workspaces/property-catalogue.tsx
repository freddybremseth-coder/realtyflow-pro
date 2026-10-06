"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Clapperboard, Search, Sparkles } from "lucide-react";

export type WorkspacePropertyCard = {
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
  primary_image: string | null;
  source: string | null;
  pool: boolean | null;
  marketable_by_brands: string[];
  can_market_on_workspace_brand: boolean;
};

type PropertyFilters = {
  q: string;
  area: string;
  type: string;
  priceMin: string;
  priceMax: string;
  bedroomsMin: string;
  bathroomsMin: string;
  pool: "any" | "true" | "false";
  areaMin: string;
  plotMin: string;
  sort: "newest" | "price_asc" | "price_desc" | "area_desc";
};

const emptyFilters: PropertyFilters = {
  q: "", area: "", type: "", priceMin: "", priceMax: "",
  bedroomsMin: "", bathroomsMin: "", pool: "any", areaMin: "", plotMin: "", sort: "newest",
};

const suggestedTypes = [
  "Villa", "Leilighet", "Penthouse", "Bungalow", "Rekkehus",
  "Ground floor apartment", "Semidetached", "Ground Floor Bungalow",
  "Quad House", "Top Floor Bungalow", "Studio",
];

const price = (value: number | null) => value == null
  ? "Pris på forespørsel"
  : new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

export function WorkspacePropertyCatalogue({
  brandKey,
  canCreateMarketing = false,
  canCreateReel = false,
  onCreateSocial,
  onCreateReel,
}: {
  brandKey: string;
  canCreateMarketing?: boolean;
  canCreateReel?: boolean;
  onCreateSocial?: (property: WorkspacePropertyCard) => void;
  onCreateReel?: (property: WorkspacePropertyCard) => void;
}) {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<WorkspacePropertyCard[]>([]);
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
      <div><h2 className="text-xl font-semibold">Eiendommer · felles katalog</h2>
        <p className="mt-1 text-sm text-slate-400">Søk i hele den ordinære offentlige boligkatalogen på tvers av områder. Du kan bruke alle treff til kundematching; innhold og Reels kan bare lages når valgt merkevare faktisk kan markedsføre boligen.</p></div>
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
        {items.map(item => {
          const canMarketHere = item.can_market_on_workspace_brand;
          return <article key={item.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
          {item.primary_image && <div className="relative">
            <img src={item.primary_image} alt="" className="aspect-video w-full object-cover" />
            {item.ref && <span className="absolute left-3 top-3 rounded-md border border-slate-500/60 bg-slate-950/80 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">Ref {item.ref}</span>}
          </div>}
          <div className="p-4">
            <div className="flex items-start gap-3"><Building2 size={22} className="mt-1 shrink-0 text-cyan-400" />
              <div><h3 className="font-semibold">{item.title || item.property_type || "Bolig"}</h3>
                <p className="text-xs text-slate-400">{item.town || item.location || "Ukjent område"} · {item.ref || "Uten referanse"}</p></div></div>
            <p className="mt-3 text-lg font-semibold text-cyan-300">{price(item.price)}</p>
            <p className="mt-1 text-sm text-slate-300">{item.bedrooms ?? "–"} soverom · {item.bathrooms ?? "–"} bad · {item.area_m2 ?? "–"} m² bolig{item.plot_size != null ? ` · ${item.plot_size} m² tomt` : ""}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
              {item.source && <span className="rounded-full border border-slate-700 px-2 py-1">Kilde: {item.source}</span>}
              <span className={canMarketHere
                ? "rounded-full border border-emerald-800 bg-emerald-950/30 px-2 py-1 text-emerald-300"
                : "rounded-full border border-amber-800 bg-amber-950/30 px-2 py-1 text-amber-300"}>
                {canMarketHere ? "Kan markedsføres i denne merkevaren" : "Kun matching i denne merkevaren"}
              </span>
              {item.marketable_by_brands.length > 0 && <span className="rounded-full border border-slate-700 px-2 py-1">
                Markedsføres av: {item.marketable_by_brands.join(", ")}
              </span>}
            </div>
            {canMarketHere && ((canCreateMarketing && onCreateSocial) || (canCreateReel && onCreateReel)) && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
              {canCreateMarketing && onCreateSocial && <button type="button"
                onClick={() => onCreateSocial(item)}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-800 px-3 py-2 text-xs text-cyan-200">
                <Sparkles size={14}/> Lag SoMe · 3 forslag
              </button>}
              {canCreateReel && onCreateReel && <button type="button" onClick={() => onCreateReel(item)}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-800 px-3 py-2 text-xs text-cyan-200">
                <Clapperboard size={14}/> Lag Reel fra boligen
              </button>}
            </div>}
          </div>
        </article>})}
        {items.length === 0 && <p className="text-sm text-slate-400">Ingen tilgjengelige boliger ble funnet for søket.</p>}
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
