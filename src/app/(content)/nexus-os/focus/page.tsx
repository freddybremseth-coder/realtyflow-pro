"use client";

import { useEffect, useState } from "react";
import { BRANDS } from "@/lib/constants";

type Focus = {
  id: string;
  brand_id: string;
  focus_key: string;
  title: string;
  notes: string | null;
  intensity: number;
  status: string;
  success_definition: string | null;
  starts_at: string;
  review_due_at: string | null;
};

type Payload = { focus: Focus[] };

const FOCUS_OPTIONS = [
  ["leads", "Flere kvalifiserte leads"],
  ["sales", "Mer salg / bedre konvertering"],
  ["email", "E-post og oppfølging"],
  ["social_growth", "SoMe vekst og engasjement"],
  ["ads", "Annonser og ROI"],
  ["content", "Innhold og publisering"],
  ["books", "Boksalg og Book Growth"],
  ["seo", "SEO og organisk trafikk"],
  ["property_marketing", "Eiendomsmarkedsføring"],
  ["customer_followup", "Kundeoppfølging"],
  ["automation", "Automatisering og kapasitet"],
  ["custom", "Egendefinert fokus"],
] as const;

export default function OwnerFocusPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [brandId, setBrandId] = useState("freddyb");
  const [focusKey, setFocusKey] = useState("sales");
  const [title, setTitle] = useState("Øk salg og konvertering");
  const [notes, setNotes] = useState("");
  const [success, setSuccess] = useState("");
  const [intensity, setIntensity] = useState(9);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/nexus/owner-focus", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Kunne ikke hente fokus");
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  useEffect(() => { void load(); }, []);

  async function createFocus() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/nexus/owner-focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "create", brand_id: brandId, focus_key: focusKey, title, notes, success_definition: success, intensity }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Kunne ikke opprette fokus");
      setNotes(""); setSuccess("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function changeStatus(id: string, status: string) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/nexus/owner-focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "status", id, status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Kunne ikke endre status");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const active = (data?.focus ?? []).filter(f => f.status === "active");
  const history = (data?.focus ?? []).filter(f => f.status !== "active");

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-fuchsia-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-fuchsia-950 p-6 text-white shadow-xl sm:p-7">
      <div className="text-xs font-black uppercase tracking-[0.24em] text-fuchsia-300">Nexus OS · Owner Priority Override</div>
      <h1 className="mt-2 text-3xl font-black">Mitt fokus</h1>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Flagg et område som er ekstra viktig akkurat nå. Nexus øker Director-score, analysefrekvens, forslag og eksperimenttrykk rundt dette brandet og fokusområdet. Fokus påvirker prioritering kraftig, men omgår aldri sikkerhets-, kanal-, budsjett- eller approval-regler.</p>
    </header>

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

    <section className="grid gap-5 lg:grid-cols-[420px,1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">Flagg nytt fokusområde</h2>
        <div className="mt-4 space-y-4">
          <label className="block"><span className="text-xs font-black uppercase text-slate-500">Brand</span><select value={brandId} onChange={e => setBrandId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">{BRANDS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className="block"><span className="text-xs font-black uppercase text-slate-500">Fokus</span><select value={focusKey} onChange={e => { const key = e.target.value; setFocusKey(key); const hit = FOCUS_OPTIONS.find(x => x[0] === key); if (hit) setTitle(hit[1]); }} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">{FOCUS_OPTIONS.map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="block"><span className="text-xs font-black uppercase text-slate-500">Tittel</span><input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-xs font-black uppercase text-slate-500">Intensitet {intensity}/10</span><input type="range" min={1} max={10} value={intensity} onChange={e => setIntensity(Number(e.target.value))} className="mt-2 w-full" /></label>
          <label className="block"><span className="text-xs font-black uppercase text-slate-500">Mine merknader</span><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Hvorfor er dette viktig, hva ser du som problemet, hva vil du at systemet skal undersøke ekstra?" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-xs font-black uppercase text-slate-500">Hvordan vet vi at vi lykkes?</span><textarea value={success} onChange={e => setSuccess(e.target.value)} rows={3} placeholder="F.eks. flere kvalifiserte leads, høyere svarrate, mer boksalg, bedre ROAS…" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" /></label>
          <button onClick={createFocus} disabled={busy || !title.trim()} className="w-full rounded-xl bg-fuchsia-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? "Lagrer…" : "Gjør dette til Nexus-prioritet"}</button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-lg font-black text-slate-900">Aktive eierprioriteringer</h2><span className="rounded-full bg-fuchsia-100 px-3 py-1 text-xs font-black text-fuchsia-800">{active.length} aktive</span></div>
          <div className="mt-4 space-y-3">{active.length === 0 ? <div className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Ingen aktiv Owner Focus. Director bruker normal porteføljebalanse.</div> : active.map(f => {
            const brand = BRANDS.find(b => b.id === f.brand_id)?.name || f.brand_id;
            return <article key={f.id} className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-wider text-fuchsia-600">{brand} · {f.focus_key.replaceAll("_"," ")}</div><h3 className="mt-1 text-lg font-black text-slate-900">{f.title}</h3></div><span className="rounded-full bg-fuchsia-600 px-3 py-1 text-xs font-black text-white">INTENSITET {f.intensity}/10</span></div>
              {f.notes && <p className="mt-3 text-sm leading-6 text-slate-700">{f.notes}</p>}
              {f.success_definition && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><b>Suksess:</b> {f.success_definition}</div>}
              <div className="mt-4 flex gap-2"><button disabled={busy} onClick={() => changeStatus(f.id,"paused")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">Pause</button><button disabled={busy} onClick={() => changeStatus(f.id,"completed")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Marker løst</button></div>
            </article>;
          })}</div>
        </div>

        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 text-sm leading-6 text-cyan-950"><b>Hva Nexus gjør når du flagger noe:</b> brandet får betydelig høyere Director-score; direkte kilder som matcher fokusområdet får ekstra boost; brandet kan bruke opptil 5 Director-plasser i stedet for 2; Victoria ser fokuset i live-konteksten; neste steg er å koble dette til eksperimentbudsjett, læringsfrekvens og ukentlig outcome-review.</div>
      </div>
    </section>

    {history.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-slate-900">Tidligere fokus</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{history.slice(0,12).map(f => <div key={f.id} className="rounded-xl bg-slate-50 p-4"><div className="text-xs font-black uppercase text-slate-400">{f.status} · {f.brand_id}</div><div className="mt-1 font-black text-slate-800">{f.title}</div></div>)}</div></section>}
  </div>;
}
