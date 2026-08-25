"use client";

import { useEffect, useState } from "react";

type Member = { book_id: string; relation_type: string; confidence: number; verified: boolean; book: { title: string; slug: string; language: string | null; series_number: number | null } | null };
type Work = { id: string; work_key: string; canonical_title: string; canonical_series_number: number | null; status: string; series: { slug: string; title: unknown } | null; members: Member[] };
type Candidate = { id: string; relation_type: string; source: string; evidence: unknown; confidence: number; status: string; sourceWork: Work | null; targetWork: Work | null };
type Payload = { summary: { activeWorks: number; archivedWorks: number; totalMembers: number; verifiedMembers: number; unverifiedGroups: number; mergeCandidates: number; pendingMerges: number; approvedMerges: number; appliedMerges: number }; unverifiedGroups: Work[]; candidates: Candidate[] };

function titleText(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return String(row.en ?? row.no ?? row.es ?? Object.values(row)[0] ?? "");
  }
  return "";
}

function Members({ work }: { work: Work | null }) {
  if (!work) return <span>—</span>;
  return <div><b>{work.canonical_title}</b><div style={{ color: "#64748b", fontSize: 11 }}>{work.series ? titleText(work.series.title) : "Standalone"} · {work.work_key}</div><div style={{ marginTop: 4 }}>{work.members.map((m) => <span key={m.book_id} style={{ display: "inline-block", margin: "2px 4px 2px 0", padding: "2px 6px", borderRadius: 999, background: "#f1f5f9", fontSize: 11 }}>{m.book?.language ?? "—"}: {m.book?.title ?? m.book_id}</span>)}</div></div>;
}

export default function WorkReviewPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/book-growth/work-review", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Work review feilet (${res.status})`);
      setData(body as Payload);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  const act = async (payload: Record<string, unknown>, id: string) => {
    setBusy(id); setError(null);
    try {
      const res = await fetch("/api/book-growth/work-review", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Handling feilet (${res.status})`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  useEffect(() => { void load(); }, []);
  const s = data?.summary;

  return <div style={{ maxWidth: 1500, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div><h1 style={{ margin: 0, fontSize: 27 }}>Work & Translation Review</h1><p style={{ margin: "6px 0 0", color: "#64748b" }}>Canonical works, language editions og kontrollerte merge-kandidater.</p></div>
      <button onClick={load} disabled={loading} style={{ border: 0, borderRadius: 9, padding: "9px 13px", background: "#0f172a", color: "white", fontWeight: 800 }}>{loading ? "Laster…" : "Oppdater"}</button>
    </div>
    {error && <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>⛔ {error}</div>}
    {s && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 18 }}>
      {[["Aktive works",s.activeWorks],["Arkiverte works",s.archivedWorks],["Members",s.totalMembers],["Verifiserte",`${s.verifiedMembers}/${s.totalMembers}`],["Uverifiserte grupper",s.unverifiedGroups],["Merge candidates",s.mergeCandidates],["Pending merges",s.pendingMerges],["Approved merges",s.approvedMerges],["Applied merges",s.appliedMerges]].map(([label,value]) => <div key={String(label)} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "white" }}><div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{label}</div><div style={{ fontSize: 25, fontWeight: 900, marginTop: 3 }}>{value}</div></div>)}
    </div>}

    <section style={{ marginTop: 18, padding: 14, border: "1px solid #e2e8f0", borderRadius: 12, background: "#f8fafc" }}><b>Arbeidsregel</b><div style={{ marginTop: 5, color: "#475569", fontSize: 13 }}>Approve betyr bare at en merge er godkjent. Først <b>Apply merge</b> flytter editions til canonical work. Apply er atomisk, krever approved-status og skriver audit-logg. Ingen Amazon/KDP-data endres.</div></section>

    <section style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: 19 }}>Eksisterende språkgrupper som trenger verifisering</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {(data?.unverifiedGroups ?? []).map((w) => <div key={w.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "white", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><Members work={w}/><button disabled={busy === w.id} onClick={() => void act({ action: "verify_group", workId: w.id }, w.id)} style={{ border: 0, borderRadius: 8, padding: "8px 11px", background: "#0f766e", color: "white", fontWeight: 800 }}>{busy === w.id ? "Behandler…" : "Verifiser gruppe"}</button></div>)}
        {!loading && (data?.unverifiedGroups ?? []).length === 0 && <div style={{ color: "#64748b" }}>Ingen uverifiserte multi-edition works.</div>}
      </div>
    </section>

    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 19 }}>Translation / same-work merge candidates</h2>
      <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12, background: "white" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr style={{ background: "#f8fafc", textAlign: "left" }}>{["Source work","→ Canonical work","Relasjon","Confidence","Status","Handling"].map((h) => <th key={h} style={{ padding: 9, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
          <tbody>{(data?.candidates ?? []).map((c) => <tr key={c.id}><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", minWidth: 260 }}><Members work={c.sourceWork}/></td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", minWidth: 260 }}><Members work={c.targetWork}/></td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{c.relation_type}</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", fontWeight: 900 }}>{Math.round(Number(c.confidence) * 100)}%</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{c.status}</td><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>{c.status === "pending" && <><button disabled={busy === c.id} onClick={() => void act({ action: "approve", candidateId: c.id }, c.id)} style={{ border: 0, borderRadius: 7, padding: "6px 9px", background: "#166534", color: "white", fontWeight: 800, marginRight: 5 }}>Godkjenn</button><button disabled={busy === c.id} onClick={() => void act({ action: "reject", candidateId: c.id }, c.id)} style={{ border: "1px solid #fecaca", borderRadius: 7, padding: "6px 9px", background: "white", color: "#b91c1c", fontWeight: 800 }}>Avvis</button></>}{c.status === "approved" && <button disabled={busy === c.id} onClick={() => void act({ action: "apply", candidateId: c.id }, c.id)} style={{ border: 0, borderRadius: 7, padding: "6px 9px", background: "#1d4ed8", color: "white", fontWeight: 800 }}>Apply merge</button>}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  </div>;
}
