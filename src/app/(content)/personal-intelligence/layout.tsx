import Link from "next/link";
import type { ReactNode } from "react";

export default function PersonalIntelligenceLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <div className="border-b border-slate-200 bg-white/95">
      <nav aria-label="Personal Intelligence" className="mx-auto flex max-w-[1280px] gap-2 overflow-x-auto px-4 py-3 sm:px-6">
        <Link href="/personal-intelligence" className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-cyan-300 hover:text-cyan-800">Mentor</Link>
        <Link href="/personal-intelligence/orient" className="whitespace-nowrap rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-800 hover:border-cyan-400">Orient</Link>
        <Link href="/personal-intelligence/learn" className="whitespace-nowrap rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 hover:border-emerald-400">Learn</Link>
        <Link href="/personal-intelligence/think" className="whitespace-nowrap rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 hover:border-amber-400">Think</Link>
        <Link href="/personal-intelligence/reflect" className="whitespace-nowrap rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800 hover:border-violet-400">Reflect</Link>
        <Link href="/personal-intelligence/me" className="whitespace-nowrap rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-800 hover:border-sky-400">Me</Link>
        <Link href="/personal-intelligence/review" className="whitespace-nowrap rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-800 hover:border-indigo-400">Review</Link>
        <Link href="/nexus-os/today" className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500 hover:text-slate-800">Nexus Today</Link>
      </nav>
    </div>
    {children}
  </div>;
}
