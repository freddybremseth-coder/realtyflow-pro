"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BRANDS } from "@/lib/constants";
import { TrendingUp, Lightbulb, Target, Rocket, Plus, X } from "lucide-react";

type StrategyStatus = "idea" | "planned" | "in_progress" | "done";
type StrategyCategory = "SEO" | "SoMe" | "Ads" | "Content" | "PR";

interface Strategy {
  id: string;
  title: string;
  description: string;
  brandId: string;
  impact: number;
  effort: number;
  status: StrategyStatus;
  category: StrategyCategory;
}

const initialStrategies: Strategy[] = [
  { id: "1", title: "Instagram Reels-kampanje for villaer", description: "Lag 10 Reels med virtuelle omvisninger av premium-villaer i Altea og Moraira.", brandId: "soleada", impact: 9, effort: 6, status: "in_progress", category: "SoMe" },
  { id: "2", title: "Blogg-serie: Bærekraftig bygging i Spania", description: "5 blogginnlegg om øko-byggematerialer og solenergi-løsninger.", brandId: "zeneco", impact: 7, effort: 5, status: "planned", category: "Content" },
  { id: "3", title: "Google Ads for ChatGenius", description: "Sett opp søkekampanje med fokus på AI chatbot-søkeord i Norden.", brandId: "chatgenius", impact: 8, effort: 4, status: "idea", category: "Ads" },
  { id: "4", title: "Pressemelding: Ny olivenhøst", description: "Send pressemelding til norske matmagasiner om Dona Annas økologiske olivenhøst.", brandId: "donaanna", impact: 6, effort: 3, status: "done", category: "PR" },
  { id: "5", title: "YouTube SEO-optimalisering", description: "Oppdater titler, beskrivelser og tags på alle 20+ videoer for bedre synlighet.", brandId: "freddyb", impact: 7, effort: 4, status: "planned", category: "SEO" },
  { id: "6", title: "Facebook Ads: Øko-hus Pinosos", description: "Retarget norske og svenske familier med interesse for bærekraftig livsstil.", brandId: "pinososecolife", impact: 8, effort: 5, status: "idea", category: "Ads" },
  { id: "7", title: "Spotify-playliste med Neural Beat-tracks", description: "Kuratér og promover playliste med AI-generert EDM på Spotify.", brandId: "neuralbeat", impact: 5, effort: 2, status: "in_progress", category: "SoMe" },
  { id: "8", title: "SEO: Costa Blanca-guider", description: "Skriv 8 stedsspesifikke guider for Soleada-bloggen med lokale søkeord.", brandId: "soleada", impact: 9, effort: 7, status: "idea", category: "SEO" },
  { id: "9", title: "LinkedIn thought leadership", description: "Publiser ukentlige artikler om spansk eiendomsmarked og entreprenørskap.", brandId: "freddyb", impact: 8, effort: 6, status: "in_progress", category: "Content" },
  { id: "10", title: "Samarbeidsinnlegg med lokale kokker", description: "Instagram-samarbeid med 3 lokale kokker som bruker Dona Anna-olje.", brandId: "donaanna", impact: 7, effort: 4, status: "planned", category: "SoMe" },
];

const statusConfig: Record<StrategyStatus, { label: string; color: string; variant: "secondary" | "outline" | "default" | "success" }> = {
  idea: { label: "Idé", color: "text-slate-400", variant: "secondary" },
  planned: { label: "Planlagt", color: "text-blue-400", variant: "outline" },
  in_progress: { label: "Pågår", color: "text-amber-400", variant: "default" },
  done: { label: "Ferdig", color: "text-emerald-400", variant: "success" },
};

const categoryColors: Record<StrategyCategory, string> = {
  SEO: "text-green-400",
  SoMe: "text-pink-400",
  Ads: "text-orange-400",
  Content: "text-blue-400",
  PR: "text-purple-400",
};

const statusOrder: StrategyStatus[] = ["idea", "planned", "in_progress", "done"];

