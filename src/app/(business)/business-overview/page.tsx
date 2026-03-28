"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRANDS } from "@/lib/constants";
import { PieChart, BarChart, TrendingUp, DollarSign, Users } from "lucide-react";

interface BrandData {
  brandId: string;
  revenue: string;
  revenueChange: string;
  customers: number;
  customerChange: string;
  growth: string;
  recentActivity: string[];
  aiSummary: string;
  kpis: { label: string; value: string; trend: "up" | "down" | "neutral" }[];
  chartData: { month: string; value: number }[];
}

const brandDataMap: Record<string, BrandData> = {
  soleada: {
    brandId: "soleada",
    revenue: "€245.000",
    revenueChange: "+18%",
    customers: 42,
    customerChange: "+7",
    growth: "+22%",
    recentActivity: [
      "Ny lead fra Instagram-kampanje - Villa Altea",
      "Visning gjennomført: Penthouse Benidorm",
      "Kontrakt signert: Rekkehus Moraira - €215K",
    ],
    aiSummary: "Soleada viser sterk vekst i Q1 2026. Instagram-kampanjer driver 45% av nye leads. Anbefaler å øke budsjettet for Costa Blanca-annonser med 20%. Moraira-segmentet har høyest konverteringsrate på 34%.",
    kpis: [
      { label: "Aktive leads", value: "18", trend: "up" },
      { label: "Visninger/mnd", value: "12", trend: "up" },
      { label: "Snittpris salg", value: "€380K", trend: "neutral" },
      { label: "Dager til salg", value: "45", trend: "down" },
    ],
    chartData: [{ month: "Jan", value: 65 }, { month: "Feb", value: 78 }, { month: "Mar", value: 92 }],
  },
  zeneco: {
    brandId: "zeneco",
    revenue: "€180.000",
    revenueChange: "+12%",
    customers: 28,
    customerChange: "+4",
    growth: "+15%",
    recentActivity: [
      "Ny henvendelse om øko-villa med solceller",
      "Bloggartikkel publisert: Bærekraftig bygging",
      "Samarbeid med lokal arkitekt inngått",
    ],
    aiSummary: "Zen Eco Homes har økende interesse fra svenske kjøpere. Bærekraft-trenden driver etterspørsel. Fokuser på energimerking og solcelle-ROI i markedsføringen. Konverteringsraten kan forbedres med virtuelle omvisninger.",
    kpis: [
      { label: "Aktive leads", value: "12", trend: "up" },
      { label: "Øko-score snitt", value: "A+", trend: "up" },
      { label: "Snittpris", value: "€295K", trend: "up" },
      { label: "Henvendelser/uke", value: "8", trend: "neutral" },
    ],
    chartData: [{ month: "Jan", value: 45 }, { month: "Feb", value: 52 }, { month: "Mar", value: 68 }],
  },
  chatgenius: {
    brandId: "chatgenius",
    revenue: "$12.400 MRR",
    revenueChange: "+28%",
    customers: 156,
    customerChange: "+23",
    growth: "+35%",
    recentActivity: [
      "Enterprise-kunde onboardet: NordTech AS",
      "Ny funksjon lansert: Multi-språk chatbot",
      "Churn redusert til 3.2% fra 4.8%",
    ],
    aiSummary: "ChatGenius viser eksponentiell SaaS-vekst. MRR har økt 28% siste kvartal. Enterprise-segmentet er mest lønnsomt med 3x høyere LTV. Anbefaler å investere i customer success for å holde churn under 3%.",
    kpis: [
      { label: "MRR", value: "$12.4K", trend: "up" },
      { label: "Aktive brukere", value: "156", trend: "up" },
      { label: "Churn", value: "3.2%", trend: "down" },
      { label: "LTV", value: "$2,400", trend: "up" },
    ],
    chartData: [{ month: "Jan", value: 82 }, { month: "Feb", value: 95 }, { month: "Mar", value: 120 }],
  },
  donaanna: {
    brandId: "donaanna",
    revenue: "€4.200",
    revenueChange: "+8%",
    customers: 89,
    customerChange: "+12",
    growth: "+10%",
    recentActivity: [
      "Ny distribusjon: Meny Norge - 15 butikker",
      "Høstinnhøsting startet - estimert 2.000L",
      "Matfestival Alicante: 340 smaksprøver utdelt",
    ],
    aiSummary: "Dona Anna har stabil vekst med sterk merkevarelojalitet. Distribusjonsavtalen med Meny er et gjennombrudd. Sesongbasert salg topper i november-desember. Vurder abonnementsmodell for å jevne ut inntektsstrømmen.",
    kpis: [
      { label: "Enheter solgt", value: "890", trend: "up" },
      { label: "Distribusjonspartnere", value: "8", trend: "up" },
      { label: "Gjenkjøpsrate", value: "67%", trend: "up" },
      { label: "Margin", value: "45%", trend: "neutral" },
    ],
    chartData: [{ month: "Jan", value: 30 }, { month: "Feb", value: 35 }, { month: "Mar", value: 42 }],
  },
  freddyb: {
    brandId: "freddyb",
    revenue: "€8.500",
    revenueChange: "+45%",
    customers: 3200,
    customerChange: "+450",
    growth: "+52%",
    recentActivity: [
      "LinkedIn-artikkel fikk 12K visninger",
      "Podcast-gjesting: 'Utflytter i Spania'",
      "Ny YouTube-video: 8.5K visninger første uke",
    ],
    aiSummary: "Personlig merkevare vokser raskt med 52% følgervekst. LinkedIn er sterkeste kanal med høyest engasjement. YouTube-veksten akselererer. Anbefaler konsistent publisering 3x/uke og mer samarbeid med andre expat-skapere.",
    kpis: [
      { label: "Følgere totalt", value: "3,200", trend: "up" },
      { label: "Engasjement", value: "4.8%", trend: "up" },
      { label: "Foredrag/mnd", value: "2", trend: "neutral" },
      { label: "Henvendelser", value: "15/uke", trend: "up" },
    ],
    chartData: [{ month: "Jan", value: 55 }, { month: "Feb", value: 72 }, { month: "Mar", value: 95 }],
  },
  pinosoecolife: {
    brandId: "pinosoecolife",
    revenue: "€92.000",
    revenueChange: "+5%",
    customers: 14,
    customerChange: "+2",
    growth: "+8%",
    recentActivity: [
      "Ny eiendom lagt til: Finca med 5.000m² tomt",
      "Visning med nederlandsk familie gjennomført",
      "Samarbeid med lokal øko-gård etablert",
    ],
    aiSummary: "Pinoso Ecolife er i tidlig fase men med lovende nisjeposisjonering. Målgruppen verdsetter autentisitet og bærekraft. Anbefaler mer video-innhold fra eiendommene og community-bygging rundt rural lifestyle.",
    kpis: [
      { label: "Aktive leads", value: "6", trend: "up" },
      { label: "Eiendommer", value: "9", trend: "up" },
      { label: "Snittpris", value: "€210K", trend: "neutral" },
      { label: "Visninger/mnd", value: "4", trend: "up" },
    ],
    chartData: [{ month: "Jan", value: 20 }, { month: "Feb", value: 25 }, { month: "Mar", value: 32 }],
  },
  neuralbeat: {
    brandId: "neuralbeat",
    revenue: "€420",
    revenueChange: "+120%",
    customers: 1850,
    customerChange: "+380",
    growth: "+85%",
    recentActivity: [
      "Ny track 'Midnight Pulse' - 4.2K streams første uke",
      "Spotify-playliste akseptert: Electronic Rising",
      "Airtable synk: 12 nye spor importert",
    ],
    aiSummary: "Neural Beat viser eksplosiv vekst i lyttertall. AI-generert musikk treffer EDM-målgruppen godt. Spotify-algoritmene favoriserer konsistent publisering. Anbefaler å øke til 2 utgivelser per uke og fokusere på Shorts-innhold.",
    kpis: [
      { label: "Månedlige lyttere", value: "1,850", trend: "up" },
      { label: "Totale streams", value: "24K", trend: "up" },
      { label: "Spor publisert", value: "42", trend: "up" },
      { label: "Playlist-plasseringer", value: "7", trend: "up" },
    ],
    chartData: [{ month: "Jan", value: 40 }, { month: "Feb", value: 65 }, { month: "Mar", value: 95 }],
  },
};

