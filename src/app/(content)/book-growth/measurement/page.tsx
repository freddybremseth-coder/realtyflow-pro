"use client";

import { useEffect, useState } from "react";

type Row = any;

type Payload = {
  summary: { appliedAwaitingExperiment: number; running: number; evaluated: number; measuredRecommendations: number };
  queue: Row[];
  experiments: Row[];
};

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "white" }}>
    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{sub}</div>}
  </div>;
}

function pct(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—";
}

export default function MeasurementPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const res = await fetch("/api/book-growth/measurement", { cache: "no-store", credentials: "same-origin" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body?.error || `Measurement load failed (${res.status})`);
    setData(body as Payload);
  };

  useEffect(() => { void load(); }, []);

  const act = async (recommendationId: string, action: "start" | "evaluate") => {
    setBusy(recommendationId); setError(null);
    try {
      const res = await fetch("/api/book-growth/measurement", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recommendationId, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Measurement action failed (${res.status})`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const s = data?.summary;
  return <div style={{ maxWidth: 1500, margin: "0 auto", padding: 24, fontFamily: "system-ui,sans-serif" }}>
    <h1 style={{ margin: 0, fontSize: 27 }}>Book Growth OS · Measurement</h1>
    <p style={{ color: "#64748b", marginTop: 6 }}>Applied → Measuring → Measured. Baseline og resultat holdes adskilt, og svakt datagrunnlag gir inconclusive, ikke et falskt svar.</p>
    {error && <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>{error}</div>}
    {s && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 16 }}>
      <Card label="Applied uten experiment" value={s.appliedAwaitingExperiment} />
      <Card label="Running" value={s.running} />
      <Card label="Evaluated" value={s.evaluated} />
      <Card label="Measured recs" value={s.measuredRecommendations} />
    </div>}

    <section style={{ marginTop: 18, border: "1px solid #e2e8f0", borderRadius: 12, background: "white", overflow: "hidden" }}>
      <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0", fontWeight: 900 }}>Measurement queue</div>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: "#f8fafc", textAlign: "left" }}>{["Book","Type","Rec status","Experiment","Due","Result","Lift","Evidence","Action"].map(h => <th key={h} style={{ padding: 9, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
        <tbody>{(data?.queue ?? []).map((r: any) => {
          const e = r.experiment;
          return <tr key={r.id}>
            <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}><b>{r.book?.title ?? "—"}</b><div style={{ color: "#94a3b8" }}>{r.book?.language ?? "—"}</div></td>
            <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{r.recommendation_type}</td>
            <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{r.status}</td>
            <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{e?.status ?? "—"}</td>
            <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{r.measurement_due_at ? new Date(r.measurement_due_at).toLocaleDateString() : "—"}</td>
            <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{e?.result ?? "—"}</td>
            <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{e?.lift == null ? "—" : pct(e.lift)}</td>
            <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{e?.evidence_level ?? "—"}</td>
            <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{r.status === "applied" && !e ? <button disabled={busy===r.id} onClick={() => void act(r.id,"start")}>Start</button> : r.status === "measuring" && e?.status === "running" ? <button disabled={busy===r.id} onClick={() => void act(r.id,"evaluate")}>Evaluate</button> : "—"}</td>
          </tr>;
        })}</tbody>
      </table></div>
      {!data?.queue?.length && <div style={{ padding: 16, color: "#64748b" }}>Ingen applied/measuring/measured anbefalinger ennå. Dette er korrekt: ingen eksperimenter opprettes før en reell apply-handling.</div>}
    </section>

    <section style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12, color: "#475569" }}>
      <b>Measurement v1:</b> 14 dager før apply brukes som baseline. Standard målevindu er 14 dager etter apply. Evidence blir moderate ved minst 7 metric-rader i begge vinduer, limited ved minst 3, ellers insufficient. Bare sammenlignbare metrics får lift.
    </section>
  </div>;
}
