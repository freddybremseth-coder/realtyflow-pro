"use client";

import { useEffect, useMemo, useState } from "react";

type Recommendation = {
  id: string;
  book_id: string | null;
  series_id: string | null;
  channel: string | null;
  marketplace: string | null;
  recommendation_type: string;
  current_value: unknown;
  proposed_value: unknown;
  evidence: unknown;
  confidence: number | null;
  expected_impact: string | null;
  status: string;
  created_at: string;
  bookTitle: string | null;
  bookSlug: string | null;
  seriesTitle: unknown;
  seriesSlug: string | null;
};

type Payload = {
  generatedAt: string;
  summary: {
    totalBooks: number;
    amazonLinked: number;
    covers: number;
    samples: number;
    pendingRecommendations: number;
    events30d: number;
    amazonClicks30d: number;
    sampleClicks30d: number;
    directBuyClicks30d: number;
    bookViews30d: number;
  };
  pendingByType: Record<string, number>;
  recommendations: Recommendation[];
};

function show(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "white" }}>
    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 900, marginTop: 3 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{sub}</div>}
  </div>;
}

export default function BookGrowthPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/book-growth/overview", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Book Growth OS feilet (${res.status})`);
      setData(body as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const decide = async (recommendationId: string, decision: "approved" | "rejected") => {
    setBusyId(recommendationId); setError(null);
    try {
      const res = await fetch("/api/book-growth/recommendation", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId, decision }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Decision feilet (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => { void load(); }, []);

  const pending = useMemo(() => (data?.recommendations ?? []).filter((r) => r.status === "pending" && (type === "all" || r.recommendation_type === type)), [data, type]);
  const types = Object.keys(data?.pendingByType ?? {}).sort();
  const s = data?.summary;
  const coverage = s?.totalBooks ? Math.round((s.amazonLinked / s.totalBooks) * 100) : 0;

  return <div style={{ maxWidth: 1500, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 27 }}>Book Growth OS</h1>
        <p style={{ margin: "6px 0 0", color: "#64748b" }}>Amazon/KDP, SEO og direkte salg — analyse, review og eksplisitt godkjenning.</p>
      </div>
      <button onClick={load} disabled={loading} style={{ border: 0, borderRadius: 9, padding: "9px 13px", background: "#0f172a", color: "white", fontWeight: 800 }}>{loading ? "Laster…" : "Oppdater"}</button>
    </div>

    {error && <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>⛔ {error}</div>}

    {s && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 18 }}>
        <Metric label="Bøker" value={s.totalBooks} />
        <Metric label="Amazon-linket" value={`${s.amazonLinked}/${s.totalBooks}`} sub={`${coverage}% coverage`} />
        <Metric label="Covers" value={s.covers} />
        <Metric label="Samples" value={s.samples} />
        <Metric label="Pending forslag" value={s.pendingRecommendations} />
        <Metric label="Book views 30d" value={s.bookViews30d} />
        <Metric label="Amazon clicks 30d" value={s.amazonClicks30d} />
        <Metric label="Sample clicks 30d" value={s.sampleClicks30d} />
        <Metric label="Direct buy clicks 30d" value={s.directBuyClicks30d} />
      </div>

      <section style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
        <div style={{ fontWeight: 900 }}>Arbeidsregel</div>
        <div style={{ marginTop: 5, color: "#475569", fontSize: 13 }}>AI analyserer og foreslår. <b>Godkjenn</b> endrer bare anbefalingens status til approved. Det utfører ikke KDP-, Ads-, Amazon- eller website-endringer. Apply blir en separat, eksplisitt kontrollert handling senere.</div>
      </section>

      <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ fontSize: 13 }}>Filter:</b>
        <button onClick={() => setType("all")} style={{ border: "1px solid #cbd5e1", borderRadius: 999, padding: "6px 10px", background: type === "all" ? "#0f172a" : "white", color: type === "all" ? "white" : "#334155" }}>Alle ({s.pendingRecommendations})</button>
        {types.map((t) => <button key={t} onClick={() => setType(t)} style={{ border: "1px solid #cbd5e1", borderRadius: 999, padding: "6px 10px", background: type === t ? "#0f172a" : "white", color: type === t ? "white" : "#334155" }}>{t} ({data?.pendingByType[t] ?? 0})</button>)}
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {pending.map((r) => <article key={r.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", color: "#64748b" }}>{r.recommendation_type} · {r.channel ?? "catalog"} · {r.marketplace ?? "global"}</div>
              <h2 style={{ fontSize: 18, margin: "5px 0 0" }}>{r.bookTitle ?? r.bookSlug ?? "Serie-/katalogforslag"}</h2>
              {r.expected_impact && <div style={{ marginTop: 5, fontSize: 13, color: "#475569" }}>{r.expected_impact}</div>}
            </div>
            <span style={{ padding: "4px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e", fontSize: 11, fontWeight: 900 }}>PENDING</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12, marginTop: 12 }}>
            <div><div style={{ fontSize: 11, fontWeight: 900, color: "#64748b" }}>CURRENT</div><pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: "5px 0 0", background: "#f8fafc", padding: 10, borderRadius: 8 }}>{show(r.current_value)}</pre></div>
            <div><div style={{ fontSize: 11, fontWeight: 900, color: "#64748b" }}>PROPOSED</div><pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: "5px 0 0", background: "#f0fdf4", padding: 10, borderRadius: 8 }}>{show(r.proposed_value)}</pre></div>
          </div>
          <details style={{ marginTop: 10 }}><summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 800 }}>Evidence</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "#f8fafc", padding: 10, borderRadius: 8 }}>{show(r.evidence)}</pre></details>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button disabled={busyId === r.id} onClick={() => void decide(r.id, "approved")} style={{ border: 0, borderRadius: 8, padding: "8px 12px", background: "#166534", color: "white", fontWeight: 800 }}>{busyId === r.id ? "Behandler…" : "Godkjenn forslag"}</button>
            <button disabled={busyId === r.id} onClick={() => void decide(r.id, "rejected")} style={{ border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", background: "#fff", color: "#b91c1c", fontWeight: 800 }}>Avvis</button>
          </div>
        </article>)}
        {!loading && pending.length === 0 && <div style={{ color: "#64748b", padding: 20 }}>Ingen pending forslag i dette filteret.</div>}
      </div>
    </>}
  </div>;
}
