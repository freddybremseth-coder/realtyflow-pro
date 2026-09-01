"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type LaunchEdition = {
  editionId: string;
  title: string;
  seriesName?: string | null;
  language?: string;
  format?: string;
  revision?: { id: string; revision_number?: number; status?: string } | null;
  readyForCampaign?: boolean;
  missing?: string[];
  nextAction?: { code?: string; label?: string };
};

export function LaunchFactoryFocusContext() {
  const search = useSearchParams();
  const editionId = String(search.get("editionId") || "").trim();
  const revisionId = String(search.get("revisionId") || "").trim();
  const [editions, setEditions] = useState<LaunchEdition[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!editionId && !revisionId) {
      setLoaded(true);
      return;
    }
    fetch("/api/book-growth/launch-factory", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => setEditions(Array.isArray(body?.editions) ? body.editions : []))
      .catch(() => setEditions([]))
      .finally(() => setLoaded(true));
  }, [editionId, revisionId]);

  const focused = useMemo(() => editions.find((edition) => {
    if (editionId && edition.editionId !== editionId) return false;
    if (revisionId && edition.revision?.id !== revisionId) return false;
    return true;
  }) || null, [editions, editionId, revisionId]);

  if (!editionId && !revisionId) return null;

  return <div style={{ maxWidth: 1450, margin: "16px auto 0", padding: "0 24px", fontFamily: "system-ui, sans-serif" }}>
    <section style={{ border: "2px solid #166534", borderRadius: 12, background: "#f0fdf4", padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, color: "#166534" }}>FOCUSED LAUNCH CONTEXT FROM QUALITY CENTER</div>
      {!loaded ? <p style={{ marginBottom: 0 }}>Resolving the approved publication revision…</p> : focused ? <>
        <h2 style={{ margin: "6px 0 4px", fontSize: 19 }}>{focused.title}</h2>
        <p style={{ margin: 0, lineHeight: 1.45 }}>
          {focused.seriesName ? `${focused.seriesName} · ` : ""}{String(focused.language || "").toUpperCase()} · {focused.format || "edition"}
          {focused.revision?.revision_number ? ` · Revision ${focused.revision.revision_number}` : ""}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 13 }}><b>Launch readiness:</b> {focused.readyForCampaign ? "Ready for controlled campaign generation" : `Blocked — ${(focused.missing || []).join(", ") || "package requirements incomplete"}`}</p>
        <p style={{ margin: "5px 0 0", fontSize: 13 }}><b>Next Launch Factory action:</b> {focused.nextAction?.label || "Review the edition below."}</p>
      </> : <>
        <h2 style={{ margin: "6px 0 4px", fontSize: 19 }}>Revision context not found in Launch Factory</h2>
        <p style={{ margin: 0 }}>No campaign action is inferred or executed. The full Launch Factory remains available below.</p>
      </>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        <Link href="/book-growth/launch-factory" style={{ fontWeight: 800 }}>Clear focused launch context</Link>
        <Link href={`/book-growth/quality-center?editionId=${encodeURIComponent(editionId)}${revisionId ? `&revisionId=${encodeURIComponent(revisionId)}` : ""}`} style={{ fontWeight: 800 }}>Back to this revision in Quality Center</Link>
        {editionId ? <code style={{ fontSize: 11, overflowWrap: "anywhere" }}>edition: {editionId}</code> : null}
        {revisionId ? <code style={{ fontSize: 11, overflowWrap: "anywhere" }}>revision: {revisionId}</code> : null}
      </div>
    </section>
  </div>;
}
