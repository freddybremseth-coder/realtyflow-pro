"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2, ChevronLeft, ChevronRight, Clapperboard, Sparkles,
  Filter, RotateCcw, Search, SlidersHorizontal,
} from "lucide-react";

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

function activeFilterCount(filters: PropertyFilters) {
  return [
    filters.q, filters.area, filters.type, filters.priceMin, filters.priceMax,
    filters.bedroomsMin, filters.bathroomsMin, filters.areaMin, filters.plotMin,
    filters.pool !== "any" ? filters.pool : "",
    filters.sort !== "newest" ? filters.sort : "",
  ].filter(Boolean).length;
}

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
  const [draft, setDraft] = useState<PropertyFilters>(emptyFilters);
  const [filters, setFilters] = useState<PropertyFilters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(true);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<WorkspacePropertyCard[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [matchedCount, setMatchedCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  const activeCount = useMemo(() => activeFilterCount(filters), [filters]);

  useEffect(() => {
    const abort = new AbortController();
    setBusy(true); setError("");
    const params = new URLSearchParams({ page: String(page) });
    for (const [key, value] of Object.entries(filters)) {
      if (!value || value === "any" || (key === "sort" && value === "newest")) continue;
      params.set(key, value);
    }
    fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/properties?${params.toString()}`,
      { cache: "no-store", signal: abort.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(
          res.status === 403 ? "Du har ikke tilgang til eiendomskatalogen i dette arbeidsområdet."
            : res.status === 400 ? "Kontroller filtrene og prøv igjen."
            : "Eiendomskatalogen er ikke tilgjengelig ennå.");
        return body;
      })
      .then((body) => {
        setItems(Array.isArray(body.properties) ? body.properties : []);
        setHasMore(body.hasMore === true);
        setMatchedCount(body.matchedCount != null && Number.isFinite(Number(body.matchedCount)) ? Number(body.matchedCount) : null);
      })
      .catch((cause) => {
        if (!abort.signal.aborted) {
          setItems([]); setHasMore(false); setMatchedCount(null);
          setError(cause instanceof Error ? cause.message : "Kunne ikke laste.");
        }
      })
      .finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [brandKey, page, filters]);

  function updateFilter<K extends keyof PropertyFilters>(key: K, value: PropertyFilters[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setPage(1);
    setFilters({ ...draft });
  }

  function clearFilters() {
    setPage(1);
    setDraft(emptyFilters);
    setFilters(emptyFilters);
  }


  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Eiendommer · felles katalog</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Fullt søk i den offentlige boligkatalogen med filter på område, boligtype, pris, soverom, bad,
            basseng, boligareal og tomtestørrelse. Alle treff kan brukes til kundematching; markedsføring følger fortsatt merkevarens synlighetsregler.
          </p>
        </div>
        <button type="button" onClick={() => setShowFilters(value => !value)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
          <SlidersHorizontal size={16}/>{showFilters ? "Skjul filtre" : "Vis filtre"}
          {activeCount > 0 && <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-200">{activeCount}</span>}
        </button>
      </div>


      <form className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
        onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-3 text-slate-500" size={18} />
            <input value={draft.q} maxLength={80} onChange={(event) => updateFilter("q", event.target.value)}
              placeholder="Søk på referanse, navn, by eller sted…"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm" />
          </label>
          <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">
            <Filter size={16}/> Søk
          </button>
        </div>

        {showFilters && <div className="mt-4 border-t border-slate-800 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-slate-400">Område / by
              <input value={draft.area} maxLength={80} onChange={event => updateFilter("area", event.target.value)}
                placeholder="F.eks. Altea, Finestrat, Pinoso"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"/>
            </label>
            <label className="text-xs text-slate-400">Boligtype
              <input list="workspace-property-types" value={draft.type} maxLength={80}
                onChange={event => updateFilter("type", event.target.value)}
                placeholder="Alle boligtyper"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"/>
              <datalist id="workspace-property-types">
                {suggestedTypes.map(type => <option value={type} key={type}/>)}
              </datalist>
            </label>
            <label className="text-xs text-slate-400">Pris fra €
              <input inputMode="numeric" value={draft.priceMin} onChange={event => updateFilter("priceMin", event.target.value)}
                placeholder="250000"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"/>
            </label>
            <label className="text-xs text-slate-400">Pris til €
              <input inputMode="numeric" value={draft.priceMax} onChange={event => updateFilter("priceMax", event.target.value)}
                placeholder="750000"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"/>
            </label>
            <label className="text-xs text-slate-400">Min. soverom
              <select value={draft.bedroomsMin} onChange={event => updateFilter("bedroomsMin", event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <option value="">Alle</option>{[1,2,3,4,5,6].map(value => <option key={value} value={value}>{value}+</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400">Min. bad
              <select value={draft.bathroomsMin} onChange={event => updateFilter("bathroomsMin", event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <option value="">Alle</option>{[1,2,3,4,5].map(value => <option key={value} value={value}>{value}+</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400">Basseng
              <select value={draft.pool} onChange={event => updateFilter("pool", event.target.value as PropertyFilters["pool"])}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <option value="any">Alle</option><option value="true">Ja</option><option value="false">Nei</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">Min. boligareal m²
              <input inputMode="numeric" value={draft.areaMin} onChange={event => updateFilter("areaMin", event.target.value)}
                placeholder="100"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"/>
            </label>
            <label className="text-xs text-slate-400">Min. tomt m²
              <input inputMode="numeric" value={draft.plotMin} onChange={event => updateFilter("plotMin", event.target.value)}
                placeholder="500"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"/>
            </label>
            <label className="text-xs text-slate-400">Sorter
              <select value={draft.sort} onChange={event => updateFilter("sort", event.target.value as PropertyFilters["sort"])}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <option value="newest">Nyeste først</option>
                <option value="price_asc">Lavest pris</option>
                <option value="price_desc">Høyest pris</option>
                <option value="area_desc">Størst boligareal</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white">Bruk filtre</button>
            <button type="button" onClick={clearFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
              <RotateCcw size={14}/> Nullstill
            </button>
          </div>
        </div>}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>{matchedCount != null ? `${matchedCount.toLocaleString("nb-NO")} boliger matcher` : "Viser tilgjengelige boliger"}</span>
        {activeCount > 0 && <span>{activeCount} aktive filter</span>}
      </div>

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
              <div className="flex items-start gap-3">
                <Building2 size={22} className="mt-1 shrink-0 text-cyan-400" />
                <div>
                  <h3 className="font-semibold">{item.title || item.property_type || "Bolig"}</h3>
                  <p className="text-xs text-slate-400">{item.town || item.location || "Ukjent område"} · {item.ref || "Uten referanse"}</p>
                </div>
              </div>
              <p className="mt-3 text-lg font-semibold text-cyan-300">{price(item.price)}</p>
              <p className="mt-1 text-sm text-slate-300">
                {item.bedrooms ?? "–"} soverom · {item.bathrooms ?? "–"} bad · {item.area_m2 ?? "–"} m² bolig
                {item.plot_size != null ? ` · ${item.plot_size} m² tomt` : ""}
                {item.pool === true ? " · Basseng" : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                {item.property_type && <span className="rounded-full border border-slate-700 px-2 py-1">{item.property_type}</span>}
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
          </article>;
        })}
        {items.length === 0 && <p className="rounded-xl border border-dashed border-slate-800 p-5 text-sm text-slate-400">
          Ingen tilgjengelige boliger matcher filtrene. Prøv å utvide pris, område eller boligtype.
        </p>}
      </div>}

      {!error && !busy && <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">
          <ChevronLeft size={16} /> Forrige
        </button>
        <span className="text-xs text-slate-400">Side {page}</span>
        <button type="button" onClick={() => setPage(p => p + 1)} disabled={!hasMore || page >= 100}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">
          Neste <ChevronRight size={16} />
        </button>
      </div>}
    </section>
  );
}
