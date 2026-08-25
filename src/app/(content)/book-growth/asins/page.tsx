"use client";

import { useEffect, useMemo, useState } from "react";

type MissingBook = {
  id: string; slug: string; title: string; language: string | null; seriesSlug: string | null;
  seriesTitle: unknown; seriesNumber: number | null; intent30d: number; candidateCount: number; priority: number;
};
type Candidate = {
  id: string; book_id: string; marketplace: string; candidate_asin: string; candidate_url: string;
  candidate_title: string | null; candidate_author: string | null; candidate_format: string | null;
  source: string; evidence: unknown; confidence: number | null; status: string; created_at: string;
  book: { id: string; slug: string; title: string; language: string | null } | null;
};
type Payload = {
  summary: { totalBooks: number; asinLinked: number; missingAsin: number; coveragePct: number; candidates: number; pending: number; approved: number; applied: number };
  missingBooks: MissingBook[];
  candidates: Candidate[];
};

function show(v: unknown) { try { return typeof v === "string" ? v : JSON.stringify(v, null, 2); } catch { return String(v); } }
function titleText(v: unknown) {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") { const r = v as Record<string, unknown>; return String(r.en ?? r.no ?? r.es ?? Object.values(r)[0] ?? ""); }
  return "";
}

export default function AsinDiscoveryPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("pending");

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/book-growth/asin-candidates", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `ASIN API feilet (${res.status})`);
      setData(body as Payload);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }

  async function act(candidateId: string, action: "approve" | "reject" | "apply") {
    setBusy(candidateId); setError(null);
    try {
      const res = await fetch("/api/book-growth/asin-candidates", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `${action} feilet (${res.status})`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  useEffect(() => { void load(); }, []);
  const candidates = useMemo(() => (data?.candidates ?? []).filter(c => filter === "all" || c.status === filter), [data, filter]);
  const s = data?.summary;

  return <div style={{ maxWidth: 1500, margin: "0 auto", padding: 24, fontFamily: "system-ui,sans-serif" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div><h1 style={{ margin: 0, fontSize: 27 }}>ASIN Discovery & Verification</h1><p style={{ margin: "6px 0 0", color: "#64748b" }}>Finn kandidater → review → approve → separat apply. Ingen ASIN blir brukt bare fordi den er funnet på web.</p></div>
      <button onClick={load} disabled={loading} style={{ border: 0, borderRadius: 9, padding: "9px 13px", background: "#0f172a", color: "white", fontWeight: 800 }}>{loading ? "Laster…" : "Oppdater"}</button>
    </div>
    {error && <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>⛔ {error}</div>}

    {s && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 18 }}>
        {[
          ["ASIN coverage", `${s.asinLinked}/${s.totalBooks}`, `${s.coveragePct}%`],
          ["Mangler ASIN", s.missingAsin, "discovery queue"],
          ["Candidates", s.candidates, "alle"],
          ["Pending", s.pending, "review"],
          ["Approved", s.approved, "ikke applied"],
          ["Applied", s.applied, "canonical Amazon metadata"],
        ].map(([label, value, sub]) => <div key={String(label)} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "white" }}><div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{label}</div><div style={{ fontSize: 26, fontWeight: 900, marginTop: 3 }}>{value}</div><div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{sub}</div></div>)}
      </div>

      <section style={{ marginTop: 18, border: "1px solid #e2e8f0", borderRadius: 12, background: "white", overflow: "hidden" }}>
        <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0" }}><div style={{ fontWeight: 900 }}>Missing-ASIN work queue</div><div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Prioritet øker med faktisk web-intent og når det allerede finnes en kandidat som bør vurderes.</div></div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr style={{ background: "#f8fafc", textAlign: "left" }}>{["#","Bok","Serie","Språk","Intent 30d","Candidates","Priority"].map(h => <th key={h} style={{ padding: 9, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
        <tbody>{data.missingBooks.slice(0, 53).map((b, i) => <tr key={b.id}><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", fontWeight: 900 }}>{i+1}</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}><b>{b.title}</b><div style={{ color: "#94a3b8" }}>{b.slug}</div></td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{titleText(b.seriesTitle) || "Standalone"}{b.seriesNumber ? ` · #${b.seriesNumber}` : ""}</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{b.language ?? "—"}</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{b.intent30d}</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{b.candidateCount}</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", fontWeight: 900 }}>{b.priority}</td></tr>)}</tbody></table></div>
      </section>

      <section style={{ marginTop: 18 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><b style={{ fontSize: 13 }}>Candidate filter:</b>{["pending","approved","applied","rejected","all"].map(f => <button key={f} onClick={() => setFilter(f)} style={{ border: "1px solid #cbd5e1", borderRadius: 999, padding: "6px 10px", background: filter===f ? "#0f172a":"white", color: filter===f?"white":"#334155" }}>{f}</button>)}</div>
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>{candidates.map(c => <article key={c.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 15, background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div><div style={{ fontSize: 11, fontWeight: 900, color: "#64748b" }}>{c.marketplace} · {c.source}</div><h2 style={{ margin: "4px 0 0", fontSize: 18 }}>{c.book?.title ?? c.book?.slug ?? c.book_id}</h2><div style={{ marginTop: 4 }}><b>{c.candidate_asin}</b>{c.candidate_title ? ` · ${c.candidate_title}` : ""}</div></div><div style={{ textAlign: "right" }}><div style={{ fontWeight: 900 }}>{c.status.toUpperCase()}</div><div style={{ fontSize: 12, color: "#64748b" }}>confidence {c.confidence == null ? "—" : `${Math.round(c.confidence*100)}%`}</div></div></div>
          <details style={{ marginTop: 10 }}><summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 800 }}>Evidence</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "#f8fafc", padding: 10, borderRadius: 8 }}>{show(c.evidence)}</pre></details>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>{c.status === "pending" && <><button disabled={busy===c.id} onClick={() => void act(c.id,"approve")} style={{ border: 0, borderRadius: 8, padding: "8px 12px", background: "#166534", color: "white", fontWeight: 800 }}>Godkjenn kandidat</button><button disabled={busy===c.id} onClick={() => void act(c.id,"reject")} style={{ border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", background: "white", color: "#b91c1c", fontWeight: 800 }}>Avvis</button></>}{c.status === "approved" && <button disabled={busy===c.id} onClick={() => void act(c.id,"apply")} style={{ border: 0, borderRadius: 8, padding: "8px 12px", background: "#0f172a", color: "white", fontWeight: 800 }}>Apply ASIN til katalog</button>}</div>
        </article>)}{!loading && candidates.length===0 && <div style={{ padding: 18, color: "#64748b" }}>Ingen kandidater i dette filteret.</div>}</div>
      </section>
    </>}
  </div>;
}
