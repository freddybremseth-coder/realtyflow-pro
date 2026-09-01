"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type ExistingProject = {
  id: string;
  title?: string;
  status?: string;
  chapter_count?: number;
  outline_count?: number;
  generation_state?: string | null;
  production_progress?: Record<string, unknown>;
  book_os_origin?: Record<string, unknown>;
};

type Intake = {
  ok?: boolean;
  proposal?: {
    id: string;
    proposal_type?: string;
    status?: string;
    series_name?: string | null;
    proposed_title?: string | null;
    rationale?: string | null;
    evidence_count?: number | null;
    evidence_level?: string | null;
    proposed_action?: Record<string, unknown> | null;
    evidence_snapshot?: Record<string, unknown> | null;
  };
  evidence?: Array<{ id: string; evidence_type?: string; evidence?: Record<string, unknown> }>;
  suggestedDraft?: { title?: string; seriesName?: string; brief?: string; canonNotes?: string };
  existingProject?: ExistingProject | null;
  productionState?: string;
  safety?: Record<string, unknown>;
  error?: string;
};

const LANGUAGES = [
  ["en", "English"], ["no", "Norwegian"], ["es", "Spanish"], ["de", "German"], ["fr", "French"], ["it", "Italian"],
];
const GENRES = [["guide", "Nonfiction / guide"], ["self_development", "Self-development"], ["memoir", "Memoir / biography"], ["children", "Children"], ["fiction", "Fiction"]];

function resumeMessage(state: string, project?: ExistingProject | null) {
  if (state === "draft_pending") return "Existing traceable draft found. Production is still stopped.";
  if (state === "start_approved") return "Production start was approved earlier. Resume the controlled sequence from canon/SEO.";
  if (state === "attention") return "The previous production attempt stopped. Resume the controlled sequence; later steps will not run until the failed step succeeds.";
  if (state === "ready") return `Existing Book Engine project is publication-ready with ${project?.chapter_count ?? 0} chapters.`;
  if (state === "in_production") return `Existing Book Engine project is already in production with ${project?.chapter_count ?? 0} chapters.`;
  return "";
}

