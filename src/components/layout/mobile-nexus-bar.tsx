"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, CheckSquare, Crosshair, Link2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/nexus-os", label: "Nexus", Icon: Boxes },
  { href: "/nexus-os/focus", label: "Fokus", Icon: Crosshair },
  { href: "/nexus-os/director", label: "Director", Icon: Sparkles },
  { href: "/connections", label: "Koble", Icon: Link2 },
  { href: "/approvals", label: "Kontroll", Icon: CheckSquare },
] as const;

function isActive(pathname:string, href:string){
  if(href === "/nexus-os") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNexusBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-600 bg-slate-950 px-1 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-1.5 shadow-[0_-8px_30px_rgba(15,23,42,0.35)] lg:hidden" aria-label="Nexus mobilnavigasjon">
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname,href);
          return (
            <Link key={href} href={href} className={cn("flex min-w-0 flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[10px] font-bold transition", active ? "border-cyan-400/60 bg-cyan-400/20 text-cyan-100" : "border-transparent text-slate-200 hover:bg-slate-800 hover:text-white")}>
              <Icon size={17} className={active ? "text-cyan-200" : "text-slate-300"} />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
