"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { inspectCommandNexusHandoff } from "@/lib/altovena/command-nexus-handoff";

type Mission = {
  id: string;
  goal: string;
  state: string;
  version: number;
  created_at: string;
  updated_at: string;
};
type Listing = { missions?: Mission[]; error?: string };
type Creation = { mission?: Mission; error?: string };
type PlanProposal = {
  status: "proposed";
  plan: {
    mode: "ROUTING_PROPOSAL_ONLY";
    agents: Array<{agentId:string;agentName:string;role:string;executionStatus:"not_started"}>;
    relatedAutomations: Array<{name:string;reference:string;executionStatus:"not_started"}>;
    controls: { requiresHumanReview:boolean; approvedForExecution:boolean; permittedExternalActions:boolean };
    note: string;
  };
};
type PlanResponse = { proposal?:PlanProposal|null; error?:string };
type AnalysisPreparation = {
  mission_id:string;state:"prepared";agent_count:number;
  max_model_calls:number;max_cost_cents:number;prepared_at:string;
};
type AnalysisResponse = { preparation?:AnalysisPreparation|null;error?:string };

const stateNames: Record<string, string> = {
  draft: "Utkast",
  planned: "Planlagt",
  running: "Pågår",
  awaiting_review: "Venter på godkjenning",
  approved: "Godkjent",
  executing: "Utfører",
  verifying: "Verifiserer",
  completed: "Ferdig",
  paused: "Pauset",
  failed: "Feilet",
  partial: "Delvis ferdig",
  rejected: "Avvist",
  cancelled: "Avbrutt",
};
function niceDate(value?: string) {
  if (!value) return "–";
  return new Date(value).toLocaleString("nb-NO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
export default function AltovenaCommandPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [planByMission, setPlanByMission] = useState<Record<string,PlanProposal|null>>({});
  const [planningMission, setPlanningMission] = useState<string|null>(null);
  const [preparingMission, setPreparingMission] = useState<string|null>(null);
  const [preparationByMission, setPreparationByMission] = useState<Record<string,AnalysisPreparation|null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/altovena/command", {
        credentials: "same-origin", cache: "no-store",
      });
      const result = await response.json() as Listing;
      if (!response.ok || !Array.isArray(result.missions)) {
        throw new Error(result.error || "Kunne ikke hente lagrede oppdrag.");
      }
      setMissions(result.missions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke hente oppdrag.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const createDraft = async () => {
    if (goal.trim().length < 1 || goal.trim().length > 4000) {
      setError("Beskriv oppdraget med opptil 4000 tegn.");
      return;
    }
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/altovena/command", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goal.trim(), requestId: crypto.randomUUID(),
        }),
      });
      const result = await response.json() as Creation;
      if (!response.ok || !result.mission) {
        throw new Error(result.error || "Utkast kunne ikke lagres.");
      }
      setGoal("");
      setNotice("Oppdraget ble lagret som utkast. Ingen agent er startet.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke opprette utkast.");
    } finally {
      setCreating(false);
    }
  };

  const showPlan = async (missionId:string) => {
    setPlanningMission(missionId);
    setError("");
    try {
      const res=await fetch(`/api/altovena/command/plan?missionId=${encodeURIComponent(missionId)}`,{
        credentials:"same-origin",cache:"no-store",
      });
      const data=await res.json() as PlanResponse;
      if(!res.ok) throw Error(data.error||"Kunne ikke hente planforslaget.");
      setPlanByMission(old=>({...old,[missionId]:data.proposal||null}));
    } catch(e) {
      setError(e instanceof Error?e.message:"Kunne ikke hente plan.");
    } finally { setPlanningMission(null); }
  };

  const createPlan = async (missionId:string) => {
    setPlanningMission(missionId);
    setError("");
    setNotice("");
    try {
      const res=await fetch("/api/altovena/command/plan",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({missionId}),
      });
      const data=await res.json() as PlanResponse;
      if(!res.ok || !data.proposal) throw Error(data.error||"Kunne ikke lagre planforslaget.");
      setPlanByMission(old=>({...old,[missionId]:data.proposal!}));
      setNotice("Agentforslaget ble lagret til gjennomgang. Ingen agent er startet.");
    } catch(e) {
      setError(e instanceof Error?e.message:"Kunne ikke lage planforslag.");
    } finally { setPlanningMission(null); }
  };

  const showPreparation = async (missionId:string) => {
    setPreparingMission(missionId);
    setError("");
    try {
      const res=await fetch(`/api/altovena/command/analysis?missionId=${encodeURIComponent(missionId)}`,{
        credentials:"same-origin",cache:"no-store",
      });
      const data=await res.json() as AnalysisResponse;
      if(!res.ok) throw Error(data.error||"Kunne ikke hente analyseforberedelsen.");
      setPreparationByMission(old=>({...old,[missionId]:data.preparation||null}));
      if(!data.preparation) setNotice("Det finnes ingen lagret analyseforberedelse ennå.");
    } catch(e) {
      setError(e instanceof Error?e.message:"Kunne ikke hente analyseforberedelsen.");
    } finally { setPreparingMission(null); }
  };
  const prepareAnalysis = async (missionId:string) => {
    setPreparingMission(missionId);
    setNotice("");
    setError("");
    try {
      const res=await fetch("/api/altovena/command/analysis",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({missionId}),
      });
      const data=await res.json() as AnalysisResponse;
      if(!res.ok||!data.preparation) throw Error(data.error||"Kunne ikke forberede analysen.");
      setPreparationByMission(old=>({...old,[missionId]:data.preparation!}));
      setNotice("Analyseforberedelsen er lagret. Ingen AI-agent eller modell er startet.");
    } catch(e) {
      setError(e instanceof Error?e.message:"Kunne ikke forberede analysen.");
    } finally { setPreparingMission(null); }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 text-sm font-semibold tracking-widest text-teal-400">ALTOVENA · COMMAND</div>
          <h1 className="text-3xl font-semibold">Mine AI-oppdrag</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Oppdragene lagres i Altovena-schemaet i RealtyflowPRO.
            Denne interne versjonen lagrer utkast og foreslår eksisterende Nexus-agenter. Ingen agenter starter automatisk.
          </p>
        </div>
        <Link href="/" className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">
          Tilbake til RealtyFlow
        </Link>
      </div>

      <section className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 text-sm text-amber-100">
        <strong>Intern betaversjon.</strong> Oppdrag kan lagres og finnes igjen etter omstart,
        men utførelse, utsendelser og faktisk godkjenning for handling er ikke aktivert.
        Bare RealtyFlow-eierens innloggede sesjon har tilgang til denne siden.
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
        <h2 className="mb-3 text-lg font-semibold">Nytt oppdragsutkast</h2>
        <label htmlFor="command-goal" className="mb-2 block text-sm text-slate-300">
          Hva ønsker du at Altovena Command skal utføre senere?
        </label>
        <textarea id="command-goal" rows={4} maxLength={4000} value={goal}
          onChange={(e) => setGoal(e.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-teal-500"
          placeholder="For eksempel: Undersøk nye B2B-muligheter, analyser datakvalitet og legg et forslag til godkjenning." />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{goal.length}/4000 tegn · Lagres kun som utkast</span>
          <button type="button" onClick={() => void createDraft()} disabled={creating || !goal.trim()}
            className="rounded-xl bg-teal-500 px-5 py-2.5 font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50">
            {creating ? "Lagrer …" : "Lagre oppdrag"}
          </button>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-700 bg-red-950/30 p-4 text-sm text-red-200">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-700 bg-emerald-950/30 p-4 text-sm text-emerald-200">{notice}</div>}

      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Lagrede oppdrag</h2>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-50">
            {loading ? "Laster …" : "Oppdater"}
          </button>
        </div>
        {!loading && missions.length===0 && !error && (
          <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
            Ingen oppdrag er lagret. Opprett det første utkastet ovenfor.
          </div>
        )}
        <div className="divide-y divide-slate-800">
          {missions.map((mission) => (
            <article key={mission.id} className="flex flex-wrap justify-between gap-3 py-4">
              <div className="max-w-3xl">
                <p className="whitespace-pre-wrap font-medium">{mission.goal}</p>
                <p className="mt-2 text-xs text-slate-400">
                  Opprettet {niceDate(mission.created_at)} · Oppdatert {niceDate(mission.updated_at)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="h-fit rounded-full border border-teal-800 bg-teal-950/40 px-3 py-1 text-xs text-teal-200">
                  {stateNames[mission.state] || mission.state}
                </span>
                <div className="flex gap-2">
                  <button type="button" disabled={planningMission===mission.id}
                    onClick={() => void showPlan(mission.id)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50">
                    Vis plan
                  </button>
                  {mission.state==="draft" && <button type="button"
                    disabled={planningMission===mission.id}
                    onClick={() => void createPlan(mission.id)}
                    className="rounded-lg border border-teal-600 px-3 py-1.5 text-xs text-teal-300 hover:bg-teal-950 disabled:opacity-50">
                    Foreslå Nexus-agenter
                  </button>}
                </div>
              </div>
              {planByMission[mission.id] && (
                <div className="w-full rounded-xl border border-cyan-800/50 bg-cyan-950/20 p-4 text-sm">
                  <p className="font-semibold text-cyan-200">Agentforslag · ikke utført</p>
                  <p className="mt-1 text-xs text-slate-400">{planByMission[mission.id]?.plan.note}</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {planByMission[mission.id]?.plan.agents.map(agent => (
                      <div key={agent.agentId} className="rounded-lg border border-slate-700 p-3">
                        <p className="font-medium">{agent.agentName}</p>
                        <p className="text-xs text-slate-400">{agent.role} · Ikke startet</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" disabled={preparingMission===mission.id}
                      onClick={()=>void prepareAnalysis(mission.id)}
                      className="rounded-lg border border-teal-600 px-3 py-1.5 text-xs text-teal-300 hover:bg-teal-950 disabled:opacity-50">
                      {preparingMission===mission.id?"Kontrollerer …":"Forbered analyse"}
                    </button>
                    <button type="button" disabled={preparingMission===mission.id}
                      onClick={()=>void showPreparation(mission.id)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50">
                      Vis analyseforberedelse
                    </button>
                  </div>
                  {preparationByMission[mission.id] && (
                    <div className="mt-3 rounded-lg border border-teal-800/50 bg-teal-950/20 p-3 text-xs">
                      <p className="font-semibold">Analyseforberedelse lagret · ikke startet</p>
                      <p className="mt-1 text-slate-300">
                        {preparationByMission[mission.id]?.agent_count} foreslåtte agenter ·
                        0 modellkall · 0 € forbruk · ingen eksterne handlinger.
                      </p>
                    </div>
                  )}
                  <div className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-100">
                    <p className="font-semibold">Status for Nexus-overføring</p>
                    <p className="mt-1">{inspectCommandNexusHandoff(planByMission[mission.id],mission.id).message}</p>
                    <p className="mt-1 text-amber-200">Neste krav: verifisert kunde-/merkevarekobling, selvstendig analyse, menneskelig godkjenning og autorisasjon ved utførelse.</p>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
