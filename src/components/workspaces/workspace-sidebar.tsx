"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, BookOpen, BriefcaseBusiness, Building2, ChevronDown,
  Clapperboard, FileText, Home, Mail, Megaphone, Menu, Search,
  Settings2, Users, Video, X,
} from "lucide-react";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";

type Brand = { brandKey: string; name: string };
type Item = {
  label: string;
  href: string;
  icon: typeof Home;
  permissions?: WorkspacePermission[];
};
type Group = { title: string; items: Item[] };

export function WorkspaceSidebar({ brandKey }: { brandKey: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [permissions, setPermissions] = useState<WorkspacePermission[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const root = `/workspace/${encodeURIComponent(brandKey)}`;
  const isZen = brandKey === "zeneco";

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/capabilities`, { cache: "no-store", signal: controller.signal }),
      fetch("/api/workspaces/available", { cache: "no-store", signal: controller.signal }),
    ]).then(async ([capabilities, available]) => {
      if (!capabilities.ok) throw new Error("Sidetilgang mangler");
      const cap = await capabilities.json();
      const list = available.ok ? await available.json() : null;
      if (controller.signal.aborted) return;
      setPermissions(Array.isArray(cap.permissions) ? cap.permissions : []);
      setBrands(Array.isArray(list?.workspaces)
        ? list.workspaces.filter((item: Brand) => item.brandKey === "zeneco" || item.brandKey === "pinosoecolife")
        : []);
    }).catch(() => {
      if (!controller.signal.aborted) setPermissions([]);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [brandKey]);

  useEffect(() => { setMobileOpen(false); }, [pathname, searchParams]);

  const groups: Group[] = useMemo(() => [
    {
      title: "Arbeidsområde",
      items: [
        { label: "I dag", href: `${root}?tab=today`, icon: Home },
        { label: "Leads og kunder", href: `${root}?tab=leads`, icon: Users,
          permissions: ["crm.read", "crm.joint.read"] },
        { label: "Eiendommer", href: `${root}?tab=properties`, icon: Building2,
          permissions: ["properties.catalog.read"] },
        { label: "Bedrifter / Corporate", href: `${root}?tab=growth&area=corporate&focus=corporate`, icon: BriefcaseBusiness,
          permissions: ["corporate.read"] },
      ],
    },
    {
      title: "Markedsføring og innhold",
      items: [
        { label: "SoMe Studio", href: `${root}?tab=growth&focus=social`, icon: Megaphone,
          permissions: ["marketing.read"] },
        { label: "Content Hub", href: `${root}/content-hub`, icon: FileText,
          permissions: ["marketing.read"] },
        { label: "Nettsideinnhold", href: `${root}?tab=growth&area=content&focus=content`, icon: BookOpen,
          permissions: ["content.read"] },
        { label: "E-post og nyhetsbrev", href: `${root}?tab=growth&area=email&focus=email`, icon: Mail,
          permissions: ["email.read"] },
        { label: "Reels Studio", href: `${root}?tab=growth&focus=reels`, icon: Clapperboard,
          permissions: ["reels.read"] },
        { label: "YouTube Studio", href: `${root}?tab=growth&focus=youtube`, icon: Video,
          permissions: ["youtube.read"] },
        { label: "SEO og synlighet", href: `${root}?tab=growth&area=visibility&focus=visibility`, icon: Search,
          permissions: ["visibility.read"] },
        { label: "Annonser", href: `${root}?tab=growth&area=ads&focus=ads`, icon: BarChart3,
          permissions: ["ads.read"] },
        { label: "Publisering", href: `${root}?tab=growth&focus=publish`, icon: Megaphone,
          permissions: ["marketing.publish"] },
      ],
    },
    {
      title: "Hjelp",
      items: [
        { label: "Nexus-innsikt", href: `${root}?tab=growth&focus=nexus`, icon: Settings2,
          permissions: ["nexus.read"] },
        { label: "Opplæring", href: `${root}?tab=today&training=1`, icon: BookOpen },
      ],
    },
  ], [root]);

  const displayedGroups = groups
    .map(group => ({ ...group, items: group.items.filter(item =>
      (!item.permissions || item.permissions.some(permission => permissions.includes(permission))) &&
      (isZen || !["Bedrifter / Corporate", "YouTube Studio"].includes(item.label)),
    ) })).filter(group => group.items.length > 0);

  const currentUrl = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
  const activeItem = (item: Item) => {
    if (item.href === pathname) return true;
    if (pathname !== root) return false;
    const link = new URL(item.href, "https://realtyflow.local");
    const current = new URL(currentUrl, "https://realtyflow.local");
    return link.searchParams.get("tab") === (current.searchParams.get("tab") || "today") &&
      link.searchParams.get("focus") === current.searchParams.get("focus") &&
      link.searchParams.get("area") === current.searchParams.get("area") &&
      link.searchParams.get("training") === current.searchParams.get("training");
  };

  return <>
    <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3 lg:hidden">
      <span className="font-semibold">RealtyFlow · {isZen ? "Zen Eco Homes" : "PinosoEcolife"}</span>
      <button type="button" aria-label={mobileOpen ? "Lukk meny" : "Åpne meny"}
        aria-expanded={mobileOpen} onClick={() => setMobileOpen(value => !value)}
        className="rounded-lg border border-slate-700 p-2">{mobileOpen ? <X size={20}/> : <Menu size={20}/>}</button>
    </div>
    {mobileOpen && <button className="fixed inset-0 z-40 bg-black/60 lg:hidden" type="button"
      aria-label="Lukk navigasjon" onClick={() => setMobileOpen(false)}/>}
    <aside aria-label="Arbeidsområdets navigasjon"
      className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-950 px-3 pb-7 pt-4 transition-transform lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="mb-5 flex items-center justify-between gap-2 px-2">
        <div><div className="text-sm font-bold tracking-wide text-white">RealtyFlow</div>
          <div className="text-xs text-slate-400">Ditt arbeidsområde</div></div>
        <button type="button" className="p-2 lg:hidden" aria-label="Lukk meny"
          onClick={() => setMobileOpen(false)}><X size={18}/></button>
      </div>
      <div className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-2">
        <button type="button" onClick={() => setBrandPickerOpen(value => !value)}
          aria-expanded={brandPickerOpen}
          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm font-semibold hover:bg-slate-800">
          <span>{isZen ? "Zen Eco Homes" : "PinosoEcolife"}</span><ChevronDown size={16}/>
        </button>
        {brandPickerOpen && <div className="mt-1 space-y-1 border-t border-slate-800 pt-2">
          {brands.map(brand => <Link key={brand.brandKey}
            className="block rounded-md px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
            href={`/workspace/${encodeURIComponent(brand.brandKey)}`}>
              {brand.name}
            </Link>)}
          <Link href="/workspace" className="block rounded-md px-3 py-2 text-xs text-cyan-300 hover:bg-slate-800">
            {brands.length ? "Alle arbeidsområder" : "Bytt arbeidsområde"}
          </Link>
        </div>}
      </div>
      {loading ? <p role="status" className="px-3 text-sm text-slate-400">Henter tilganger…</p> :
        displayedGroups.map(group => <nav key={group.title} aria-label={group.title} className="mb-5">
          <h2 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.title}</h2>
          <div className="space-y-1">
            {group.items.map(item => {
              const Icon = item.icon;
              const active = activeItem(item);
              return <Link key={item.href} href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
                className={`flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active
                  ? "bg-cyan-950 text-cyan-100 ring-1 ring-cyan-700"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
                <Icon size={17} aria-hidden="true"/><span>{item.label}</span>
              </Link>;
            })}
          </div>
        </nav>)}
      <p className="px-3 text-xs leading-relaxed text-slate-500">Menyen viser bare verktøyene din brukerrolle har tilgang til. Soleada-kunder er ikke en del av dette arbeidsområdet.</p>
    </aside>
  </>;
}
