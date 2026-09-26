"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Database,
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Target,
  UserPlus,
  Users,
} from "lucide-react";

type Prospect = {
  id: string;
  company_name: string;
  organization_number?: string | null;
  domain?: string | null;
  organization_type: string;
  country_code: string;
  city?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  employee_band?: string | null;
  member_count?: number | null;
  website_url?: string | null;
  status: string;
  fit_score: number;
  fit_tier: string;
  fit_reasons?: string[];
  evidence_gaps?: string[];
  decision_roles?: string[];
  source_type?: string | null;
  source_url?: string | null;
  next_action?: string | null;
  next_followup?: string | null;
  contact_coverage?: { total: number; verified: number; primary: number };
  converted_contact_id?: string | null;
};

type Summary = {
  total: number;
  target: number;
  progressPercent: number;
  aTier: number;
  bTier: number;
  qualified: number;
  engaged: number;
  statusCounts: Record<string, number>;
  tierCounts: Record<string, number>;
};

const STATUS_OPTIONS = [
  "DISCOVERED",
  "RESEARCHED",
  "QUALIFIED",
  "CONTACT_READY",
  "CONTACTED",
  "ENGAGED",
  "MEETING",
  "OPPORTUNITY",
  "DISQUALIFIED",
];

const STATUS_LABELS: Record<string, string> = {
  DISCOVERED: "Oppdaget",
  RESEARCHED: "Research",
  QUALIFIED: "Kvalifisert",
  CONTACT_READY: "Klar for kontakt",
  CONTACTED: "Kontaktet",
  ENGAGED: "Dialog",
  MEETING: "Møte",
  OPPORTUNITY: "Mulighet",
  DISQUALIFIED: "Ikke aktuell",
};

const PROMOTABLE_STATUSES = new Set(["QUALIFIED", "CONTACT_READY", "CONTACTED", "ENGAGED", "MEETING", "OPPORTUNITY"]);

const EXPECTED_HEADERS = [
  "company_name",
  "organization_number",
  "domain",
  "organization_type",
  "country_code",
  "city",
  "industry",
  "employee_count",
  "employee_band",
  "member_count",
  "website_url",
  "linkedin_company_url",
  "source_type",
  "source_url",
  "decision_roles",
  "notes",
];

function splitCsvLine(line: string, delimiter: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}

function parseCsv(text: string) {
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV-filen må ha en header-rad og minst én prospekt-rad.");
  const first = lines[0];
  const delimiter = first.includes(";") ? ";" : first.includes("\t") ? "\t" : ",";
  const headers = splitCsvLine(first, delimiter).map((header) => header.trim().toLowerCase());
  if (!headers.includes("company_name")) throw new Error("CSV må inneholde kolonnen company_name.");

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!EXPECTED_HEADERS.includes(header)) return;
      row[header] = values[index] || "";
    });
    return row;
  }).filter((row) => row.company_name);
}

