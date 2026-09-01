"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Lineage = Record<string, any> & { error?: string; lineageStatus?: "complete" | "incomplete" | "conflict" };

const inputStyle: React.CSSProperties = { width: "100%", padding: 9, border: "1px solid #cbd5e1", borderRadius: 8 };
const card: React.CSSProperties = { background: "white", border: "1px solid #cbd5e1", borderRadius: 12, padding: 16 };
const idText: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, wordBreak: "break-all", color: "#475569" };

function Step({ title, value, children }: { title: string; value?: string | null; children?: React.ReactNode }) {
  return <section style={card}>
    <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>{title}</h2>
    {value ? <div style={idText}>{value}</div> : <p style={{ color: "#94a3b8", margin: 0 }}>Not resolved</p>}
    {children}
  </section>;
}

export default function BookOsLineagePage() {
  const search = useSearchParams();
  const initial = useMemo(() => ({
    proposalId: String(search.get("proposalId") || ""), projectId: String(search.get("projectId") || ""),
    editionId: String(search.get("editionId") || ""), revisionId: String(search.get("revisionId") || ""),
  }), [search]);
  const [form, setForm] = useState(initial);
  const [data, setData] = useState<Lineage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(next = form) {
    const params = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => { if (value.trim()) params.set(key, value.trim()); });
    if (!params.toString()) { setError("Enter at least one exact ID."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/book-growth/lineage?${params.toString()}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setData(body);
      window.history.replaceState({}, "", `/book-growth/lineage?${params.toString()}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  useEffect(() => { if (Object.values(initial).some(Boolean)) void load(initial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const statusColor = data?.lineageStatus === "complete" ? "#166534" : data?.lineageStatus === "conflict" ? "#991b1b" : "#92400e";
  const sales = data?.salesEvidence?.totals || {};

  return <main style={{ maxWidth: 1250, margin: "0 auto", padding: 24, fontFamily: "system-ui,sans-serif" }}>
    <header>
      <p style={{ color: "#1d4ed8", fontWeight: 900, margin: 0 }}>BOOK OS · LINEAGE / AUDIT</p>
      <h1 style={{ margin: "5px 0" }}>Trace one book across the entire lifecycle</h1>
      <p style={{ color: "#475569", maxWidth: 900 }}>Read-only evidence view. Resolve by exact proposal, Book Engine project, catalog edition or revision ID. This page never approves, mutates, reconciles, launches or publishes anything.</p>
    </header>

    <section style={{ ...card, marginTop: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 }}>
        {(["proposalId", "projectId", "editionId", "revisionId"] as const).map((key) => <label key={key}>{key}<input style={inputStyle} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
      </div>
      <button onClick={() => void load()} disabled={busy} style={{ marginTop: 12, padding: "10px 14px", border: 0, borderRadius: 8, background: busy ? "#94a3b8" : "#1d4ed8", color: "white", fontWeight: 900 }}>{busy ? "Resolving lineage…" : "Resolve lineage"}</button>
      {error ? <p role="alert" style={{ color: "#991b1b" }}>{error}</p> : null}
    </section>

    {data ? <>
      <section style={{ ...card, marginTop: 16, borderWidth: 2, borderColor: statusColor }}>
        <h2 style={{ margin: 0, color: statusColor }}>Lineage: {String(data.lineageStatus || "unknown").toUpperCase()}</h2>
        {data.conflicts?.length ? <p style={{ color: "#991b1b" }}>Conflicts: {data.conflicts.join(", ")}</p> : null}
        {data.missing?.length ? <p style={{ color: "#92400e" }}>Missing: {data.missing.join(", ")}</p> : null}
        <pre style={{ ...idText, whiteSpace: "pre-wrap" }}>{JSON.stringify(data.resolved, null, 2)}</pre>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12, marginTop: 16 }}>
        <Step title="1 · Learning proposal" value={data.proposal?.id}><p>{data.proposal?.proposed_title || data.proposal?.rationale || ""}</p><p>Status: <b>{data.proposal?.status || "—"}</b> · evidence {data.proposal?.evidence_count ?? "—"} ({data.proposal?.evidence_level || "—"})</p></Step>
        <Step title="2 · Book Engine project" value={data.project?.id}><p><b>{data.project?.title || ""}</b></p><p>Status: <b>{data.project?.status || "—"}</b> · {data.project?.metadata_plan?.generation_state || "—"}</p></Step>
        <Step title="3 · Catalog work" value={data.work?.id}><p><b>{data.work?.canonical_title || ""}</b></p><p>{data.work?.series_name || ""} {data.work?.series_number ? `#${data.work.series_number}` : ""}</p></Step>
        <Step title="4 · Catalog edition" value={data.edition?.id}><p>Status: <b>{data.edition?.status || "—"}</b> · {data.edition?.language || "—"} · {data.edition?.format || "—"}</p><p style={idText}>canonical project: {data.edition?.canonical_project_id || "—"}</p></Step>
        <Step title="5 · Canonical revision" value={data.revision?.id}><p>Revision {data.revision?.revision_number ?? "—"} · <b>{data.revision?.status || "—"}</b> · canonical {String(Boolean(data.revision?.is_canonical))}</p><p style={idText}>fingerprint: {data.revision?.content_fingerprint || "—"}</p></Step>
        <Step title="6 · Package ingest" value={data.packageIngests?.[0]?.id}><p>{data.packageIngests?.length || 0} ingest record(s)</p><p>Latest: <b>{data.packageIngests?.[0]?.status || "—"}</b> · {data.packageIngests?.[0]?.source || "—"}</p></Step>
        <Step title="7 · Distribution" value={data.distributionPublications?.[0]?.id}><p>{data.distributionPublications?.length || 0} publication record(s)</p><p>{(data.distributionPublications || []).map((row: any) => `${row.channel}:${row.status}`).join(" · ") || "No distribution records"}</p></Step>
        <Step title="8 · Sales evidence" value={data.revision?.id}><p>{data.salesEvidence?.facts?.length || 0} fact rows · channels {(data.salesEvidence?.channels || []).join(", ") || "—"}</p><p>Units <b>{sales.units || 0}</b> · Orders <b>{sales.orders || 0}</b> · Pages <b>{sales.pages_read || 0}</b></p><p>Gross <b>{sales.gross_sales || 0}</b> · Royalties <b>{sales.royalties || 0}</b> · Ad spend <b>{sales.ad_spend || 0}</b></p></Step>
        <Step title="9 · Controlled experiments" value={data.experiments?.[0]?.id}><p>{data.experiments?.length || 0} experiment(s)</p><p>{(data.experiments || []).slice(0, 5).map((row: any) => `${row.change_field}:${row.status}${row.relative_lift != null ? ` (${row.relative_lift})` : ""}`).join(" · ") || "No experiments"}</p></Step>
        <Step title="10 · Learning outcomes" value={data.learningProposals?.[0]?.id}><p>{data.learningProposals?.length || 0} proposal(s) tied to this revision</p><p>{(data.learningProposals || []).slice(0, 5).map((row: any) => `${row.proposal_type}:${row.status}`).join(" · ") || "No later learning proposals"}</p></Step>
      </div>
    </> : null}
  </main>;
}
