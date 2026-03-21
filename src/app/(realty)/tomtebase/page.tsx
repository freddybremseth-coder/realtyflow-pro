"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Map, MapPin, Plus, Filter, Grid, List,
  Ruler, Droplets, Zap, X,
} from "lucide-react";

type Zoning = "urbano" | "rustico" | "urbanizable";

interface LandPlot {
  id: string;
  plotNumber: string;
  area: number;
  price: number;
  location: string;
  municipality: string;
  zoning: Zoning;
  water: boolean;
  electricity: boolean;
  slope: string;
  roadAccess: boolean;
  notes: string;
}

const zoningConfig: Record<Zoning, { label: string; className: string }> = {
  urbano: {
    label: "Urbano",
    className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
  rustico: {
    label: "Rustico",
    className: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  urbanizable: {
    label: "Urbanizable",
    className: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  },
};

const initialPlots: LandPlot[] = [
  {
    id: "1",
    plotNumber: "PIN-2024-001",
    area: 12500,
    price: 45000,
    location: "Partida La Solana, Pinosos",
    municipality: "Pinosos",
    zoning: "rustico",
    water: true,
    electricity: false,
    slope: "Lett skrånende (5-10%)",
    roadAccess: true,
    notes: "Flott beliggenhet med utsikt over dalen. Nær Pinosos sentrum. Oliventrær på eiendommen.",
  },
  {
    id: "2",
    plotNumber: "MON-2024-002",
    area: 800,
    price: 32000,
    location: "Calle Mayor, Monóvar",
    municipality: "Monóvar",
    zoning: "urbano",
    water: true,
    electricity: true,
    slope: "Flat (0-2%)",
    roadAccess: true,
    notes: "Byggetomt i sentrum av Monóvar. Alle tilkoblinger klare. Nær skole og butikker.",
  },
  {
    id: "3",
    plotNumber: "ELD-2024-003",
    area: 5200,
    price: 78000,
    location: "Partida El Chorrillo, Elda",
    municipality: "Elda",
    zoning: "urbanizable",
    water: true,
    electricity: true,
    slope: "Moderat (10-15%)",
    roadAccess: true,
    notes: "Stort utviklingsområde i utkanten av Elda. Regulert for boligbygging. Utsikt mot Sierra del Cid.",
  },
  {
    id: "4",
    plotNumber: "SAX-2024-004",
    area: 20000,
    price: 55000,
    location: "Camino de la Colonia, Sax",
    municipality: "Sax",
    zoning: "rustico",
    water: false,
    electricity: false,
    slope: "Bratt (15-25%)",
    roadAccess: false,
    notes: "Stor landbrukstomt med mandel- og oliventrær. Fantastisk utsikt mot Sax-borgen. Ingen infrastruktur.",
  },
  {
    id: "5",
    plotNumber: "NOV-2024-005",
    area: 1200,
    price: 65000,
    location: "Avenida de la Constitución, Novelda",
    municipality: "Novelda",
    zoning: "urbano",
    water: true,
    electricity: true,
    slope: "Flat (0-2%)",
    roadAccess: true,
    notes: "Sentralt i Novelda, nær marmormuseet. Perfekt for villabygging. Alle tilkoblinger på plass.",
  },
  {
    id: "6",
    plotNumber: "PIN-2024-006",
    area: 8500,
    price: 38000,
    location: "Partida La Cañada, Pinosos",
    municipality: "Pinosos",
    zoning: "rustico",
    water: true,
    electricity: false,
    slope: "Lett skrånende (5-10%)",
    roadAccess: true,
    notes: "Idyllisk landbrukstomt med vanntilgang. Vindrueplantasje. Mulighet for eco-bolig.",
  },
];

const emptyPlot: Omit<LandPlot, "id"> = {
  plotNumber: "",
  area: 0,
  price: 0,
  location: "",
  municipality: "Pinosos",
  zoning: "rustico",
  water: false,
  electricity: false,
  slope: "",
  roadAccess: false,
  notes: "",
};

const municipalities = ["Alle", "Pinosos", "Monóvar", "Elda", "Sax", "Novelda"];
const zonings: Zoning[] = ["urbano", "rustico", "urbanizable"];

export default function TomtebasePage() {
  const [plots, setPlots] = useState<LandPlot[]>(initialPlots);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedPlot, setSelectedPlot] = useState<LandPlot | null>(null);
  const [newPlot, setNewPlot] = useState(emptyPlot);

  // Filters
  const [filterMunicipality, setFilterMunicipality] = useState("Alle");
  const [filterZoning, setFilterZoning] = useState<string>("alle");
  const [filterMinArea, setFilterMinArea] = useState("");
  const [filterMaxArea, setFilterMaxArea] = useState("");
  const [filterMinPrice, setFilterMinPrice] = useState("");
  const [filterMaxPrice, setFilterMaxPrice] = useState("");

  const filtered = plots.filter((p) => {
    if (filterMunicipality !== "Alle" && p.municipality !== filterMunicipality) return false;
    if (filterZoning !== "alle" && p.zoning !== filterZoning) return false;
    if (filterMinArea && p.area < Number(filterMinArea)) return false;
    if (filterMaxArea && p.area > Number(filterMaxArea)) return false;
    if (filterMinPrice && p.price < Number(filterMinPrice)) return false;
    if (filterMaxPrice && p.price > Number(filterMaxPrice)) return false;
    return true;
  });

  // Stats
  const totalPlots = filtered.length;
  const totalArea = filtered.reduce((sum, p) => sum + p.area, 0);
  const avgPricePerSqm =
    totalArea > 0
      ? filtered.reduce((sum, p) => sum + p.price, 0) / totalArea
      : 0;

  const addPlot = () => {
    if (!newPlot.plotNumber || !newPlot.location) return;
    setPlots((prev) => [
      ...prev,
      { ...newPlot, id: `p${Date.now()}` },
    ]);
    setNewPlot(emptyPlot);
    setShowNewModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Map className="text-emerald-400" size={28} />
            Tomtebase
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Database over tomter i Alicante-provinsen
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={14} className="mr-1" />
            Filter
          </Button>
          <div className="flex border border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 ${
                viewMode === "grid"
                  ? "bg-slate-700 text-white"
                  : "bg-slate-800/50 text-slate-400"
              }`}
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 ${
                viewMode === "list"
                  ? "bg-slate-700 text-white"
                  : "bg-slate-800/50 text-slate-400"
              }`}
            >
              <List size={16} />
            </button>
          </div>
          <Button onClick={() => setShowNewModal(true)}>
            <Plus size={16} className="mr-2" />
            Ny tomt
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400 mb-1">Totalt tomter</p>
            <p className="text-2xl font-bold text-white">{totalPlots}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400 mb-1">Gjennomsnitt pris/m²</p>
            <p className="text-2xl font-bold text-emerald-400">
              {"\u20AC"}
              {avgPricePerSqm.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400 mb-1">Totalt areal</p>
            <p className="text-2xl font-bold text-white">
              {totalArea.toLocaleString("nb-NO")} m{"\u00B2"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">
                  Kommune
                </label>
                <select
                  value={filterMunicipality}
                  onChange={(e) => setFilterMunicipality(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-600 bg-slate-800 px-2 text-sm text-slate-100"
                >
                  {municipalities.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">
                  Regulering
                </label>
                <select
                  value={filterZoning}
                  onChange={(e) => setFilterZoning(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-600 bg-slate-800 px-2 text-sm text-slate-100"
                >
                  <option value="alle">Alle</option>
                  {zonings.map((z) => (
                    <option key={z} value={z}>
                      {zoningConfig[z].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">
                  Min areal (m²)
                </label>
                <Input
                  type="number"
                  value={filterMinArea}
                  onChange={(e) => setFilterMinArea(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">
                  Maks areal (m²)
                </label>
                <Input
                  type="number"
                  value={filterMaxArea}
                  onChange={(e) => setFilterMaxArea(e.target.value)}
                  placeholder="100000"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">
                  Min pris (EUR)
                </label>
                <Input
                  type="number"
                  value={filterMinPrice}
                  onChange={(e) => setFilterMinPrice(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">
                  Maks pris (EUR)
                </label>
                <Input
                  type="number"
                  value={filterMaxPrice}
                  onChange={(e) => setFilterMaxPrice(e.target.value)}
                  placeholder="1000000"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Map Placeholder */}
      <Card>
        <CardContent className="p-4">
          <div className="h-40 rounded-lg bg-slate-900/50 border border-slate-700/30 flex items-center justify-center">
            <div className="text-center">
              <Map size={40} className="mx-auto text-slate-600 mb-2" />
              <p className="text-sm text-slate-500">Kart kommer snart</p>
              <p className="text-[10px] text-slate-600 mt-1">
                Tomteplasseringer i Alicante-provinsen
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plot Cards / List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">
          Ingen tomter funnet med valgte filtre
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((plot) => (
            <Card
              key={plot.id}
              className="cursor-pointer hover:border-slate-500 transition-all"
              onClick={() => setSelectedPlot(plot)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
                      zoningConfig[plot.zoning].className
                    }`}
                  >
                    {zoningConfig[plot.zoning].label}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {plot.plotNumber}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
                  <MapPin size={12} className="text-slate-500 shrink-0" />
                  <span className="truncate">{plot.location}</span>
                </div>
                <p className="text-[10px] text-slate-500 mb-3">
                  {plot.municipality}
                </p>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-slate-900/50">
                    <p className="text-[10px] text-slate-500">Areal</p>
                    <p className="text-sm font-semibold text-white flex items-center gap-1">
                      <Ruler size={12} className="text-slate-400" />
                      {plot.area.toLocaleString("nb-NO")} m{"\u00B2"}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900/50">
                    <p className="text-[10px] text-slate-500">Pris</p>
                    <p className="text-sm font-semibold text-emerald-400">
                      {"\u20AC"}
                      {plot.price.toLocaleString("nb-NO")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1">
                    <Droplets
                      size={12}
                      className={
                        plot.water ? "text-blue-400" : "text-slate-600"
                      }
                    />
                    <span
                      className={`text-[10px] ${
                        plot.water ? "text-blue-300" : "text-slate-600"
                      }`}
                    >
                      Vann
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap
                      size={12}
                      className={
                        plot.electricity
                          ? "text-yellow-400"
                          : "text-slate-600"
                      }
                    />
                    <span
                      className={`text-[10px] ${
                        plot.electricity
                          ? "text-yellow-300"
                          : "text-slate-600"
                      }`}
                    >
                      Strøm
                    </span>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500">
                  Helning: {plot.slope}
                </p>
                <p className="text-[10px] text-slate-500">
                  Veiadkomst:{" "}
                  {plot.roadAccess ? (
                    <span className="text-emerald-400">Ja</span>
                  ) : (
                    <span className="text-red-400">Nei</span>
                  )}
                </p>

                <div className="pt-3 mt-3 border-t border-slate-700/50">
                  <p className="text-[10px] text-slate-500">
                    {"\u20AC"}
                    {(plot.price / plot.area).toFixed(2)}/m{"\u00B2"}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          {filtered.map((plot) => (
            <Card
              key={plot.id}
              className="cursor-pointer hover:border-slate-500 transition-all"
              onClick={() => setSelectedPlot(plot)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${
                        zoningConfig[plot.zoning].className
                      }`}
                    >
                      {zoningConfig[plot.zoning].label}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <MapPin size={12} className="text-slate-500" />
                        <span className="text-sm text-slate-200">
                          {plot.location}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {plot.municipality} | {plot.plotNumber}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-xs text-slate-400">Areal</p>
                      <p className="text-sm font-semibold text-white">
                        {plot.area.toLocaleString("nb-NO")} m{"\u00B2"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Pris</p>
                      <p className="text-sm font-semibold text-emerald-400">
                        {"\u20AC"}
                        {plot.price.toLocaleString("nb-NO")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Droplets
                        size={14}
                        className={
                          plot.water ? "text-blue-400" : "text-slate-600"
                        }
                      />
                      <Zap
                        size={14}
                        className={
                          plot.electricity
                            ? "text-yellow-400"
                            : "text-slate-600"
                        }
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Plot Detail Modal */}
      {selectedPlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setSelectedPlot(null)}
        >
          <Card
            className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
                        zoningConfig[selectedPlot.zoning].className
                      }`}
                    >
                      {zoningConfig[selectedPlot.zoning].label}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {selectedPlot.plotNumber}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-slate-300">
                    <MapPin size={14} className="text-slate-400" />
                    {selectedPlot.location}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedPlot.municipality}, Alicante
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedPlot(null)}
                >
                  <X size={18} />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-lg bg-slate-900/50">
                  <p className="text-[10px] text-slate-500">Areal</p>
                  <p className="text-lg font-bold text-white">
                    {selectedPlot.area.toLocaleString("nb-NO")} m{"\u00B2"}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50">
                  <p className="text-[10px] text-slate-500">Pris</p>
                  <p className="text-lg font-bold text-emerald-400">
                    {"\u20AC"}
                    {selectedPlot.price.toLocaleString("nb-NO")}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {"\u20AC"}
                    {(selectedPlot.price / selectedPlot.area).toFixed(2)}/m
                    {"\u00B2"}
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Regulering</span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
                      zoningConfig[selectedPlot.zoning].className
                    }`}
                  >
                    {zoningConfig[selectedPlot.zoning].label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Helning</span>
                  <span className="text-slate-200">{selectedPlot.slope}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Veiadkomst</span>
                  <span
                    className={
                      selectedPlot.roadAccess
                        ? "text-emerald-400"
                        : "text-red-400"
                    }
                  >
                    {selectedPlot.roadAccess ? "Ja" : "Nei"}
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-xs text-slate-400 mb-2">Infrastruktur</p>
                <div className="flex gap-3">
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
                      selectedPlot.water
                        ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                        : "bg-slate-800/50 border-slate-700 text-slate-500"
                    }`}
                  >
                    <Droplets size={14} />
                    <span className="text-xs">Vann</span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
                      selectedPlot.electricity
                        ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"
                        : "bg-slate-800/50 border-slate-700 text-slate-500"
                    }`}
                  >
                    <Zap size={14} />
                    <span className="text-xs">Strøm</span>
                  </div>
                </div>
              </div>

              {selectedPlot.notes && (
                <div className="mb-4 p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
                  <p className="text-xs text-slate-400 mb-1">Notater</p>
                  <p className="text-sm text-slate-200">
                    {selectedPlot.notes}
                  </p>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSelectedPlot(null)}
              >
                Lukk
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* New Plot Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowNewModal(false)}
        >
          <Card
            className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Ny tomt</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowNewModal(false)}
                >
                  <X size={18} />
                </Button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">
                      Tomtenummer
                    </label>
                    <Input
                      value={newPlot.plotNumber}
                      onChange={(e) =>
                        setNewPlot((p) => ({
                          ...p,
                          plotNumber: e.target.value,
                        }))
                      }
                      placeholder="PIN-2024-007"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">
                      Kommune
                    </label>
                    <select
                      value={newPlot.municipality}
                      onChange={(e) =>
                        setNewPlot((p) => ({
                          ...p,
                          municipality: e.target.value,
                        }))
                      }
                      className="w-full h-9 rounded-lg border border-slate-600 bg-slate-800 px-2 text-sm text-slate-100"
                    >
                      {municipalities
                        .filter((m) => m !== "Alle")
                        .map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">
                    Beliggenhet
                  </label>
                  <Input
                    value={newPlot.location}
                    onChange={(e) =>
                      setNewPlot((p) => ({ ...p, location: e.target.value }))
                    }
                    placeholder="Partida ..., Kommune"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">
                      Areal (m²)
                    </label>
                    <Input
                      type="number"
                      value={newPlot.area || ""}
                      onChange={(e) =>
                        setNewPlot((p) => ({
                          ...p,
                          area: Number(e.target.value),
                        }))
                      }
                      placeholder="1000"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">
                      Pris (EUR)
                    </label>
                    <Input
                      type="number"
                      value={newPlot.price || ""}
                      onChange={(e) =>
                        setNewPlot((p) => ({
                          ...p,
                          price: Number(e.target.value),
                        }))
                      }
                      placeholder="50000"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">
                      Regulering
                    </label>
                    <select
                      value={newPlot.zoning}
                      onChange={(e) =>
                        setNewPlot((p) => ({
                          ...p,
                          zoning: e.target.value as Zoning,
                        }))
                      }
                      className="w-full h-9 rounded-lg border border-slate-600 bg-slate-800 px-2 text-sm text-slate-100"
                    >
                      {zonings.map((z) => (
                        <option key={z} value={z}>
                          {zoningConfig[z].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">
                    Helning
                  </label>
                  <Input
                    value={newPlot.slope}
                    onChange={(e) =>
                      setNewPlot((p) => ({ ...p, slope: e.target.value }))
                    }
                    placeholder="Flat (0-2%)"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={newPlot.water}
                      onChange={(e) =>
                        setNewPlot((p) => ({ ...p, water: e.target.checked }))
                      }
                      className="rounded border-slate-600"
                    />
                    <Droplets size={14} className="text-blue-400" />
                    Vann
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={newPlot.electricity}
                      onChange={(e) =>
                        setNewPlot((p) => ({
                          ...p,
                          electricity: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-600"
                    />
                    <Zap size={14} className="text-yellow-400" />
                    Strøm
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={newPlot.roadAccess}
                      onChange={(e) =>
                        setNewPlot((p) => ({
                          ...p,
                          roadAccess: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-600"
                    />
                    Veiadkomst
                  </label>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">
                    Notater
                  </label>
                  <textarea
                    value={newPlot.notes}
                    onChange={(e) =>
                      setNewPlot((p) => ({ ...p, notes: e.target.value }))
                    }
                    placeholder="Tilleggsinfo om tomten..."
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-20 resize-none"
                  />
                </div>
                <Button
                  onClick={addPlot}
                  className="w-full"
                  disabled={!newPlot.plotNumber || !newPlot.location}
                >
                  <Plus size={16} className="mr-1" />
                  Legg til tomt
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
