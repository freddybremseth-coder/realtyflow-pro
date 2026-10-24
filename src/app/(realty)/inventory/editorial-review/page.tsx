"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Row = { id: string; ref: string | null; title: string | null; location: string | null; approved: boolean; headline: string; intro: string; reasons: string[]; updated_at: string | null };
export default function EditorialReviewPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"needs_review" | "approved" | "all">("needs_review");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/properties/editorial-review", { credentials: "include", cache: "no-store" })
      .then(async res => { if (!res.ok) throw Error(res.status === 403 ? "Du har ikke tilgang til denne oversikten." : "Kunne ikke hente boligtekstene."); return res.json(); })
      .then(data => setRows(data.rows || []))
      .catch(err => setError(err instanceof Error ? err.message : "Ukjent feil"))
      .finally(() => setLoading(false));
  }, []);
  const shown = rows.filter(row => (filter === "all" || row.approved === (filter === "approved")) &&
    [row.title, row.ref, row.location, row.headline].some(value => String(value || "").toLocaleLowerCase("nb").includes(query.toLocaleLowerCase("nb"))));
  return <main className="mx-auto max-w-6xl px-4 py-8 space-y-5">
    <div><Link href="/inventory" className="text-sm underline">← Til boliger</Link><h1 className="mt-3 text-3xl font-semibold">Redaksjonell gjennomgang av boligtekster</h1>
      <p className="mt-2 text-sm text-gray-600">Viser opptil 300 nylig oppdaterte boligtekster. Ingen tekst blir godkjent eller publisert herfra.</p></div>
    <div className="flex flex-wrap gap-3 items-center">
      <label htmlFor="review-filter">Status</label>
      <select id="review-filter" value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="rounded border px-3 py-2 bg-white">
        <option value="needs_review">Trenger gjennomgang</option><option value="approved">Godkjente</option><option value="all">Alle</option>
      </select>
      <input aria-label="Søk etter bolig" value={query} onChange={e => setQuery(e.target.value)} placeholder="Søk på referanse, sted eller tittel" className="rounded border px-3 py-2 min-w-64" />
      <span className="text-sm text-gray-600">{shown.length} av {rows.length} boliger</span>
    </div>
    {loading && <p>Laster boligtekster …</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && shown.length === 0 && <p>Ingen boliger i dette utvalget.</p>}
    <div className="space-y-3">{shown.map(row => <article key={row.id} className="rounded-lg border p-4 bg-white space-y-2">
      <div className="flex justify-between gap-3 flex-wrap"><div><h2 className="font-semibold">{row.title || row.headline || "Bolig uten tittel"}</h2><p className="text-sm text-gray-600">{row.ref || row.id} · {row.location || "Sted ikke angitt"}</p></div>
        <span className="text-sm">{row.approved ? "Godkjent" : "Trenger gjennomgang"}</span></div>
      {row.headline && <p><strong>Forslag til overskrift:</strong> {row.headline}</p>}
      {row.intro && <p className="text-sm leading-relaxed">{row.intro}</p>}
      {!row.approved && row.reasons.length > 0 && <p className="text-xs text-amber-800">Kontroll: {row.reasons.join(", ")}</p>}
      <Link className="inline-block text-sm underline" href="/inventory">Åpne boligoversikten for redigering →</Link>
    </article>)}</div>
  </main>;
}
