"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Users, TrendingUp, FileText,
  Eye, Zap, BarChart3, Bot,
} from "lucide-react";

const realtyStats = [
  { label: "Aktive Leads", value: "47", change: "+12%", icon: Users, color: "text-primary-400" },
  { label: "Eiendommer", value: "124", change: "+3", icon: Building2, color: "text-emerald-400" },
  { label: "Pipeline Verdi", value: "€2.4M", change: "+8%", icon: TrendingUp, color: "text-amber-400" },
  { label: "Closing Rate", value: "23%", change: "+2%", icon: BarChart3, color: "text-blue-400" },
];

const contentStats = [
  { label: "Publiserte Innlegg", value: "156", change: "+24", icon: FileText, color: "text-purple-400" },
  { label: "Total Rekkevidde", value: "45.2K", change: "+18%", icon: Eye, color: "text-pink-400" },
  { label: "Viralitetsscore", value: "8.4", change: "+0.6", icon: Zap, color: "text-amber-400" },
  { label: "AI Agenter Aktive", value: "6", change: "Online", icon: Bot, color: "text-emerald-400" },
];

const recentActivity = [
  { type: "lead", text: "Ny lead: Erik Hansen - Villa i Altea", time: "12m siden" },
  { type: "content", text: "AI genererte 3 innlegg for Soleada.no", time: "28m siden" },
  { type: "youtube", text: "Neural Beat: 'Midnight Pulse' lastet opp", time: "1t siden" },
  { type: "lead", text: "Lead oppgradert: Maria S. → VIEWING", time: "2t siden" },
  { type: "content", text: "Instagram-post publisert for Dona Anna", time: "3t siden" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          Oversikt over eiendom, innhold og forretning
        </p>
      </div>

      {/* Realty KPIs */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Eiendom
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {realtyStats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">{stat.label}</p>
                    <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                    <Badge variant="success" className="mt-2 text-[10px]">
                      {stat.change}
                    </Badge>
                  </div>
                  <stat.icon className={`${stat.color} opacity-60`} size={28} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Content & Marketing KPIs */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Innhold & Marketing
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {contentStats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">{stat.label}</p>
                    <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                    <Badge variant="default" className="mt-2 text-[10px]">
                      {stat.change}
                    </Badge>
                  </div>
                  <stat.icon className={`${stat.color} opacity-60`} size={28} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Siste Aktivitet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.map((item, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 ${
                      item.type === "lead"
                        ? "bg-primary-400"
                        : item.type === "content"
                        ? "bg-purple-400"
                        : "bg-pink-400"
                    }`}
                  />
                  <div className="flex-1">
                    <p className="text-slate-200">{item.text}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hurtighandlinger</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Ny Lead", href: "/pipeline", icon: Users, color: "bg-primary-500/20 text-primary-300" },
                { label: "Generer Innhold", href: "/content-studio", icon: Zap, color: "bg-purple-500/20 text-purple-300" },
                { label: "Se Eiendommer", href: "/inventory", icon: Building2, color: "bg-emerald-500/20 text-emerald-300" },
                { label: "AI Agenter", href: "/agents", icon: Bot, color: "bg-amber-500/20 text-amber-300" },
              ].map((action) => (
                <a
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/30 hover:border-slate-600 transition-colors"
                >
                  <div className={`w-9 h-9 rounded-lg ${action.color} flex items-center justify-center`}>
                    <action.icon size={16} />
                  </div>
                  <span className="text-sm text-slate-200">{action.label}</span>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
