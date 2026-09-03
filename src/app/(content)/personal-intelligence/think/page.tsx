"use client";

import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, Loader2, Plus, RefreshCw, Scale, Sparkles } from "lucide-react";

type Option = { id: string; label: string; description?: string | null; upside?: string | null; downside?: string | null; opportunity_cost?: string | null };
type Assumption = { id: string; statement: string; importance?: number | null; confidence?: number | null; testability?: string; test_plan?: string | null; status?: string };
type Outcome = { id: string; actual_outcome: string; decision_quality: number | null; outcome_quality: number | null; luck_factor: number | null; lesson?: string | null; belief_update?: string | null; review_date: string };
type Decision = {
  id: string;
  title: string;
  decision_type: string;
  description?: string | null;
  deadline?: string | null;
  reversibility: string;
  stakes: string;
  status: string;
  confidence?: number | null;
  chosen_option_id?: string | null;
  uncertainty_notes?: string | null;
  premortem?: string | null;
  scenario_notes?: string | null;
  decided_at?: string | null;
  created_at: string;
  options: Option[];
  assumptions: Assumption[];
  outcomes: Outcome[];
};

type DraftOption = { label: string; description: string; upside: string; downside: string; opportunityCost: string };
type DraftAssumption = { statement: string; importance: string; confidence: string; testability: string; testPlan: string };
type Analysis = Record<string, unknown>;

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `${url} feilet (${response.status})`);
  return body as T;
}

function scoreLabel(value: number | null | undefined) {
  return value == null ? "Unknown" : `${Math.round(value * 100)}%`;
}

function asText(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("\n• ");
  return typeof value === "string" ? value : value == null ? "" : JSON.stringify(value, null, 2);
}

const emptyOption = (): DraftOption => ({ label: "", description: "", upside: "", downside: "", opportunityCost: "" });
const emptyAssumption = (): DraftAssumption => ({ statement: "", importance: "", confidence: "", testability: "unknown", testPlan: "" });

