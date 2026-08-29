"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";

type Bible = { id: string; bible_type: string; version: number; status: string; approved_by?: string | null; approved_at?: string | null };
type Edition = {
  editionId: string;
  title: string;
  seriesName?: string | null;
  language: string;
  format: string;
  kind: "fiction" | "nonfiction";
  canonicalRevision?: { id: string; revision_number: number; status: string } | null;
  canImport: boolean;
  bibles: Bible[];
  draftBibleIds: string[];
  readiness: { ready: boolean; missingBibles: string[]; missingChecks: string[]; taxonomyIssues: string[]; categoryCount: number; keywordCount: number };
  nextAction: { code: string; label: string };
};
type Data = { available: boolean; error?: string; summary?: Record<string, number>; editions?: Edition[] };

const labels: Record<string, string> = {
  series_bible: "Seriebibel",
  work_canon: "Canon",
  canon_consistency: "Canon-konsistens",
  editorial: "Redaksjonell kvalitet",
  factual: "Faktasjekk",
  citations: "Kilder og referanser",
  epub_validation: "EPUB-validering",
  accessibility: "Tilgjengelighet",
  metadata: "Metadata",
  missing_approved_category: "Godkjent kategori",
  needs_5_approved_keywords: "5–7 godkjente søkeord",
  too_many_approved_keywords: "Maksimalt 7 søkeord",
};

