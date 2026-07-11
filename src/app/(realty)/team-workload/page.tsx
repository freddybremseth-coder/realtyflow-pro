"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  CircleUserRound,
  Clock3,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import type { AccessRole } from "@/lib/access-control";
import type { TeamWorkloadItem, TeamWorkloadWorkspace } from "@/lib/revenue/team-workload";

type Payload = {
  workspace: TeamWorkloadWorkspace;
  canManageAssignments: boolean;
  assignmentHistoryCount: number;
};

const roleLabels: Record<AccessRole, string> = {
  OWNER: "Owner",
  SALES: "Sales",
  CLOSING: "Closing",
  FINANCE: "Finance",
  MARKETING: "Marketing",
  KEYHOLDING: "Keyholding",
  VIEWER: "Read-only",
};

const loadLabels = {
  HIGH: "Høy belastning",
  BALANCED: "Balansert",
  LIGHT: "Lett belastning",
  EMPTY: "Ingen tildelinger",
};

function priorityClass(priority: TeamWorkloadItem["priority"]) {
  if (priority === "CRITICAL") return "border-red-700/60 bg-red-950/25 text-red-200";
  if (priority === "HIGH") return "border-amber-700/60 bg-amber-950/20 text-amber-200";
  if (priority === "MEDIUM") return "border-blue-700/50 bg-blue-950/20 text-blue-200";
  return "border-slate-700 bg-slate-900/50 text-slate-300";
}

