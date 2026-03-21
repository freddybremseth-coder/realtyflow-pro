"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScanLine, Search, Globe, Download, ExternalLink, Plus } from "lucide-react";

interface ScannedProperty {
  id: string;
  title: string;
  price: string;
  location: string;
  size: string;
  type: string;
  source: string;
  sourceUrl: string;
  imported: boolean;
}

const mockResults: ScannedProperty[] = [
  { id: "1", title: "Villa med havutsikt i Altea", price: "€485.000", location: "Altea, Costa Blanca", size: "220 m²", type: "Villa", source: "Idealista", sourceUrl: "https://idealista.com/example1", imported: false },
  { id: "2", title: "Modern leilighet i Benidorm sentrum", price: "€189.000", location: "Benidorm, Costa Blanca", size: "85 m²", type: "Leilighet", source: "Fotocasa", sourceUrl: "https://fotocasa.es/example2", imported: false },
  { id: "3", title: "Finca med olivenlund i Pinosos", price: "€320.000", location: "Pinosos, Alicante", size: "450 m²", type: "Finca", source: "Kyero", sourceUrl: "https://kyero.com/example3", imported: false },
  { id: "4", title: "Rekkehus nær stranden i Torrevieja", price: "€215.000", location: "Torrevieja, Costa Blanca", size: "110 m²", type: "Rekkehus", source: "ThinkSpain", sourceUrl: "https://thinkspain.com/example4", imported: false },
  { id: "5", title: "Penthouse med takterrasse i Alicante", price: "€395.000", location: "Alicante sentrum", size: "145 m²", type: "Leilighet", source: "Idealista", sourceUrl: "https://idealista.com/example5", imported: false },
  { id: "6", title: "Øko-hus med solceller i Jávea", price: "€540.000", location: "Jávea, Costa Blanca", size: "280 m²", type: "Villa", source: "SpainHouses", sourceUrl: "https://spainhouses.net/example6", imported: false },
  { id: "7", title: "Landsbyhus med patio i Moraira", price: "€175.000", location: "Moraira, Costa Blanca", size: "95 m²", type: "Rekkehus", source: "Kyero", sourceUrl: "https://kyero.com/example7", imported: false },
  { id: "8", title: "Luksusvilla med basseng i Calpe", price: "€720.000", location: "Calpe, Costa Blanca", size: "350 m²", type: "Villa", source: "Fotocasa", sourceUrl: "https://fotocasa.es/example8", imported: false },
];

const propertyTypes = ["Alle", "Villa", "Leilighet", "Rekkehus", "Finca"];
const locations = ["Alle", "Altea", "Benidorm", "Pinosos", "Torrevieja", "Alicante", "Jávea", "Moraira", "Calpe"];

export default function ScannerPage() {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScannedProperty[]>([]);
  const [filterType, setFilterType] = useState("Alle");
  const [filterLocation, setFilterLocation] = useState("Alle");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  const handleScan = async () => {
    if (!url.trim()) return;
    setScanning(true);
    await new Promise((r) => setTimeout(r, 2000));
    setResults(mockResults);
    setScanning(false);
  };

  const handleImport = (id: string) => {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, imported: true } : r)));
  };

  const filtered = results.filter((r) => {
    if (filterType !== "Alle" && r.type !== filterType) return false;
    if (filterLocation !== "Alle" && !r.location.includes(filterLocation)) return false;
    if (priceMin) {
      const price = parseInt(r.price.replace(/[^0-9]/g, ""));
      if (price < parseInt(priceMin)) return false;
    }
    if (priceMax) {
      const price = parseInt(r.price.replace(/[^0-9]/g, ""));
      if (price > parseInt(priceMax)) return false;
    }
    return true;
  });

  const totalScanned = results.length;
  const importedCount = results.filter((r) => r.imported).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <ScanLine className="text-primary-400" size={28} />
          Eiendomsskanner
        </h1>
        <p className="text-sm text-slate-400 mt-1">Skann eiendomssider og importer eiendommer automatisk</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Totalt skannet", value: totalScanned, icon: Globe },
          { label: "Nye i dag", value: totalScanned > 0 ? totalScanned : 0, icon: Search },
          { label: "Importert", value: importedCount, icon: Download },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon size={24} className="text-slate-400" />
              <div>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* URL Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe size={18} />
            Skann nettside
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="https://idealista.com/venta-viviendas/alicante-provincia/"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
            />
            <Button onClick={handleScan} disabled={scanning || !url.trim()}>
              {scanning ? (
                <span className="flex items-center gap-2">
                  <ScanLine size={16} className="animate-pulse" />
                  Skanner...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Search size={16} />
                  Skann
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      {results.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1 block">Eiendomstype</label>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                  {propertyTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1 block">Beliggenhet</label>
                <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                  {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1 block">Pris fra (EUR)</label>
                <Input type="number" placeholder="0" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} className="w-32" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1 block">Pris til (EUR)</label>
                <Input type="number" placeholder="1000000" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} className="w-32" />
              </div>
              <Badge variant="secondary" className="h-10 flex items-center">{filtered.length} resultater</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((property) => (
            <Card key={property.id} className={property.imported ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-white">{property.title}</h3>
                      {property.imported && <Badge variant="success" className="text-[10px]">Importert</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="font-semibold text-emerald-400">{property.price}</span>
                      <span>{property.location}</span>
                      <span>{property.size}</span>
                      <Badge variant="outline" className="text-[10px]">{property.type}</Badge>
                      <span className="flex items-center gap-1 text-slate-500">
                        <Globe size={10} />
                        {property.source}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => window.open(property.sourceUrl, "_blank")}>
                      <ExternalLink size={14} />
                    </Button>
                    <Button size="sm" onClick={() => handleImport(property.id)} disabled={property.imported}>
                      <Plus size={14} className="mr-1" />
                      {property.imported ? "Importert" : "Importer til Eiendommer"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