export default function BusinessOverviewPage() {
  const [selectedBrand, setSelectedBrand] = useState<string>("all");

  const brandsToShow = selectedBrand === "all" ? BRANDS : BRANDS.filter((b) => b.id === selectedBrand);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <PieChart className="text-primary-400" size={28} />
          Business Oversikt
        </h1>
        <p className="text-sm text-slate-400 mt-1">Samlet ytelse og analyse per brand</p>
      </div>

      {/* Brand Selector */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={selectedBrand === "all" ? "default" : "outline"} onClick={() => setSelectedBrand("all")}>
          Alle brands
        </Button>
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

      {/* Comparative Overview (only when "all" is selected) */}
      {selectedBrand === "all" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart size={18} />
              Sammenlignende oversikt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {BRANDS.map((brand) => {
                const data = brandDataMap[brand.id];
                if (!data) return null;
                const maxValue = 120;
                const currentValue = data.chartData[data.chartData.length - 1]?.value || 0;
                const barWidth = (currentValue / maxValue) * 100;
                return (
                  <div key={brand.id} className="flex items-center gap-3">
                    <div className="w-32 shrink-0">
                      <p className="text-sm text-slate-200 font-medium truncate">{brand.name}</p>
                    </div>
                    <div className="flex-1 bg-slate-800 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full rounded-full flex items-center justify-end pr-2 text-[10px] font-medium text-white transition-all"
                        style={{ width: `${barWidth}%`, backgroundColor: brand.color }}
                      >
                        {data.revenue}
                      </div>
                    </div>
                    <Badge variant="success" className="text-[10px] shrink-0">{data.growth}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Brand Sections */}
      <div className="grid grid-cols-1 gap-6">
        {brandsToShow.map((brand) => {
          const data = brandDataMap[brand.id];
          if (!data) return null;
          return (
            <Card key={brand.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                    style={{ backgroundColor: brand.color + "33", color: brand.color }}
                  >
                    {brand.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <CardTitle className="text-base">{brand.name}</CardTitle>
                    <p className="text-xs text-slate-500">{brand.description}</p>
                  </div>
                  <Badge variant="secondary" className="ml-auto text-[10px]">{brand.type}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <DollarSign size={16} className="mx-auto text-emerald-400 mb-1" />
                    <p className="text-lg font-bold text-white">{data.revenue}</p>
                    <p className="text-[10px] text-slate-500">Omsetning</p>
                    <Badge variant="success" className="text-[10px] mt-1">{data.revenueChange}</Badge>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <Users size={16} className="mx-auto text-blue-400 mb-1" />
                    <p className="text-lg font-bold text-white">{data.customers}</p>
                    <p className="text-[10px] text-slate-500">Kunder</p>
                    <Badge variant="success" className="text-[10px] mt-1">{data.customerChange}</Badge>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <TrendingUp size={16} className="mx-auto text-amber-400 mb-1" />
                    <p className="text-lg font-bold text-white">{data.growth}</p>
                    <p className="text-[10px] text-slate-500">Vekst</p>
                  </div>
                  {data.kpis[0] && (
                    <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                      <PieChart size={16} className="mx-auto text-purple-400 mb-1" />
                      <p className="text-lg font-bold text-white">{data.kpis[0].value}</p>
                      <p className="text-[10px] text-slate-500">{data.kpis[0].label}</p>
                    </div>
                  )}
                </div>

                {/* Additional KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {data.kpis.slice(1).map((kpi) => (
                    <div key={kpi.label} className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg">
                      <span className="text-xs text-slate-400">{kpi.label}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-white">{kpi.value}</span>
                        {kpi.trend === "up" && <TrendingUp size={10} className="text-emerald-400" />}
                        {kpi.trend === "down" && <TrendingUp size={10} className="text-emerald-400 rotate-180" />}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Recent Activity */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">Siste aktivitet</h4>
                    <div className="space-y-2">
                      {data.recentActivity.map((activity, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: brand.color }} />
                          <span className="text-slate-400">{activity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Summary */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">AI-analyse</h4>
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <p className="text-xs text-slate-300 leading-relaxed">{data.aiSummary}</p>
                    </div>
                  </div>
                </div>

                {/* Mini Chart */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">Utvikling Q1 2026</h4>
                  <div className="flex items-end gap-2 h-16">
                    {data.chartData.map((point) => {
                      const height = (point.value / 120) * 100;
                      return (
                        <div key={point.month} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full rounded-t transition-all"
                            style={{ height: `${height}%`, backgroundColor: brand.color + "aa" }}
                          />
                          <span className="text-[10px] text-slate-500">{point.month}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
