"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BrainCircuit, Clock3, Languages, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";
import type { RevenueBrainWithCommunication, RevenueBrainActionWithCommunication } from "@/lib/nexus/next-best-action-communication";

type NextBestActionResponse = {
  nextBestAction?: RevenueBrainWithCommunication | null;
  warnings?: string[];
  error?: string;
};

function localHourFromUtc(hourUtc: number | null) {
  if (hourUtc === null || !Number.isInteger(hourUtc) || hourUtc < 0 || hourUtc > 23) return null;
  const now = new Date();
  const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0));
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(utcDate);
}

function evidenceLabel(value: "none" | "moderate" | "strong") {
  if (value === "strong") return "Sterk evidens";
  if (value === "moderate") return "Moderat evidens";
  return "Ingen sikker læring ennå";
}

function adviceChips(item: RevenueBrainActionWithCommunication) {
  const advice = item.communicationAdvice;
  const chips: { label: string; icon: typeof Clock3 }[] = [];
  const localHour = localHourFromUtc(advice.timing.preferredHourUtc);
  if (localHour) chips.push({ label: `Ca. ${localHour} spansk tid`, icon: Clock3 });
  if (advice.timing.preferredWeekdayUtc) chips.push({ label: advice.timing.preferredWeekdayUtc, icon: Clock3 });
  if (advice.message.preferredTone) chips.push({ label: `Tone: ${advice.message.preferredTone}`, icon: MessageSquareText });
  if (advice.message.preferredLanguage) chips.push({ label: `Språk: ${advice.message.preferredLanguage}`, icon: Languages });
  if (advice.message.preferredLength) chips.push({ label: `Lengde: ${advice.message.preferredLength}`, icon: MessageSquareText });
  if (advice.message.preferredIntent) chips.push({ label: `Vinkel: ${advice.message.preferredIntent}`, icon: Sparkles });
  return chips.slice(0, 6);
}

export function NextBestActionPanel() {
  const [data, setData] = useState<RevenueBrainWithCommunication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch("/api/nexus/next-best-action", { cache: "no-store" });
        const body = await response.json().catch(() => ({})) as NextBestActionResponse;
        if (!alive) return;
        if (!response.ok) {
          setError(body.error || "Kunne ikke hente Nexus-anbefalinger.");
          return;
        }
        setData(body.nextBestAction || null);
      } catch {
        if (alive) setError("Kunne ikke hente Nexus-anbefalinger.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => { alive = false; };
  }, []);

  const top = useMemo(() => (data?.actions || []).slice(0, 5), [data]);

  return (
    <section className="rounded-2xl border border-primary-900/70 bg-primary-950/15 p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary-300"><BrainCircuit size={18}/> Nexus · Next Best Action</div>
          <h2 className="text-xl font-semibold text-slate-100">Hva bør gjøres nå – og hvordan bør kunden kontaktes?</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">Revenue Brain prioriterer handlingene. Kommunikasjonslæringen foreslår timing og budskap bare når det finnes nok evidens.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200"><ShieldCheck size={15}/> Rådgivning בלבד · ingen automatisk utsending</div>
      </div>

      {loading && <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-5 text-sm text-slate-500">Henter prioriteringer og læringssignaler…</div>}
      {error && <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4 text-sm text-amber-200">{error}</div>}

      {!loading && !error && (
        <div className="space-y-3">
          {top.map((item) => {
            const chips = adviceChips(item);
            return (
              <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      <span>#{item.rank}</span>
                      <span>{item.priority}</span>
                      <span>{item.policyClass}</span>
                      <span>Score {item.opportunityScore}/100</span>
                      <span>{evidenceLabel(item.communicationAdvice.evidence)}</span>
                    </div>
                    <h3 className="font-semibold text-slate-100">{item.title}</h3>
                    <p className="mt-1 text-sm text-slate-300">{item.subject}</p>
                    <p className="mt-2 text-sm text-slate-400">{item.recommendedAction}</p>

                    {chips.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {chips.map(({ label, icon: Icon }) => (
                          <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300"><Icon size={12}/>{label}</span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-xs text-slate-500">Ikke nok historikk til å gi timing- eller budskapsråd ennå.</div>
                    )}

                    {item.communicationAdvice.reasons.length > 0 && (
                      <div className="mt-3 text-xs text-slate-500">{item.communicationAdvice.reasons.slice(0, 2).join(" · ")}</div>
                    )}
                  </div>
                  <Link href={item.href} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-500">Åpne arbeidsflate <ArrowRight size={15}/></Link>
                </div>
              </article>
            );
          })}

          {!top.length && <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">Ingen Next Best Action er klar akkurat nå.</div>}

          {data && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-slate-500">
              <span>{data.summary.ranked} rangerte handlinger</span>
              <span>{data.communicationLearning.advisedActions} med kommunikasjonslæring</span>
              <span>Policy kan ikke endres av læringen</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
