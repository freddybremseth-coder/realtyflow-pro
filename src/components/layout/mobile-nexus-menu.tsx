"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search, X, Sparkles, MessageSquareText, Gauge, Link2, CheckSquare, Target } from "lucide-react";
import { buildVisibleNavigation } from "@/lib/navigation";
import type { AccessRole } from "@/lib/access-control";

const CORE = [
  { href: "/nexus-os", label: "Nexus", Icon: Sparkles },
  { href: "/nexus-os/focus", label: "Mitt fokus", Icon: Target },
  { href: "/nexus-os/communications", label: "Communications", Icon: MessageSquareText },
  { href: "/nexus-os/runtime", label: "Runtime", Icon: Gauge },
  { href: "/connections", label: "Koble kanaler", Icon: Link2 },
  { href: "/approvals", label: "Kontroll", Icon: CheckSquare },
] as const;

type CurrentUser = { email:string; role:AccessRole; permissions:string[] };

export function MobileNexusMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const [open,setOpen] = useState(false);
  const [query,setQuery] = useState("");
  const [user,setUser] = useState<CurrentUser|null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me",{cache:"no-store"})
      .then(async r => {
        if(r.status===401){ router.replace("/login"); return null; }
        return r.ok ? r.json() : null;
      })
      .then(b => { if(alive && b?.user) setUser(b.user as CurrentUser); })
      .catch(()=>{});
    return () => { alive=false; };
  },[router]);

  useEffect(()=>{ setOpen(false); setQuery(""); },[pathname]);

  const sections = useMemo(() => user ? buildVisibleNavigation(user.role,user.permissions) : [],[user]);
  const filtered = useMemo(() => {
    const q=query.trim().toLowerCase();
    return sections.map(section => ({
      ...section,
      items: section.items
        .filter(item => !(user?.role === "OWNER" && item.href === "/"))
        .filter(item => !q || `${item.label} ${item.href}`.toLowerCase().includes(q)),
    })).filter(section => section.items.length>0);
  },[sections,query,user?.role]);

  return <>
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-slate-700 bg-slate-950 px-3 shadow-lg lg:hidden">
      <Link href="/nexus-os" className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-300 text-sm font-black text-slate-950">N</div>
        <div className="leading-tight"><div className="text-sm font-black text-white">Nexus OS</div><div className="text-[9px] font-bold uppercase tracking-[.18em] text-cyan-200">RealtyFlow Director</div></div>
      </Link>
      <button onClick={()=>setOpen(true)} aria-label="Åpne Nexus-meny" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-600 bg-slate-900 text-white"><Menu size={19}/></button>
    </header>

    {!open ? null : <div className="fixed inset-0 z-[80] bg-slate-950 text-white lg:hidden">
      <div className="flex h-14 items-center justify-between border-b border-slate-700 px-4">
        <div><div className="text-sm font-black text-white">Nexus OS</div><div className="text-[10px] font-medium text-slate-300">Hele RealtyFlow fra én meny</div></div>
        <button onClick={()=>setOpen(false)} aria-label="Lukk meny" className="rounded-xl border border-slate-600 bg-slate-900 p-2 text-white"><X size={18}/></button>
      </div>
      <div className="h-[calc(100dvh-3.5rem)] overflow-y-auto pb-24">
        <div className="border-b border-slate-700 p-4">
          <div className="grid grid-cols-2 gap-2">
            {CORE.map(({href,label,Icon}) => {
              const active = pathname===href || (href!=="/nexus-os" && pathname.startsWith(`${href}/`));
              return <Link key={href} href={href} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold ${active?"border-cyan-300 bg-cyan-300/15 text-cyan-100":"border-slate-700 bg-slate-900 text-slate-100"}`}><Icon size={16}/>{label}</Link>;
            })}
          </div>
        </div>

        <div className="sticky top-0 z-10 bg-slate-950 p-4">
          <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Søk i RealtyFlow …" className="w-full rounded-xl border border-slate-600 bg-slate-900 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-slate-400 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"/></label>
        </div>

        <div className="space-y-5 px-4 pb-8">
          {filtered.map(section => <section key={section.id}>
            <div className="mb-2 text-[10px] font-black uppercase tracking-[.18em] text-slate-300">{section.label}</div>
            <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
              {section.items.map((item,index) => {
                const active = pathname===item.href || (item.href!=="/" && pathname.startsWith(`${item.href}/`));
                return <Link key={item.href} href={item.href} className={`block px-4 py-3 text-sm font-medium ${index?"border-t border-slate-700":""} ${active?"bg-cyan-300/15 font-bold text-cyan-100":"text-slate-100 hover:bg-slate-800"}`}>{item.label}</Link>;
              })}
            </div>
          </section>)}
        </div>
      </div>
    </div>}
  </>;
}
