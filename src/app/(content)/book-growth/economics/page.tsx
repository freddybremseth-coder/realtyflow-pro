"use client";

import { useEffect, useState } from "react";

type PriorityBook = {
  bookId: string;
  title: string;
  language: string | null;
  seriesTitle: string | null;
  seriesNumber: number | null;
  asin: string | null;
  score: number;
  economics90d: {
    royalties: number;
    units: number;
    pagesRead: number;
    adSpend: number;
    adSales: number;
    orders: number;
    impressions: number;
    clicks: number;
    netEarnings: number;
    rows: number;
  };
  scoreComponents: {
    intentScore: number;
    readinessGap: number;
    recommendationSignal: number;
    economicScore: number;
    revenueLeverage: number;
    adWasteOpportunity: number;
    demandNoSalesOpportunity: number;
  };
};

type Payload = {
  generatedAt: string;
  summary: {
    totalBooks: number;
    economicMetricRows90d: number;
    bookReportRows90d: number;
    booksWithEconomicData: number;
    royalties90d: number;
    adSpend90d: number;
    units90d: number;
    pagesRead90d: number;
  };
  sourceStatus: {
    bookReport: { ready: boolean; rows90d: number; state: string };
  };
  priority: PriorityBook[];
};

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div style={{ border: "1px solid #e2e8f0", background: "white", borderRadius: 12, padding: 14 }}>
    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>{label}</div>
    <div style={{ fontSize: 25, fontWeight: 900, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{sub}</div>}
  </div>;
}

export default function BookGrowthEconomicsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/book-growth/overview", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Book Growth Economics feilet (${res.status})`);
      setData(body as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const s = data?.summary;
  const br = data?.sourceStatus?.bookReport;

  return <div style={{ maxWidth: 1500, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 27 }}>Book Growth OS · Economics</h1>
        <p style={{ margin: "6px 0 0", color: "#64748b" }}>90-dagers økonomiske signaler fra normaliserte Book Report / Ads-data.</p>
      </div>
      <button onClick={load} disabled={loading} style={{ border: 0, borderRadius: 9, padding: "9px 13px", background: "#0f172a", color: "white", fontWeight: 800 }}>{loading ? "Laster…" : "Oppdater"}</button>
    </div>

    {error && <div style={{ marginTop: 16, background: "#fef2f2", color: "#b91c1c", padding: 12, borderRadius: 9 }}>{error}</div>}

    {s && <>
      <div style={{ marginTop: 18, padding: 14, borderRadius: 12, border: "1px solid #e2e8f0", background: br?.rows90d ? "#f0fdf4" : "#fffbeb" }}>
        <b>Book Report:</b> {br?.rows90d ? `${br.rows90d} normaliserte rader siste 90 dager` : "integrasjonen er klar, men det finnes foreløpig ingen Book Report-data å importere."}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 14 }}>
        <Card label="Royalties 90d" value={`$${s.royalties90d.toFixed(2)}`} />
        <Card label="Ad spend 90d" value={`$${s.adSpend90d.toFixed(2)}`} />
        <Card label="Units 90d" value={s.units90d} />
        <Card label="KU pages 90d" value={s.pagesRead90d} />
        <Card label="Bøker med økonomidata" value={`${s.booksWithEconomicData}/${s.totalBooks}`} />
        <Card label="Book Report-rader" value={s.bookReportRows90d} />
      </div>

      <section style={{ marginTop: 18, border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "white" }}>
        <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 900 }}>Economic opportunity ranking</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>Total score kombinerer web-intent, catalog readiness, anbefalinger og økonomisk leverage/waste. Ingen ekstern kanal endres fra denne siden.</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ background: "#f8fafc", textAlign: "left" }}>
              {['#','Book','Score','Economic','Royalties','Units','Pages','Ad spend','Ad waste','Demand/no sales','ASIN'].map((h) => <th key={h} style={{ padding: 9, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>)}
            </tr></thead>
            <tbody>{(data?.priority ?? []).slice(0, 30).map((b, i) => <tr key={b.bookId}>
              <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", fontWeight: 900 }}>{i + 1}</td>
              <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", minWidth: 230 }}><b>{b.title}</b><div style={{ color: "#94a3b8", marginTop: 2 }}>{b.seriesTitle ?? "Standalone"}{b.seriesNumber ? ` · #${b.seriesNumber}` : ""} · {b.language ?? "—"}</div></td>
              <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", fontWeight: 900 }}>{b.score}</td>
              <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{b.scoreComponents.economicScore}</td>
              <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>${b.economics90d.royalties.toFixed(2)}</td>
              <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{b.economics90d.units}</td>
              <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{b.economics90d.pagesRead}</td>
              <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>${b.economics90d.adSpend.toFixed(2)}</td>
              <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{b.scoreComponents.adWasteOpportunity}</td>
              <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{b.scoreComponents.demandNoSalesOpportunity}</td>
              <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>{b.asin ?? "Mangler"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </>}
  </div>;
}
