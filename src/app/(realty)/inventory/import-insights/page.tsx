"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
  primary_image: string | null;
  source: string | null;
  pool: boolean | null;
  can_market_on_workspace_brand: boolean;
};
type ResponseBody = { ok: boolean; properties?: Property[]; hasMore?: boolean; matchedCount?: number | null; error?: { code?: string } };
const FIELDS: Array<{ key: keyof Property; label: string; surface: string; criterion: (value: unknown) => boolean }> = [
  { key: "ref", label: "Referanse", surface: "Kort / detalj", criterion: v => typeof v === "string" && !!v.trim() },
  { key: "title", label: "Tittel", surface: "Kort", criterion: v => typeof v === "string" && !!v.trim() },
  { key: "town", label: "By", surface: "Kort", criterion: v => typeof v === "string" && !!v.trim() },
  { key: "location", label: "Område", surface: "Kort", criterion: v => typeof v === "string" && !!v.trim() },
  { key: "price", label: "Pris", surface: "Kort", criterion: v => typeof v === "number" && v > 0 },
  { key: "bedrooms", label: "Soverom", surface: "Kort", criterion: v => typeof v === "number" && v > 0 },
  { key: "bathrooms", label: "Bad", surface: "Kort", criterion: v => typeof v === "number" && v > 0 },
  { key: "area_m2", label: "Boligareal", surface: "Kort", criterion: v => typeof v === "number" && v > 0 },
  { key: "plot_size", label: "Tomtestørrelse", surface: "Pinoso / villa", criterion: v => typeof v === "number" && v > 0 },
  { key: "property_type", label: "Boligtype", surface: "Kort", criterion: v => typeof v === "string" && !!v.trim() },
  { key: "primary_image", label: "Hovedbilde", surface: "Kort", criterion: v => typeof v === "string" && /^https?:\/\//i.test(v) },
  { key: "pool", label: "Basseng", surface: "Detalj / egenskap", criterion: v => typeof v === "boolean" },
];
const MORE_FIELDS = [
  ["source_description", "Full kildebeskrivelse"],
  ["amenities_no", "Fasiliteter"],
  ["floorplans", "Plantegninger"],
  ["floor_label", "Etasje"],
  ["facing_source", "Himmelretning"],
  ["year_built", "Byggeår"],
  ["plot_included_in_price", "Tomt inkludert i pris"],
  ["plot_price_eur", "Tomtepris"],
  ["pricing_source_note", "Prisforbehold"],
  ["energy_rating", "Energiklasse"],
  ["gallery", "Bildegalleri"],
] as const;
const formatCurrency = (value: number | null | undefined) => typeof value === "number" && value > 0
  ? new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value)
  : "Pris ikke oppgitt";