export default function LearningBookEngineIntakePage() {
  const search = useSearchParams();
  const proposalId = String(search.get("proposalId") || "").trim();
  const [intake, setIntake] = useState<Intake | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState("");
  const [productionStarted, setProductionStarted] = useState(false);
  const [productionMessage, setProductionMessage] = useState("");
  const [form, setForm] = useState({ title: "", seriesName: "", language: "en", genre: "guide", audience: "", brief: "", pages: 180, canonNotes: "" });

  useEffect(() => {
    if (!proposalId) { setError("proposalId is required"); setLoading(false); return; }
    fetch(`/api/publishing/book-engine/learning-intake?proposalId=${encodeURIComponent(proposalId)}`, { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => {
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        setIntake(body);
        setForm((current) => ({
          ...current,
          title: String(body?.suggestedDraft?.title || ""),
          seriesName: String(body?.suggestedDraft?.seriesName || ""),
          brief: String(body?.suggestedDraft?.brief || ""),
          canonNotes: String(body?.suggestedDraft?.canonNotes || ""),
        }));
        const existingId = String(body?.existingProject?.id || "").trim();
        const state = String(body?.productionState || "not_created");
        if (existingId) {
          setCreatedProjectId(existingId);
          setProductionStarted(["in_production", "ready"].includes(state));
          setProductionMessage(resumeMessage(state, body?.existingProject));
        }
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  }, [proposalId]);

  const ready = useMemo(() => Boolean(form.title.trim() && form.brief.trim() && proposalId && !busy && !createdProjectId), [form, proposalId, busy, createdProjectId]);

  async function createDraftProject() {
    if (!ready) return;
    setBusy(true); setError(""); setProductionMessage("");
    try {
      const res = await fetch("/api/publishing/book-engine/learning-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_draft",
          proposalId,
          title: form.title.trim(),
          genre: form.genre,
          language: form.language,
          audience: form.audience.trim(),
          brief: form.brief.trim(),
          seriesName: form.seriesName.trim(),
          canonNotes: form.canonNotes.trim(),
          pages: Number(form.pages || 180),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.project?.id) throw new Error(body?.error || "Could not create Book Engine draft project");
      if (body.production_started !== false || body.production_start_approved !== false) throw new Error("Book Engine draft safety contract was not confirmed");
      setCreatedProjectId(String(body.project.id));
      setProductionMessage("Draft registered. Production is still stopped.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function startControlledProduction() {
    if (!createdProjectId || !proposalId || busy || productionStarted) return;
    setBusy(true); setError("");
    try {
      setProductionMessage("Step 1/3: approving controlled production start…");
      const approveRes = await fetch("/api/publishing/book-engine/learning-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_production", proposalId, projectId: createdProjectId }),
      });
      const approved = await approveRes.json().catch(() => ({}));
      if (!approveRes.ok || approved.production_start_approved !== true || approved.production_started !== false) {
        throw new Error(approved?.error || "Controlled production start could not be approved");
      }

      setProductionMessage("Step 2/3: building SEO metadata and locking series bible/canon 1.0…");
      const seoRes = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "generate_seo", id: createdProjectId }),
      });
      const seo = await seoRes.json().catch(() => ({}));
      if (!seoRes.ok) throw new Error(seo?.error || "Series bible/canon generation failed");

      setProductionMessage("Step 3/3: building master outline, research and first chapter…");
      const authorRes = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "generate_author", id: createdProjectId }),
      });
      const author = await authorRes.json().catch(() => ({}));
      if (!authorRes.ok) throw new Error(author?.error || "Outline and first-chapter generation failed");

      setProductionStarted(true);
      setProductionMessage(author?.warning ? String(author.warning) : "Controlled production started successfully: canon, outline and first chapter are ready.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setProductionMessage("Production stopped at the failed step. No later step was started automatically.");
    } finally {
      setBusy(false);
    }
  }

  const card: React.CSSProperties = { background: "white", border: "1px solid #cbd5e1", borderRadius: 12, padding: 16 };
  return <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "system-ui,sans-serif" }}>
    <header>
      <p style={{ margin: 0, color: "#1d4ed8", fontWeight: 900 }}>BOOK OS · CONTROLLED BOOK ENGINE INTAKE</p>
      <h1 style={{ margin: "5px 0" }}>Approved learning proposal → draft → controlled production</h1>
      <p style={{ color: "#475569", maxWidth: 900 }}>This page keeps the approval boundaries separate and resumes the existing Book Engine state after reload. It never creates a second draft for the same approved proposal.</p>
    </header>

    {loading ? <p>Resolving approved proposal and Book Engine state…</p> : null}
    {error ? <p role="alert" style={{ padding: 12, background: "#fef2f2", border: "1px solid #ef4444", borderRadius: 8 }}>{error}</p> : null}

    {intake?.proposal ? <section style={{ ...card, marginTop: 16, background: "#eff6ff", borderColor: "#93c5fd" }}>
      <h2 style={{ marginTop: 0 }}>Approved proposal evidence</h2>
      <p><b>{intake.proposal.series_name ? `${intake.proposal.series_name}: ` : ""}{intake.proposal.proposed_title}</b></p>
      <p style={{ fontSize: 13 }}>{intake.proposal.rationale}</p>
      <p style={{ fontSize: 12, color: "#475569" }}>Proposal {intake.proposal.id} · {intake.proposal.evidence_count ?? 0} evidence points · {intake.proposal.evidence_level || "unknown"}</p>
      {intake.existingProject ? <p style={{ fontSize: 12, fontWeight: 800, color: "#0f766e" }}>Book Engine: {intake.productionState} · {intake.existingProject.title || intake.existingProject.id}</p> : null}
      <details><summary style={{ cursor: "pointer", fontWeight: 800 }}>Evidence snapshot</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{JSON.stringify(intake.proposal.evidence_snapshot || {}, null, 2)}</pre></details>
    </section> : null}

    {intake?.proposal && !createdProjectId ? <section style={{ ...card, marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Draft project intake</h2>
      <p style={{ fontSize: 12, color: "#475569" }}>Review and edit every field. Approval of the learning proposal does not approve these production settings.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 }}>
        <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ display: "block", width: "100%", padding: 9 }} /></label>
        <label>Series<input value={form.seriesName} onChange={(e) => setForm({ ...form, seriesName: e.target.value })} style={{ display: "block", width: "100%", padding: 9 }} /></label>
        <label>Language<select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} style={{ display: "block", width: "100%", padding: 9 }}>{LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Genre<select value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} style={{ display: "block", width: "100%", padding: 9 }}>{GENRES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Target pages<input type="number" min={60} max={800} value={form.pages} onChange={(e) => setForm({ ...form, pages: Number(e.target.value) || 180 })} style={{ display: "block", width: "100%", padding: 9 }} /></label>
        <label>Audience<input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} style={{ display: "block", width: "100%", padding: 9 }} /></label>
      </div>
      <label style={{ display: "block", marginTop: 10 }}>Book promise / brief<textarea value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} style={{ display: "block", width: "100%", minHeight: 100, padding: 9 }} /></label>
      <label style={{ display: "block", marginTop: 10 }}>Canon / provenance notes<textarea value={form.canonNotes} onChange={(e) => setForm({ ...form, canonNotes: e.target.value })} style={{ display: "block", width: "100%", minHeight: 90, padding: 9 }} /></label>
      <button disabled={!ready} onClick={createDraftProject} style={{ marginTop: 12, padding: "10px 14px", border: 0, borderRadius: 8, background: ready ? "#1d4ed8" : "#94a3b8", color: "white", fontWeight: 900 }}>{busy ? "Creating draft…" : "Create Book Engine draft"}</button>
      <p style={{ marginBottom: 0, fontSize: 12, color: "#92400e" }}><b>Boundary 1:</b> this creates one pending draft with structured proposal provenance. It does not start production.</p>
    </section> : null}

    {createdProjectId ? <section style={{ ...card, marginTop: 16, background: productionStarted ? "#ecfdf5" : "#fffbeb", borderColor: productionStarted ? "#86efac" : "#fbbf24" }}>
      <h2 style={{ marginTop: 0 }}>{productionStarted ? "Book Engine production is active" : "Existing draft — controlled production can be resumed"}</h2>
      <p>{productionMessage || "The approved proposal has one traceable Book Engine project."}</p>
      {!productionStarted ? <>
        <button disabled={busy} onClick={startControlledProduction} style={{ padding: "10px 14px", border: 0, borderRadius: 8, background: busy ? "#94a3b8" : "#166534", color: "white", fontWeight: 900 }}>{busy ? "Running controlled start…" : "Start / resume controlled production"}</button>
        <p style={{ marginBottom: 0, fontSize: 12, color: "#92400e" }}><b>Boundary 2:</b> the sequence remains start approval → SEO/canon → outline/first chapter. Existing approval is reused idempotently after reload or a failed attempt.</p>
      </> : <Link href={`/publishing/forfatterstudio?project=${encodeURIComponent(createdProjectId)}`} style={{ fontWeight: 900 }}>Open Book Engine project in Forfatterstudio</Link>}
    </section> : null}

    <div style={{ marginTop: 16 }}><Link href="/book-growth/learning">Back to Learning Proposal Center</Link></div>
  </main>;
}
