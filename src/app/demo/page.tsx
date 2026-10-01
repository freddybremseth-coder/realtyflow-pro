"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Building2, CheckCircle2, CircleDollarSign, Clock3, Home, Mail, Play, RefreshCcw, Sparkles, Target, UserRound, WandSparkles } from "lucide-react";

const TOTAL_MS = 15000;
const STEP_MS = TOTAL_MS / 4;

const leads = [
  { name: "Kari Hansen", need: "3 sov · Albir", value: "620 000 €", signal: "Ny forespørsel" },
  { name: "Jonas Berg", need: "Villa · Finestrat", value: "780 000 €", signal: "Visning" },
  { name: "Mona Lie", need: "2 sov · Benidorm", value: "410 000 €", signal: "Oppfølging" },
];

export default function PublicDemoPage() {
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const next = Date.now() - startedAt;
      if (next >= TOTAL_MS) {
        setElapsed(TOTAL_MS);
        setPlaying(false);
      } else {
        setElapsed(next);
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [playing, startedAt]);

  const step = Math.min(3, Math.floor(elapsed / STEP_MS));
  const progress = Math.min(100, (elapsed / TOTAL_MS) * 100);
  const secondsLeft = Math.max(0, Math.ceil((TOTAL_MS - elapsed) / 1000));
  const restart = () => {
    setStartedAt(Date.now());
    setElapsed(0);
    setPlaying(true);
  };

  const heading = useMemo(
    () => [
      "1. Se hva som trenger handling i dag",
      "2. AI strukturerer leadet",
      "3. Finn relevante eiendommer",
      "4. Oppfølging uten å miste kontroll",
    ][step],
    [step],
  );

  return (
    <main className="min-h-screen bg-[#050914] text-white">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
        <a href="/" className="flex items-center gap-3 text-white no-underline">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400 text-slate-950"><Sparkles className="h-5 w-5" /></span>
          <div><p className="font-black leading-none">RealtyFlow</p><p className="mt-1 text-xs text-slate-400">15 sek produktdemo</p></div>
        </a>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">Kun syntetiske demo-data</span>
          <a href="/" className="text-sm font-bold text-slate-300 hover:text-white">Tilbake</a>
        </div>
      </header>

      <section className="mx-auto grid min-h-[80vh] max-w-7xl items-center gap-10 px-5 pb-12 lg:grid-cols-[0.78fr_1.22fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Auto demo · {secondsLeft}s igjen</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">{heading}</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
            Denne offentlige demoen kobler ikke til CRM, Supabase eller ekte kundedata. Navn, priser, pipeline-signaler og eiendommer er laget kun for presentasjon.
          </p>
          <div className="mt-7 flex gap-3">
            <button onClick={restart} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-slate-950"><RefreshCcw className="h-4 w-4" /> Start på nytt</button>
            {!playing && <button onClick={restart} className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 px-5 py-3 font-black"><Play className="h-4 w-4" /> Spill 15 sek</button>}
          </div>
          <div className="mt-8 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-300 transition-[width] duration-100" style={{ width: `${progress}%` }} /></div>
          <div className="mt-3 grid grid-cols-4 text-center text-[11px] font-black text-slate-600">
            {["Today","Lead","Match","Follow-up"].map((label, i) => <span key={label} className={i === step ? "text-white" : ""}>{label}</span>)}
          </div>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950/90 p-3 shadow-2xl shadow-cyan-950/40">
          <div className="rounded-[1.5rem] border border-slate-800 bg-[#0b1220] p-5 md:p-7">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 text-slate-950"><Sparkles className="h-5 w-5" /></span><div><p className="font-black">RealtyFlow · DEMO</p><p className="text-xs text-slate-500">AI suggests · human approves</p></div></div>
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-300">DEMO</span>
            </div>

            {step === 0 && (
              <div className="mt-6 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  {[["Prioritet i dag","7","kunder"],["Nye signaler","4","siste 24t"],["Oppfølging","5","forfalt"]].map(([a,b,c]) => <div key={a} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs font-semibold text-slate-500">{a}</p><p className="mt-1 text-3xl font-black">{b}</p><p className="text-xs text-slate-500">{c} · demo</p></div>)}
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="mb-3 flex items-center gap-2"><Target className="h-4 w-4 text-cyan-300" /><p className="font-black">Neste anbefalte handlinger</p></div>
                  <div className="space-y-2">{leads.map((lead,i)=><div key={lead.name} className="flex items-center justify-between gap-3 rounded-xl bg-slate-950/70 p-3"><div><p className="font-bold">{lead.name}</p><p className="text-xs text-slate-500">{lead.need} · {lead.signal}</p></div><span className="text-sm font-black text-cyan-300">{i===0?"Kontakt i dag":i===1?"Bekreft visning":"Send utkast"}</span></div>)}</div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="mt-6">
                <div className="mb-4 flex items-center gap-2"><UserRound className="h-5 w-5 text-cyan-300" /><h2 className="text-xl font-black">Lead Intelligence</h2></div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Innkommende melding · demo</p>
                  <p className="mt-3 text-slate-200">«Vi ser etter 3 soverom, gjerne i Albir eller Alfaz. Budsjett rundt 600–650k. Viktig med skole og uteplass.»</p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[["Område","Albir · Alfaz"],["Budsjett","600–650k €"],["Bolig","3 soverom"],["Prioriteter","Skole · uteplass"]].map(([a,b])=><div key={a} className="rounded-2xl border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-500">{a}</p><p className="mt-1 font-black">{b}</p></div>)}
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4"><WandSparkles className="h-5 w-5 text-cyan-300" /><div><p className="font-black">AI foreslår profil</p><p className="text-xs text-slate-400">Mennesket kan korrigere før videre bruk.</p></div><BadgeCheck className="ml-auto h-5 w-5 text-emerald-400" /></div>
              </div>
            )}

            {step === 2 && (
              <div className="mt-6">
                <div className="mb-4 flex items-center gap-2"><Home className="h-5 w-5 text-cyan-300" /><h2 className="text-xl font-black">Property match preview</h2></div>
                <div className="space-y-3">
                  {[
                    ["Mar Azul Residence","Albir","629 000 €","92%"],
                    ["Costa Verde Homes","Alfaz del Pi","598 000 €","87%"],
                    ["Serra Garden","La Nucia","545 000 €","78%"],
                  ].map(([name,area,price,score])=><div key={name} className="grid grid-cols-[1fr_auto] gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-[1.2fr_.8fr_auto]"><div><p className="font-black">{name}</p><p className="text-xs text-slate-500">{area} · syntetisk objekt</p></div><div className="hidden md:block"><p className="text-xs text-slate-500">Pris</p><p className="font-bold">{price}</p></div><div className="text-right"><p className="text-xs text-slate-500">Match</p><p className="text-lg font-black text-cyan-300">{score}</p></div></div>)}
                </div>
                <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">Matchscore og objekter er demo-data. Systemet skal brukes som beslutningsstøtte, ikke som automatisk kundeløfte.</div>
              </div>
            )}

            {step === 3 && (
              <div className="mt-6">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><Mail className="h-5 w-5 text-cyan-300" /><p className="mt-3 font-black">E-postutkast</p><p className="mt-1 text-sm text-slate-500">Generert, ikke sendt</p></div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><Clock3 className="h-5 w-5 text-cyan-300" /><p className="mt-3 font-black">Neste oppfølging</p><p className="mt-1 text-sm text-slate-500">I morgen kl. 10 · demo</p></div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><CircleDollarSign className="h-5 w-5 text-cyan-300" /><p className="mt-3 font-black">Pipeline-verdi</p><p className="mt-1 text-sm text-slate-500">1,8M € · syntetisk</p></div>
                </div>
                <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
                  <div className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 text-emerald-400" /><div><p className="font-black">AI foreslår. Brukeren godkjenner.</p><p className="mt-1 text-sm text-slate-400">Ingen kundemelding sendes fra denne demoen. Ingen ekte data lastes.</p></div></div>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4"><p className="font-black">15 sekunder: signal → leadprofil → relevante objekter → kontrollert oppfølging</p></div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