export default function QualityCenterPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    const response = await fetch("/api/book-growth/quality-center", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Kunne ikke laste Quality Center");
    setData(body);
  }, []);

  useEffect(() => { load().catch((err) => setError(err instanceof Error ? err.message : "Kunne ikke laste Quality Center")); }, [load]);

  const act = (edition: Edition, action: "import_existing_bibles" | "approve_bible_bundle") => {
    setBusyId(edition.editionId);
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/book-growth/quality-center", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action === "import_existing_bibles"
            ? { action, editionId: edition.editionId }
            : { action, bibleIds: edition.draftBibleIds }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Handlingen mislyktes");
        setNotice(action === "import_existing_bibles"
          ? body.created ? `${body.created} bibel-/canon-versjoner er importert til vurdering.` : body.message
          : "Seriebibel og canon er godkjent for dette bokverket.");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Handlingen mislyktes");
      } finally {
        setBusyId("");
      }
    });
  };

  if (!data && !error) return <main style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}><p role="status">Laster Quality Center…</p></main>;
  const summary = data?.summary ?? {};
  const editions = data?.editions ?? [];

  return <main style={{ maxWidth: 1400, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div><p style={{ margin: 0, color: "#1d4ed8", fontWeight: 900 }}>BOOK OS · FASE 3</p><h1 style={{ margin: "6px 0" }}>Quality Center</h1><p style={{ maxWidth: 800, marginTop: 0 }}>Én samlet oversikt for seriebibel, canon, manus-kvalitet, EPUB og søkeord. Hver bok viser bare neste nødvendige handling.</p></div>
      <Link href="/publishing/forfatterstudio" style={{ background: "#0f172a", color: "white", padding: "10px 14px", borderRadius: 8, fontWeight: 800, textDecoration: "none" }}>Åpne Forfatterstudio</Link>
    </header>

    {error ? <p role="alert" style={{ padding: 12, background: "#fee2e2", border: "1px solid #ef4444", borderRadius: 8 }}>{error}</p> : null}
    {notice ? <p role="status" style={{ padding: 12, background: "#ecfdf5", border: "1px solid #22c55e", borderRadius: 8 }}>{notice}</p> : null}

    <section aria-label="Quality Center status" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "20px 0" }}>
      {[["Utgaver", summary.editions], ["Klare", summary.ready], ["Mangler bibel/canon", summary.needsBible], ["Mangler kvalitet", summary.needsQuality], ["Mangler tagging", summary.needsTaxonomy]].map(([label, value]) => <article key={String(label)} style={{ background: "white", border: "1px solid #aebdce", borderRadius: 10, padding: 14 }}><div style={{ fontSize: 12, fontWeight: 800 }}>{label}</div><div style={{ fontSize: 28, fontWeight: 900 }}>{value ?? 0}</div></article>)}
    </section>

    <section style={{ background: "white", border: "1px solid #aebdce", borderRadius: 12, padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>Bøker og neste handling</h2>
      {editions.length === 0 ? <p>Ingen aktive utgaver finnes i den kanoniske katalogen.</p> : editions.map((edition) => {
        const busy = busyId === edition.editionId;
        const approved = edition.bibles.filter((row) => row.status === "approved");
        const missing = [...edition.readiness.missingBibles, ...edition.readiness.missingChecks, ...edition.readiness.taxonomyIssues];
        return <article key={edition.editionId} style={{ border: "1px solid #cbd5e1", borderRadius: 10, padding: 14, marginTop: 12, background: edition.readiness.ready ? "#f0fdf4" : "#f8fafc" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 520px" }}>
              <h3 style={{ margin: 0 }}>{edition.title}</h3>
              <p style={{ margin: "5px 0", color: "#475569" }}>{edition.seriesName ? `${edition.seriesName} · ` : ""}{edition.language.toUpperCase()} · {edition.format} · {edition.kind === "fiction" ? "Skjønnlitteratur" : "Sakprosa"}{edition.canonicalRevision ? ` · Revisjon ${edition.canonicalRevision.revision_number}` : " · Ingen kanonisk revisjon"}</p>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
                {approved.map((row) => <span key={row.id} style={{ padding: "4px 8px", borderRadius: 999, background: "#dcfce7", border: "1px solid #22c55e", fontSize: 12, fontWeight: 800 }}>{labels[row.bible_type] ?? row.bible_type} v{row.version} godkjent</span>)}
                {missing.slice(0, 5).map((item) => <span key={item} style={{ padding: "4px 8px", borderRadius: 999, background: "#fff7ed", border: "1px solid #fb923c", fontSize: 12 }}>{labels[item] ?? item}</span>)}
                {missing.length > 5 ? <span style={{ padding: "4px 8px", fontSize: 12 }}>+ {missing.length - 5} flere</span> : null}
              </div>
              <p style={{ marginBottom: 0, fontSize: 13 }}>Tagging: {edition.readiness.categoryCount} kategori · {edition.readiness.keywordCount} søkeord</p>
            </div>
            <div style={{ minWidth: 260, maxWidth: 360, background: "white", border: "1px solid #94a3b8", borderRadius: 9, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: "#475569" }}>ANBEFALT NESTE HANDLING</div>
              <strong style={{ display: "block", margin: "5px 0 10px" }}>{edition.nextAction.label}</strong>
              {edition.nextAction.code === "import_bibles" ? <button disabled={busy} onClick={() => act(edition, "import_existing_bibles")} style={{ width: "100%", padding: "9px 12px", border: 0, borderRadius: 8, background: "#1d4ed8", color: "white", fontWeight: 900 }}>{busy ? "Importerer…" : "Importer til vurdering"}</button> : null}
              {edition.nextAction.code === "approve_bibles" ? <button disabled={busy} onClick={() => act(edition, "approve_bible_bundle")} style={{ width: "100%", padding: "9px 12px", border: 0, borderRadius: 8, background: "#166534", color: "white", fontWeight: 900 }}>{busy ? "Godkjenner…" : "Godkjenn seriebibel og canon"}</button> : null}
              {edition.nextAction.code === "build_bibles" ? <Link href="/publishing/forfatterstudio" style={{ display: "block", textAlign: "center", padding: "9px 12px", borderRadius: 8, background: "#1d4ed8", color: "white", fontWeight: 900, textDecoration: "none" }}>Bygg i Forfatterstudio</Link> : null}
              {edition.nextAction.code === "ready" ? <div style={{ color: "#166534", fontWeight: 900 }}>✓ Klar for neste publiseringssteg</div> : null}
              {["select_revision", "quality_check", "taxonomy"].includes(edition.nextAction.code) ? <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>Neste fase kobler denne handlingen direkte til riktig verktøy.</p> : null}
            </div>
          </div>
        </article>;
      })}
    </section>
  </main>;
}
