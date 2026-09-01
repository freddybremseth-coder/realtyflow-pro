"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { distributionHref } from "@/lib/publishing/book-os-distribution-link";

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
  calendar?: Array<{
    handoffs?: Array<{
      releases?: Array<{ id?: string; status?: string }>;
    }>;
  }>;
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

  const approvedRelease = useMemo(() => focused?.calendar?.flatMap((item) => item.handoffs || [])
    .flatMap((handoff) => handoff.releases || [])
    .find((release) => release.status === "approved") || null, [focused]);

  if (!editionId && !revisionId) return null;
  const distributionLink = distributionHref({ editionId: focused?.editionId || editionId, revisionId: focused?.revision?.id || revisionId });

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
        {approvedRelease ? <p style={{ margin: "8px 0 0", fontSize: 13, color: "#166534", fontWeight: 900 }}>An approved release candidate exists. Distribution context may now be opened, but channel preparation and delivery remain separate explicit actions.</p> : null}
      </> : <>
        <h2 style={{ margin: "6px 0 4px", fontSize: 19 }}>Revision context not found in Launch Factory</h2>
        <p style={{ margin: 0 }}>No campaign action is inferred or executed. The full Launch Factory remains available below.</p>
      </>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        <Link href="/book-growth/launch-factory" style={{ fontWeight: 800 }}>Clear focused launch context</Link>
        <Link href={`/book-growth/quality-center?editionId=${encodeURIComponent(editionId)}${revisionId ? `&revisionId=${encodeURIComponent(revisionId)}` : ""}`} style={{ fontWeight: 800 }}>Back to this revision in Quality Center</Link>
        {approvedRelease ? <Link href={distributionLink} style={{ padding: "7px 10px", borderRadius: 8, background: "#0f172a", color: "white", textDecoration: "none", fontWeight: 900 }}>Open this release in Distribution</Link> : null}
        {editionId ? <code style={{ fontSize: 11, overflowWrap: "anywhere" }}>edition: {editionId}</code> : null}
        {revisionId ? <code style={{ fontSize: 11, overflowWrap: "anywhere" }}>revision: {revisionId}</code> : null}
      </div>
    </section>
  </div>;
}
