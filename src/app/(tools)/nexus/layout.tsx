import Link from "next/link";
import type { ReactNode } from "react";

const LINKS = [
  { href: "/os", label: "RealtyFlow OS" },
  { href: "/nexus", label: "Nexus OS" },
  { href: "/automation", label: "Automation" },
  { href: "/agents", label: "AI Agents" },
  { href: "/social-automation", label: "Social Automation" },
  { href: "/book-growth", label: "Book Growth" },
  { href: "/approvals", label: "Approvals" },
];

export default function NexusOsLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-950">
    <div className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2">
        <div className="mr-3">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">RealtyFlow</div>
          <div className="text-sm font-black text-white">Nexus OS</div>
        </div>
        {LINKS.map((item) => <Link key={item.href} href={item.href} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-200">{item.label}</Link>)}
      </div>
    </div>
    {children}
  </div>;
}
