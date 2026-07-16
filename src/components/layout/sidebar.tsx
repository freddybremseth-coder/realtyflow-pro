"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AccessRole } from "@/lib/access-control";
import {
  activeNavigationSection,
  buildVisibleNavigation,
  filterNavigationSections,
  isNavigationPathActive,
  normalizeNavigationFavorites,
  quickNavigationItems,
  toggleNavigationFavorite,
  type NavigationItem,
  type NavigationSectionId,
} from "@/lib/navigation";
import {
  Activity,
  Banknote,
  BarChart3,
  BellRing,
  BookOpen,
  Bot,
  Boxes,
  Briefcase,
  Clapperboard,
  ClipboardList,
  Building2,
  Calculator,
  Calendar,
  CalendarCheck2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Database,
  Feather,
  FileSpreadsheet,
  FileText,
  Flag,
  FolderLock,
  Gauge,
  GitBranch,
  Globe,
  Handshake,
  HeartHandshake,
  Image,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Send,
  Map,
  MapPin,
  Megaphone,
  Menu,
  MessageSquareText,
  Music,
  Palette,
  PanelsTopLeft,
  PieChart,
  RefreshCw,
  Rocket,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  UserCog,
  Users,
  UsersRound,
  Wrench,
  X,
  Youtube,
  Zap,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  Activity,
  Banknote,
  BarChart3,
  BellRing,
  BookOpen,
  Bot,
  Boxes,
  Briefcase,
  Clapperboard,
  ClipboardList,
  Building2,
  Calculator,
  Calendar,
  CalendarCheck2,
  CheckSquare,
  ClipboardCheck,
  Database,
  Feather,
  FileSpreadsheet,
  FileText,
  Flag,
  FolderLock,
  Gauge,
  GitBranch,
  Globe,
  Handshake,
  HeartHandshake,
  Image,
  KeyRound,
  LayoutDashboard,
  Mail,
  Send,
  Map,
  MapPin,
  Megaphone,
  MessageSquareText,
  Music,
  Palette,
  PanelsTopLeft,
  PieChart,
  RefreshCw,
  Rocket,
  ScanLine,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserCog,
  Users,
  UsersRound,
  Wrench,
  Youtube,
  Zap,
};

const NAV_PREFERENCES_VERSION = 1;

type CurrentUser = {
  email: string;
  role: AccessRole;
  roleLabel: string;
  permissions: string[];
};

type NavigationPreferences = {
  version: number;
  favorites: string[];
  collapsed: boolean;
};

function preferenceKey(email: string) {
  return `realtyflow:navigation:${email.toLowerCase()}`;
}

function readPreferences(email: string): Partial<NavigationPreferences> {
  try {
    const raw = window.localStorage.getItem(preferenceKey(email));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<NavigationPreferences>;
    return parsed.version === NAV_PREFERENCES_VERSION ? parsed : {};
  } catch {
    return {};
  }
}

