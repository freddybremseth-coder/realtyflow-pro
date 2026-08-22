"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Bot,
  Brain,
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  Command,
  Cpu,
  Filter,
  Gauge,
  Pause,
  Pencil,
  Play,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  Wand2,
  X,
  Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Autonomous Real Estate Dealflow Cockpit — RealtyFlow Pro           */
/*  Selvstendig klient-side med lokal dummy-state (koble til           */
/*  /api/agents senere). Cyber-minimalistisk Bento + glassmorphism.    */
/* ------------------------------------------------------------------ */

type AgentStatus = "idle" | "thinking" | "executing" | "waiting";
type DealStage = "Forberedelse" | "Markedsføring" | "Budrunde" | "Oppgjør";

interface AgentCard {
  id: string;
  name: string;
  role: string;
  icon: React.ComponentType<{ className?: string }>;
  status: AgentStatus;
  task: string;
  tools: string[];
  tokens: number;
  cpu: number;
  latency: number[];
}

interface Property {
  id: string;
  address: string;
  area: string;
  priceNok: number;
  stage: DealStage;
  health: number;
  nextAction: string;
  agents: string[];
}

interface Approval {
  id: string;
  title: string;
  detail: string;
  agent: string;
  risk: "høy" | "middels" | "lav";
  valueNok?: number;
}

type LogKind = "thought" | "tool" | "result";
interface LogEntry {
  id: string;
  ts: string;
  agent: string;
  kind: LogKind;
  text: string;
  json?: string;
}

const STAGES: DealStage[] = ["Forberedelse", "Markedsføring", "Budrunde", "Oppgjør"];

const STATUS_META: Record<AgentStatus, { label: string; color: string; glow: string }> = {
  idle: { label: "Idle", color: "#64748b", glow: "rgba(100,116,139,0.35)" },
  thinking: { label: "Resonnerer", color: "#a78bfa", glow: "rgba(167,139,250,0.55)" },
  executing: { label: "Kjører", color: "#34d399", glow: "rgba(52,211,153,0.55)" },
  waiting: { label: "Venter godkjenning", color: "#fbbf24", glow: "rgba(251,191,36,0.55)" },
};

const nok = (v: number) =>
  new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 0 }).format(v);
const mnok = (v: number) => `${(v / 1_000_000).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} MNOK`;
const uid = () => Math.random().toString(36).slice(2, 9);

const INITIAL_AGENTS: AgentCard[] = [
  {
    id: "lead",
    name: "Lead Scorer",
    role: "Intake & Urgency",
    icon: Radio,
    status: "executing",
    task: "Scorer 8 nye henvendelser fra finn.no + skjema",
    tools: ["portal.scan", "crm.enrich", "score.intent"],
    tokens: 18420,
    cpu: 41,
    latency: [220, 180, 260, 190, 210, 170, 240, 200],
  },
  {
    id: "valuation",
    name: "Market Valuator",
    role: "Verdivurdering",
    icon: TrendingUp,
    status: "thinking",
    task: "Analyserer 12 sammenlignbare salg i Oslo Vest",
    tools: ["market.comps", "price.model", "notat.gen"],
    tokens: 42890,
    cpu: 63,
    latency: [340, 410, 380, 360, 420, 390, 370, 400],
  },
  {
    id: "listing",
    name: "Listing Copywriter",
    role: "Creative Studio",
    icon: Wand2,
    status: "idle",
    task: "Klar — venter på verdivurdering fra Valuator",
    tools: ["copy.gen", "seo.optimize", "social.pack"],
    tokens: 9110,
    cpu: 8,
    latency: [160, 150, 170, 140, 155, 165, 150, 145],
  },
  {
    id: "concierge",
    name: "Showing Concierge",
    role: "Visning & Match",
    icon: Sparkles,
    status: "executing",
    task: "Booker 3 visninger + sender budvarsel til 14 interessenter",
    tools: ["calendar.sync", "sms.send", "feedback.collect"],
    tokens: 27340,
    cpu: 52,
    latency: [200, 230, 210, 240, 220, 205, 215, 225],
  },
  {
    id: "compliance",
    name: "Compliance Officer",
    role: "Oppgjør & AML",
    icon: ShieldCheck,
    status: "waiting",
    task: "Budjournal Raveien 152E venter meglers godkjenning",
    tools: ["aml.check", "contract.verify", "commission.calc"],
    tokens: 15980,
    cpu: 12,
    latency: [180, 190, 200, 175, 185, 195, 188, 182],
  },
];

