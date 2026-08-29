"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";

type CatalogData = {
  available: boolean;
  error?: string;
  summary?: Record<string, number>;
  editions?: Array<{ id: string; title: string; language: string; format: string; status: string; score: number; issues: string[] }>;
  candidates?: Array<{ id: string; status: string; confidence: number; match_type: string; sourceWork?: { canonical_title: string } | null; targetWork?: { canonical_title: string } | null }>;
};

const issueLabels: Record<string, string> = {
  missing_canonical_revision: "Mangler kanonisk manus",
  missing_epub: "Mangler EPUB",
  missing_cover: "Mangler omslag",
  missing_sample: "Mangler smakebit",
  missing_identifier: "Mangler verifisert ISBN/ASIN",
  missing_publication_link: "Publikasjonen er ikke koblet til utgaven",
};

export default function CanonicalCatalogPage() {
  const [data, setData] = useState<CatalogData | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/book-growth/canonical-catalog", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Kunne ikke laste katalogen");
    setData(body);
  }, []);

  useEffect(() => {
    load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Kunne ikke laste katalogen"));
  }, [load]);

  const act = (candidateId: string, action: "approve" | "reject" | "apply") => {
    setBusyId(candidateId);
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/book-growth/canonical-catalog", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ candidateId, action }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Handlingen mislyktes");
        await load();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Handlingen mislyktes");
      } finally {
        setBusyId("");
      }
    });
  };

  if (!data && !error) return <main style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}><p role="status">Laster Canonical Catalogue…</p></main>;

  const summary = data?.summary ?? {};
  const editions = data?.editions ?? [];
  const incomplete = editions.filter((edition) => edition.issues.length > 0);
  const candidates = data?.candidates ?? [];

  return <main style={{ maxWidth: 1400, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div>
        <p style={{ margin: 0, fontWeight: 900, color: "#1d4ed8" }}>BOOK OS · FASE 2</p>
        <h1 style={{ margin: "6px 0" }}>Canonical Catalogue</h1>
        <p style={{ maxWidth: 760, marginTop: 0 }}>Én sann identitet for bokverk, utgaver, manusrevisjoner, filer, ISBN/ASIN og kanalpublikasjoner.</p>
      </div>
      <Link href="/publishing/forfatterstudio" style={{ background: "#0f172a", color: "white", padding: "10px 14px", borderRadius: 8, fontWeight: 800, textDecoration: "none" }}>Åpne Forfatterstudio</Link>
    </header>

    {error ? <p role="alert" style={{ padding: 12, background: "#fee2e2", border: "1px solid #ef4444", borderRadius: 8 }}>{error}</p> : null}
    {data && !data.available ? <section style={{ padding: 18, background: "#fff7ed", border: "1px solid #f97316", borderRadius: 12 }}><h2 style={{ marginTop: 0 }}>Ikke aktivert ennå</h2><p>{data.error}</p><p>Migreringen må verifiseres i CI og godkjennes før den kjøres i Supabase.</p></section> : null}

    {data?.available ? <>
      <section aria-label="Katalogstatus" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "20px 0" }}>
        {[
          ["Verk", summary.works], ["Utgaver", summary.editions], ["Komplette", summary.completeEditions],
          ["Dekning", `${summary.completenessPercent ?? 0}%`], ["Avventer vurdering", summary.pendingMerges], ["Godkjent, ikke utført", summary.approvedMerges],
        ].map(([label, value]) => <article key={String(label)} style={{ background: "white", border: "1px solid #aebdce", borderRadius: 10, padding: 14 }}><div style={{ fontSize: 12, fontWeight: 800 }}>{label}</div><div style={{ fontSize: 28, fontWeight: 900 }}>{value ?? 0}</div></article>)}
      </section>

      <section style={{ background: "white", border: "1px solid #aebdce", borderRadius: 12, padding: 18, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Utgaver som trenger arbeid ({incomplete.length})</h2>
        {incomplete.length === 0 ? <p>Alle utgaver er komplette.</p> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th align="left">Bok</th><th align="left">Utgave</th><th align="left">Dekning</th><th align="left">Neste arbeid</th></tr></thead><tbody>{incomplete.map((edition) => <tr key={edition.id}><td style={{ padding: 10, borderTop: "1px solid #cbd5e1", fontWeight: 800 }}>{edition.title}</td><td style={{ padding: 10, borderTop: "1px solid #cbd5e1" }}>{edition.language.toUpperCase()} · {edition.format}</td><td style={{ padding: 10, borderTop: "1px solid #cbd5e1" }}>{edition.score}%</td><td style={{ padding: 10, borderTop: "1px solid #cbd5e1" }}>{edition.issues.map((issue) => issueLabels[issue] ?? issue).join(" · ")}</td></tr>)}</tbody></table></div>}
      </section>

      <section style={{ background: "white", border: "1px solid #aebdce", borderRadius: 12, padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Mulige duplikatverk ({candidates.length})</h2>
        <p>Lik tittel er bare et forslag. Ingen bøker slås sammen før du først godkjenner og deretter uttrykkelig utfører sammenslåingen.</p>
        {candidates.length === 0 ? <p>Ingen kandidater trenger vurdering.</p> : candidates.map((candidate) => {
          const busy = busyId === candidate.id;
          return <article key={candidate.id} style={{ borderTop: "1px solid #cbd5e1", padding: "14px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><strong>{candidate.sourceWork?.canonical_title ?? "Ukjent verk"}</strong> → <strong>{candidate.targetWork?.canonical_title ?? "Ukjent verk"}</strong><div>{Math.round(candidate.confidence * 100)}% samsvar · {candidate.match_type} · Status: {candidate.status}</div></div><div style={{ display: "flex", gap: 8 }}>
              {candidate.status === "pending" ? <><button disabled={busy} onClick={() => act(candidate.id, "approve")} style={{ padding: "8px 12px", fontWeight: 800 }}>Godkjenn forslag</button><button disabled={busy} onClick={() => act(candidate.id, "reject")} style={{ padding: "8px 12px" }}>Avvis</button></> : null}
              {candidate.status === "approved" ? <button disabled={busy} onClick={() => act(candidate.id, "apply")} style={{ padding: "8px 12px", background: "#166534", color: "white", fontWeight: 900 }}>Utfør sammenslåing</button> : null}
              {busy ? <span role="status">Arbeider…</span> : null}
            </div></div>
          </article>;
        })}
      </section>
    </> : null}
  </main>;
}