function NavigationLink({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavigationItem;
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = iconMap[item.icon];
  const active = isNavigationPathActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        collapsed && "lg:justify-center lg:px-2",
        active
          ? "bg-primary-500/15 font-medium text-primary-300"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-100",
      )}
      title={collapsed ? item.label : undefined}
    >
      {Icon && <Icon size={17} className={cn("shrink-0", active ? "text-primary-400" : "text-slate-500")} />}
      <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [query, setQuery] = useState("");
  const [openSection, setOpenSection] = useState<NavigationSectionId | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.push("/login");
          return null;
        }
        return response.json();
      })
      .then((body) => {
        if (active && body?.user) setUser(body.user);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [router]);

  const visibleSections = useMemo(
    () => (user ? buildVisibleNavigation(user.role, user.permissions) : []),
    [user],
  );
  const availableHrefs = useMemo(
    () => visibleSections.flatMap((section) => section.items.map((item) => item.href)),
    [visibleSections],
  );
  const availableKey = availableHrefs.join("|");

  useEffect(() => {
    if (!user) return;
    const preferences = readPreferences(user.email);
    setFavorites(normalizeNavigationFavorites(preferences.favorites, availableHrefs));
    setCollapsed(Boolean(preferences.collapsed));
    setPreferencesLoaded(true);
  }, [user, availableKey]);

  useEffect(() => {
    if (!user || !preferencesLoaded) return;
    const preferences: NavigationPreferences = {
      version: NAV_PREFERENCES_VERSION,
      favorites: normalizeNavigationFavorites(favorites, availableHrefs),
      collapsed,
    };
    window.localStorage.setItem(preferenceKey(user.email), JSON.stringify(preferences));
  }, [user, preferencesLoaded, favorites, collapsed, availableKey]);

  useEffect(() => {
    document.documentElement.dataset.realtyflowSidebar = collapsed ? "collapsed" : "expanded";
    return () => {
      delete document.documentElement.dataset.realtyflowSidebar;
    };
  }, [collapsed]);

  const activeSection = useMemo(
    () => activeNavigationSection(pathname, visibleSections),
    [pathname, visibleSections],
  );

  useEffect(() => {
    if (activeSection) setOpenSection(activeSection);
  }, [activeSection]);

  const quickItems = useMemo(
    () => (user ? quickNavigationItems(user.role, visibleSections, favorites) : []),
    [user, visibleSections, favorites],
  );
  const filteredSections = useMemo(
    () => filterNavigationSections(visibleSections, query),
    [visibleSections, query],
  );
  const searching = Boolean(query.trim());

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const toggleFavorite = (href: string) => {
    setFavorites((current) => toggleNavigationFavorite(current, href, availableHrefs));
  };

  const toggleSection = (sectionId: NavigationSectionId) => {
    if (collapsed) {
      setCollapsed(false);
      setOpenSection(sectionId);
      return;
    }
    setOpenSection((current) => (current === sectionId ? null : sectionId));
  };

  const closeMobile = () => setMobileOpen(false);
  const displayName = user?.email.split("@")[0] || "Bruker";
  const initials = displayName
    .split(/[._-]/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "RF";

  const navContent = (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-3 border-b border-slate-700/50 px-4 py-4", collapsed && "lg:px-2")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 text-sm font-bold text-white">RF</div>
        <div className={cn("min-w-0 animate-fade-in", collapsed && "lg:hidden")}>
          <h1 className="truncate text-base font-bold text-white">RealtyFlow Pro</h1>
          <p className="truncate text-[10px] uppercase tracking-wider text-slate-500">Freddy Revenue OS</p>
        </div>
        <button
          onClick={() => setCollapsed((value) => !value)}
          className={cn(
            "ml-auto hidden h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-white lg:flex",
            collapsed && "lg:mx-auto",
          )}
          title={collapsed ? "Utvid meny" : "Komprimer meny"}
          aria-label={collapsed ? "Utvid meny" : "Komprimer meny"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <div className={cn("px-3 pb-2 pt-3", collapsed && "lg:hidden")}>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Søk i menyen…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950/70 py-2 pl-9 pr-8 text-sm text-slate-200 outline-none transition focus:border-primary-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-200"
              aria-label="Tøm menysøk"
            >
              <X size={13} />
            </button>
          )}
        </label>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {!user && <div className="px-3 py-4 text-xs text-slate-600">Laster tilgang…</div>}

        {!searching && quickItems.length > 0 && (
          <section className="pb-3">
            <div className={cn("flex items-center justify-between px-3 pb-1 pt-1", collapsed && "lg:hidden")}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Hurtigtilgang</p>
              {favorites.length > 0 && <span className="text-[10px] text-amber-500">★ {favorites.length}</span>}
            </div>
            <div className="space-y-0.5">
              {quickItems.map((item) => (
                <NavigationLink
                  key={`quick:${item.href}`}
                  item={item}
                  pathname={pathname}
                  collapsed={collapsed}
                  onNavigate={closeMobile}
                />
              ))}
            </div>
          </section>
        )}

        <div className={cn("border-t border-slate-800 pt-3", searching && "border-t-0 pt-0")}>
          <p className={cn("px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500", collapsed && "lg:hidden")}>
            {searching ? "Søkeresultater" : "Alle arbeidsområder"}
          </p>

          {filteredSections.length === 0 && searching && (
            <div className="mx-1 rounded-lg border border-slate-800 p-4 text-center text-xs text-slate-500">Ingen menyvalg matcher «{query}».</div>
          )}

          <div className="space-y-1">
            {filteredSections.map((section) => {
              const SectionIcon = iconMap[section.icon];
              const expanded = searching || openSection === section.id;
              const containsActive = section.items.some((item) => isNavigationPathActive(pathname, item.href));
              return (
                <section key={section.id}>
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      collapsed && "lg:justify-center lg:px-2",
                      containsActive ? "text-primary-300" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100",
                    )}
                    title={collapsed ? section.label : undefined}
                    aria-expanded={expanded}
                  >
                    {SectionIcon && <SectionIcon size={17} className={cn("shrink-0", containsActive ? "text-primary-400" : "text-slate-500")} />}
                    <span className={cn("min-w-0 flex-1 truncate font-medium", collapsed && "lg:hidden")}>{section.label}</span>
                    <span className={cn("text-[10px] text-slate-600", collapsed && "lg:hidden")}>{section.items.length}</span>
                    <ChevronDown size={14} className={cn("text-slate-600 transition-transform", expanded && "rotate-180", collapsed && "lg:hidden")} />
                  </button>

                  {expanded && (
                    <div className={cn("ml-3 mt-1 space-y-0.5 border-l border-slate-800 pl-2", collapsed && "lg:hidden")}>
                      {section.items.map((item) => {
                        const Icon = iconMap[item.icon];
                        const active = isNavigationPathActive(pathname, item.href);
                        const favorite = favorites.includes(item.href);
                        return (
                          <div
                            key={item.href}
                            className={cn(
                              "group flex items-center rounded-lg transition-colors",
                              active ? "bg-primary-500/15" : "hover:bg-slate-800",
                            )}
                          >
                            <Link
                              href={item.href}
                              onClick={closeMobile}
                              className={cn(
                                "flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm",
                                active ? "font-medium text-primary-300" : "text-slate-400 group-hover:text-slate-100",
                              )}
                            >
                              {Icon && <Icon size={16} className={cn("shrink-0", active ? "text-primary-400" : "text-slate-600")} />}
                              <span className="truncate">{item.label}</span>
                            </Link>
                            <button
                              type="button"
                              onClick={() => toggleFavorite(item.href)}
                              className={cn(
                                "mr-1 rounded p-1.5 transition",
                                favorite
                                  ? "text-amber-400"
                                  : "text-slate-700 opacity-0 hover:text-amber-300 group-hover:opacity-100 focus:opacity-100",
                              )}
                              title={favorite ? "Fjern fra hurtigtilgang" : "Legg til i hurtigtilgang"}
                              aria-label={favorite ? `Fjern ${item.label} fra hurtigtilgang` : `Legg ${item.label} til i hurtigtilgang`}
                            >
                              <Star size={13} fill={favorite ? "currentColor" : "none"} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </nav>

      <div className={cn("border-t border-slate-700/50 px-3 py-3", collapsed && "lg:px-2")}>
        {user && (
          <div className={cn("flex items-center gap-2", collapsed && "lg:flex-col")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500/20">
              <span className="text-xs font-medium text-primary-400">{initials}</span>
            </div>
            <div className={cn("min-w-0 flex-1 text-xs", collapsed && "lg:hidden")}>
              <p className="truncate font-medium text-slate-300">{user.email}</p>
              <p className="text-slate-500">{user.roleLabel}</p>
            </div>
            <button
              onClick={() => router.push("/account/password")}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200"
              title="Endre passord"
              aria-label="Endre passord"
            >
              <KeyRound size={14} />
            </button>
            <button
              onClick={logout}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200"
              title="Logg ut"
              aria-label="Logg ut"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen((value) => !value)}
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 lg:hidden"
        aria-label={mobileOpen ? "Lukk meny" : "Åpne meny"}
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={closeMobile} />}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen w-72 border-r border-slate-700/50 bg-slate-900 transition-all duration-300 lg:translate-x-0",
          collapsed ? "lg:w-16" : "lg:w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {navContent}
      </aside>
    </>
  );
}