const INITIAL_PROPERTIES: Property[] = [
  { id: "PRO-152E", address: "Raveien 152E", area: "Sandefjord", priceNok: 4_800_000, stage: "Oppgjør", health: 94, nextAction: "Godkjenn budjournal + provisjon", agents: ["compliance", "valuation"] },
  { id: "PRO-014A", address: "Bjørnstadveien 14A", area: "Oslo Vest", priceNok: 8_450_000, stage: "Budrunde", health: 78, nextAction: "Send budvarsel til selger", agents: ["concierge", "valuation"] },
  { id: "PRO-207", address: "Strandpromenaden 207", area: "Tønsberg", priceNok: 6_120_000, stage: "Markedsføring", health: 88, nextAction: "Publiser finn.no-prospekt", agents: ["listing", "concierge"] },
  { id: "PRO-330", address: "Kirkegata 33", area: "Larvik", priceNok: 3_275_000, stage: "Forberedelse", health: 61, nextAction: "Fullfør verdivurdering", agents: ["valuation", "lead"] },
  { id: "PRO-091", address: "Fjellveien 9", area: "Oslo Vest", priceNok: 11_900_000, stage: "Markedsføring", health: 82, nextAction: "Optimaliser annonse-nøkkelord", agents: ["listing"] },
  { id: "PRO-142", address: "Hagemann Terrasse 4", area: "Sandefjord", priceNok: 5_640_000, stage: "Budrunde", health: 70, nextAction: "Ring 2 kalde interessenter", agents: ["concierge", "lead"] },
];

const INITIAL_APPROVALS: Approval[] = [
  { id: "APR-1", title: "Publiser finn.no-prospekt", detail: "Strandpromenaden 207 — annonsetekst, 18 bilder og prisantydning 6,12 MNOK klar for publisering.", agent: "listing", risk: "middels", valueNok: 6_120_000 },
  { id: "APR-2", title: "Godkjenn automatisk budoppdatering til selger", detail: "Bjørnstadveien 14A — nytt bud 8,55 MNOK (+100k). Send SMS-varsel til selger?", agent: "concierge", risk: "høy", valueNok: 8_550_000 },
  { id: "APR-3", title: "Send formelt budnotat", detail: "Raveien 152E — AML-sjekk grønn. Budjournal og provisjonsberegning klar for utsending.", agent: "compliance", risk: "høy", valueNok: 4_800_000 },
  { id: "APR-4", title: "Start markedsføringskampanje", detail: "Fjellveien 9 — Meta + finn.no-kampanje, budsjett 12 000 kr over 14 dager.", agent: "listing", risk: "lav", valueNok: 12_000 },
];

