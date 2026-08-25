"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, CheckSquare, Link2, Megaphone, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/nexus-os", label: "Nexus", Icon: Boxes },
  { href: "/nexus-os/director", label: "Director", Icon: Sparkles },
  { href: "/connections", label: "Koble", Icon: Link2 },
  { href: "/social-automation", label: "Growth", Icon: Megaphone },
  { href: "/approvals", label: "Kontroll", Icon: CheckSquare },
] as const;

export function MobileNexusBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-700/80 bg-slate-950/95 px-1 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-1.5 backdrop-blur lg:hidden" aria-label="Nexus mobilnavigasjon">
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} className={cn("flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold", active ? "bg-cyan-500/15 text-cyan-300" : "text-slate-400")}>
              <Icon size={17} className={active ? "text-cyan-300" : "text-slate-500"} />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
