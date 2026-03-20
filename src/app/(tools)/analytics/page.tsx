"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Users, Eye, Heart, DollarSign } from "lucide-react";

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
              <Card key={m.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <m.icon size={24} className="text-primary-400 opacity-60" />
                  <div>
                    <p className="text-2xl font-bold text-white">{m.value}</p>
                    <p className="text-xs text-slate-400">{m.label}</p>
                    <Badge variant="success" className="text-[10px] mt-1">{m.change}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle>Lead Konvertering over tid</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
                Recharts-graf kobles til Supabase-data
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {contentMetrics.map((m) => (
              <Card key={m.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <m.icon size={24} className="text-purple-400 opacity-60" />
                  <div>
                    <p className="text-2xl font-bold text-white">{m.value}</p>
                    <p className="text-xs text-slate-400">{m.label}</p>
                    <Badge variant="default" className="text-[10px] mt-1">{m.change}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle>Engasjement per plattform</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
                Recharts-graf kobles til Supabase-data
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cross">
          <Card>
            <CardHeader><CardTitle>Cross-Channel ROI</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
                ROI-analyse: kobling mellom SoMe-kampanjer og eiendomssalg
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
