"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Brain, TrendingUp, TrendingDown, Minus, MapPin,
  Home, Bed, Bath, Maximize, Sparkles, BarChart3,
  ArrowRight, CheckCircle2, Loader2,
} from "lucide-react";

interface ValuationResult {
  low: number;
  agent: number;
  high: number;
  confidence: number;
  factors: { label: string; impact: "positive" | "neutral" | "negative"; detail: string }[];
  comparable: { address: string; price: number; area: number; date: string }[];
}

const propertyTypes = ["Leilighet", "Villa", "Rekkehus", "Penthouse", "Bungalow", "Tomt"];
const conditions = ["Nybygget", "Meget god", "God", "Middels", "Oppussingsobjekt"];
const amenities = [
  "Basseng", "Havutsikt", "Garasje", "Hage", "Terrasse",
  "Aircondition", "Sentralvarme", "Lagerrom", "Fellesomrade",
];

const mockResult: ValuationResult = {
  low: 365000,
  agent: 425000,
  high: 490000,
  confidence: 87,
  factors: [
    { label: "Beliggenhet", impact: "positive", detail: "Altea er et ettertraktet omrade med stigende priser (+8% siste ar)" },
    { label: "Havutsikt", impact: "positive", detail: "Eiendommer med havutsikt har 15-25% premium" },
    { label: "Areal vs pris", impact: "neutral", detail: "Prisen per kvm er i trad med markedsgjennomsnittet" },
    { label: "Tilstand", impact: "positive", detail: "Meget god tilstand reduserer forventet renoveringskostnad" },
    { label: "Soverom", impact: "neutral", detail: "3 soverom er standard for denne eiendomstypen" },
  ],
  comparable: [
    { address: "Calle del Mar 14, Altea", price: 410000, area: 145, date: "2024-02" },
    { address: "Av. del Albir 22, Altea", price: 445000, area: 160, date: "2024-01" },
    { address: "Partida Cap Negret 8, Altea", price: 395000, area: 135, date: "2023-12" },
  ],
};

