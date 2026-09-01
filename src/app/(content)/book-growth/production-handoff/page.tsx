"use client";

import { useEffect, useMemo, useState } from "react";

type Project = { id: string; title: string; subtitle?: string; language?: string; series_name?: string; status?: string; updated_at?: string };

export default function ProductionHandoffPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [revision, setRevision] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
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
    if (!projectId || !confirmed) return;
    setBusy(true); setHandoff(null); setResult(null);
    setStatus("Generating the locked publication revision: DOCX, EPUB, canonical cover, retailer metadata, 6×9 print interior, page-count-dependent KDP full-wrap and complete ZIP…");
    try {
      const res = await fetch("/api/publishing/book-engine/production-handoff", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: projectId, revisionNumber: revision }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Production handoff failed (${res.status})`);
      setHandoff(json);
      setStatus("Publication-ready package prepared. Immutable assets are SHA-256 verified. Preview Book OS gates before ingesting into review.");
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function packageAction(action: "preview" | "ingest") {
    if (!handoff?.manifest) return;
    setBusy(true); setResult(null); setStatus(action === "preview" ? "Previewing Book OS gates…" : "Registering locked publication revision in review…");
    try {
      const res = await fetch("/api/book-growth/package-ingest", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, actor: "book_engine_production_handoff", manifest: handoff.manifest }),
      });
      const json = await res.json().catch(() => ({}));
      setResult({ ok: res.ok, status: res.status, ...json });
      if (!res.ok) throw new Error(json.error || `${action} failed (${res.status})`);
      setStatus(action === "preview" ? "Gate preview passed. No revision was ingested." : "Revision registered in review. Continue in Quality Center; nothing has been auto-approved or auto-published.");
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  const generatedEntries = handoff?.generated && typeof handoff.generated === "object" ? Object.entries(handoff.generated) : [];

  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 72px", fontFamily: "system-ui, sans-serif" }}>
    <header style={{ marginBottom: 22 }}>
      <p style={{ fontWeight: 900, letterSpacing: 1.4, fontSize: 12, margin: 0 }}>BOOK OS · BOOK ENGINE BRIDGE</p>
      <h1 style={{ fontSize: 34, margin: "6px 0" }}>Production Handoff</h1>
      <p style={{ maxWidth: 920, lineHeight: 1.55 }}>Convert a finished Book Engine project into one locked, verified publication revision. The bridge generates the master DOCX, retailer EPUB, canonical ebook cover, retailer metadata, exact 6×9 print interior, actual final page count, KDP full-wrap and complete publication ZIP. It then stops for controlled gate preview and Quality Center review.</p>
    </header>

    <section style={{ background: "white", border: "1px solid #aebdce", borderRadius: 14, padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>1. Select ready project</h2>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) 150px", gap: 10 }}>
        <label style={{ fontWeight: 800 }}>Book Engine project
          <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setHandoff(null); setResult(null); setConfirmed(false); }} style={{ display: "block", width: "100%", padding: 9, marginTop: 5 }}>
            <option value="">Choose a ready_for_export project…</option>
            {ready.map((project) => <option key={project.id} value={project.id}>{project.title} · {(project.language || "en").toUpperCase()}</option>)}
          </select>
        </label>
        <label style={{ fontWeight: 800 }}>Revision
          <input type="number" min={1} value={revision} onChange={(e) => { setRevision(Math.max(1, Number(e.target.value) || 1)); setConfirmed(false); }} style={{ display: "block", width: "100%", padding: 9, marginTop: 5, boxSizing: "border-box" }} />
        </label>
      </div>
      {ready.length === 0 ? <p style={{ color: "#b45309", fontWeight: 800 }}>No Book Engine projects are currently marked ready_for_export.</p> : null}
      {selected ? <p style={{ fontSize: 13 }}>Selected: <b>{selected.title}</b>{selected.subtitle ? ` — ${selected.subtitle}` : ""}{selected.series_name ? ` · ${selected.series_name}` : ""}</p> : null}
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, maxWidth: 900, lineHeight: 1.45 }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={!projectId || busy} style={{ marginTop: 3 }} />
        <span><b>I understand this creates immutable production assets for this revision.</b> Re-running the same revision is safe only when the generated fingerprints are identical; changed content must use a new revision number.</span>
      </label>
      <button disabled={busy || !projectId || !confirmed} onClick={prepare} style={{ marginTop: 12, padding: "10px 15px", fontWeight: 900, background: "#0f172a", color: "white", borderRadius: 8, opacity: busy || !projectId || !confirmed ? 0.55 : 1 }}>Generate publication-ready package</button>
    </section>

    {handoff ? <section style={{ marginTop: 18, background: "white", border: "1px solid #aebdce", borderRadius: 14, padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>2. Verify publication revision</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        <div><b>Status</b><br />{handoff.manifest?.productionStatus || handoff.productionStatus}</div>
        <div><b>Assets</b><br />{handoff.manifest?.assets?.length || 0}</div>
        <div><b>Print pages</b><br />{handoff.print?.pageCount ?? "—"}</div>
        <div><b>Trim</b><br />{handoff.print?.trim || "—"}</div>
        <div><b>Paper</b><br />{handoff.print?.paper || "—"}</div>
        <div><b>Spine</b><br />{typeof handoff.print?.spineWidthIn === "number" ? `${handoff.print.spineWidthIn.toFixed(4)} in` : "—"}</div>
        <div><b>Full wrap</b><br />{typeof handoff.print?.fullCoverWidthIn === "number" && typeof handoff.print?.fullCoverHeightIn === "number" ? `${handoff.print.fullCoverWidthIn.toFixed(4)} × ${handoff.print.fullCoverHeightIn.toFixed(4)} in` : "—"}</div>
        <div><b>Next gate</b><br />{handoff.gates?.nextGate || "quality_center"}</div>
        <div><b>Auto approved</b><br />{handoff.gates?.autoApproved ? "Yes" : "No"}</div>
        <div><b>Auto published</b><br />{handoff.gates?.autoPublished ? "Yes" : "No"}</div>
      </div>

      {generatedEntries.length ? <div style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>SHA-256 fingerprints</h3>
        <div style={{ display: "grid", gap: 6 }}>
          {generatedEntries.map(([key, value]) => <div key={key} style={{ display: "grid", gridTemplateColumns: "210px minmax(0,1fr)", gap: 10, fontSize: 12 }}><b>{key}</b><code style={{ overflowWrap: "anywhere" }}>{String(value)}</code></div>)}
        </div>
      </div> : null}

      {Array.isArray(handoff.readiness?.warnings) && handoff.readiness.warnings.length ? <ul>{handoff.readiness.warnings.map((warning: string) => <li key={warning}>{warning}</li>)}</ul> : null}
      <p style={{ marginTop: 14, fontSize: 13, lineHeight: 1.5 }}><b>Control boundary:</b> generating the package does not ingest, approve, launch or publish it. Preview the manifest first; ingest only registers the revision in review.</p>
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
