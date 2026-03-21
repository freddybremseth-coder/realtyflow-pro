"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Users, Eye, Heart, DollarSign } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const leadData = [
  { month: "Okt", leads: 18, conversions: 3 },
  { month: "Nov", leads: 24, conversions: 5 },
  { month: "Des", leads: 20, conversions: 4 },
  { month: "Jan", leads: 32, conversions: 6 },
  { month: "Feb", leads: 38, conversions: 8 },
  { month: "Mar", leads: 47, conversions: 11 },
];

const platformData = [
  { platform: "Instagram", engagement: 4200, reach: 18500 },
  { platform: "Facebook", engagement: 2800, reach: 12000 },
  { platform: "LinkedIn", engagement: 1500, reach: 8200 },
  { platform: "YouTube", engagement: 3100, reach: 15800 },
  { platform: "TikTok", engagement: 1900, reach: 6500 },
];

const channelROI = [
  { name: "Facebook Ads", value: 35, color: "#3b82f6" },
  { name: "Google Ads", value: 25, color: "#ef4444" },
  { name: "Instagram", value: 20, color: "#ec4899" },
  { name: "Organisk", value: 12, color: "#10b981" },
  { name: "Henvisning", value: 8, color: "#f59e0b" },
];

const realtyMetrics = [
  { label: "Totale Leads", value: "47", change: "+12%", icon: Users },
  { label: "Visninger", value: "23", change: "+5", icon: Eye },
  { label: "Closing Rate", value: "23%", change: "+2%", icon: TrendingUp },
  { label: "Pipeline Verdi", value: "€2.4M", change: "+€180K", icon: DollarSign },
];

const contentMetrics = [
  { label: "Publiserte Innlegg", value: "156", change: "+24", icon: Heart },
  { label: "Total Rekkevidde", value: "45.2K", change: "+18%", icon: Eye },
  { label: "Engasjement", value: "3.2%", change: "+0.4%", icon: Heart },
  { label: "Konverteringer", value: "34", change: "+8", icon: TrendingUp },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <BarChart3 className="text-primary-400" size={28} />
          Analytics
        </h1>
        <p className="text-sm text-slate-400 mt-1">Samlet analytikk for eiendom og innhold</p>
      </div>

      <Tabs defaultValue="realty">
        <TabsList>
          <TabsTrigger value="realty">Eiendom</TabsTrigger>
          <TabsTrigger value="content">Innhold & SoMe</TabsTrigger>
          <TabsTrigger value="cross">Cross-Channel ROI</TabsTrigger>
        </TabsList>

        <TabsContent value="realty">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {realtyMetrics.map((m) => (
              <Card key={m.label}><CardContent className="p-4 flex items-center gap-3">
                <m.icon size={24} className="text-primary-400 opacity-60" />
                <div><p className="text-2xl font-bold text-white">{m.value}</p><p className="text-xs text-slate-400">{m.label}</p><Badge variant="success" className="text-[10px] mt-1">{m.change}</Badge></div>
              </CardContent></Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle>Lead Konvertering - Siste 6 Maneder</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={leadData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }} />
                  <Legend />
                  <Area type="monotone" dataKey="leads" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.15} name="Leads" />
                  <Area type="monotone" dataKey="conversions" stroke="#10b981" fill="#10b981" fillOpacity={0.15} name="Konverteringer" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {contentMetrics.map((m) => (
              <Card key={m.label}><CardContent className="p-4 flex items-center gap-3">
                <m.icon size={24} className="text-purple-400 opacity-60" />
                <div><p className="text-2xl font-bold text-white">{m.value}</p><p className="text-xs text-slate-400">{m.label}</p><Badge variant="default" className="text-[10px] mt-1">{m.change}</Badge></div>
              </CardContent></Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle>Engasjement per Plattform</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={platformData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="platform" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }} />
                  <Legend />
                  <Bar dataKey="engagement" fill="#8b5cf6" name="Engasjement" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="reach" fill="#06b6d4" name="Rekkevidde" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cross">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Lead-kilder (ROI-fordeling)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={channelROI} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}%`} labelLine={false}>
                      {channelROI.map((entry) => (<Cell key={entry.name} fill={entry.color} />))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Kanal-ytelse</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {channelROI.map((ch) => (
                    <div key={ch.name}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-slate-300">{ch.name}</span>
                        <span className="text-white font-medium">{ch.value}%</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${ch.value}%`, backgroundColor: ch.color }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-sm text-emerald-300 font-medium">Beste kanal: Facebook Ads</p>
                  <p className="text-xs text-slate-400 mt-1">35% av alle konverteringer kommer fra Facebook Ads med en gjennomsnittlig CPA pa €45</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
