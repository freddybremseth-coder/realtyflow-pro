"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BRANDS } from "@/lib/constants";
import { TrendingUp, Zap, Wand2, BarChart3, RefreshCw, Copy } from "lucide-react";

export default function GrowthHubPage() {
  const [selectedBrand, setSelectedBrand] = useState(BRANDS[0].id);
  const [generating, setGenerating] = useState(false);
  const [campaign, setCampaign] = useState<{ headline: string; body: string; score: number } | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 2000));
    setCampaign({
      headline: "Drømmer du om en villa ved havet? Vi gjør det mulig.",
      body: "Med over 100 utvalgte eiendommer langs Costa Blanca, finner vi ditt perfekte hjem i solen. Kontakt oss i dag for en uforpliktende samtale.",
      score: 8.7,
    });
    setGenerating(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <TrendingUp className="text-amber-400" size={28} />
          Growth Hub
        </h1>
        <p className="text-sm text-slate-400 mt-1">Kampanjegenerering, automasjon og vekstanalyse</p>
      </div>

      {/* Brand Selection */}
      <div className="flex gap-2 flex-wrap">
        {BRANDS.map((brand) => (
          <Button
            key={brand.id}
            size="sm"
            variant={selectedBrand === brand.id ? "default" : "outline"}
            onClick={() => setSelectedBrand(brand.id)}
            style={selectedBrand === brand.id ? { backgroundColor: brand.color } : {}}
          >
            {brand.name}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campaign Generator */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 size={18} className="text-primary-400" />
              Kampanjegenerator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="Emne eller tema for kampanjen..." />
            <Button onClick={handleGenerate} disabled={generating} className="w-full">
              {generating ? <RefreshCw size={16} className="mr-2 animate-spin" /> : <Zap size={16} className="mr-2" />}
              {generating ? "Genererer..." : "Generer Kampanje"}
            </Button>

            {campaign && (
              <div className="bg-slate-800 rounded-lg p-4 space-y-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-white">{campaign.headline}</h4>
                  <Badge variant="success">Score: {campaign.score}</Badge>
                </div>
                <p className="text-sm text-slate-300">{campaign.body}</p>
                <Button size="sm" variant="ghost">
                  <Copy size={14} className="mr-1" />
                  Kopier
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Automation Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap size={18} className="text-amber-400" />
              Automasjon
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { name: "Market Pulse", desc: "Ukentlig markedsrapport", enabled: true },
              { name: "Brand Guard", desc: "Sjekk merkevarekonsistens", enabled: false },
              { name: "Social Sync", desc: "Auto-publisering på SoMe", enabled: true },
              { name: "Lead Nurture", desc: "Automatisk lead-oppfølging", enabled: false },
            ].map((item) => (
              <div key={item.name} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-200">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
                <Badge variant={item.enabled ? "success" : "secondary"}>
                  {item.enabled ? "Aktiv" : "Av"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* 7-Day Analytics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 size={18} />
            Siste 7 dager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Klikk", value: "1,234", change: "+12%" },
              { label: "Leads", value: "23", change: "+8%" },
              { label: "Konverteringer", value: "5", change: "+2" },
              { label: "ROI", value: "340%", change: "+15%" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-400">{stat.label}</p>
                <Badge variant="success" className="text-[10px] mt-1">{stat.change}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
