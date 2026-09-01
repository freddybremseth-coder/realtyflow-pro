"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type FocusResult = {
  ok?: boolean;
  edition?: { id: string; title?: string; language?: string; format?: string } | null;
  revision?: { id: string; revision_number?: number; status?: string } | null;
  project?: { id: string; title?: string; language?: string; status?: string; approval?: { approved?: boolean; approvedAt?: string | null; approvedBy?: string | null } } | null;
  revisionMatches?: boolean;
  distributionReady?: boolean;
  blocking?: string[];
  next?: string;
  error?: string;
};

export function DistributionFocusContext() {
  const search = useSearchParams();
  const editionId = String(search.get("editionId") || "").trim();
  const revisionId = String(search.get("revisionId") || "").trim();
  const [result, setResult] = useState<FocusResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!editionId) {
      setLoaded(true);
      return;
    }
    const params = new URLSearchParams({ editionId });
    if (revisionId) params.set("revisionId", revisionId);
    fetch(`/api/book-growth/distribution/focus?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => setResult(res.ok ? body : { error: body?.error || `HTTP ${res.status}` }))
      .catch((error) => setResult({ error: error instanceof Error ? error.message : String(error) }))
      .finally(() => setLoaded(true));
  }, [editionId, revisionId]);

  if (!editionId) return null;
  const ready = Boolean(result?.distributionReady && result?.revisionMatches);

  return <div style={{ maxWidth: 1500, margin: "16px auto 0", padding: "0 24px", fontFamily: "system-ui, sans-serif" }}>
    <section style={{ border: `2px solid ${ready ? "#166534" : "#b45309"}`, borderRadius: 12, background: ready ? "#f0fdf4" : "#fffbeb", padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, color: ready ? "#166534" : "#92400e" }}>FOCUSED DISTRIBUTION CONTEXT</div>
      {!loaded ? <p style={{ marginBottom: 0 }}>Resolving the canonical distribution project…</p> : result?.error ? <p style={{ marginBottom: 0 }}>{result.error}</p> : <>
        <h2 style={{ margin: "6px 0 4px", fontSize: 19 }}>{result?.edition?.title || result?.project?.title || "Catalog edition"}</h2>
        <p style={{ margin: 0, lineHeight: 1.45 }}>
          {String(result?.edition?.language || "").toUpperCase()} · {result?.edition?.format || "edition"}
          {result?.revision?.revision_number ? ` · Revision ${result.revision.revision_number}` : ""}
          {result?.project?.title ? ` · Canonical project: ${result.project.title}` : ""}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 13 }}><b>Canonical revision:</b> {result?.revisionMatches ? "Yes" : "No"} · <b>Finally approved for Distribution:</b> {result?.distributionReady ? "Yes" : "No"}</p>
        {result?.project?.approval?.approvedAt ? <p style={{ margin: "5px 0 0", fontSize: 12 }}>Final approval: {result.project.approval.approvedBy || "owner"} · {new Date(result.project.approval.approvedAt).toLocaleString("nb-NO")}</p> : null}
        {Array.isArray(result?.blocking) && result.blocking.length ? <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>{result.blocking.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        <p style={{ margin: "8px 0 0", fontSize: 13 }}>{result?.next}</p>
        {ready ? <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 800 }}>Canonical project resolved above. In the Distribution selector, use this exact project. Rights confirmation, AI disclosure, channel selection, prepare and approval remain explicit actions.</p> : null}
      </>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        <Link href="/book-growth/distribution" style={{ fontWeight: 800 }}>Clear focused distribution context</Link>
        <Link href={`/book-growth/launch-factory?editionId=${encodeURIComponent(editionId)}${revisionId ? `&revisionId=${encodeURIComponent(revisionId)}` : ""}`} style={{ fontWeight: 800 }}>Back to this revision in Launch Factory</Link>
        {result?.project?.id ? <code style={{ fontSize: 11, overflowWrap: "anywhere" }}>canonical project: {result.project.id}</code> : null}
      </div>
    </section>
  </div>;
}