const THOUGHT_TEMPLATES: { agent: string; kind: LogKind; text: string; json?: string }[] = [
  { agent: "Market Valuator", kind: "thought", text: "Vekter 12 comps etter avstand, alder og standard → median 84 200 kr/m²." },
  { agent: "Market Valuator", kind: "tool", text: "market.comps(area='Oslo Vest', radius=800m)", json: '{"comps":12,"median_sqm":84200,"trend_90d":"+2.1%"}' },
  { agent: "Lead Scorer", kind: "tool", text: "score.intent(lead='inq_8841')", json: '{"urgency":82,"intent":"selge","budget_ok":true}' },
  { agent: "Lead Scorer", kind: "result", text: "Ny hot lead (score 82) rutet til Showing Concierge." },
  { agent: "Showing Concierge", kind: "thought", text: "3 interessenter har overlappende ledig tid tors 17:00 — foreslår felles visning." },
  { agent: "Showing Concierge", kind: "tool", text: "calendar.sync(property='PRO-014A')", json: '{"slots":3,"confirmed":2,"pending":1}' },
  { agent: "Listing Copywriter", kind: "thought", text: "Fremhever sjøutsikt + nyoppusset kjøkken; nøkkelord for finn.no-søk optimalisert." },
  { agent: "Compliance Officer", kind: "tool", text: "aml.check(party='Nordic Group Invest AS')", json: '{"pep":false,"sanctions":false,"risk":"low"}' },
  { agent: "Compliance Officer", kind: "result", text: "AML grønn. Budjournal klar — flagget for meglers godkjenning." },
];

function classForKind(kind: LogKind) {
  if (kind === "tool") return "text-cyan-300";
  if (kind === "result") return "text-emerald-300";
  return "text-violet-300";
}

