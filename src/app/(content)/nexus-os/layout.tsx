import Link from "next/link";
import type { ReactNode } from "react";
import { AgentFleetStrip } from "@/components/nexus/agent-fleet-strip";
import { NexusAttentionStrip } from "@/components/nexus/nexus-attention-strip";

const LINKS = [
  { href: "/nexus-os/today", label: "Today" },
  { href: "/nexus-os/revenue-command", label: "Revenue Command" },
  { href: "/nexus-os/commercial-targets", label: "Targets" },
  { href: "/nexus-os/mission-operations", label: "Mission Ops" },
  { href: "/nexus-os", label: "Agentic OS" },
  { href: "/agents", label: "Agent Fleet" },
  { href: "/os", label: "Attention" },
  { href: "/nexus-os/focus", label: "Owner Focus" },
  { href: "/nexus-os/director", label: "Director" },
  { href: "/nexus-os/communications", label: "Communications" },
  { href: "/nexus-os/runtime", label: "Runtime" },
  { href: "/nexus-os/autonomy", label: "Autonomy" },
  { href: "/approvals", label: "Approvals" },
  { href: "/connections", label: "Connections" },
  { href: "/social-automation", label: "Growth" },
  { href: "/book-growth", label: "Books" },
];

export default function NexusOsLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-950 text-slate-100">
    <div className="border-b border-cyan-900/50 bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.16),_transparent_34%),linear-gradient(135deg,#020617,#0f172a_56%,#082f49)]">
      <div className="mx-auto max-w-[1600px] px-4 pb-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,.8)]" />
              Nexus // Agentic Operating System
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">AI Mission Control</h1>
              <span className="text-xs font-bold text-slate-400">multi-agent orchestration · runtime · learning · approvals</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/nexus-os/today" className="rounded-xl border border-emerald-400/50 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-400/20">Open Today →</Link>
            <Link href="/nexus-os/autonomy" className="rounded-xl border border-slate-600 bg-slate-900/70 px-4 py-2 text-xs font-black text-slate-200 transition hover:border-slate-400">Autonomy Policy</Link>
          </div>
        </div>
        <nav aria-label="Nexus Agentic OS" className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {LINKS.map((item) => <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-black text-slate-200 transition hover:border-cyan-400 hover:bg-cyan-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">{item.label}</Link>)}
        </nav>
      </div>
    </div>
    <AgentFleetStrip />
    <div className="border-b border-slate-800 bg-slate-950/95 py-3"><NexusAttentionStrip /></div>
    <div className="bg-slate-50 text-slate-950">{children}</div>
  </div>;
}
