"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReactivationReplyControl } from "@/components/nexus/reactivation-reply-control";

type QueueItem = {
  contact: {
    id: string;
    name?: string | null;
    email?: string | null;
    pipelineStatus?: string | null;
    brandId?: string | null;
  };
  assessment: {
    segment: "hot_dormant" | "warm_dormant" | "cold_dormant";
    score: number;
  };
};

export default function ReactivationReplyReviewPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/nexus/reactivation/queue?limit=100", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setItems(Array.isArray(body?.items) ? body.items : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke laste reaktiveringskø");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-7 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-indigo-700">Nexus Reactivation · Reply Review</div>
          <h2 className="mt-1 text-3xl font-black text-slate-950">Svar som kan vekke gamle leads til live igjen</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Nexus bruker bare inbound e-post som matcher CRM-adressen eksakt. Du ser klassifiseringen først og må eksplisitt bruke svaret før pipeline eller nurture kan endres.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/nexus-os/reactivation" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700">← Reactivation Queue</Link>
          <button onClick={() => void load()} disabled={loading} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{loading ? "Oppdaterer …" : "Oppdater"}</button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{error}</div> : null}
      {!loading && !items.length ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Ingen dormant leads i køen.</div> : null}

      <section className="space-y-4">
        {items.map((item) => (
          <article key={item.contact.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-black text-slate-950">{item.contact.name || item.contact.email || "Ukjent lead"}</h3>
                  <span className="rounded-full bg-slate-950 px-2 py-1 text-[11px] font-black text-white">Score {item.assessment.score}</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">{item.assessment.segment}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{item.contact.email || "Ingen e-post"} · {item.contact.pipelineStatus || "Ukjent stage"} · {item.contact.brandId || "Ukjent brand"}</div>
              </div>
              <Link href={`/customers/${item.contact.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700">Customer 360</Link>
            </div>
            <ReactivationReplyControl contactId={item.contact.id} onApplied={() => void load()} />
          </article>
        ))}
      </section>
    </main>
  );
}