export default function CorporateProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [importing, setImporting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryCandidates, setDiscoveryCandidates] = useState<Array<Record<string, any>>>([]);
  const [discoveryProfile, setDiscoveryProfile] = useState("core");
  const [minEmployees, setMinEmployees] = useState("15");
  const [maxEmployees, setMaxEmployees] = useState("500");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [manual, setManual] = useState({
    company_name: "",
    domain: "",
    organization_type: "company",
    industry: "",
    employee_count: "",
    member_count: "",
    source_url: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (tierFilter) params.set("tier", tierFilter);
      const response = await fetch(`/api/corporate-homes/prospects?${params.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente prospektkøen.");
      setProspects(body?.prospects || []);
      setSummary(body?.summary || null);
      setWarnings(body?.warnings || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente prospektkøen.");
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter, tierFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  const progress = summary?.progressPercent || 0;
  const topGaps = useMemo(() => {
    const counts = new Map<string, number>();
    prospects.forEach((prospect) => (prospect.evidence_gaps || []).forEach((gap) => counts.set(gap, (counts.get(gap) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [prospects]);

  async function updateProspect(id: string, patch: Record<string, unknown>) {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/corporate-homes/prospects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke oppdatere prospektet.");
      setProspects((rows) => rows.map((row) => row.id === id ? { ...row, ...body.prospect } : row));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Kunne ikke oppdatere prospektet.");
    } finally {
      setBusyId("");
    }
  }

  async function createManual() {
    if (!manual.company_name.trim()) return;
    setImporting(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...manual,
          employee_count: manual.employee_count || null,
          member_count: manual.member_count || null,
          source_type: "manual",
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke opprette prospekt.");
      setNotice(body.createdCount ? "Prospektet er lagt i køen." : "Prospektet finnes allerede i køen.");
      setManual({ company_name: "", domain: "", organization_type: "company", industry: "", employee_count: "", member_count: "", source_url: "" });
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Kunne ikke opprette prospekt.");
    } finally {
      setImporting(false);
    }
  }

  async function discoverFromBrreg() {
    setDiscovering(true);
    setNotice("");
    setError("");
    try {
      const params = new URLSearchParams({
        profile: discoveryProfile,
        minEmployees: minEmployees || "15",
        maxEmployees: maxEmployees || "500",
        limit: "50",
        scanPages: "4",
      });
      const response = await fetch(`/api/corporate-homes/discovery/brreg?${params.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Brønnøysund-data.");
      setDiscoveryCandidates(body?.candidates || []);
      const count = body?.candidates?.length || 0;
      setNotice(`Fant ${count} virksomheter i det avgrensede Brønnøysund-uttrekket.`);
    } catch (discoveryError) {
      setError(discoveryError instanceof Error ? discoveryError.message : "Kunne ikke hente Brønnøysund-data.");
    } finally {
      setDiscovering(false);
    }
  }

  async function importDiscoveryBatch() {
    if (!discoveryCandidates.length) return;
    setImporting(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: discoveryCandidates }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke importere Brønnøysund-batch.");
      setNotice(`Importert ${body.createdCount || 0}. Duplikater: ${body.duplicateCount || 0}. Ugyldige: ${body.invalid?.length || 0}.`);
      await load();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Kunne ikke importere Brønnøysund-batch.");
    } finally {
      setImporting(false);
    }
  }

  async function promoteToCrm(prospect: Prospect) {
    setBusyId(prospect.id);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/corporate-homes/prospects/${prospect.id}/promote`, {
        method: "POST",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke promotere prospektet til CRM.");
      setNotice(`${prospect.company_name} er lagt i Zen Eco Homes CRM. Automatisk nurture er pauset.`);
      await load();
    } catch (promotionError) {
      setError(promotionError instanceof Error ? promotionError.message : "Kunne ikke promotere prospektet til CRM.");
    } finally {
      setBusyId("");
    }
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    setNotice("");
    setError("");
    try {
      const rows = parseCsv(await file.text());
      if (rows.length > 250) throw new Error("Maksimalt 250 prospekter per import.");
      const response = await fetch("/api/corporate-homes/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rows.map((row) => ({ ...row, source_type: row.source_type || "csv_import" })) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Importen feilet.");
      setNotice(`Importert ${body.createdCount || 0}. Duplikater: ${body.duplicateCount || 0}. Ugyldige: ${body.invalid?.length || 0}.`);
      await load();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Importen feilet.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1750px] space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link href="/corporate-homes" className="mb-3 inline-flex items-center gap-1 text-xs font-black text-cyan-800 hover:underline">
              <ArrowLeft size={14} /> Corporate Homes
            </Link>
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.13em] text-teal-800">
              <Target size={18} /> Corporate Prospect Engine
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Prospektkø · Norge</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
              Bedrifter og organisasjoner holdes utenfor vanlig CRM til de er kvalifisert. Fit-score er en synlig
              heuristikk basert på størrelse, segment, bransje, virksomhetsidentitet, buying committee og kildegrunnlag.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50">
              {importing ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
              Importer CSV
              <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={importCsv} disabled={importing} />
            </label>
            <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Oppdater
            </button>
          </div>
        </div>
      </header>

      {notice && <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{notice}</div>}
      {error && <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
      {warnings.map((warning) => <div key={warning} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{warning}</div>)}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="I kø" value={summary?.total ?? "—"} icon={<Users size={18} />} />
        <Metric label="Mål" value={summary?.target ?? 250} icon={<Target size={18} />} />
        <Metric label="A-fit" value={summary?.aTier ?? "—"} icon={<CheckCircle2 size={18} />} />
        <Metric label="B-fit" value={summary?.bTier ?? "—"} icon={<Building2 size={18} />} />
        <Metric label="Kvalifisert" value={summary?.qualified ?? "—"} icon={<CheckCircle2 size={18} />} />
        <Metric label="I salgsdialog" value={summary?.engaged ?? "—"} icon={<Users size={18} />} />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">Fremdrift mot første 250</h2>
            <p className="mt-1 text-sm text-slate-500">Bygg listen i kontrollerte batcher og research A/B-fit før personlig kontakt.</p>
          </div>
          <div className="text-2xl font-black text-teal-800">{progress}%</div>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
              <Database size={16} /> Offentlig selskapsdata
            </div>
            <h2 className="mt-2 text-xl font-black text-slate-950">Finn bedrifter i Brønnøysundregistrene</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Henter kun virksomhetsdata fra Enhetsregisterets åpne API: navn, organisasjonsnummer, bransje,
              antall ansatte, adresse og eventuelt nettsted. Ingen personlige e-poster eller telefonnumre hentes her.
            </p>
          </div>
          <a
            href="https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-cyan-800 hover:underline"
          >
            API-dokumentasjon
          </a>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_.7fr_.7fr_auto]">
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
            Bransjeprofil
            <select value={discoveryProfile} onChange={(event) => setDiscoveryProfile(event.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900">
              <option value="core">Kjernebransjer</option>
              <option value="technology">Teknologi / software</option>
              <option value="consulting">Rådgivning / engineering</option>
              <option value="construction">Bygg / anlegg</option>
              <option value="energy">Energi</option>
              <option value="finance">Finans / regnskap</option>
              <option value="industry">Industri</option>
              <option value="all">Alle bransjer</option>
            </select>
          </label>
          <Input label="Min. ansatte" type="number" value={minEmployees} onChange={setMinEmployees} />
          <Input label="Maks ansatte" type="number" value={maxEmployees} onChange={setMaxEmployees} />
          <button onClick={() => void discoverFromBrreg()} disabled={discovering} className="self-end inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-bold text-white disabled:opacity-50">
            {discovering ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Finn virksomheter
          </button>
        </div>

        {discoveryCandidates.length > 0 && (
          <div className="mt-5">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-700">
                {discoveryCandidates.length} kandidater · sortert etter Corporate Homes-fit
              </p>
              <button onClick={() => void importDiscoveryBatch()} disabled={importing} className="inline-flex items-center gap-2 rounded-xl border border-teal-700 px-4 py-2 text-sm font-bold text-teal-900 disabled:opacity-50">
                {importing ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Legg hele batchen i kø
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {discoveryCandidates.slice(0, 12).map((candidate) => (
                <article key={candidate.organization_number || candidate.company_name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-950">{candidate.company_name}</div>
                      <div className="mt-1 text-xs text-slate-500">{candidate.organization_number} · {candidate.employee_count ?? "?"} ansatte</div>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-teal-900">{candidate.fit_tier} · {candidate.fit_score}</span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-600">{candidate.industry || "Bransje ikke oppgitt"}</p>
                </article>
              ))}
            </div>
            {discoveryCandidates.length > 12 && <p className="mt-3 text-xs text-slate-500">Viser de 12 øverste av {discoveryCandidates.length}. Hele batchen importeres med knappen over.</p>}
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[.7fr_1.3fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Legg til manuelt</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">Nytt prospekt</h2>
          <div className="mt-5 grid gap-3">
            <Input label="Virksomhet / organisasjon" value={manual.company_name} onChange={(value) => setManual((row) => ({ ...row, company_name: value }))} placeholder="Firmanavn" />
            <Input label="Domene" value={manual.domain} onChange={(value) => setManual((row) => ({ ...row, domain: value }))} placeholder="firma.no" />
            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
              Type
              <select value={manual.organization_type} onChange={(event) => setManual((row) => ({ ...row, organization_type: event.target.value }))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900">
                <option value="company">Bedrift</option>
                <option value="association">Forening</option>
                <option value="member_organization">Medlemsorganisasjon</option>
                <option value="group">Konsern</option>
                <option value="other">Annet</option>
              </select>
            </label>
            <Input label="Bransje" value={manual.industry} onChange={(value) => setManual((row) => ({ ...row, industry: value }))} placeholder="IT, engineering, medlemsorganisasjon ..." />
            {["association", "member_organization"].includes(manual.organization_type)
              ? <Input label="Antall medlemmer" type="number" value={manual.member_count} onChange={(value) => setManual((row) => ({ ...row, member_count: value }))} placeholder="f.eks. 1500" />
              : <Input label="Antall ansatte" type="number" value={manual.employee_count} onChange={(value) => setManual((row) => ({ ...row, employee_count: value }))} placeholder="f.eks. 75" />}
            <Input label="Kildelenke" value={manual.source_url} onChange={(value) => setManual((row) => ({ ...row, source_url: value }))} placeholder="https://..." />
            <button onClick={() => void createManual()} disabled={importing || !manual.company_name.trim()} className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
              <Plus size={16} /> Legg i prospektkø
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Datakvalitet</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">Største hull i køen</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Scoren skal ikke skjule manglende data. Disse feltene bør fylles før et prospekt flyttes til kvalifisert.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {topGaps.length ? topGaps.map(([gap, count]) => (
              <div key={gap} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-2xl font-black text-slate-950">{count}</div>
                <div className="mt-1 text-sm font-semibold text-slate-600">{gap}</div>
              </div>
            )) : <div className="text-sm text-slate-500">Ingen prospektdata ennå.</div>}
          </div>
          <div className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm leading-6 text-cyan-950">
            Personlige kontaktdata hentes ikke automatisk. Beslutningstakerroller kan defineres nå; navn, e-post og telefon bør først berikes når en godkjent datakilde er koblet til og bruken er eksplisitt godkjent.
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">Prospekter</h2>
            <p className="mt-1 text-sm text-slate-500">Prioritert etter fit-score. Ingen utsendelser skjer fra denne siden.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="relative min-w-[240px]">
              <Search size={15} className="absolute left-3 top-3 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søk selskap, domene, bransje ..." className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900" />
            </label>
            <select value={tierFilter} onChange={(event) => setTierFilter(event.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800">
              <option value="">Alle fit</option>
              <option value="A">A-fit</option>
              <option value="B">B-fit</option>
              <option value="C">C-fit</option>
              <option value="UNSCORED">Uscoret</option>
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800">
              <option value="">Alle faser</option>
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Prospekt</th>
                <th className="px-3 py-3">Fit</th>
                <th className="px-3 py-3">Størrelse</th>
                <th className="px-3 py-3">Bransje</th>
                <th className="px-3 py-3">Beslutningsroller</th>
                <th className="px-3 py-3">Fase</th>
                <th className="px-3 py-3">Datagap</th>
                <th className="px-3 py-3">CRM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prospects.map((prospect) => (
                <tr key={prospect.id} className="align-top hover:bg-slate-50">
                  <td className="px-3 py-4">
                    <div className="font-bold text-slate-950">{prospect.company_name}</div>
                    <div className="mt-1 text-xs text-slate-500">{prospect.domain || prospect.organization_number || "Ingen domene/org.nr."}</div>
                    {prospect.source_url && <a href={prospect.source_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-bold text-cyan-800 hover:underline">Kilde</a>}
                  </td>
                  <td className="px-3 py-4">
                    <span className={`inline-flex min-w-[42px] justify-center rounded-full px-2.5 py-1 text-xs font-black ${prospect.fit_tier === "A" ? "bg-emerald-100 text-emerald-900" : prospect.fit_tier === "B" ? "bg-cyan-100 text-cyan-900" : "bg-slate-100 text-slate-700"}`}>
                      {prospect.fit_tier} · {prospect.fit_score}
                    </span>
                    <div className="mt-2 max-w-[220px] text-xs leading-5 text-slate-500">{(prospect.fit_reasons || []).slice(0, 2).join(" · ")}</div>
                  </td>
                  <td className="px-3 py-4 text-slate-700">
                    {["association", "member_organization"].includes(prospect.organization_type)
                      ? prospect.member_count ? `${prospect.member_count.toLocaleString("nb-NO")} medlemmer` : "Medlemmer ukjent"
                      : prospect.employee_count ? `${prospect.employee_count.toLocaleString("nb-NO")} ansatte` : prospect.employee_band || "Ansatte ukjent"}
                  </td>
                  <td className="px-3 py-4 text-slate-700">{prospect.industry || "—"}</td>
                  <td className="max-w-[280px] px-3 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(prospect.decision_roles || []).slice(0, 4).map((role) => <span key={role} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">{role}</span>)}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <select
                      value={prospect.status}
                      disabled={busyId === prospect.id}
                      onChange={(event) => void updateProspect(prospect.id, { status: event.target.value })}
                      className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 disabled:opacity-50"
                    >
                      {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                    </select>
                  </td>
                  <td className="max-w-[260px] px-3 py-4 text-xs leading-5 text-amber-900">
                    {(prospect.evidence_gaps || []).slice(0, 3).join(" · ") || "Ingen store gap"}
                  </td>
                  <td className="px-3 py-4">
                    {prospect.converted_contact_id ? (
                      <Link href={`/customers?contactId=${encodeURIComponent(prospect.converted_contact_id)}&tab=all`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs font-bold text-emerald-800 hover:underline">
                        <CheckCircle2 size={14} /> I CRM
                      </Link>
                    ) : PROMOTABLE_STATUSES.has(prospect.status) ? (
                      <button onClick={() => void promoteToCrm(prospect)} disabled={busyId === prospect.id} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-2.5 py-2 text-xs font-bold text-white disabled:opacity-50">
                        {busyId === prospect.id ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Promoter
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-400">Kvalifiser først</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && prospects.length === 0 && <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-500">Ingen prospekter matcher filteret.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white sm:p-6">
        <h2 className="text-xl font-black">CSV-format</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Minimum er <code className="rounded bg-slate-800 px-1.5 py-0.5">company_name</code>. For bedre scoring: domain, organization_type,
          industry, employee_count eller member_count, source_url og decision_roles. Maks 250 rader per batch.
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">{icon}{label}</div>
      <div className="mt-3 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900" />
    </label>
  );
}
