"use client";

import { useEffect, useState } from "react";

type PreflightResponse = {
  ok?: boolean;
  preflight?: {
    ok: boolean;
    blocking: string[];
    warnings: string[];
    productionStatus: string;
    chapterCount: number;
    metadata: {
      descriptionPresent: boolean;
      keywordCount: number;
      categoryCount: number;
    };
    plannedArtifacts: string[];
    next: string;
  };
  cover?: { retrievable: boolean; type: string | null };
  existingIngest?: { ingest_key?: string; status?: string; created_at?: string } | null;
  error?: string;
};

export function ProductionHandoffPreflightCard({
  projectId,
  revisionNumber,
  onReadyChange,
}: {
  projectId: string;
  revisionNumber: number;
  onReadyChange?: (ready: boolean) => void;
}) {
  const [data, setData] = useState<PreflightResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setData(null);
      onReadyChange?.(false);
      return;
    }
    setLoading(true);
    onReadyChange?.(false);
    fetch(`/api/publishing/book-engine/production-handoff/preflight?id=${encodeURIComponent(projectId)}&revisionNumber=${Math.max(1, revisionNumber)}`, { cache: "no-store" })
      .then(async (res) => ({ res, json: await res.json().catch(() => ({})) }))
      .then(({ res, json }) => {
        if (cancelled) return;
        const next = { ...json, ok: res.ok } as PreflightResponse;
        setData(next);
        onReadyChange?.(Boolean(res.ok && next.preflight?.ok));
      })
      .catch((error) => {
        if (cancelled) return;
        setData({ ok: false, error: error instanceof Error ? error.message : String(error) });
        onReadyChange?.(false);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, revisionNumber, onReadyChange]);

  if (!projectId) return null;
  if (loading) return <section style={{ marginTop: 14, padding: 14, border: "1px solid #cbd5e1", borderRadius: 10, background: "#f8fafc" }}><b>Preflight:</b> checking project, metadata, cover and revision identity…</section>;
  if (!data?.preflight) return <section style={{ marginTop: 14, padding: 14, border: "1px solid #dc2626", borderRadius: 10, background: "#fef2f2" }}><b>Preflight unavailable:</b> {data?.error || "Unknown error"}</section>;

  const p = data.preflight;
  return <section style={{ marginTop: 14, padding: 14, border: `1px solid ${p.ok ? "#16a34a" : "#dc2626"}`, borderRadius: 10, background: p.ok ? "#f0fdf4" : "#fef2f2" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div><b>Production preflight</b><br />{p.ok ? "READY — no immutable writes performed" : "BLOCKED — resolve before generation"}</div>
      <div><b>Candidate status</b><br />{p.productionStatus}</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginTop: 12, fontSize: 13 }}>
      <div><b>Chapters</b><br />{p.chapterCount}</div>
      <div><b>Cover</b><br />{data.cover?.retrievable ? String(data.cover.type || "yes").toUpperCase() : "Missing"}</div>
      <div><b>Description</b><br />{p.metadata.descriptionPresent ? "Yes" : "Missing"}</div>
      <div><b>Keywords</b><br />{p.metadata.keywordCount}</div>
      <div><b>Categories</b><br />{p.metadata.categoryCount}</div>
      <div><b>Existing ingest</b><br />{data.existingIngest ? "Yes" : "No"}</div>
    </div>
    {p.blocking.length ? <div style={{ marginTop: 12 }}><b>Blocking</b><ul>{p.blocking.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
    {p.warnings.length ? <div style={{ marginTop: 12 }}><b>Warnings</b><ul>{p.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
    <details style={{ marginTop: 10 }}><summary style={{ cursor: "pointer", fontWeight: 800 }}>Planned immutable artifacts</summary><ul>{p.plannedArtifacts.map((item) => <li key={item}>{item}</li>)}</ul></details>
    <p style={{ marginBottom: 0, fontSize: 13 }}><b>Next:</b> {p.next}</p>
  </section>;
}
