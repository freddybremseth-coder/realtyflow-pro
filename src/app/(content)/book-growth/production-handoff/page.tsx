"use client";

import { useEffect, useMemo, useState } from "react";

type Project = { id: string; title: string; subtitle?: string; language?: string; series_name?: string; status?: string; updated_at?: string };

export default function ProductionHandoffPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [revision, setRevision] = useState(1);
  const [handoff, setHandoff] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/publishing/book-engine", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => setProjects(Array.isArray(json.projects) ? json.projects : []))
      .catch((error) => setStatus(String(error)));
  }, []);

  const ready = useMemo(() => projects.filter((project) => project.status === "ready_for_export"), [projects]);
  const selected = projects.find((project) => project.id === projectId) || null;

  async function prepare() {
    if (!projectId) return;
    setBusy(true); setHandoff(null); setResult(null); setStatus("Generating canonical DOCX, EPUB, cover copy, metadata and digital package…");
    try {
      const res = await fetch("/api/publishing/book-engine/production-handoff", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: projectId, revisionNumber: revision }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Production handoff failed (${res.status})`);
      setHandoff(json);
      setStatus("Digital handoff prepared and SHA-256 verified. Print artifacts remain a separate gate.");
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function packageAction(action: "preview" | "ingest") {
    if (!handoff?.manifest) return;
    setBusy(true); setResult(null); setStatus(action === "preview" ? "Previewing Book OS gates…" : "Registering revision in review…");
    try {
      const res = await fetch("/api/book-growth/package-ingest", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, actor: "book_engine_production_handoff", manifest: handoff.manifest }),
      });
      const json = await res.json().catch(() => ({}));
      setResult({ ok: res.ok, status: res.status, ...json });
      if (!res.ok) throw new Error(json.error || `${action} failed (${res.status})`);
      setStatus(action === "preview" ? "Gate preview passed. No revision was ingested." : "Revision registered in review. Continue in Quality Center.");
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 72px", fontFamily: "system-ui, sans-serif" }}>
    <header style={{ marginBottom: 22 }}>
      <p style={{ fontWeight: 900, letterSpacing: 1.4, fontSize: 12, margin: 0 }}>BOOK OS · BOOK ENGINE BRIDGE</p>
      <h1 style={{ fontSize: 34, margin: "6px 0" }}>Production Handoff</h1>
      <p style={{ maxWidth: 900, lineHeight: 1.55 }}>Convert a finished Book Engine project into verified Book OS production artifacts. The bridge generates real DOCX and EPUB files, captures the canonical cover, creates retailer metadata and a digital package ZIP, then stops for controlled preview and Quality Center review.</p>
    </header>

    <section style={{ background: "white", border: "1px solid #aebdce", borderRadius: 14, padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>1. Select ready project</h2>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) 150px", gap: 10 }}>
        <label style={{ fontWeight: 800 }}>Book Engine project
          <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setHandoff(null); setResult(null); }} style={{ display: "block", width: "100%", padding: 9, marginTop: 5 }}>
            <option value="">Choose a ready_for_export project…</option>
            {ready.map((project) => <option key={project.id} value={project.id}>{project.title} · {(project.language || "en").toUpperCase()}</option>)}
          </select>
        </label>
        <label style={{ fontWeight: 800 }}>Revision
          <input type="number" min={1} value={revision} onChange={(e) => setRevision(Math.max(1, Number(e.target.value) || 1))} style={{ display: "block", width: "100%", padding: 9, marginTop: 5, boxSizing: "border-box" }} />
        </label>
      </div>
      {ready.length === 0 ? <p style={{ color: "#b45309", fontWeight: 800 }}>No Book Engine projects are currently marked ready_for_export.</p> : null}
      {selected ? <p style={{ fontSize: 13 }}>Selected: <b>{selected.title}</b>{selected.subtitle ? ` — ${selected.subtitle}` : ""}{selected.series_name ? ` · ${selected.series_name}` : ""}</p> : null}
      <button disabled={busy || !projectId} onClick={prepare} style={{ marginTop: 8, padding: "10px 15px", fontWeight: 900, background: "#0f172a", color: "white", borderRadius: 8 }}>Prepare verified digital handoff</button>
    </section>

    {handoff ? <section style={{ marginTop: 18, background: "white", border: "1px solid #aebdce", borderRadius: 14, padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>2. Verify handoff</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        <div><b>Status</b><br />{handoff.manifest?.productionStatus}</div>
        <div><b>Assets</b><br />{handoff.manifest?.assets?.length || 0}</div>
        <div><b>Next gate</b><br />{handoff.gates?.nextGate || "quality_center"}</div>
        <div><b>Auto approved</b><br />{handoff.gates?.autoApproved ? "Yes" : "No"}</div>
        <div><b>Auto published</b><br />{handoff.gates?.autoPublished ? "Yes" : "No"}</div>
      </div>
      {Array.isArray(handoff.readiness?.warnings) ? <ul>{handoff.readiness.warnings.map((warning: string) => <li key={warning}>{warning}</li>)}</ul> : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button disabled={busy} onClick={() => packageAction("preview")} style={{ padding: "9px 14px", fontWeight: 900 }}>Preview Book OS gates</button>
        <button disabled={busy} onClick={() => packageAction("ingest")} style={{ padding: "9px 14px", fontWeight: 900, background: "#14532d", color: "white", borderRadius: 8 }}>Ingest into review</button>
        <a href="/book-growth/quality-center" style={{ padding: "9px 14px", fontWeight: 900 }}>Open Quality Center</a>
      </div>
      <details style={{ marginTop: 14 }}><summary style={{ cursor: "pointer", fontWeight: 800 }}>Advanced manifest</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11, background: "#f8fafc", padding: 12, borderRadius: 8 }}>{JSON.stringify(handoff.manifest, null, 2)}</pre></details>
    </section> : null}

    {result ? <section style={{ marginTop: 18, background: "white", border: "1px solid #aebdce", borderRadius: 14, padding: 18 }}><h2 style={{ marginTop: 0 }}>Gate result</h2><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11, background: result.ok ? "#f0fdf4" : "#fef2f2", padding: 12, borderRadius: 8 }}>{JSON.stringify(result, null, 2)}</pre></section> : null}
    {status ? <p style={{ marginTop: 18, padding: 12, border: "1px solid #cbd5e1", borderRadius: 10, background: "#f8fafc", fontWeight: 700 }}>{status}</p> : null}
  </main>;
}
