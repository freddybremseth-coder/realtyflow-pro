"use client";

import { useState } from "react";
import { buildPublicationIngestDraft } from "@/lib/publishing/publication-ingest-draft";

export function PublicationPackageQuickstart({ onCreate }: { onCreate: (draft: unknown) => void }) {
  const [seriesKey, setSeriesKey] = useState("money-power");
  const [bookKey, setBookKey] = useState("debt-machine");
  const [title, setTitle] = useState("THE DEBT MACHINE");
  const [subtitle, setSubtitle] = useState("How Credit Creates Money, Fortunes, Crises and Power");
  const [seriesName, setSeriesName] = useState("Money & Power");
  const [seriesNumber, setSeriesNumber] = useState("2");
  const [language, setLanguage] = useState("en");
  const [revisionNumber, setRevisionNumber] = useState("1");
  const [error, setError] = useState("");

  function create() {
    try {
      const draft = buildPublicationIngestDraft({
        seriesKey,
        bookKey,
        title,
        subtitle,
        seriesName,
        seriesNumber: Number(seriesNumber),
        language,
        revisionNumber: Number(revisionNumber),
      });
      setError("");
      onCreate(draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const inputStyle = { width: "100%", padding: 8, marginTop: 4, boxSizing: "border-box" as const };
  return <section style={{ background: "white", border: "1px solid #aebdce", borderRadius: 14, padding: 18, marginBottom: 18 }}>
    <h2 style={{ marginTop: 0 }}>New package</h2>
    <p style={{ lineHeight: 1.5, marginTop: 0 }}>Create the Book OS identity first. Then upload one complete publication ZIP; Book OS verifies and expands the package automatically.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
      <label style={{ fontWeight: 800 }}>Series key<input value={seriesKey} onChange={(e) => setSeriesKey(e.target.value)} style={inputStyle} /></label>
      <label style={{ fontWeight: 800 }}>Book key<input value={bookKey} onChange={(e) => setBookKey(e.target.value)} style={inputStyle} /></label>
      <label style={{ fontWeight: 800 }}>Language<input value={language} onChange={(e) => setLanguage(e.target.value)} style={inputStyle} /></label>
      <label style={{ fontWeight: 800 }}>Revision<input type="number" min={1} value={revisionNumber} onChange={(e) => setRevisionNumber(e.target.value)} style={inputStyle} /></label>
      <label style={{ fontWeight: 800 }}>Series name<input value={seriesName} onChange={(e) => setSeriesName(e.target.value)} style={inputStyle} /></label>
      <label style={{ fontWeight: 800 }}>Series number<input type="number" min={1} value={seriesNumber} onChange={(e) => setSeriesNumber(e.target.value)} style={inputStyle} /></label>
    </div>
    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
      <label style={{ fontWeight: 800 }}>Title<input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} /></label>
      <label style={{ fontWeight: 800 }}>Subtitle<input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} style={inputStyle} /></label>
    </div>
    <button onClick={create} style={{ marginTop: 12, padding: "9px 14px", fontWeight: 900, background: "#0f172a", color: "white", borderRadius: 8 }}>Create package draft</button>
    {error ? <p style={{ color: "#b91c1c", fontWeight: 800 }}>{error}</p> : null}
  </section>;
}