export default function TeamWorkloadPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"ALL" | "UNASSIGNED" | "OVERDUE" | "CRITICAL">("ALL");
  const [type, setType] = useState<"ALL" | "CONTACT" | "TASK">("ALL");
  const [member, setMember] = useState("all");

  const load = async () => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/team-workload", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Kunne ikke hente teamoversikten.");
    else setData(body);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const assign = async (item: TeamWorkloadItem, ownerEmail: string) => {
    const key = item.id;
    if (!data?.canManageAssignments) return;
    setBusy(key);
    setError("");
    setNotice("");
    const response = await fetch("/api/team-workload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceType: item.resourceType, resourceId: item.resourceId, ownerEmail: ownerEmail || null }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Kunne ikke lagre tildelingen.");
    else {
      setNotice(body.unchanged ? "Tildelingen var allerede registrert." : ownerEmail ? "Ansvarlig er oppdatert." : "Ansvarlig er fjernet.");
      if (body.mirrorWarning) setNotice((value) => `${value} Sentral historikk er lagret, men speiling ga varsel: ${body.mirrorWarning}`);
      await load();
    }
    setBusy("");
  };

  const visible = useMemo(() => {
    const items = data?.workspace.items || [];
    return items.filter((item) => {
      if (filter === "UNASSIGNED" && item.ownerEmail) return false;
      if (filter === "OVERDUE" && !item.overdue) return false;
      if (filter === "CRITICAL" && item.priority !== "CRITICAL") return false;
      if (type !== "ALL" && item.resourceType !== type) return false;
      if (member !== "all" && item.ownerEmail !== member) return false;
      return true;
    });
  }, [data, filter, type, member]);

  if (loading) return <div className="p-8 text-slate-400">Laster team og arbeidsfordeling…</div>;

  const workspace = data?.workspace;
  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary-400"><UsersRound size={18}/> Team Ownership & Workload</div>
            <h1 className="text-3xl font-bold">Team & arbeidsfordeling</h1>
            <p className="mt-2 max-w-3xl text-slate-400">Se hvem som eier kunder og oppgaver, finn ufordelte kritiske saker og balanser arbeidsmengden. Bare Owner kan endre ansvar.</p>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"><RefreshCw size={15}/> Oppdater</button>
        </header>

        {error && <div className="rounded-xl border border-red-700/60 bg-red-950/40 p-4 text-red-200"><AlertTriangle className="mr-2 inline" size={17}/>{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/40 p-4 text-emerald-200"><CheckCircle2 className="mr-2 inline" size={17}/>{notice}</div>}
        {!data?.canManageAssignments && <div className="rounded-xl border border-blue-800/50 bg-blue-950/20 p-4 text-sm text-blue-200"><ShieldCheck className="mr-2 inline" size={17}/>Du har lesetilgang. Tildelinger kan bare endres av Owner.</div>}
        {(workspace?.warnings || []).map((warning) => <div key={warning} className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-200">{warning}</div>)}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Teammedlemmer", workspace?.summary.members || 0, UsersRound],
            ["Fordelte kunder", workspace?.summary.assignedContacts || 0, CircleUserRound],
            ["Fordelte oppgaver", workspace?.summary.assignedTasks || 0, BriefcaseBusiness],
            ["Ufordelte", (workspace?.summary.unassignedContacts || 0) + (workspace?.summary.unassignedTasks || 0), UserRoundCheck],
            ["Forfalt", workspace?.summary.overdue || 0, Clock3],
            ["Kritisk", workspace?.summary.critical || 0, AlertTriangle],
          ].map(([label, value, Icon]: any) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><Icon size={18} className="mb-3 text-primary-400"/><div className="text-2xl font-bold">{value}</div><div className="text-xs text-slate-500">{label}</div></div>)}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-semibold">Belastning per person</h2><span className="text-xs text-slate-500">{data?.assignmentHistoryCount || 0} tildelingshendelser lagret</span></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(workspace?.members || []).map((row) => (
              <button key={row.email} onClick={() => setMember(member === row.email ? "all" : row.email)} className={`rounded-2xl border p-5 text-left transition ${member === row.email ? "border-primary-500 bg-primary-950/20" : "border-slate-800 bg-slate-900/70 hover:border-slate-700"}`}>
                <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{row.displayName}</div><div className="text-xs text-slate-500">{row.email} · {roleLabels[row.role]}</div></div><span className={`rounded-full px-2 py-1 text-[10px] font-medium ${row.load === "HIGH" ? "bg-red-950 text-red-300" : row.load === "BALANCED" ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-300"}`}>{loadLabels[row.load]}</span></div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs"><div><div className="text-lg font-semibold">{row.contacts}</div><div className="text-slate-500">Kunder</div></div><div><div className="text-lg font-semibold">{row.tasks}</div><div className="text-slate-500">Oppgaver</div></div><div><div className="text-lg font-semibold text-amber-300">{row.overdue}</div><div className="text-slate-500">Forfalt</div></div><div><div className="text-lg font-semibold text-red-300">{row.critical}</div><div className="text-slate-500">Kritisk</div></div></div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-xl font-semibold">Arbeidskø <span className="text-sm font-normal text-slate-500">({visible.length})</span></h2>
            <div className="flex flex-wrap gap-2">
              {(["ALL", "UNASSIGNED", "OVERDUE", "CRITICAL"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-2 text-xs ${filter === value ? "bg-primary-600 text-white" : "border border-slate-700 text-slate-300"}`}>{value === "ALL" ? "Alle" : value === "UNASSIGNED" ? "Ufordelte" : value === "OVERDUE" ? "Forfalt" : "Kritisk"}</button>)}
              <select value={type} onChange={(event) => setType(event.target.value as any)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs"><option value="ALL">Kunder og oppgaver</option><option value="CONTACT">Kun kunder</option><option value="TASK">Kun oppgaver</option></select>
              {member !== "all" && <button onClick={() => setMember("all")} className="rounded-lg border border-slate-700 px-3 py-2 text-xs">Nullstill person</button>}
            </div>
          </div>

          <div className="space-y-3">
            {visible.map((item) => (
              <article key={item.id} className={`rounded-2xl border p-4 ${priorityClass(item.priority)}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2"><span className="rounded bg-slate-950/60 px-2 py-1 text-[10px] font-semibold">{item.resourceType === "CONTACT" ? "KUNDE" : "OPPGAVE"}</span><span className="text-[10px] font-semibold">{item.priority}</span>{item.overdue && <span className="rounded bg-red-900/50 px-2 py-1 text-[10px]">FORFALT</span>}<span className="text-[10px] uppercase text-slate-500">{item.brandId}</span></div>
                    <Link href={item.href} className="font-semibold hover:underline">{item.title}</Link>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-400">{item.detail}</p>
                    <div className="mt-2 text-xs text-slate-500">Anbefalt rolle: {item.recommendedRoles.map((role) => roleLabels[role]).join(" / ")} · score {item.score}</div>
                  </div>
                  <div className="flex min-w-[280px] flex-col gap-2 lg:items-end">
                    <div className="text-xs text-slate-400">Nå: {item.ownerName || "Ufordelt"}{item.ownerRole ? ` · ${roleLabels[item.ownerRole]}` : ""}</div>
                    {data?.canManageAssignments ? (
                      <select disabled={busy === item.id} value={item.ownerEmail || ""} onChange={(event) => void assign(item, event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm lg:w-72">
                        <option value="">Ufordelt</option>
                        {(workspace?.members || []).map((person) => <option key={person.email} value={person.email}>{person.displayName} · {roleLabels[person.role]} · {loadLabels[person.load]}</option>)}
                      </select>
                    ) : <div className="rounded-lg border border-slate-700 px-3 py-2 text-sm">{item.ownerEmail || "Ufordelt"}</div>}
                  </div>
                </div>
              </article>
            ))}
            {!visible.length && <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-500">Ingen saker matcher filtrene.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
