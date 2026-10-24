"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Mission = { id: string; goal: string; state: string; created_at: string; updated_at: string };
type Data = { missions?: Mission[]; mode?: string; error?: string };
const states: Record<string, string> = {
  draft: "Utkast", planned: "Planlagt", running: "Pågår",
  awaiting_review: "Til godkjenning", approved: "Godkjent",
  completed: "Ferdig", paused: "Pauset", failed: "Feilet",
};

export default function AltovenaCollaborationWorkspacePage() {
  const { brandKey } = useParams<{ brandKey: string }>();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const endpoint = "/api/workspaces/" + encodeURIComponent(String(brandKey)) + "/altovena/command";
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin" });
      const result = await response.json() as Data;
      if (!response.ok || !Array.isArray(result.missions)) throw new Error(
        response.status === 403 ? "Altovena-samarbeidet er ikke aktivert for denne brukeren."
          : "Kunne ikke hente Altovena-oppdrag."
      );
      setMissions(result.missions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ukjent feil");
    } finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createDraft() {
    const cleaned = goal.trim();
    if (!cleaned || cleaned.length > 4000) { setError("Beskriv oppdraget med maksimalt 4000 tegn."); return; }
    setCreating(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: cleaned, requestId: crypto.randomUUID() }),
      });
      if (!response.ok) throw new Error("Oppdraget kunne ikke lagres. Kontroller tilgangen og prøv igjen.");
      setGoal("");
      setNotice("Oppdraget er lagret som utkast i Altovenas samarbeidsområde. Ingen agent er startet.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ukjent feil");
    } finally { setCreating(false); }
  }

  return <main className="mx-auto max-w-6xl space-y-6 p-4 text-slate-100 sm:p-6">
    <header className="space-y-2">
      <Link href={"/workspace/" + brandKey + "/content-hub"} className="text-sm text-cyan-300 underline">Tilbake til arbeidsområdet</Link>
      <h1 className="text-3xl font-bold">Altovena · Samarbeid</h1>
      <p className="max-w-3xl text-slate-300">Felles utvikling av Altovena-produktene. Dette er et separat prosjektområde, uten Soleada, økonomi, privat CRM eller systemadministrasjon.</p>
      <p className="text-sm text-amber-200">Command kan foreløpig lagre oppdragsutkast. Ingen agentkjøring, automatisk godkjenning eller publisering er aktivert her.</p>
    </header>
    <div className="grid gap-3 md:grid-cols-3">
      {[
        { name: "Command", text: "Samarbeid om oppdragsutkast", state: "Åpent for utkast" },
        { name: "Intelligence", text: "Fleragent-system og kvalitetssikring", state: "Under utvikling" },
        { name: "Visibility", text: "Tester, PR-er og produksjonsbevis", state: "Under utvikling" },
      ].map(product => <article key={product.name} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="font-semibold">{product.name}</h2>
        <p className="mt-2 text-sm text-slate-300">{product.text}</p>
        <span className="mt-3 inline-block rounded bg-slate-800 px-2 py-1 text-xs">{product.state}</span>
      </article>)}
    </div>
    <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-5">
      <h2 className="text-xl font-semibold">Nytt felles oppdragsutkast</h2>
      <label className="block text-sm text-slate-300" htmlFor="altovena-goal">Hva skal vi utvikle eller undersøke?</label>
      <textarea id="altovena-goal" value={goal} onChange={event => setGoal(event.target.value)}
        maxLength={4000} rows={5} className="w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"/>
      <button type="button" disabled={creating || !goal.trim()} onClick={() => void createDraft()}
        className="rounded-lg bg-cyan-700 px-4 py-2 font-semibold disabled:opacity-50">
        {creating ? "Lagrer…" : "Lagre felles utkast"}
      </button>
      {notice && <p role="status" className="text-emerald-200">{notice}</p>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
    </section>
    <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Felles oppdrag ({missions.length})</h2>
        <button type="button" onClick={() => void refresh()} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Oppdater</button>
      </div>
      {loading && <p className="mt-3 text-slate-300">Henter oppdrag…</p>}
      {!loading && !error && missions.length === 0 && <p className="mt-3 text-slate-400">Ingen oppdrag er registrert i dette samarbeidsområdet ennå.</p>}
      <div className="mt-4 space-y-3">
        {missions.map(mission => <article key={mission.id} className="rounded-lg border border-slate-700 bg-slate-950 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded bg-slate-800 px-2 py-1 text-xs">{states[mission.state] || mission.state}</span>
            <time className="text-xs text-slate-400">{new Date(mission.updated_at).toLocaleString("nb-NO", { timeZone: "Europe/Madrid" })}</time>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm">{mission.goal}</p>
        </article>)}
      </div>
    </section>
  </main>;
}
