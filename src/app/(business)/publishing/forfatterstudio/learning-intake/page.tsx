"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  safety?: Record<string, unknown>;
  error?: string;
};

const LANGUAGES = [
  ["en", "English"], ["no", "Norwegian"], ["es", "Spanish"], ["de", "German"], ["fr", "French"], ["it", "Italian"],
];
const GENRES = [["guide", "Nonfiction / guide"], ["self_development", "Self-development"], ["memoir", "Memoir / biography"], ["children", "Children"], ["fiction", "Fiction"]];

export default function LearningBookEngineIntakePage() {
  const search = useSearchParams();
  const proposalId = String(search.get("proposalId") || "").trim();
  const [intake, setIntake] = useState<Intake | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState("");
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
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  }, [proposalId]);

  const ready = useMemo(() => Boolean(form.title.trim() && form.brief.trim() && proposalId && !busy && !createdProjectId), [form, proposalId, busy, createdProjectId]);

  async function createDraftProject() {
    if (!ready) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/publishing/book-engine/learning-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      if (body.production_started !== false) throw new Error("Book Engine safety contract was not confirmed");
      setCreatedProjectId(String(body.project.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  const card: React.CSSProperties = { background: "white", border: "1px solid #cbd5e1", borderRadius: 12, padding: 16 };
  return <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "system-ui,sans-serif" }}>
    <header>
      <p style={{ margin: 0, color: "#1d4ed8", fontWeight: 900 }}>BOOK OS · CONTROLLED BOOK ENGINE INTAKE</p>
      <h1 style={{ margin: "5px 0" }}>Approved learning proposal → draft project</h1>
      <p style={{ color: "#475569", maxWidth: 900 }}>This page can prepare a Book Engine draft from an explicitly approved next-book proposal. Nothing is created until you press the create button. Creating the draft records structured Book OS provenance and does not run SEO, lock canon, build the outline or start writing.</p>
    </header>

    {loading ? <p>Resolving approved proposal…</p> : null}
    {error ? <p role="alert" style={{ padding: 12, background: "#fef2f2", border: "1px solid #ef4444", borderRadius: 8 }}>{error}</p> : null}

    {intake?.proposal ? <section style={{ ...card, marginTop: 16, background: "#eff6ff", borderColor: "#93c5fd" }}>
      <h2 style={{ marginTop: 0 }}>Approved proposal evidence</h2>
      <p><b>{intake.proposal.series_name ? `${intake.proposal.series_name}: ` : ""}{intake.proposal.proposed_title}</b></p>
      <p style={{ fontSize: 13 }}>{intake.proposal.rationale}</p>
      <p style={{ fontSize: 12, color: "#475569" }}>Proposal {intake.proposal.id} · {intake.proposal.evidence_count ?? 0} evidence points · {intake.proposal.evidence_level || "unknown"}</p>
      <details><summary style={{ cursor: "pointer", fontWeight: 800 }}>Evidence snapshot</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{JSON.stringify(intake.proposal.evidence_snapshot || {}, null, 2)}</pre></details>
    </section> : null}

    {intake?.proposal ? <section style={{ ...card, marginTop: 16 }}>
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
      <p style={{ marginBottom: 0, fontSize: 12, color: "#92400e" }}><b>Fixed boundary:</b> this button creates one draft with structured proposal provenance. It does not start SEO, canon, outline, writing, publication or distribution.</p>
    </section> : null}

    {createdProjectId ? <section style={{ ...card, marginTop: 16, background: "#ecfdf5", borderColor: "#86efac" }}>
      <h2 style={{ marginTop: 0 }}>Draft created</h2>
      <p>The approved proposal has produced one traceable Book Engine draft. Production remains stopped until an explicit action in Forfatterstudio.</p>
      <Link href={`/publishing/forfatterstudio?project=${encodeURIComponent(createdProjectId)}`} style={{ fontWeight: 900 }}>Open draft in Forfatterstudio</Link>
    </section> : null}

    <div style={{ marginTop: 16 }}><Link href="/book-growth/learning">Back to Learning Proposal Center</Link></div>
  </main>;
}
