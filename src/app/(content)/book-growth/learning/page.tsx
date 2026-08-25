"use client";

import { useEffect, useState } from "react";

type Payload = { rules: any[]; evaluatedExperiments: any[] };

export default function LearningPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setError(null);
    const res = await fetch("/api/book-growth/learning", { cache: "no-store", credentials: "same-origin" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body?.error || `Learning load failed (${res.status})`);
    setData(body as Payload);
  };
  useEffect(() => { void load(); }, []);
  const refresh = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/book-growth/learning", { method: "POST", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Learning refresh failed (${res.status})`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <div style={{ maxWidth: 1500, margin: "0 auto", padding: 24, fontFamily: "system-ui,sans-serif" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <div><h1 style={{ margin: 0, fontSize: 27 }}>Book Growth OS · Learning</h1><p style={{ marginTop: 6, color: "#64748b" }}>Only repeated measured outcomes become reusable rules.</p></div>
      <button onClick={() => void refresh()} disabled={busy} style={{ border: 0, borderRadius: 8, padding: "9px 13px", background: "#0f172a", color: "white", fontWeight: 800 }}>{busy ? "Oppdaterer…" : "Oppdater learning rules"}</button>
    </div>
    {error && <div style={{ marginTop: 14, padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 8 }}>{error}</div>}
    <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}><div style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>Learning rules</div><div style={{ fontSize: 26, fontWeight: 900 }}>{data?.rules?.length ?? 0}</div></div>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}><div style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>Evaluated experiments</div><div style={{ fontSize: 26, fontWeight: 900 }}>{data?.evaluatedExperiments?.length ?? 0}</div></div>
    </div>
    <section style={{ marginTop: 18, border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "white" }}>
      <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0", fontWeight: 900 }}>Evidence-gated rules</div>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr style={{ background: "#f8fafc", textAlign: "left" }}>{["Dimension","Metric","Sample","Lift","Evidence","Verdict","Finding"].map(h => <th key={h} style={{ padding: 9, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead><tbody>{(data?.rules ?? []).map((r:any) => <tr key={r.id}><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{r.dimension}</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{r.value}</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{r.sample}</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{r.lift == null ? "—" : `${(Number(r.lift)*100).toFixed(1)}%`}</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{r.evidence_level}</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{r.verdict}</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", minWidth: 320 }}>{r.finding}</td></tr>)}</tbody></table></div>
      {!data?.rules?.length && <div style={{ padding: 16, color: "#64748b" }}>Ingen learning rules ennå. Det er korrekt før minst tre moderate/strong målte eksperimenter finnes for samme dimensjon og metric.</div>}
    </section>
    <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 12 }}><b>Guardrail:</b> ett resultat blir aldri generalisert. Minimum 3 moderate/strong experiments kreves; 8+ gir strong learning evidence.</div>
  </div>;
}