export default function ThinkPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [decisionType, setDecisionType] = useState("operational");
  const [reversibility, setReversibility] = useState("unknown");
  const [stakes, setStakes] = useState("medium");
  const [confidence, setConfidence] = useState("");
  const [uncertaintyNotes, setUncertaintyNotes] = useState("");
  const [premortem, setPremortem] = useState("");
  const [scenarioNotes, setScenarioNotes] = useState("");
  const [options, setOptions] = useState<DraftOption[]>([emptyOption(), emptyOption()]);
  const [assumptions, setAssumptions] = useState<DraftAssumption[]>([emptyAssumption()]);

  const [outcomeText, setOutcomeText] = useState("");
  const [decisionQuality, setDecisionQuality] = useState("");
  const [outcomeQuality, setOutcomeQuality] = useState("");
  const [luckFactor, setLuckFactor] = useState("");
  const [lesson, setLesson] = useState("");

  const selected = useMemo(() => decisions.find((decision) => decision.id === selectedId) || null, [decisions, selectedId]);

  async function loadDecisions(preferId?: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await jsonRequest<{ ok: boolean; decisions: Decision[] }>("/api/personal-intelligence/decisions");
      setDecisions(result.decisions);
      const nextId = preferId || selectedId;
      if (nextId && result.decisions.some((decision) => decision.id === nextId)) setSelectedId(nextId);
      else if (!creating) setSelectedId(result.decisions[0]?.id || null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDecisions(); }, []);

  function startNew() {
    setCreating(true);
    setSelectedId(null);
    setAnalysis(null);
    setTitle(""); setDescription(""); setDecisionType("operational"); setReversibility("unknown"); setStakes("medium"); setConfidence("");
    setUncertaintyNotes(""); setPremortem(""); setScenarioNotes(""); setOptions([emptyOption(), emptyOption()]); setAssumptions([emptyAssumption()]);
  }

  async function createDecision() {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const result = await jsonRequest<{ ok: boolean; decision: { id: string } }>("/api/personal-intelligence/decisions", {
        method: "POST",
        body: JSON.stringify({
          title, description, decisionType, reversibility, stakes,
          confidence: confidence === "" ? null : Number(confidence) / 100,
          uncertaintyNotes, premortem, scenarioNotes,
          options,
          assumptions: assumptions.map((item) => ({ ...item, importance: item.importance === "" ? null : Number(item.importance) / 100, confidence: item.confidence === "" ? null : Number(item.confidence) / 100 })),
        }),
      });
      setCreating(false);
      await loadDecisions(result.decision.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally { setSaving(false); }
  }

  async function analyzeDecision() {
    if (!selected || analyzing) return;
    setAnalyzing(true); setAnalysis(null); setError(null);
    try {
      const result = await jsonRequest<{ ok: boolean; analysis: Analysis }>("/api/personal-intelligence/decisions/analyze", {
        method: "POST", body: JSON.stringify({ decisionId: selected.id }),
      });
      setAnalysis(result.analysis);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setAnalyzing(false); }
  }

  async function chooseOption(optionId: string) {
    if (!selected || saving) return;
    setSaving(true); setError(null);
    try {
      await jsonRequest("/api/personal-intelligence/decisions/choose", {
        method: "POST",
        body: JSON.stringify({ decisionId: selected.id, optionId, confidence: selected.confidence ?? null }),
      });
      await loadDecisions(selected.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setSaving(false); }
  }

  async function recordOutcome() {
    if (!selected || saving) return;
    setSaving(true); setError(null);
    try {
      await jsonRequest("/api/personal-intelligence/decisions/outcome", {
        method: "POST",
        body: JSON.stringify({
          decisionId: selected.id,
          actualOutcome: outcomeText,
          decisionQuality: decisionQuality === "" ? null : Number(decisionQuality) / 100,
          outcomeQuality: outcomeQuality === "" ? null : Number(outcomeQuality) / 100,
          luckFactor: luckFactor === "" ? null : Number(luckFactor) / 100,
          lesson,
        }),
      });
      setOutcomeText(""); setDecisionQuality(""); setOutcomeQuality(""); setLuckFactor(""); setLesson("");
      await loadDecisions(selected.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setSaving(false); }
  }

  return <main className="mx-auto max-w-[1380px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-700"><Scale size={17} /> THINK · Decision Journal</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Make the decision process visible.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Alternativer, antakelser, usikkerhet, opportunity cost og reversibilitet før valg. Utfallet vurderes senere — separat fra kvaliteten på selve beslutningen.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadDecisions()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"><RefreshCw size={14} /> Refresh</button>
          <button type="button" onClick={startNew} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"><Plus size={14} /> New decision</button>
        </div>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}

    <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-black text-slate-950">Decision history</div>
        <div className="mt-1 text-xs text-slate-500">{decisions.length} journal entries</div>
        <div className="mt-4 max-h-[72vh] space-y-2 overflow-y-auto">
          {loading && <div className="p-5 text-center text-sm text-slate-500"><Loader2 size={18} className="mx-auto mb-2 animate-spin" />Loading…</div>}
          {!loading && !decisions.length && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No decisions recorded yet.</div>}
          {decisions.map((decision) => <button key={decision.id} type="button" onClick={() => { setCreating(false); setSelectedId(decision.id); setAnalysis(null); }} className={`w-full rounded-2xl border p-3 text-left ${selectedId === decision.id ? "border-amber-300 bg-amber-50" : "border-slate-200 hover:bg-slate-50"}`}>
            <div className="text-sm font-black text-slate-900">{decision.title}</div>
            <div className="mt-1 text-[11px] font-bold uppercase text-slate-400">{decision.decision_type} · {decision.reversibility} · {decision.stakes}</div>
            <div className="mt-2 text-xs text-slate-500">{decision.status}{decision.confidence != null ? ` · confidence ${scoreLabel(decision.confidence)}` : ""}</div>
          </button>)}
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        {creating && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-black text-slate-950">New decision</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Capture what you know now. Do not rewrite history after the outcome.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Decision title" className="sm:col-span-3 rounded-xl border border-slate-200 p-3 text-sm" />
            <select value={decisionType} onChange={(e) => setDecisionType(e.target.value)} className="rounded-xl border border-slate-200 p-3 text-sm"><option value="operational">Operational</option><option value="strategic">Strategic</option><option value="life">Life</option><option value="trivial">Trivial</option></select>
            <select value={reversibility} onChange={(e) => setReversibility(e.target.value)} className="rounded-xl border border-slate-200 p-3 text-sm"><option value="unknown">Reversibility unknown</option><option value="two_way">Two-way door</option><option value="one_way">One-way door</option><option value="mixed">Mixed</option></select>
            <select value={stakes} onChange={(e) => setStakes(e.target.value)} className="rounded-xl border border-slate-200 p-3 text-sm"><option value="low">Low stakes</option><option value="medium">Medium stakes</option><option value="high">High stakes</option><option value="critical">Critical stakes</option></select>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is the decision, and why now?" rows={4} className="sm:col-span-3 rounded-xl border border-slate-200 p-3 text-sm" />
            <input type="number" min="0" max="100" value={confidence} onChange={(e) => setConfidence(e.target.value)} placeholder="Current confidence % (optional)" className="rounded-xl border border-slate-200 p-3 text-sm" />
            <textarea value={uncertaintyNotes} onChange={(e) => setUncertaintyNotes(e.target.value)} placeholder="What are you uncertain about?" rows={3} className="sm:col-span-2 rounded-xl border border-slate-200 p-3 text-sm" />
            <textarea value={premortem} onChange={(e) => setPremortem(e.target.value)} placeholder="Premortem: if this fails, why?" rows={3} className="sm:col-span-3 rounded-xl border border-slate-200 p-3 text-sm" />
            <textarea value={scenarioNotes} onChange={(e) => setScenarioNotes(e.target.value)} placeholder="Relevant scenarios / what could change?" rows={3} className="sm:col-span-3 rounded-xl border border-slate-200 p-3 text-sm" />
          </div>

          <div className="mt-6 flex items-center justify-between"><h3 className="text-sm font-black text-slate-950">Alternatives</h3><button type="button" onClick={() => setOptions((current) => [...current, emptyOption()])} className="text-xs font-black text-amber-700">+ option</button></div>
          <div className="mt-3 space-y-3">{options.map((option, index) => <div key={index} className="grid gap-2 rounded-2xl border border-slate-200 p-3 sm:grid-cols-2">
            <input value={option.label} onChange={(e) => setOptions((current) => current.map((item, i) => i === index ? { ...item, label: e.target.value } : item))} placeholder={`Option ${index + 1}`} className="sm:col-span-2 rounded-lg border border-slate-200 p-2 text-sm" />
            <textarea value={option.upside} onChange={(e) => setOptions((current) => current.map((item, i) => i === index ? { ...item, upside: e.target.value } : item))} placeholder="Upside" rows={2} className="rounded-lg border border-slate-200 p-2 text-sm" />
            <textarea value={option.downside} onChange={(e) => setOptions((current) => current.map((item, i) => i === index ? { ...item, downside: e.target.value } : item))} placeholder="Downside" rows={2} className="rounded-lg border border-slate-200 p-2 text-sm" />
            <textarea value={option.opportunityCost} onChange={(e) => setOptions((current) => current.map((item, i) => i === index ? { ...item, opportunityCost: e.target.value } : item))} placeholder="Opportunity cost" rows={2} className="sm:col-span-2 rounded-lg border border-slate-200 p-2 text-sm" />
          </div>)}</div>

          <div className="mt-6 flex items-center justify-between"><h3 className="text-sm font-black text-slate-950">Assumptions</h3><button type="button" onClick={() => setAssumptions((current) => [...current, emptyAssumption()])} className="text-xs font-black text-amber-700">+ assumption</button></div>
          <div className="mt-3 space-y-3">{assumptions.map((item, index) => <div key={index} className="grid gap-2 rounded-2xl border border-slate-200 p-3 sm:grid-cols-4">
            <input value={item.statement} onChange={(e) => setAssumptions((current) => current.map((a, i) => i === index ? { ...a, statement: e.target.value } : a))} placeholder="Assumption" className="sm:col-span-4 rounded-lg border border-slate-200 p-2 text-sm" />
            <input type="number" min="0" max="100" value={item.importance} onChange={(e) => setAssumptions((current) => current.map((a, i) => i === index ? { ...a, importance: e.target.value } : a))} placeholder="Importance %" className="rounded-lg border border-slate-200 p-2 text-sm" />
            <input type="number" min="0" max="100" value={item.confidence} onChange={(e) => setAssumptions((current) => current.map((a, i) => i === index ? { ...a, confidence: e.target.value } : a))} placeholder="Confidence %" className="rounded-lg border border-slate-200 p-2 text-sm" />
            <select value={item.testability} onChange={(e) => setAssumptions((current) => current.map((a, i) => i === index ? { ...a, testability: e.target.value } : a))} className="rounded-lg border border-slate-200 p-2 text-sm"><option value="unknown">Unknown testability</option><option value="testable">Testable</option><option value="partly_testable">Partly testable</option><option value="not_testable">Not testable</option></select>
            <input value={item.testPlan} onChange={(e) => setAssumptions((current) => current.map((a, i) => i === index ? { ...a, testPlan: e.target.value } : a))} placeholder="Test plan" className="rounded-lg border border-slate-200 p-2 text-sm" />
          </div>)}</div>
          <button type="button" onClick={() => void createDecision()} disabled={saving || title.trim().length < 4} className="mt-6 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? "Saving…" : "Save decision snapshot"}</button>
        </section>}

        {!creating && selected && <>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">{selected.decision_type} · {selected.reversibility} · {selected.stakes}</div><h2 className="mt-2 text-2xl font-black text-slate-950">{selected.title}</h2></div><span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black uppercase text-slate-600">{selected.status}</span></div>
            {selected.description && <p className="mt-3 text-sm leading-6 text-slate-600">{selected.description}</p>}
            <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Confidence</div><div className="mt-1 text-sm font-bold">{scoreLabel(selected.confidence)}</div></div><div className="rounded-2xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Uncertainty</div><div className="mt-1 text-xs leading-5 text-slate-600">{selected.uncertainty_notes || "Not recorded"}</div></div><div className="rounded-2xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Premortem</div><div className="mt-1 text-xs leading-5 text-slate-600">{selected.premortem || "Not recorded"}</div></div></div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-950">Alternatives</h3><p className="mt-1 text-xs text-slate-500">AI analysis cannot choose. Only your explicit click can record a choice.</p></div><button type="button" disabled={analyzing} onClick={() => void analyzeDecision()} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800"><Sparkles size={14} /> {analyzing ? "Analyzing…" : "Analyze"}</button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{selected.options.map((option) => <article key={option.id} className={`rounded-2xl border p-4 ${selected.chosen_option_id === option.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}><div className="flex items-start justify-between gap-2"><div className="text-sm font-black text-slate-900">{option.label}</div>{selected.chosen_option_id === option.id && <CheckCircle2 size={17} className="text-emerald-700" />}</div>{option.upside && <div className="mt-3 text-xs leading-5 text-slate-600"><strong>Upside:</strong> {option.upside}</div>}{option.downside && <div className="mt-1 text-xs leading-5 text-slate-600"><strong>Downside:</strong> {option.downside}</div>}{option.opportunity_cost && <div className="mt-1 text-xs leading-5 text-slate-600"><strong>Opportunity cost:</strong> {option.opportunity_cost}</div>}{!selected.chosen_option_id && <button type="button" onClick={() => void chooseOption(option.id)} disabled={saving} className="mt-4 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Choose explicitly</button>}</article>)}</div></section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-black text-slate-950">Assumption register</h3><div className="mt-3 space-y-2">{selected.assumptions.length ? selected.assumptions.map((item) => <div key={item.id} className="rounded-2xl bg-slate-50 p-3"><div className="text-sm font-bold text-slate-800">{item.statement}</div><div className="mt-1 text-[11px] text-slate-500">importance {scoreLabel(item.importance)} · confidence {scoreLabel(item.confidence)} · {item.testability || "unknown"}</div>{item.test_plan && <div className="mt-2 text-xs text-slate-600">Test: {item.test_plan}</div>}</div>) : <div className="text-sm text-slate-500">No explicit assumptions recorded.</div>}</div></section>

          {analysis && <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm"><div className="flex items-center gap-2 text-sm font-black text-amber-950"><BrainCircuit size={17} /> Non-binding analysis</div><div className="mt-4 grid gap-3 md:grid-cols-2">{Object.entries(analysis).map(([key, value]) => <div key={key} className="rounded-2xl bg-white/80 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-amber-700">{key.replace(/([A-Z])/g, " $1")}</div><div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{Array.isArray(value) && value.length ? `• ${asText(value)}` : asText(value) || "—"}</div></div>)}</div><div className="mt-3 text-[11px] font-semibold text-amber-800">This analysis is not persisted and does not choose or execute anything.</div></section>}

          {selected.chosen_option_id && selected.status !== "reviewed" && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-black text-slate-950">Outcome review</h3><p className="mt-1 text-xs text-slate-500">Complete this later. Judge the decision process separately from what happened.</p><textarea value={outcomeText} onChange={(e) => setOutcomeText(e.target.value)} rows={4} placeholder="What actually happened?" className="mt-4 w-full rounded-xl border border-slate-200 p-3 text-sm" /><div className="mt-3 grid gap-2 sm:grid-cols-3"><input type="number" min="0" max="100" value={decisionQuality} onChange={(e) => setDecisionQuality(e.target.value)} placeholder="Decision quality %" className="rounded-xl border border-slate-200 p-3 text-sm" /><input type="number" min="0" max="100" value={outcomeQuality} onChange={(e) => setOutcomeQuality(e.target.value)} placeholder="Outcome quality %" className="rounded-xl border border-slate-200 p-3 text-sm" /><input type="number" min="0" max="100" value={luckFactor} onChange={(e) => setLuckFactor(e.target.value)} placeholder="Luck factor %" className="rounded-xl border border-slate-200 p-3 text-sm" /></div><textarea value={lesson} onChange={(e) => setLesson(e.target.value)} rows={3} placeholder="What did this teach you?" className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm" /><button type="button" disabled={saving || outcomeText.trim().length < 10} onClick={() => void recordOutcome()} className="mt-3 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Record outcome review</button></section>}

          {selected.outcomes.length > 0 && <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm"><h3 className="text-sm font-black text-emerald-950">Outcome history</h3>{selected.outcomes.map((outcome) => <article key={outcome.id} className="mt-3 rounded-2xl bg-white/80 p-4"><div className="text-sm leading-6 text-slate-800">{outcome.actual_outcome}</div><div className="mt-2 text-xs text-slate-600">Decision quality {scoreLabel(outcome.decision_quality)} · Outcome quality {scoreLabel(outcome.outcome_quality)} · Luck {scoreLabel(outcome.luck_factor)}</div>{outcome.lesson && <div className="mt-2 text-xs text-slate-600"><strong>Lesson:</strong> {outcome.lesson}</div>}</article>)}</section>}
        </>}

        {!creating && !selected && !loading && <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm"><Scale size={32} className="mx-auto text-slate-300" /><h2 className="mt-4 text-xl font-black text-slate-900">No decision selected.</h2><p className="mt-2 text-sm text-slate-500">Create a journal entry to make assumptions and alternatives explicit before deciding.</p></div>}
      </div>
    </section>
  </main>;
}
