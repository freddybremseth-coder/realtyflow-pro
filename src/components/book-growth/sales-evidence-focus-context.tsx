"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type SalesFact = {
  id: string;
  edition_id?: string | null;
  revision_id?: string | null;
  attribution_status?: string | null;
  channel?: string | null;
  marketplace?: string | null;
  units?: number | null;
  orders?: number | null;
  pages_read?: number | null;
  royalties?: number | null;
  gross_sales?: number | null;
  currency?: string | null;
  metric_date?: string | null;
};

type Edition = {
  id: string;
  title?: string | null;
  language?: string | null;
  format?: string | null;
  work?: { canonical_title?: string | null; series_name?: string | null } | null;
};

type Payload = { facts?: SalesFact[]; editions?: Edition[] };

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("nb-NO", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function SalesEvidenceFocusContext() {
  const search = useSearchParams();
  const editionId = String(search.get("editionId") || "").trim();
  const revisionId = String(search.get("revisionId") || "").trim();
  const [data, setData] = useState<Payload | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!editionId) {
      setLoaded(true);
      return;
    }
    fetch("/api/book-growth/sales-evidence", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => setData(body || {}))
      .catch(() => setData({}))
      .finally(() => setLoaded(true));
  }, [editionId]);

  const edition = useMemo(() => (data?.editions || []).find((row) => row.id === editionId) || null, [data, editionId]);
  const facts = useMemo(() => (data?.facts || []).filter((row) => {
    if (row.edition_id !== editionId) return false;
    if (revisionId && row.revision_id !== revisionId) return false;
    return true;
  }), [data, editionId, revisionId]);
  const exact = facts.filter((row) => row.attribution_status === "exact_revision").length;
  const units = facts.reduce((sum, row) => sum + Number(row.units || 0), 0);
  const orders = facts.reduce((sum, row) => sum + Number(row.orders || 0), 0);
  const pagesRead = facts.reduce((sum, row) => sum + Number(row.pages_read || 0), 0);
  const currencies = useMemo(() => {
    const totals = new Map<string, { royalties: number; grossSales: number }>();
    for (const row of facts) {
      const currency = String(row.currency || "UNKNOWN").toUpperCase();
      const current = totals.get(currency) || { royalties: 0, grossSales: 0 };
      current.royalties += Number(row.royalties || 0);
      current.grossSales += Number(row.gross_sales || 0);
      totals.set(currency, current);
    }
    return [...totals.entries()];
  }, [facts]);

  if (!editionId) return null;

  return <div style={{ maxWidth: 1400, margin: "16px auto 0", padding: "0 24px", fontFamily: "system-ui, sans-serif" }}>
    <section style={{ border: "2px solid #0f766e", borderRadius: 12, background: "#f0fdfa", padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, color: "#0f766e" }}>FOCUSED SALES EVIDENCE FROM PUBLISHED DISTRIBUTION</div>
      {!loaded ? <p style={{ marginBottom: 0 }}>Resolving canonical sales evidence…</p> : <>
        <h2 style={{ margin: "6px 0 4px", fontSize: 19 }}>{edition?.work?.canonical_title || edition?.title || "Catalog edition"}</h2>
        <p style={{ margin: 0, lineHeight: 1.45 }}>{String(edition?.language || "").toUpperCase()} · {edition?.format || "edition"}{revisionId ? " · focused revision" : ""}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginTop: 10 }}>
          <div><b>Sales facts</b><br />{facts.length}</div>
          <div><b>Exact revision</b><br />{exact}</div>
          <div><b>Units</b><br />{units}</div>
          <div><b>Orders</b><br />{orders}</div>
          <div><b>Pages read</b><br />{pagesRead}</div>
        </div>
        {currencies.length ? <div style={{ marginTop: 10, fontSize: 12 }}>{currencies.map(([currency, totals]) => <span key={currency} style={{ display: "inline-block", marginRight: 16 }}><b>{currency}</b>: royalties {money(totals.royalties, currency === "UNKNOWN" ? "USD" : currency)} · gross {money(totals.grossSales, currency === "UNKNOWN" ? "USD" : currency)}</span>)}</div> : <p style={{ margin: "10px 0 0", fontSize: 13 }}>No canonical sales facts are attached to this revision yet. This does not trigger reconciliation or create evidence automatically.</p>}
        {facts.length ? <p style={{ margin: "8px 0 0", fontSize: 12 }}>Channels: {[...new Set(facts.map((row) => `${row.channel || "unknown"}${row.marketplace ? ` · ${row.marketplace}` : ""}`))].join(" · ")}</p> : null}
      </>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        <Link href="/book-growth/sales-evidence" style={{ fontWeight: 800 }}>Clear focused sales evidence</Link>
        <Link href={`/book-growth/distribution?editionId=${encodeURIComponent(editionId)}${revisionId ? `&revisionId=${encodeURIComponent(revisionId)}` : ""}`} style={{ fontWeight: 800 }}>Back to this revision in Distribution</Link>
        <code style={{ fontSize: 11, overflowWrap: "anywhere" }}>edition: {editionId}</code>
        {revisionId ? <code style={{ fontSize: 11, overflowWrap: "anywhere" }}>revision: {revisionId}</code> : null}
      </div>
    </section>
  </div>;
}