export default function ImportInsightsPage() {
  const [brand, setBrand] = useState<"zeneco" | "pinosoecolife">("zeneco");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ResponseBody | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [variant, setVariant] = useState<"standard" | "compact">("standard");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brand)}/properties?page=${page}&sort=newest`, { cache: "no-store" });
      const body: ResponseBody = await response.json();
      if (!response.ok || !body.ok || !Array.isArray(body.properties)) {
        throw new Error(body.error?.code === "CATALOGUE_ACCESS_REVOKED" ? "Ingen tilgang til denne merkevaren." : "Kunne ikke hente boligkatalogen.");
      }
      setData(body);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Ukjent feil");
    } finally {
      setLoading(false);
    }
  }, [brand, page]);
  useEffect(() => { void load(); }, [load]);

  const properties = data?.properties || [];
  const metrics = useMemo(() => FIELDS.map(field => ({
    ...field,
    count: properties.filter(property => field.criterion(property[field.key])).length,
  })), [properties]);
  const sample = properties.find(property => property.can_market_on_workspace_brand) || properties[0];
  const countText = data?.matchedCount == null ? "Ukjent totalt" : `${data.matchedCount} katalogtreff`;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 text-slate-100">
      <header className="space-y-2">
        <Link href="/inventory" className="text-sm text-cyan-300 hover:underline">← Til eiendommer</Link>
        <h1 className="text-2xl font-semibold">Importdata og boligkort – analyse for Andrea</h1>
        <p className="max-w-4xl text-sm text-slate-400">Lesebasert kontroll av felter i den tilgangsbegrensede boligkatalogen. Tallene gjelder kun den viste siden (inntil 24 boliger), ikke hele importen. Ingen publisering, oppdatering eller statusendring utføres her.</p>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
        <label className="space-y-1 text-sm">Merkevare
          <select className="block rounded-md border border-slate-600 bg-slate-950 p-2" value={brand}
            onChange={event => { setBrand(event.target.value as typeof brand); setPage(1); }}>
            <option value="zeneco">Zen Eco Homes</option>
            <option value="pinosoecolife">Pinoso EcoLife</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">Kortvisning
          <select className="block rounded-md border border-slate-600 bg-slate-950 p-2" value={variant}
            onChange={event => setVariant(event.target.value as typeof variant)}>
            <option value="standard">Standard</option><option value="compact">Kompakt</option>
          </select>
        </label>
        <button className="rounded-md border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800" onClick={() => void load()} disabled={loading}>Oppdater</button>
        <span className="text-sm text-slate-400">{loading ? "Henter …" : `${properties.length} på denne siden · ${countText}`}</span>
      </section>

      {error && <div role="alert" className="rounded-lg border border-red-500/40 p-4 text-red-200">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Dekning i tilgjengelig katalogutvalg</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800 text-slate-300"><tr><th className="p-3">Felt</th><th className="p-3">Utfylt</th><th className="p-3">Visning</th></tr></thead>
              <tbody>{metrics.map(item => <tr key={item.key} className="border-t border-slate-800">
                <td className="p-3">{item.label}</td>
                <td className="p-3 tabular-nums">{item.count}/{properties.length}{properties.length ? ` (${Math.round(item.count/properties.length*100)} %)` : ""}</td>
                <td className="p-3 text-slate-400">{item.surface}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button className="rounded border border-slate-600 px-3 py-2 text-sm disabled:opacity-40" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Forrige side</button>
            <span className="self-center text-sm text-slate-400">Side {page}</span>
            <button className="rounded border border-slate-600 px-3 py-2 text-sm disabled:opacity-40" disabled={!data?.hasMore || loading} onClick={() => setPage(value => value + 1)}>Neste side</button>
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Forhåndsvisning – {brand === "zeneco" ? "Zen Eco Homes" : "Pinoso EcoLife"}</h2>
          {sample ? <article className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
            {sample.primary_image && <img src={sample.primary_image} alt="" className={variant === "compact" ? "h-36 w-full object-cover" : "h-56 w-full object-cover"} />}
            <div className="space-y-3 p-4">
              <p className="text-xs text-slate-400">{sample.ref ? `Ref. ${sample.ref}` : "Referanse mangler"}</p>
              <h3 className="text-lg font-semibold">{sample.title || "Bolig uten tittel"}</h3>
              <p className="text-sm text-slate-300">{sample.town || sample.location || "Område ikke oppgitt"}</p>
              <p className="text-xl font-bold">{formatCurrency(sample.price)}</p>
              <div className="flex flex-wrap gap-3 text-sm text-slate-300">
                {sample.bedrooms != null && sample.bedrooms > 0 && <span>{sample.bedrooms} sov.</span>}
                {sample.bathrooms != null && sample.bathrooms > 0 && <span>{sample.bathrooms} bad</span>}
                {sample.area_m2 != null && sample.area_m2 > 0 && <span>{sample.area_m2} m² bolig</span>}
                {brand === "pinosoecolife" && sample.plot_size != null && sample.plot_size > 0 && <span>{sample.plot_size} m² tomt</span>}
              </div>
              {variant === "standard" && sample.pool === true && <p className="text-xs text-cyan-300">Basseng oppgitt</p>}
              <p className="text-xs text-amber-300">Tilgjengelighet og pris må bekreftes</p>
              <p className="text-xs text-slate-500">Forhåndsvisning – ingen publiseringshandling</p>
            </div>
          </article> : <div className="rounded-xl border border-slate-700 p-5 text-slate-400">Ingen bolig i dette utvalget.</div>}
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
            <h3 className="mb-2 font-semibold">Importfelter som ikke finnes i denne sikre katalogvisningen</h3>
            <p className="mb-2 text-xs text-slate-400">Dette betyr ikke at de mangler i databasen. De må vurderes separat før de kan eksponeres i en merkespesifikk API.</p>
            <div className="flex flex-wrap gap-2">{MORE_FIELDS.map(([key,label]) =>
              <span key={key} title={key} className="rounded bg-slate-800 px-2 py-1 text-xs">{label}</span>
            )}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
