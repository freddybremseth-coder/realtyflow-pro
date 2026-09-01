"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type FocusEdition = {
  editionId: string;
  title: string;
  seriesName?: string | null;
  language?: string;
  format?: string;
  canonicalRevision?: { id: string; revision_number: number; status: string } | null;
  nextAction?: { label?: string };
};

export function QualityCenterFocusContext() {
  const search = useSearchParams();
  const editionId = String(search.get("editionId") || "").trim();
  const revisionId = String(search.get("revisionId") || "").trim();
  const [editions, setEditions] = useState<FocusEdition[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!editionId && !revisionId) {
      setLoaded(true);
      return;
    }
    fetch("/api/book-growth/quality-center", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => setEditions(Array.isArray(body?.editions) ? body.editions : []))
      .catch(() => setEditions([]))
      .finally(() => setLoaded(true));
  }, [editionId, revisionId]);

  const focused = useMemo(() => editions.find((edition) => {
    if (editionId && edition.editionId !== editionId) return false;
    if (revisionId && edition.canonicalRevision?.id !== revisionId) return false;
    return true;
  }) || null, [editions, editionId, revisionId]);

  if (!editionId && !revisionId) return null;

  return <div style={{ maxWidth: 1400, margin: "16px auto 0", padding: "0 24px", fontFamily: "system-ui, sans-serif" }}>
    <section style={{ border: "2px solid #2563eb", borderRadius: 12, background: "#eff6ff", padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, color: "#1d4ed8" }}>FOCUSED REVIEW FROM PRODUCTION HANDOFF</div>
      {!loaded ? <p style={{ marginBottom: 0 }}>Resolving the ingested publication revision…</p> : focused ? <>
        <h2 style={{ margin: "6px 0 4px", fontSize: 19 }}>{focused.title}</h2>
        <p style={{ margin: 0, lineHeight: 1.45 }}>
          {focused.seriesName ? `${focused.seriesName} · ` : ""}{String(focused.language || "").toUpperCase()} · {focused.format || "edition"}
          {focused.canonicalRevision ? ` · Revision ${focused.canonicalRevision.revision_number} · ${focused.canonicalRevision.status}` : ""}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 13 }}><b>Next Quality Center action:</b> {focused.nextAction?.label || "Review the revision below."}</p>
      </> : <>
        <h2 style={{ margin: "6px 0 4px", fontSize: 19 }}>Revision context not found in the active Quality Center set</h2>
        <p style={{ margin: 0, lineHeight: 1.45 }}>The deep link is preserved, but no approval action will be inferred or executed. Refresh the catalogue or open the full Quality Center list.</p>
      </>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <Link href="/book-growth/quality-center" style={{ fontWeight: 800 }}>Clear focused review</Link>
        {editionId ? <code style={{ fontSize: 11, overflowWrap: "anywhere" }}>edition: {editionId}</code> : null}
        {revisionId ? <code style={{ fontSize: 11, overflowWrap: "anywhere" }}>revision: {revisionId}</code> : null}
      </div>
    </section>
  </div>;
}
