"use client";

import { useEffect, useMemo, useState } from "react";

type Candidate = {
  id: string;
  book_id: string;
  current_language: string | null;
  proposed_language: string;
  source: string;
  evidence: unknown;
  confidence: number;
  status: string;
  book: { id: string; slug: string; title: string; language: string | null; series_number: number | null } | null;
};

type Channel = {
  book_id: string;
  channel: string;
  marketplace: string;
  external_id: string | null;
  format: string | null;
  language: string | null;
  title: string | null;
  subtitle: string | null;
  book: { id: string; slug: string; title: string; language: string | null } | null;
};

type Payload = {
  summary: {
    totalBooks: number;
    pendingLanguage: number;
    approvedLanguage: number;
    appliedLanguage: number;
    amazonRows: number;
    amazonMissingFormat: number;
    amazonMissingLanguage: number;
    amazonMissingTitle: number;
  };
  candidates: Candidate[];
  channels: Channel[];
};

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "white" }}>
    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{label}</div>
    <div style={{ fontSize: 25, fontWeight: 900, marginTop: 3 }}>{value}</div>
    {sub && <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 3 }}>{sub}</div>}
  </div>;
}

export default function EditionLanguagePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/book-growth/edition-language", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Edition intelligence feilet (${res.status})`);
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  const act = async (candidateId: string, action: "approve" | "reject" | "apply") => {
    setBusy(candidateId); setError(null);
    try {
      const res = await fetch("/api/book-growth/edition-language", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId, action }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `${action} feilet (${res.status})`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  useEffect(() => { void load(); }, []);
  const pending = useMemo(() => (data?.candidates ?? []).filter((c) => c.status === "pending"), [data]);
  const approved = useMemo(() => (data?.candidates ?? []).filter((c) => c.status === "approved"), [data]);
  const incompleteChannels = useMemo(() => (data?.channels ?? []).filter((c) => !c.format || !c.language || !c.title), [data]);
  const s = data?.summary;

  return <div style={{ maxWidth: 1500, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 27 }}>Edition & Language Intelligence</h1>
        <p style={{ margin: "6px 0 0", color: "#64748b" }}>Edition-språk og Amazon metadata behandles separat. Approval er ikke det samme som apply.</p>
      </div>
      <button onClick={load} disabled={loading} style={{ border: 0, borderRadius: 9, padding: "9px 13px", background: "#0f172a", color: "white", fontWeight: 800 }}>{loading ? "Laster…" : "Oppdater"}</button>
    </div>

    {error && <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>⛔ {error}</div>}

    {s && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 18 }}>
      <Metric label="Published editions" value={s.totalBooks} />
      <Metric label="Language pending" value={s.pendingLanguage} />
      <Metric label="Language approved" value={s.approvedLanguage} sub="Ikke applied" />
      <Metric label="Language applied" value={s.appliedLanguage} />
      <Metric label="Amazon rows" value={s.amazonRows} />
      <Metric label="Missing format" value={s.amazonMissingFormat} />
      <Metric label="Missing channel language" value={s.amazonMissingLanguage} />
      <Metric label="Missing channel title" value={s.amazonMissingTitle} />
    </div>}

    <section style={{ marginTop: 18, border: "1px solid #e2e8f0", borderRadius: 12, background: "white", overflow: "hidden" }}>
      <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0" }}><b>Pending language review</b><div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>Kun kuraterte, høy-confidence kandidater. Ingen endring skjer før approve + apply.</div></div>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: "#f8fafc", textAlign: "left" }}>{["Book","Current","Proposed","Confidence","Action"].map((h) => <th key={h} style={{ padding: 9, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
        <tbody>{pending.map((c) => <tr key={c.id}>
          <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}><b>{c.book?.title ?? c.book_id}</b><div style={{ color: "#94a3b8" }}>{c.book?.slug}</div></td>
          <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{c.current_language ?? "—"}</td>
          <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", fontWeight: 900 }}>{c.proposed_language}</td>
          <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{Math.round(Number(c.confidence) * 100)}%</td>
          <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}><div style={{ display: "flex", gap: 6 }}>
            <button disabled={busy === c.id} onClick={() => void act(c.id, "approve")} style={{ border: 0, borderRadius: 7, padding: "6px 9px", background: "#166534", color: "white", fontWeight: 800 }}>Approve</button>
            <button disabled={busy === c.id} onClick={() => void act(c.id, "reject")} style={{ border: "1px solid #fecaca", borderRadius: 7, padding: "6px 9px", background: "white", color: "#b91c1c", fontWeight: 800 }}>Reject</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    {approved.length > 0 && <section style={{ marginTop: 18, border: "1px solid #bbf7d0", borderRadius: 12, background: "#f0fdf4", padding: 14 }}>
      <b>Approved — awaiting explicit apply</b>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>{approved.map((c) => <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", background: "white", padding: 10, borderRadius: 8 }}><span><b>{c.book?.title}</b> · {c.current_language} → {c.proposed_language}</span><button disabled={busy === c.id} onClick={() => void act(c.id, "apply")} style={{ border: 0, borderRadius: 7, padding: "7px 10px", background: "#0f172a", color: "white", fontWeight: 800 }}>Apply language</button></div>)}</div>
    </section>}

    <section style={{ marginTop: 18, border: "1px solid #e2e8f0", borderRadius: 12, background: "white", overflow: "hidden" }}>
      <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0" }}><b>Amazon channel metadata gaps</b><div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>Disse feltene skal fylles fra verifisert Amazon/Book Report-kilde, ikke gjettes fra katalogen.</div></div>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: "#f8fafc", textAlign: "left" }}>{["Book","ASIN","Marketplace","Format","Language","Channel title"].map((h) => <th key={h} style={{ padding: 9, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
        <tbody>{incompleteChannels.map((c) => <tr key={`${c.book_id}:${c.external_id}`}>
          <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}><b>{c.book?.title ?? c.book_id}</b></td>
          <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{c.external_id ?? "—"}</td>
          <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{c.marketplace}</td>
          <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{c.format ?? "Mangler"}</td>
          <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{c.language ?? "Mangler"}</td>
          <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{c.title ?? "Mangler"}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
