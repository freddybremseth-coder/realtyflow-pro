"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Summary = { works: number; editions: number; completenessPercent: number; pendingMerges: number; approvedMerges: number };

export function CatalogCoverage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/book-growth/canonical-catalog", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((body) => { setAvailable(Boolean(body.available)); setSummary(body.summary ?? null); })
      .catch((error) => { if (error?.name !== "AbortError") setAvailable(false); });
    return () => controller.abort();
  }, []);

  return <section aria-label="Canonical Catalogue" style={{ margin: "0 0 16px", padding: 16, border: "1px solid #334155", borderRadius: 12, background: "#0f172a", color: "#f8fafc" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <div><strong style={{ color: "white" }}>Canonical Catalogue</strong><div style={{ color: "#cbd5e1", marginTop: 4 }}>{available === null ? "Laster katalogstatus…" : available && summary ? `${summary.works} verk · ${summary.editions} utgaver · ${summary.completenessPercent}% komplette · ${summary.pendingMerges} forslag til vurdering` : "Fase 2 venter på godkjent databasemigrering."}</div></div>
      <Link href="/book-growth/canonical-catalog" style={{ color: "#0f172a", background: "#f8fafc", borderRadius: 8, padding: "9px 12px", fontWeight: 900, textDecoration: "none" }}>{available ? "Se katalog og mangler" : "Se fase 2-status"}</Link>
    </div>
  </section>;
}