export default function GrowthHubPage() {
  const [strategies, setStrategies] = useState<Strategy[]>(initialStrategies);
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [newStrategy, setNewStrategy] = useState({ title: "", description: "", brandId: BRANDS[0].id, impact: 5, effort: 5, category: "Content" as StrategyCategory });

  const filtered = selectedBrand === "all" ? strategies : strategies.filter((s) => s.brandId === selectedBrand);

  const handleAdd = () => {
    if (!newStrategy.title) return;
    const strategy: Strategy = {
      id: String(strategies.length + 1),
      title: newStrategy.title,
      description: newStrategy.description,
      brandId: newStrategy.brandId,
      impact: newStrategy.impact,
      effort: newStrategy.effort,
      status: "idea",
      category: newStrategy.category,
    };
    setStrategies((prev) => [strategy, ...prev]);
    setNewStrategy({ title: "", description: "", brandId: BRANDS[0].id, impact: 5, effort: 5, category: "Content" });
    setShowNew(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <TrendingUp className="text-amber-400" size={28} />
            Growth Hub
          </h1>
          <p className="text-sm text-slate-400 mt-1">Vekststrategier og ideer per brand</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} className="mr-2" />
          Ny strategi
        </Button>
      </div>

      {/* Brand Filter */}
      <div className="flex gap-2 flex-wrap items-center">
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
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant={view === "kanban" ? "default" : "outline"} onClick={() => setView("kanban")}>Kanban</Button>
          <Button size="sm" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")}>Liste</Button>
        </div>
      </div>

      {/* New Strategy Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNew(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Ny strategi</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowNew(false)}><X size={18} /></Button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Tittel *</label>
                  <Input placeholder="Strategitittel" value={newStrategy.title} onChange={(e) => setNewStrategy((p) => ({ ...p, title: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Beskrivelse</label>
                  <textarea placeholder="Beskriv strategien..." value={newStrategy.description} onChange={(e) => setNewStrategy((p) => ({ ...p, description: e.target.value }))} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-20 resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Brand</label>
                    <select value={newStrategy.brandId} onChange={(e) => setNewStrategy((p) => ({ ...p, brandId: e.target.value }))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                      {BRANDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Kategori</label>
                    <select value={newStrategy.category} onChange={(e) => setNewStrategy((p) => ({ ...p, category: e.target.value as StrategyCategory }))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                      {(["SEO", "SoMe", "Ads", "Content", "PR"] as StrategyCategory[]).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Impact (1-10): {newStrategy.impact}</label>
                    <input type="range" min={1} max={10} value={newStrategy.impact} onChange={(e) => setNewStrategy((p) => ({ ...p, impact: parseInt(e.target.value) }))} className="w-full" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Effort (1-10): {newStrategy.effort}</label>
                    <input type="range" min={1} max={10} value={newStrategy.effort} onChange={(e) => setNewStrategy((p) => ({ ...p, effort: parseInt(e.target.value) }))} className="w-full" />
                  </div>
                </div>
                <Button onClick={handleAdd} className="w-full" disabled={!newStrategy.title}><Plus size={16} className="mr-1" />Opprett strategi</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Kanban View */}
      {view === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statusOrder.map((status) => {
            const colItems = filtered.filter((s) => s.status === status);
            const cfg = statusConfig[status];
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</h3>
                  <Badge variant="secondary" className="text-[10px]">{colItems.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[200px] rounded-lg bg-slate-900/30 border border-slate-700/20 p-2">
                  {colItems.map((strategy) => {
                    const brand = BRANDS.find((b) => b.id === strategy.brandId);
                    return (
                      <Card key={strategy.id} className="hover:border-slate-500 transition-all">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: brand?.color || "#06b6d4" }} />
                            <p className="text-sm text-slate-200 font-medium truncate">{strategy.title}</p>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2 mb-2">{strategy.description}</p>
                          <div className="flex flex-wrap gap-1 mb-2">
                            <Badge variant="outline" className={`text-[10px] ${categoryColors[strategy.category]}`}>{strategy.category}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{brand?.name}</Badge>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-slate-500">
                            <span className="flex items-center gap-1"><Target size={10} /> Impact: {strategy.impact}</span>
                            <span className="flex items-center gap-1"><Rocket size={10} /> Effort: {strategy.effort}</span>
                          </div>
                          {strategy.status !== "done" && (
                            <div className="flex gap-1 mt-2">
                              <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2" onClick={() => alert("Sendt til Automasjon")}>
                                Automatiser
                              </Button>
                              <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2" onClick={() => alert("Åpner Content Studio")}>
                                Publiser innhold
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {view === "list" && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-700/50">
              {filtered.map((strategy) => {
                const brand = BRANDS.find((b) => b.id === strategy.brandId);
                const cfg = statusConfig[strategy.status];
                return (
                  <div key={strategy.id} className="flex items-center gap-4 p-4 hover:bg-slate-800/30">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: brand?.color || "#06b6d4" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-white truncate">{strategy.title}</p>
                        <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>
                        <Badge variant="outline" className={`text-[10px] ${categoryColors[strategy.category]}`}>{strategy.category}</Badge>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{strategy.description}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
                      <span>Impact: {strategy.impact}</span>
                      <span>Effort: {strategy.effort}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{brand?.name}</Badge>
                    {strategy.status !== "done" && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => alert("Sendt til Automasjon")}>Automatiser</Button>
                        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => alert("Åpner Content Studio")}>Publiser</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
