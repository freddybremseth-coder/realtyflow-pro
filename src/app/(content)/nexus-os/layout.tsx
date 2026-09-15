import Link from "next/link";
import type { ReactNode } from "react";
import { AgentFleetStrip } from "@/components/nexus/agent-fleet-strip";
import { NexusAttentionStrip } from "@/components/nexus/nexus-attention-strip";

const PRIMARY_LINKS = [
  { href: "/nexus-os/today", label: "I dag" },
  { href: "/nexus-os/morning-brief", label: "Morgenbrief" },
  { href: "/nexus-os/focus", label: "Mitt fokus" },
  { href: "/nexus-os/communications", label: "E-post & kommunikasjon" },
  { href: "/nexus-os/director", label: "AI Director" },
  { href: "/approvals", label: "Godkjenninger" },
  { href: "/connections", label: "Tilkoblinger" },
  { href: "/nexus-os", label: "Nexus oversikt" },
] as const;

const ADVANCED_LINKS = [
  { href: "/nexus-os/review-console", label: "Freddy Review" },
  { href: "/nexus-os/buyer-profile-health", label: "Kjøperprofiler – kvalitet" },
  { href: "/nexus-os/growth-scaling", label: "Growth Scaling" },
  { href: "/personal-intelligence", label: "AI-rådgiver" },
  { href: "/nexus-os/revenue-command", label: "Revenue Command" },
  { href: "/nexus-os/revenue-brain", label: "Revenue Brain" },
  { href: "/nexus-os/multi-brand-intelligence", label: "Multi-brand" },
  { href: "/nexus-os/commercial-targets", label: "Mål" },
  { href: "/nexus-os/reactivation", label: "Reaktivering" },
  { href: "/nexus-os/reactivation/replies", label: "Svar – reaktivering" },
  { href: "/nexus-os/buyer-intake", label: "Kjøperinntak" },
  { href: "/nexus-os/buyer-intake/reviews", label: "Kjøperinntak – kontroll" },
  { href: "/nexus-os/persona-backfill", label: "Persona Backfill" },
  { href: "/nexus-os/source-health", label: "Kildestatus" },
  { href: "/nexus-os/email-link-health", label: "E-postkoblinger" },
  { href: "/nexus-os/mission-operations", label: "Mission Ops" },
  { href: "/agents", label: "AI-agenter" },
  { href: "/os", label: "Systemstatus" },
  { href: "/nexus-os/communications/nurture", label: "Nurture Control" },
  { href: "/nexus-os/communications/readiness", label: "E-post readiness" },
  { href: "/nexus-os/communications/audit", label: "E-post audit" },
  { href: "/nexus-os/runtime", label: "Automatisering – status" },
  { href: "/nexus-os/autonomy", label: "Autopilot-regler" },
  { href: "/social-automation", label: "Markedsføring" },
  { href: "/book-growth", label: "Bøker" },
] as const;

export default function NexusOsLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-950 text-slate-100">
    <div className="border-b border-cyan-900/50 bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.16),_transparent_34%),linear-gradient(135deg,#020617,#0f172a_56%,#082f49)]">
      <div className="mx-auto max-w-[1600px] px-4 pb-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,.8)]" />
              Nexus AI
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Kontrollsenter</h1>
              <span className="text-xs font-bold text-slate-400">Daglige valg først · tekniske verktøy under avansert</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/nexus-os/today" className="rounded-xl border border-emerald-400/50 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-400/20">Åpne I dag →</Link>
            <Link href="/nexus-os/communications" className="rounded-xl border border-cyan-300/60 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/20">E-post →</Link>
          </div>
        </div>

        <nav aria-label="Nexus hovedvalg" className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {PRIMARY_LINKS.map((item) => <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-black text-slate-200 transition hover:border-cyan-400 hover:bg-cyan-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">{item.label}</Link>)}
        </nav>

        <details className="mt-3 rounded-xl border border-slate-800 bg-slate-950/45">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-200">Avanserte Nexus-verktøy</summary>
          <nav aria-label="Avanserte Nexus-verktøy" className="flex flex-wrap gap-2 border-t border-slate-800 px-3 py-3">
            {ADVANCED_LINKS.map((item) => <Link key={item.href} href={item.href} className="rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-cyan-500/60 hover:text-slate-100">{item.label}</Link>)}
          </nav>
        </details>
      </div>
    </div>
    <AgentFleetStrip />
    <div className="border-b border-slate-800 bg-slate-950/95 py-3"><NexusAttentionStrip /></div>
    <div className="bg-slate-50 text-slate-950">{children}</div>
  </div>;
}
