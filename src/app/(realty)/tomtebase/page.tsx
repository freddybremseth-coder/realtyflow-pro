"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MapPin, Maximize, Search, Plus, TreePine,
  Ruler, Tag, Eye, FileText, Map, Building2,
  ArrowRight, ChevronRight,
} from "lucide-react";

type PlotStatus = "TILGJENGELIG" | "UNDER_VURDERING" | "SOLGT" | "RESERVERT";

interface Plot {
  id: string;
  name: string;
  location: string;
  municipality: string;
  size: number;
  price: number;
  pricePerSqm: number;
  status: PlotStatus;
  zoning: string;
  buildableArea: number;
  terrain: string;
  utilities: string[];
  views: string;
  ref: string;
  addedDate: string;
}

const plots: Plot[] = [
  {
    id: "T001",
    name: "Solrik byggetomt med havutsikt",
    location: "Partida Cap Blanc, Altea",
    municipality: "Altea, Alicante",
    size: 1200,
    price: 195000,
    pricePerSqm: 163,
    status: "TILGJENGELIG",
    zoning: "Residensiell",
    buildableArea: 480,
    terrain: "Lett skranende, sorvendt",
    utilities: ["Vann", "Strom", "Kloakk", "Fiber"],
    views: "Panoramisk havutsikt og fjellsikt",
    ref: "ALT-2024-001",
    addedDate: "2024-03-01",
  },
  {
    id: "T002",
    name: "Flat byggetomt nær sentrum",
    location: "Partida Alhama, La Nucia",
    municipality: "La Nucia, Alicante",
    size: 800,
    price: 120000,
    pricePerSqm: 150,
    status: "UNDER_VURDERING",
    zoning: "Residensiell",
    buildableArea: 320,
    terrain: "Flat, klargjort",
    utilities: ["Vann", "Strom", "Kloakk"],
    views: "Fjellsikt mot Sierra Aitana",
    ref: "NUC-2024-002",
    addedDate: "2024-02-15",
  },
  {
    id: "T003",
    name: "Stor tomt for luksusvilla",
    location: "Cuesta San Antonio, Javea",
    municipality: "Javea, Alicante",
    size: 2500,
    price: 450000,
    pricePerSqm: 180,
    status: "TILGJENGELIG",
    zoning: "Residensiell lav tetthet",
    buildableArea: 750,
    terrain: "Terrasse-formet, sorvestvendt",
    utilities: ["Vann", "Strom", "Kloakk", "Fiber", "Gass"],
    views: "180-graders havutsikt, Cap de la Nao",
    ref: "JAV-2024-003",
    addedDate: "2024-02-28",
  },
  {
    id: "T004",
    name: "Rimelig tomt i Calpe",
    location: "Urbanizacion Maryvilla, Calpe",
    municipality: "Calpe, Alicante",
    size: 600,
    price: 85000,
    pricePerSqm: 142,
    status: "RESERVERT",
    zoning: "Residensiell",
    buildableArea: 240,
    terrain: "Lett skranende, ostvendt",
    utilities: ["Vann", "Strom"],
    views: "Delvis havutsikt, Penon de Ifach",
    ref: "CAL-2024-004",
    addedDate: "2024-01-20",
  },
];

function statusVariant(status: PlotStatus) {
  switch (status) {
    case "TILGJENGELIG":
      return "success" as const;
    case "UNDER_VURDERING":
      return "warning" as const;
    case "RESERVERT":
      return "default" as const;
    case "SOLGT":
      return "destructive" as const;
  }
}

function statusLabel(status: PlotStatus) {
  switch (status) {
    case "TILGJENGELIG":
      return "Tilgjengelig";
    case "UNDER_VURDERING":
      return "Under vurdering";
    case "RESERVERT":
      return "Reservert";
    case "SOLGT":
      return "Solgt";
  }
}

export default function TomtebasePage() {
  const [search, setSearch] = useState("");
  const [selectedPlot, setSelectedPlot] = useState<Plot | null>(null);

  const filtered = plots.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.location.toLowerCase().includes(search.toLowerCase()) ||
      p.municipality.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TreePine className="text-emerald-400" size={28} />
            Tomtebase
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Database over tilgjengelige byggetomter i Spania
          </p>
        </div>
        <Button size="sm">
          <Plus size={16} className="mr-1" />
          Legg til tomt
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <Input
          placeholder="Sok etter tomter..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plot Cards */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((plot) => (
              <Card
                key={plot.id}
                className={`cursor-pointer hover:border-slate-500 transition-all ${
                  selectedPlot?.id === plot.id ? "border-primary-500/50 bg-slate-800/80" : ""
                }`}
                onClick={() => setSelectedPlot(plot)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <Badge variant={statusVariant(plot.status)} className="text-[10px]">
                      {statusLabel(plot.status)}
                    </Badge>
                    <span className="text-[10px] text-slate-500">{plot.ref}</span>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-100 mb-1">
                    {plot.name}
                  </h3>
                  <div className="flex items-center gap-1 text-xs text-slate-400 mb-3">
                    <MapPin size={12} />
                    <span>{plot.location}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-slate-900/50">
                      <p className="text-[10px] text-slate-500">Storrelse</p>
                      <p className="text-sm font-semibold text-slate-200 flex items-center gap-1">
                        <Maximize size={12} className="text-slate-400" />
                        {plot.size.toLocaleString("nb-NO")} m{"\u00B2"}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900/50">
                      <p className="text-[10px] text-slate-500">Byggbart</p>
                      <p className="text-sm font-semibold text-slate-200 flex items-center gap-1">
                        <Building2 size={12} className="text-slate-400" />
                        {plot.buildableArea.toLocaleString("nb-NO")} m{"\u00B2"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
                    <div>
                      <p className="text-lg font-bold text-emerald-400">
                        {"\u20AC"}{plot.price.toLocaleString("nb-NO")}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {"\u20AC"}{plot.pricePerSqm}/m{"\u00B2"}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs">
                      Detaljer <ChevronRight size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Map Placeholder & Detail */}
        <div className="space-y-4">
          {/* Map placeholder */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Map size={16} className="text-blue-400" />
                Kart
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 rounded-lg bg-slate-900/50 border border-slate-700/30 flex items-center justify-center">
                <div className="text-center">
                  <Map size={48} className="mx-auto text-slate-600 mb-2" />
                  <p className="text-xs text-slate-500">
                    Interaktivt kart kommer snart
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Viser tomtenes plassering langs Costa Blanca
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Plot Detail */}
          {selectedPlot ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{selectedPlot.name}</CardTitle>
                <CardDescription>{selectedPlot.municipality}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Regulering</span>
                    <span className="text-slate-200">{selectedPlot.zoning}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Terreng</span>
                    <span className="text-slate-200">{selectedPlot.terrain}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Utsikt</span>
                    <span className="text-slate-200 text-right max-w-[60%]">{selectedPlot.views}</span>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-400 mb-1.5">Infrastruktur</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPlot.utilities.map((u) => (
                      <Badge key={u} variant="outline" className="text-[10px]">
                        {u}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 text-xs">
                    <FileText size={12} className="mr-1" />
                    Last ned info
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs">
                    <Eye size={12} className="mr-1" />
                    Bestill visning
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="flex items-center justify-center min-h-[200px]">
              <div className="text-center p-6">
                <Ruler size={32} className="mx-auto text-slate-600 mb-2" />
                <p className="text-sm text-slate-500">Velg en tomt for detaljer</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
