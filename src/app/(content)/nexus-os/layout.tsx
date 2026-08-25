import Link from "next/link";
import type { ReactNode } from "react";

const LINKS = [
  { href: "/nexus-os", label: "Command Center" },
  { href: "/nexus-os/director", label: "Portfolio Director" },
  { href: "/nexus-os/autonomy", label: "24/7 Autonomy" },
  { href: "/nexus-os/account-launch", label: "Account Launch" },
  { href: "/connections", label: "Channel Connections" },
  { href: "/social-automation", label: "Social Growth" },
  { href: "/book-growth", label: "Book Growth" },
  { href: "/approvals", label: "Approvals" },
];

export default function NexusOsLayout({ children }: { children: ReactNode }) {
  return <>
    <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-6">
      <nav aria-label="Nexus OS" className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {LINKS.map((item) => <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800">{item.label}</Link>)}
      </nav>
    </div>
    {children}
  </>;
}