/* ---------- små byggeklosser ---------- */

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md ${className}`}
      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
    >
      {children}
    </div>
  );
}

function StatusRing({ status }: { status: AgentStatus }) {
  const meta = STATUS_META[status];
  const animate = status !== "idle";
  return (
    <span className="relative inline-flex h-3 w-3">
      {animate && (
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-70 nx-ping"
          style={{ background: meta.color }}
        />
      )}
      <span
        className="relative inline-flex h-3 w-3 rounded-full"
        style={{ background: meta.color, boxShadow: `0 0 10px 2px ${meta.glow}` }}
      />
    </span>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 72;
  const h = 22;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / span) * (h - 3) - 1.5}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
    </svg>
  );
}

/* ---------- hovedkomponent ---------- */

export default function NexusCockpitPage() {
  const [agents, setAgents] = useState<AgentCard[]>(INITIAL_AGENTS);
  const [properties] = useState<Property[]>(INITIAL_PROPERTIES);
  const [approvals, setApprovals] = useState<Approval[]>(INITIAL_APPROVALS);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<"all" | LogKind>("all");
  const [stageFilter, setStageFilter] = useState<"all" | DealStage>("all");
  const [query, setQuery] = useState("");
  const [tokenCost, setTokenCost] = useState(38.42);
  const feedRef = useRef<HTMLDivElement>(null);

  const activeAgents = agents.filter((a) => a.status !== "idle").length;
  const pipelineValue = properties.reduce((s, p) => s + p.priceNok, 0);

  /* live tanke-/tool-feed + telemetri */
  useEffect(() => {
    const t = setInterval(() => {
      setAgents((prev) =>
        prev.map((a) =>
          a.status === "idle"
            ? a
            : {
                ...a,
                tokens: a.tokens + Math.round(Math.random() * 320),
                cpu: Math.max(4, Math.min(96, a.cpu + Math.round((Math.random() - 0.5) * 14))),
                latency: [...a.latency.slice(1), Math.max(120, a.latency[a.latency.length - 1] + Math.round((Math.random() - 0.5) * 90))],
              },
        ),
      );
      setTokenCost((c) => Number((c + Math.random() * 0.11).toFixed(2)));
      const tpl = THOUGHT_TEMPLATES[Math.floor(Math.random() * THOUGHT_TEMPLATES.length)];
      setLogs((prev) =>
        [
          {
            id: uid(),
            ts: new Date().toLocaleTimeString("nb-NO", { hour12: false }),
            agent: tpl.agent,
            kind: tpl.kind,
            text: tpl.text,
            json: tpl.json,
          },
          ...prev,
        ].slice(0, 40),
      );
    }, 2200);
    return () => clearInterval(t);
  }, []);

  const toggleAgent = useCallback((id: string) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status: a.status === "idle" ? "executing" : "idle", task: a.status === "idle" ? "Gjenopptar oppdrag …" : "Satt på pause av megler", cpu: a.status === "idle" ? 30 : 2 }
          : a,
      ),
    );
  }, []);

  const resolveApproval = useCallback((id: string, decision: "approve" | "reject") => {
    const item = approvals.find((a) => a.id === id);
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    if (item) {
      setLogs((prev) =>
        [
          {
            id: uid(),
            ts: new Date().toLocaleTimeString("nb-NO", { hour12: false }),
            agent: "Human-in-the-loop",
            kind: (decision === "approve" ? "result" : "thought") as LogKind,
            text: `${decision === "approve" ? "GODKJENT" : "AVVIST"}: ${item.title}`,
          },
          ...prev,
        ].slice(0, 40),
      );
    }
  }, [approvals]);

  const filteredProps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return properties.filter(
      (p) =>
        (stageFilter === "all" || p.stage === stageFilter) &&
        (!q || p.address.toLowerCase().includes(q) || p.area.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)),
    );
  }, [properties, stageFilter, query]);

  const visibleLogs = logs.filter((l) => logFilter === "all" || l.kind === logFilter);
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="min-h-screen font-sans text-slate-200" style={{ background: "#08090C" }}>
      <style>{`
        @keyframes nxPing { 75%,100% { transform: scale(2.2); opacity: 0; } }
        .nx-ping { animation: nxPing 1.6s cubic-bezier(0,0,0.2,1) infinite; }
        @keyframes nxFlow { to { stroke-dashoffset: -16; } }
        .nx-flow { stroke-dasharray: 4 6; animation: nxFlow 0.9s linear infinite; }
        @keyframes nxGrid { 0%,100% { opacity:.5 } 50% { opacity:1 } }
      `}</style>

      <div className="mx-auto max-w-[1400px] space-y-4 p-4 md:p-6">
        {/* ── 1. TOP BAR / HEADER COCKPIT ── */}
        <Panel className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10">
                <Building2 className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight text-white">RealtyFlow Pro</h1>
                  <span className="rounded-md border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-violet-300">
                    Dealflow OS
                  </span>
                </div>
                <p className="text-xs text-slate-500">Autonomous Real Estate Cockpit</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <HeaderStat icon={CircleDollarSign} label="Pipeline" value={mnok(pipelineValue)} tone="#34d399" />
              <HeaderStat icon={Building2} label="Eiendommer" value={`${properties.length} aktive`} tone="#22d3ee" />
              <HeaderStat icon={Bot} label="Agenter" value={`${activeAgents}/${agents.length} online`} tone="#a78bfa" />
              <HeaderStat icon={Gauge} label="Token-kost" value={`$${tokenCost.toFixed(2)}`} tone="#fbbf24" mono />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Søk eiendom / område …"
                  className="w-40 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
                />
                <span className="hidden items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-500 sm:flex">
                  <Command className="h-3 w-3" />K
                </span>
              </div>
            </div>
          </div>
        </Panel>

        {/* ── 2. AGENT SWARM + CHAIN ── */}
        <Panel className="p-4">
          <SectionTitle icon={Cpu} title="Agent Swarm" hint="Spesialiserte roller langs eiendomsreisen" />
          <AgentChain agents={agents} />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {agents.map((a) => {
              const meta = STATUS_META[a.status];
              const Icon = a.icon;
              return (
                <div key={a.id} className="group relative rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 transition-colors hover:border-white/20">
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/40" style={{ color: meta.color }}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-tight text-white">{a.name}</p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">{a.role}</p>
                      </div>
                    </div>
                    <StatusRing status={a.status} />
                  </div>

                  <p className="mb-2 line-clamp-2 min-h-[2.2rem] text-xs text-slate-400">{a.task}</p>

                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={{ color: meta.color, background: `${meta.color}18` }}>
                      {meta.label}
                    </span>
                    <Sparkline data={a.latency} color={meta.color} />
                  </div>

                  <div className="mb-2.5 flex flex-wrap gap-1">
                    {a.tools.map((t) => (
                      <span key={t} className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300/80">
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-white/5 pt-2">
                    <div className="flex items-center gap-3 font-mono text-[10px] text-slate-500">
                      <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-amber-400/70" />{(a.tokens / 1000).toFixed(1)}k</span>
                      <span className="flex items-center gap-1"><Cpu className="h-3 w-3 text-cyan-400/70" />{a.cpu}%</span>
                    </div>
                    <button
                      onClick={() => toggleAgent(a.id)}
                      className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/10"
                    >
                      {a.status === "idle" ? <><Play className="h-3 w-3 text-emerald-400" /> Start</> : <><Pause className="h-3 w-3 text-amber-400" /> Pause</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* ── 3. PROPERTY DEAL FLOW ── */}
          <Panel className="p-4 xl:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SectionTitle icon={Activity} title="Property Dealflow" hint="Sanntids AI-status per eiendom" />
              <div className="flex flex-wrap items-center gap-1">
                <Filter className="mr-1 h-3.5 w-3.5 text-slate-500" />
                {(["all", ...STAGES] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStageFilter(s)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      stageFilter === s ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {s === "all" ? "Alle" : s}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredProps.map((p) => (
                <div key={p.id} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-3.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{p.address}</p>
                      <p className="font-mono text-[10px] text-slate-500">{p.id} · {p.area}</p>
                    </div>
                    <HealthBadge health={p.health} />
                  </div>

                  <p className="mt-2 font-mono text-base font-semibold text-emerald-300">{nok(p.priceNok)}</p>

                  <StageBar stage={p.stage} />

                  <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.06] px-2.5 py-1.5">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                    <p className="text-[11px] text-cyan-100/90">{p.nextAction}</p>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between">
                    <div className="flex -space-x-1.5">
                      {p.agents.map((aid) => {
                        const a = agents.find((x) => x.id === aid);
                        const Icon = a?.icon ?? Bot;
                        const color = a ? STATUS_META[a.status].color : "#64748b";
                        return (
                          <span key={aid} title={agentName(aid)} className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black" style={{ color }}>
                            <Icon className="h-3 w-3" />
                          </span>
                        );
                      })}
                    </div>
                    <span className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-400">{p.stage}</span>
                  </div>
                </div>
              ))}
              {filteredProps.length === 0 && (
                <div className="col-span-full py-10 text-center text-sm text-slate-500">Ingen eiendommer i dette filteret.</div>
              )}
            </div>
          </Panel>

          {/* ── 4. HUMAN-IN-THE-LOOP GATEWAY ── */}
          <Panel className="p-4">
            <SectionTitle icon={BadgeCheck} title="Godkjenningskø" hint={`${approvals.length} handlinger venter`} tone="#fbbf24" />
            <div className="mt-4 space-y-3">
              {approvals.map((a) => (
                <div key={a.id} className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-3">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-amber-100">{a.title}</p>
                    <RiskBadge risk={a.risk} />
                  </div>
                  <p className="mb-2 text-[11px] leading-relaxed text-slate-400">{a.detail}</p>
                  <div className="mb-2.5 flex items-center gap-2 font-mono text-[10px] text-slate-500">
                    <Bot className="h-3 w-3" /> {agentName(a.agent)}
                    {a.valueNok != null && <><span className="text-slate-700">·</span><span className="text-emerald-300/80">{nok(a.valueNok)}</span></>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => resolveApproval(a.id, "approve")} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1.5 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/20">
                      <Check className="h-3.5 w-3.5" /> Godkjenn
                    </button>
                    <button onClick={() => resolveApproval(a.id, "reject")} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-400/30 bg-rose-400/10 px-2 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-400/20">
                      <X className="h-3.5 w-3.5" /> Avvis
                    </button>
                    <button className="flex items-center justify-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/10" title="Juster kontekst">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {approvals.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <BadgeCheck className="h-8 w-8 text-emerald-400/70" />
                  <p className="text-sm text-slate-400">Køen er tom — alt er behandlet.</p>
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* ── 5. LIVE CHAIN-OF-THOUGHT / TOOL TRACE ── */}
        <Panel className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle icon={Terminal} title="Agent Activity" hint="Action Trace: hendelse → verktøy → resultat → beslutning → godkjenning" tone="#a78bfa" />
            <div className="flex items-center gap-1">
              {(["all", "thought", "tool", "result"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setLogFilter(k)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    logFilter === k ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {k === "all" ? "Alle" : k === "thought" ? "Aktivitet" : k === "tool" ? "Verktøy" : "Resultat"}
                </button>
              ))}
            </div>
          </div>

          <div ref={feedRef} className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs">
            {visibleLogs.length === 0 && <p className="py-6 text-center text-slate-600">Venter på agent-aktivitet …</p>}
            {visibleLogs.map((l) => (
              <div key={l.id} className="flex gap-2 border-b border-white/[0.04] py-1.5 last:border-b-0">
                <span className="shrink-0 text-slate-600">{l.ts}</span>
                <span className="shrink-0 text-slate-500">[{l.agent}]</span>
                <span className={`shrink-0 uppercase ${classForKind(l.kind)}`}>{l.kind === "thought" ? "activity" : l.kind}</span>
                <div className="min-w-0">
                  <p className="text-slate-300">{l.text}</p>
                  {l.json && <pre className="mt-0.5 whitespace-pre-wrap break-all text-cyan-300/70">{l.json}</pre>}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ---------- flere byggeklosser ---------- */

function HeaderStat({ icon: Icon, label, value, tone, mono }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: string; tone: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
        <Icon className="h-3 w-3" style={{ color: tone }} />
        {label}
      </div>
      <p className={`mt-0.5 text-sm font-semibold text-white ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, hint, tone = "#e2e8f0" }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; title: string; hint?: string; tone?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4" style={{ color: tone }} />
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-white">{title}</h2>
        {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

function AgentChain({ agents }: { agents: AgentCard[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <div className="flex min-w-[640px] items-center gap-1">
        {agents.map((a, i) => {
          const meta = STATUS_META[a.status];
          return (
            <div key={a.id} className="flex flex-1 items-center">
              <div className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-white/10 bg-black/30 px-2 py-2">
                <span className="text-[10px] font-medium text-slate-300">{a.name}</span>
                <StatusRing status={a.status} />
              </div>
              {i < agents.length - 1 && (
                <svg width="34" height="16" className="shrink-0">
                  <line x1="2" y1="8" x2="32" y2="8" stroke={meta.color} strokeWidth="1.5" className={a.status !== "idle" ? "nx-flow" : ""} opacity={0.7} />
                  <polygon points="30,4 34,8 30,12" fill={meta.color} opacity={0.8} />
                </svg>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HealthBadge({ health }: { health: number }) {
  const color = health >= 85 ? "#34d399" : health >= 70 ? "#fbbf24" : "#fb7185";
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2 py-1">
      <Brain className="h-3 w-3" style={{ color }} />
      <span className="font-mono text-xs font-semibold" style={{ color }}>{health}</span>
    </div>
  );
}

function RiskBadge({ risk }: { risk: Approval["risk"] }) {
  const map = { høy: "#fb7185", middels: "#fbbf24", lav: "#34d399" } as const;
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: map[risk], background: `${map[risk]}18` }}>
      {risk} risiko
    </span>
  );
}

function StageBar({ stage }: { stage: DealStage }) {
  const idx = STAGES.indexOf(stage);
  return (
    <div className="mt-2.5 flex items-center gap-1">
      {STAGES.map((s, i) => (
        <div key={s} className="flex-1">
          <div
            className="h-1 rounded-full transition-colors"
            style={{ background: i <= idx ? "#34d399" : "rgba(255,255,255,0.08)" }}
          />
          <span className={`mt-1 block text-[9px] ${i === idx ? "text-emerald-300" : "text-slate-600"}`}>{s}</span>
        </div>
      ))}
    </div>
  );
}