export default function ValuationPage() {
  const [formData, setFormData] = useState({
    type: "Villa",
    location: "",
    bedrooms: "",
    bathrooms: "",
    area: "",
    condition: "God",
    selectedAmenities: [] as string[],
  });
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAmenityToggle = (amenity: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedAmenities: prev.selectedAmenities.includes(amenity)
        ? prev.selectedAmenities.filter((a) => a !== amenity)
        : [...prev.selectedAmenities, amenity],
    }));
  };

  const handleGenerate = () => {
    setIsLoading(true);
    setTimeout(() => {
      setResult(mockResult);
      setIsLoading(false);
    }, 2000);
  };

  const impactIcon = (impact: string) => {
    switch (impact) {
      case "positive":
        return <TrendingUp size={14} className="text-emerald-400" />;
      case "negative":
        return <TrendingDown size={14} className="text-red-400" />;
      default:
        return <Minus size={14} className="text-amber-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Brain className="text-purple-400" size={28} />
          AI Eiendomsvurdering
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Fa en intelligent verdivurdering basert pa markedsdata og AI-analyse
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Eiendomsdetaljer</CardTitle>
              <CardDescription>Fyll inn informasjon om eiendommen</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Type */}
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Type eiendom</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData((p) => ({ ...p, type: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-primary-500 focus:outline-none"
                >
                  {propertyTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Location */}
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Beliggenhet</label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input
                    placeholder="F.eks. Altea, Costa Blanca"
                    value={formData.location}
                    onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Bedrooms & Bathrooms */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Soverom</label>
                  <div className="relative">
                    <Bed size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      type="number"
                      placeholder="3"
                      value={formData.bedrooms}
                      onChange={(e) => setFormData((p) => ({ ...p, bedrooms: e.target.value }))}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Bad</label>
                  <div className="relative">
                    <Bath size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      type="number"
                      placeholder="2"
                      value={formData.bathrooms}
                      onChange={(e) => setFormData((p) => ({ ...p, bathrooms: e.target.value }))}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>

              {/* Area */}
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Areal (m{"\u00B2"})</label>
                <div className="relative">
                  <Maximize size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input
                    type="number"
                    placeholder="150"
                    value={formData.area}
                    onChange={(e) => setFormData((p) => ({ ...p, area: e.target.value }))}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Condition */}
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Tilstand</label>
                <select
                  value={formData.condition}
                  onChange={(e) => setFormData((p) => ({ ...p, condition: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-primary-500 focus:outline-none"
                >
                  {conditions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Amenities */}
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Fasiliteter</label>
                <div className="flex flex-wrap gap-2">
                  {amenities.map((a) => (
                    <button
                      key={a}
                      onClick={() => handleAmenityToggle(a)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        formData.selectedAmenities.includes(a)
                          ? "bg-primary-500/20 text-primary-300 border border-primary-500/30"
                          : "bg-slate-700/50 text-slate-400 border border-slate-600 hover:border-slate-500"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={handleGenerate} disabled={isLoading} className="w-full">
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Analyserer...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} className="mr-2" />
                    Generer AI Vurdering
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <div className="lg:col-span-3 space-y-4">
          {!result && !isLoading && (
            <Card className="h-full flex items-center justify-center min-h-[400px]">
              <div className="text-center p-8">
                <Brain size={64} className="mx-auto text-slate-600 mb-4" />
                <h3 className="text-lg font-semibold text-slate-300 mb-2">
                  Klar for AI-analyse
                </h3>
                <p className="text-sm text-slate-500 max-w-sm">
                  Fyll inn eiendomsdetaljene til venstre og klikk &quot;Generer AI Vurdering&quot; for a fa en intelligent verdivurdering
                </p>
              </div>
            </Card>
          )}

          {isLoading && (
            <Card className="h-full flex items-center justify-center min-h-[400px]">
              <div className="text-center p-8">
                <div className="relative mx-auto w-20 h-20 mb-4">
                  <div className="absolute inset-0 rounded-full border-2 border-purple-500/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-t-purple-400 animate-spin" />
                  <Brain size={32} className="absolute inset-0 m-auto text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-300 mb-1">
                  AI analyserer eiendommen...
                </h3>
                <p className="text-sm text-slate-500">
                  Sammenligner med markedsdata og lignende eiendommer
                </p>
              </div>
            </Card>
          )}

          {result && !isLoading && (
            <>
              {/* Price Range */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Estimert Verdi</CardTitle>
                    <Badge variant="success">
                      <CheckCircle2 size={12} className="mr-1" />
                      {result.confidence}% sikkerhet
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-4 rounded-lg bg-slate-900/50 border border-slate-700/30">
                      <p className="text-xs text-slate-500 mb-1">Lav</p>
                      <p className="text-xl font-bold text-slate-300">
                        {"\u20AC"}{(result.low / 1000).toFixed(0)}K
                      </p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-xs text-emerald-400 mb-1">Meglerverdi</p>
                      <p className="text-2xl font-bold text-emerald-400">
                        {"\u20AC"}{(result.agent / 1000).toFixed(0)}K
                      </p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-slate-900/50 border border-slate-700/30">
                      <p className="text-xs text-slate-500 mb-1">Hoy</p>
                      <p className="text-xl font-bold text-slate-300">
                        {"\u20AC"}{(result.high / 1000).toFixed(0)}K
                      </p>
                    </div>
                  </div>

                  {/* Range bar */}
                  <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="absolute h-full bg-gradient-to-r from-amber-500 via-emerald-500 to-blue-500 rounded-full"
                      style={{ left: "10%", right: "10%" }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg border-2 border-emerald-400"
                      style={{ left: "50%" }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>{"\u20AC"}{result.low.toLocaleString("nb-NO")}</span>
                    <span>{"\u20AC"}{result.high.toLocaleString("nb-NO")}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Factors */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 size={16} className="text-purple-400" />
                    Pavirknigsfaktorer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {result.factors.map((f, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/30">
                        {impactIcon(f.impact)}
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-200">{f.label}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{f.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Comparable */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Home size={16} className="text-blue-400" />
                    Sammenlignbare salg
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {result.comparable.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/30">
                        <div>
                          <p className="text-sm text-slate-200">{c.address}</p>
                          <p className="text-xs text-slate-500">{c.area} m{"\u00B2"} &middot; Solgt {c.date}</p>
                        </div>
                        <p className="text-sm font-semibold text-emerald-400">
                          {"\u20AC"}{c.price.toLocaleString("nb-NO")}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
