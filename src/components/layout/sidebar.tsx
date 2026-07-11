"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { SIDEBAR_NAV } from "@/lib/constants";
import { canSeeNavHref, type AccessRole } from "@/lib/access-control";
import {
  LayoutDashboard, GitBranch, Building2, Calculator, Users, Map, MapPin,
  Target, Sparkles, Youtube, Music, Image, FileText,
  Palette, Globe, TrendingUp, Briefcase, PieChart, Rocket,
  Bot, Mail, Zap, Calendar, BarChart3, ScanLine, CheckSquare, Settings,
  ChevronLeft, ChevronRight, KeyRound, LogOut, Menu, X, BookOpen,
  Database, HeartHandshake, Banknote, RefreshCw, Gauge, Flag, Megaphone, ShieldCheck,
  MessageSquareText, CalendarCheck2, FolderLock, FileSpreadsheet, UserCog, Activity, UsersRound,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard, GitBranch, Building2, Calculator, Users, Map, MapPin,
  Target, Sparkles, Youtube, Music, Image, FileText,
  Palette, Globe, TrendingUp, Briefcase, PieChart, Rocket,
  Bot, Mail, Zap, Calendar, BarChart3, ScanLine, CheckSquare, Settings,
  BookOpen, Database, HeartHandshake, Banknote, KeyRound, RefreshCw, Gauge, Flag, Megaphone, ShieldCheck,
  MessageSquareText, CalendarCheck2, FolderLock, FileSpreadsheet, UserCog, Activity, UsersRound,
};

const sectionLabels: Record<string, string> = {
  overview: "OVERSIKT",
  saas: "SAAS & DEMO",
  operations: "DRIFT",
  properties: "EIENDOM",
  content: "MARKEDSFØRING",
  growth: "VEKST",
  automation: "AUTOMASJON",
  admin: "ADMIN",
};

type CurrentUser = { email: string; role: AccessRole; roleLabel: string; permissions: string[] };
type NavItem = { label: string; href: string; icon: string };

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) { router.push("/login"); return null; }
        return response.json();
      })
      .then((body) => { if (active && body?.user) setUser(body.user); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [router]);

  const visibleSections = useMemo(() => {
    if (!user) return [] as Array<[string, NavItem[]]>;
    return (Object.entries(SIDEBAR_NAV) as Array<[string, readonly NavItem[]]>)
      .map(([section, items]) => [section, items.filter((item) => canSeeNavHref(user.role, item.href))] as [string, NavItem[]])
      .filter(([, items]) => items.length > 0);
  }, [user]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const displayName = user?.email.split("@")[0] || "Bruker";
  const initials = displayName.split(/[._-]/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "RF";

  const navContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700/50">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center font-bold text-white text-sm">RF</div>
        {!collapsed && (
          <div className="animate-fade-in">
            <h1 className="text-base font-bold text-white">RealtyFlow Pro</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Freddy Revenue OS</p>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="ml-auto hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors">
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {!user && <div className="px-3 py-4 text-xs text-slate-600">Laster tilgang…</div>}
        {visibleSections.map(([section, items]) => (
          <div key={section}>
            {!collapsed && <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{sectionLabels[section]}</p>}
            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = iconMap[item.icon];
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                    isActive ? "bg-primary-500/15 text-primary-300 font-medium" : "text-slate-400 hover:text-slate-100 hover:bg-slate-700/40",
                  )} title={collapsed ? item.label : undefined}>
                    {Icon && <Icon size={18} className={cn(isActive ? "text-primary-400" : "text-slate-500")} />}
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-700/50 px-4 py-3">
        {!collapsed && user && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary-500/20 flex items-center justify-center"><span className="text-xs font-medium text-primary-400">{initials}</span></div>
            <div className="min-w-0 text-xs"><p className="truncate text-slate-300 font-medium">{user.email}</p><p className="text-slate-500">{user.roleLabel}</p></div>
            <button onClick={() => router.push("/account/password")} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200" title="Endre passord"><KeyRound size={14} /></button>
            <button onClick={logout} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200" title="Logg ut"><LogOut size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setMobileOpen(!mobileOpen)} className="fixed top-4 left-4 z-50 lg:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">{mobileOpen ? <X size={18} /> : <Menu size={18} />}</button>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={cn(
        "fixed top-0 left-0 z-40 h-screen bg-slate-900 border-r border-slate-700/50 transition-all duration-300",
        collapsed ? "w-16" : "w-60",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      )}>{navContent}</aside>
    </>
  );
}
