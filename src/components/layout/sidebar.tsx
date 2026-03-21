"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SIDEBAR_NAV } from "@/lib/constants";
import {
  LayoutDashboard, GitBranch, Building2, Calculator, Users, Map,
  Sparkles, Youtube, Music, Image, FileText,
  Palette, TrendingUp, Briefcase, PieChart,
  Bot, Mail, Zap, Calendar, BarChart3, ScanLine, CheckSquare, Settings,
  ChevronLeft, ChevronRight, Menu, X,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard, GitBranch, Building2, Calculator, Users, Map,
  Sparkles, Youtube, Music, Image, FileText,
  Palette, TrendingUp, Briefcase, PieChart,
  Bot, Mail, Zap, Calendar, BarChart3, ScanLine, CheckSquare, Settings,
};

const sectionLabels: Record<string, string> = {
  overview: "OVERSIKT",
  realty: "EIENDOM",
  content: "INNHOLD & MARKETING",
  business: "FORRETNING",
  tools: "VERKTØY",
};

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700/50">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center font-bold text-white text-sm">
          RF
        </div>
        {!collapsed && (
          <div className="animate-fade-in">
            <h1 className="text-base font-bold text-white">RealtyFlow Pro</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Super App</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {Object.entries(SIDEBAR_NAV).map(([section, items]) => (
          <div key={section}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {sectionLabels[section]}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = iconMap[item.icon];
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                      isActive
                        ? "bg-primary-500/15 text-primary-300 font-medium"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-700/40"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    {Icon && (
                      <Icon
                        size={18}
                        className={cn(
                          isActive ? "text-primary-400" : "text-slate-500"
                        )}
                      />
                    )}
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700/50 px-4 py-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary-500/20 flex items-center justify-center">
              <span className="text-xs font-medium text-primary-400">FB</span>
            </div>
            <div className="text-xs">
              <p className="text-slate-300 font-medium">Freddy Bremseth</p>
              <p className="text-slate-500">Admin</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-slate-300"
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen bg-slate-900 border-r border-slate-700/50 transition-all duration-300",
          collapsed ? "w-16" : "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {navContent}
      </aside>
    </>
  );
}
