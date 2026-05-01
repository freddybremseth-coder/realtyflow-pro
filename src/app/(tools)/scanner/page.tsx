"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ScanLine, Search, Globe, Download, ExternalLink, Plus, Loader2,
  MapPin, Home, Building2, TreePine, Trash2, Star, Eye, Clock,
  ChevronDown, ChevronUp, Filter, RefreshCw, CheckCircle, X,
  Hammer, DollarSign, Ruler, BedDouble, Bath, Zap, Calendar, FileText, Send,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScannedProperty {
  id: string;
  title: string;
  price: string;
  price_numeric: number;
  location: string;
  municipality: string;
  province: string;
  size_m2: number;
  plot_m2: number;
  bedrooms: number;
  bathrooms: number;
  type: string;
  description: string;
  source: string;
  source_url: string;
  image_urls: string[];
  features: string[];
  is_new_build: boolean;
  developer?: string;
  completion_date?: string;
  energy_rating?: string;
  ref_number?: string;
  status: "new" | "interested" | "investigating" | "imported" | "rejected" | "archived";
  user_notes?: string;
  scraped_at: string;
  created_at?: string;
}

interface PropertySource {
  name: string;
  type: string;
  base_url: string;
  search_urls: string[];
  description: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Home; color: string }> = {
  villa: { label: "Villa", icon: Home, color: "text-emerald-400" },
  apartment: { label: "Leilighet", icon: Building2, color: "text-blue-400" },
  townhouse: { label: "Rekkehus", icon: Building2, color: "text-cyan-400" },
  finca: { label: "Finca", icon: TreePine, color: "text-amber-400" },
  plot: { label: "Tomt", icon: MapPin, color: "text-green-400" },
  new_build: { label: "Nybygg", icon: Hammer, color: "text-purple-400" },
  other: { label: "Annet", icon: Home, color: "text-slate-400" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new: { label: "Ny", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  interested: { label: "Interessant", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  investigating: { label: "Undersokes", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  imported: { label: "Importert", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  rejected: { label: "Forkastet", color: "bg-red-500/20 text-red-300 border-red-500/30" },
  archived: { label: "Arkivert", color: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
};

const MUNICIPALITIES = [
  "Alle", "Alicante", "Altea", "Aspe", "Benidorm", "Calpe", "Castalla",
  "Denia", "El Campello", "Elda", "Finestrat", "Guardamar del Segura",
  "Hondón de las Nieves", "Javea", "Jijona", "La Nucia", "Moraira",
  "Novelda", "Onil", "Orihuela Costa", "Pilar de la Horadada",
  "Pinosos", "Polop", "Rojales", "San Miguel de Salinas", "Santa Pola",
  "Torrevieja", "Villajoyosa",
];

const AREA_SCAN_ZONES = [
  { label: "Benidorm", value: "Benidorm" },
  { label: "Finestrat", value: "Finestrat" },
  { label: "Polop", value: "Polop" },
  { label: "La Nucia", value: "La Nucia" },
  { label: "Altea", value: "Altea" },
  { label: "Calpe", value: "Calpe" },
  { label: "Jávea", value: "Jávea" },
  { label: "Moraira", value: "Moraira" },
  { label: "Dénia", value: "Dénia" },
  { label: "Alicante", value: "Alicante" },
  { label: "El Campello", value: "El Campello" },
  { label: "Villajoyosa", value: "Villajoyosa" },
  { label: "Santa Pola", value: "Santa Pola" },
  { label: "Torrevieja", value: "Torrevieja" },
  { label: "Orihuela Costa", value: "Orihuela Costa" },
  { label: "Guardamar del Segura", value: "Guardamar del Segura" },
  { label: "Pinosos", value: "Pinosos" },
  { label: "Novelda", value: "Novelda" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function ScannerPage() {
  // Data
  const [properties, setProperties] = useState<ScannedProperty[]>([]);
  const [sources, setSources] = useState<PropertySource[]>([]);
  const [latestScan, setLatestScan] = useState<{ created_at: string; properties_found: number } | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanningUrl, setScanningUrl] = useState(false);
  const [scanningArea, setScanningArea] = useState(false);
  const [selectedArea, setSelectedArea] = useState("");
  const [onlyNewBuilds, setOnlyNewBuilds] = useState(true);
  const [url, setUrl] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("nye");
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});

  // Filters
  const [filterType, setFilterType] = useState("Alle");
  const [filterMunicipality, setFilterMunicipality] = useState("Alle");
  const [filterNewBuild, setFilterNewBuild] = useState(false);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch("/api/scanner");
      if (res.ok) {
        const data = await res.json();
        setProperties(data.properties || []);
        setSources(data.sources || []);
        if (data.latest_scan) setLatestScan(data.latest_scan);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const [scanError, setScanError] = useState<string | null>(null);

  const runWeeklyScan = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "weekly_scan" }),
      });
      const data = await res.json();
      if (res.ok) {
        const newProps = (data.properties || []).map((p: ScannedProperty, i: number) => ({
          ...p,
          id: p.id || `scan-${Date.now()}-${i}`,
          status: p.status || "new",
        }));
        setProperties((prev) => [...newProps, ...prev]);
        setLatestScan({ created_at: new Date().toISOString(), properties_found: data.total_found || 0 });
        if (data.errors?.length > 0) {
          setScanError(`Fant ${data.total_found || 0} eiendommer, men med feil: ${data.errors.join("; ")}`);
        }
      } else {
        setScanError(data.error || `Skanning feilet (HTTP ${res.status})`);
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Nettverksfeil ved skanning");
    } finally {
      setScanning(false);
    }
  };

  const scanUrl = async () => {
    if (!url.trim()) return;
    setScanningUrl(true);
    try {
      const res = await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan_url", url }),
      });
      if (res.ok) {
        const data = await res.json();
        const newProps = (data.properties || []).map((p: ScannedProperty, i: number) => ({
          ...p,
          id: p.id || `url-${Date.now()}-${i}`,
          status: p.status || "new",
        }));
        setProperties((prev) => [...newProps, ...prev]);
        setUrl("");
      }
    } catch {
      // silently handle
    } finally {
      setScanningUrl(false);
    }
  };

  const runAreaScan = async () => {
    if (!selectedArea) return;
    setScanningArea(true);
    try {
      const res = await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "area_scan", area: selectedArea, only_new_builds: onlyNewBuilds }),
      });
      if (res.ok) {
        const data = await res.json();
        const newProps = (data.properties || []).map((p: ScannedProperty, i: number) => ({
          ...p,
          id: p.id || `area-${Date.now()}-${i}`,
          status: p.status || "new",
        }));
        setProperties((prev) => [...newProps, ...prev]);
        setLatestScan({ created_at: new Date().toISOString(), properties_found: data.total_found || 0 });
      }
    } catch {
      // silently handle
    } finally {
      setScanningArea(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_status", id, status }),
      });
      setProperties((prev) =>
        prev.map((p) => p.id === id ? { ...p, status: status as ScannedProperty["status"] } : p)
      );
    } catch {
      // silently handle
    }
  };

  const importProperty = async (id: string, options?: { showOnWebsite?: boolean; publishToPortal?: boolean }) => {
    setActionStatus((prev) => ({ ...prev, [id]: options?.publishToPortal ? "Lager PDF og Min side..." : options?.showOnWebsite ? "Legger på nettsiden..." : "Importerer..." }));
    try {
      const res = await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_property", id, ...options }),
      });
      if (!res.ok) throw new Error("Import failed");
      setProperties((prev) =>
        prev.map((p) => p.id === id ? { ...p, status: "imported" as const } : p)
      );
      setActionStatus((prev) => ({ ...prev, [id]: options?.publishToPortal ? "Lagt på Min side" : options?.showOnWebsite ? "Lagt på nettsiden" : "Importert" }));
    } catch {
      setActionStatus((prev) => ({ ...prev, [id]: "Feilet" }));
    }
  };

  // ─── Filtering ─────────────────────────────────────────────────────────────

  const getFiltered = (statusFilter: string) => {
    return properties.filter((p) => {
      if (statusFilter === "nye" && p.status !== "new") return false;
      if (statusFilter === "interessante" && p.status !== "interested" && p.status !== "investigating") return false;
      if (statusFilter === "importert" && p.status !== "imported") return false;
      if (statusFilter === "forkastet" && p.status !== "rejected") return false;

      if (filterType !== "Alle" && p.type !== filterType) return false;
      if (filterMunicipality !== "Alle" && p.municipality !== filterMunicipality) return false;
      if (filterNewBuild && !p.is_new_build) return false;
      if (priceMin && p.price_numeric < parseInt(priceMin)) return false;
      if (priceMax && p.price_numeric > parseInt(priceMax)) return false;
      return true;
    });
  };

  const newCount = properties.filter((p) => p.status === "new").length;
  const interestedCount = properties.filter((p) => p.status === "interested" || p.status === "investigating").length;
  const importedCount = properties.filter((p) => p.status === "imported").length;
  const totalNewBuilds = properties.filter((p) => p.is_new_build).length;
  const totalPlots = properties.filter((p) => p.type === "plot").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <ScanLine className="text-primary-400" size={28} />
            Eiendomsskanner
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            AI skanner Costa Blanca for nybygg og tomter hver sondag
            {latestScan && (
              <span className="text-slate-500 ml-2">
                | Siste: {new Date(latestScan.created_at).toLocaleDateString("nb-NO")} ({latestScan.properties_found} funn)
              </span>
            )}
          </p>
        </div>
        <Button onClick={runWeeklyScan} disabled={scanning}
          className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500">
          {scanning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Skanner...</>
            : <><Search className="mr-2 h-4 w-4" /> Skann na</>}
        </Button>
      </div>

      {/* Scan Error */}
      {scanError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
          <X size={16} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-300">{scanError}</p>
            <button onClick={() => setScanError(null)} className="text-xs text-red-400/60 hover:text-red-300 mt-1">Lukk</button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Nye", value: newCount, icon: ScanLine, color: "text-blue-400" },
          { label: "Interessante", value: interestedCount, icon: Star, color: "text-emerald-400" },
          { label: "Nybygg", value: totalNewBuilds, icon: Hammer, color: "text-purple-400" },
          { label: "Tomter", value: totalPlots, icon: MapPin, color: "text-green-400" },
          { label: "Importert", value: importedCount, icon: Download, color: "text-cyan-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-3 flex items-center gap-3">
              <Icon size={20} className={color} />
              <div>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-[10px] text-slate-500">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* URL Scanner */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Lim inn URL fra Idealista, Kyero, ThinkSpain, Fotocasa..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && scanUrl()}
              />
              <div className="flex flex-wrap gap-1 mt-2">
                {sources.slice(0, 6).map((s) => (
                  <Badge key={s.name} variant="outline" className="text-[9px] border-slate-600 text-slate-500 cursor-pointer hover:border-cyan-500/50 hover:text-cyan-300"
                    onClick={() => setUrl(s.search_urls[0])}>
                    {s.name}
                  </Badge>
                ))}
              </div>
            </div>
            <Button onClick={scanUrl} disabled={scanningUrl || !url.trim()} className="shrink-0">
              {scanningUrl ? <><Loader2 size={16} className="animate-spin mr-2" /> Skanner...</>
                : <><Globe size={16} className="mr-2" /> Skann URL</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Area Scanner */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <MapPin size={14} className="text-cyan-400" />
            Skann spesifikt område
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-medium text-slate-400 mb-1 block">Velg område</label>
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100"
              >
                <option value="">Velg kommune...</option>
                {AREA_SCAN_ZONES.map((z) => (
                  <option key={z.value} value={z.value}>{z.label}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer h-9">
              <input
                type="checkbox"
                checked={onlyNewBuilds}
                onChange={(e) => setOnlyNewBuilds(e.target.checked)}
                className="rounded border-slate-600"
              />
              <span className="text-xs text-slate-300">Kun nye prosjekter</span>
            </label>
            <Button
              onClick={runAreaScan}
              disabled={scanningArea || !selectedArea}
              className="bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500"
            >
              {scanningArea ? (
                <><Loader2 size={16} className="animate-spin mr-2" /> Skanner {selectedArea}...</>
              ) : (
                <><Search size={16} className="mr-2" /> Skann {selectedArea || "område"}</>
              )}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {AREA_SCAN_ZONES.slice(0, 10).map((z) => (
              <Badge
                key={z.value}
                variant="outline"
                className={`text-[10px] cursor-pointer transition-all ${
                  selectedArea === z.value
                    ? "border-cyan-500 text-cyan-300 bg-cyan-500/10"
                    : "border-slate-600 text-slate-500 hover:border-cyan-500/50 hover:text-cyan-300"
                }`}
                onClick={() => setSelectedArea(z.value)}
              >
                {z.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}
          className="text-slate-400 hover:text-white mb-2">
          <Filter size={14} className="mr-1" /> Filtre
          {showFilters ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />}
        </Button>
        {showFilters && (
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="text-[10px] font-medium text-slate-400 mb-1 block">Type</label>
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                    className="h-9 rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100">
                    <option value="Alle">Alle typer</option>
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-400 mb-1 block">Kommune</label>
                  <select value={filterMunicipality} onChange={(e) => setFilterMunicipality(e.target.value)}
                    className="h-9 rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100">
                    {MUNICIPALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-400 mb-1 block">Pris fra</label>
                  <Input type="number" placeholder="0" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} className="w-28 h-9" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-400 mb-1 block">Pris til</label>
                  <Input type="number" placeholder="∞" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} className="w-28 h-9" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer h-9">
                  <input type="checkbox" checked={filterNewBuild} onChange={(e) => setFilterNewBuild(e.target.checked)}
                    className="rounded border-slate-600" />
                  <span className="text-xs text-slate-300">Kun nybygg</span>
                </label>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="nye" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="nye">
            <ScanLine className="mr-1.5 h-3.5 w-3.5" /> Nye {newCount > 0 && <Badge className="ml-1.5 bg-blue-500/20 text-blue-300 text-[10px]">{newCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="interessante">
            <Star className="mr-1.5 h-3.5 w-3.5" /> Interessante {interestedCount > 0 && <Badge className="ml-1.5 bg-emerald-500/20 text-emerald-300 text-[10px]">{interestedCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="importert">
            <CheckCircle className="mr-1.5 h-3.5 w-3.5" /> Importert
          </TabsTrigger>
          <TabsTrigger value="forkastet">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Forkastet
          </TabsTrigger>
        </TabsList>

        {["nye", "interessante", "importert", "forkastet"].map((tab) => (
          <TabsContent key={tab} value={tab} className="space-y-3 mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
              </div>
            ) : getFiltered(tab).length === 0 ? (
              <Card className="bg-slate-800/50 border-slate-700/50">
                <CardContent className="p-12 text-center">
                  <Search className="h-12 w-12 mx-auto text-slate-600 mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {tab === "nye" ? "Ingen nye eiendommer" : `Ingen ${tab} eiendommer`}
                  </h3>
                  <p className="text-sm text-slate-400 mb-4">
                    {tab === "nye" ? 'Trykk "Skann na" for a la AI finne nybygg og tomter i Costa Blanca' : ""}
                  </p>
                  {tab === "nye" && (
                    <Button onClick={runWeeklyScan} disabled={scanning} className="bg-cyan-600 hover:bg-cyan-500">
                      <Search className="mr-2 h-4 w-4" /> Start skanning
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              getFiltered(tab).map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  expanded={expandedId === property.id}
                  onToggle={() => setExpandedId(expandedId === property.id ? null : property.id)}
                  onInterested={() => updateStatus(property.id, "interested")}
                  onInvestigate={() => updateStatus(property.id, "investigating")}
                  onReject={() => updateStatus(property.id, "rejected")}
                  onImport={() => importProperty(property.id)}
                  onPublishWebsite={() => importProperty(property.id, { showOnWebsite: true })}
                  onPublishPortal={() => importProperty(property.id, { showOnWebsite: true, publishToPortal: true })}
                  onRestore={() => updateStatus(property.id, "new")}
                  actionStatus={actionStatus[property.id]}
                />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ─── Property Card ───────────────────────────────────────────────────────────

function PropertyCard({
  property, expanded, onToggle, onInterested, onInvestigate, onReject, onImport, onPublishWebsite, onPublishPortal, onRestore, actionStatus,
}: {
  property: ScannedProperty;
  expanded: boolean;
  onToggle: () => void;
  onInterested: () => void;
  onInvestigate: () => void;
  onReject: () => void;
  onImport: () => void;
  onPublishWebsite: () => void;
  onPublishPortal: () => void;
  onRestore: () => void;
  actionStatus?: string;
}) {
  const typeCfg = TYPE_CONFIG[property.type] || TYPE_CONFIG.other;
  const TypeIcon = typeCfg.icon;
  const statusCfg = STATUS_CONFIG[property.status] || STATUS_CONFIG.new;

  return (
    <Card className={`bg-slate-800/50 border-slate-700/50 hover:border-slate-600 transition-all ${property.status === "rejected" ? "opacity-60" : ""}`}>
      <CardContent className="p-4">
        {/* Main row */}
        <div className="flex items-start gap-3 cursor-pointer" onClick={onToggle}>
          {/* Type icon */}
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-slate-700/50 shrink-0 ${typeCfg.color}`}>
            <TypeIcon size={20} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-white truncate">{property.title}</h3>
              {property.is_new_build && (
                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[9px] shrink-0">Nybygg</Badge>
              )}
              <Badge className={`text-[9px] shrink-0 ${statusCfg.color}`}>{statusCfg.label}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
              <span className="font-bold text-lg text-emerald-400">{property.price}</span>
              <span className="flex items-center gap-1"><MapPin size={11} /> {property.location}</span>
              {property.size_m2 > 0 && <span className="flex items-center gap-1"><Ruler size={11} /> {property.size_m2} m²</span>}
              {property.plot_m2 > 0 && <span className="flex items-center gap-1"><MapPin size={11} /> {property.plot_m2} m² tomt</span>}
              {property.bedrooms > 0 && <span className="flex items-center gap-1"><BedDouble size={11} /> {property.bedrooms}</span>}
              {property.bathrooms > 0 && <span className="flex items-center gap-1"><Bath size={11} /> {property.bathrooms}</span>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {property.source_url && (
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                onClick={(e) => { e.stopPropagation(); window.open(property.source_url, "_blank"); }}>
                <ExternalLink size={14} className="text-slate-400" />
              </Button>
            )}
            {expanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-3">
            {/* Description */}
            <p className="text-sm text-slate-300">{property.description}</p>

            {/* Details grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {property.developer && (
                <div className="p-2 rounded bg-slate-700/30">
                  <div className="text-[10px] text-slate-500">Utvikler</div>
                  <div className="text-xs text-white">{property.developer}</div>
                </div>
              )}
              {property.completion_date && (
                <div className="p-2 rounded bg-slate-700/30">
                  <div className="text-[10px] text-slate-500 flex items-center gap-1"><Calendar size={10} /> Ferdig</div>
                  <div className="text-xs text-white">{property.completion_date}</div>
                </div>
              )}
              {property.energy_rating && (
                <div className="p-2 rounded bg-slate-700/30">
                  <div className="text-[10px] text-slate-500 flex items-center gap-1"><Zap size={10} /> Energi</div>
                  <div className="text-xs text-white">{property.energy_rating}</div>
                </div>
              )}
              <div className="p-2 rounded bg-slate-700/30">
                <div className="text-[10px] text-slate-500">Kilde</div>
                <div className="text-xs text-white">{property.source}</div>
              </div>
            </div>

            {/* Features */}
            {property.features?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {property.features.map((f, i) => (
                  <Badge key={i} variant="outline" className="text-[9px] border-slate-600 text-slate-400">{f}</Badge>
                ))}
              </div>
            )}

            {/* Ref + scraped date */}
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              {property.ref_number && <span>Ref: {property.ref_number}</span>}
              <span className="flex items-center gap-1"><Clock size={10} /> Skannet: {new Date(property.scraped_at).toLocaleDateString("nb-NO")}</span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              {actionStatus && (
                <span className="flex items-center rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">
                  {actionStatus}
                </span>
              )}
              {property.status === "new" && (
                <>
                  <Button size="sm" onClick={onInterested} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500">
                    <Star size={12} className="mr-1" /> Interessant
                  </Button>
                  <Button size="sm" onClick={onInvestigate} variant="outline" className="h-7 text-xs border-amber-500/30 text-amber-300">
                    <Eye size={12} className="mr-1" /> Undersok mer
                  </Button>
                  <Button size="sm" onClick={onReject} variant="outline" className="h-7 text-xs border-red-500/30 text-red-400">
                    <X size={12} className="mr-1" /> Ikke aktuelt
                  </Button>
                </>
              )}
              {(property.status === "interested" || property.status === "investigating") && (
                <>
                  <Button size="sm" onClick={onImport} className="h-7 text-xs bg-cyan-600 hover:bg-cyan-500">
                    <Download size={12} className="mr-1" /> Importer til Eiendommer
                  </Button>
                  <Button size="sm" onClick={onPublishWebsite} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500">
                    <Globe size={12} className="mr-1" /> Legg på nettsiden
                  </Button>
                  <Button size="sm" onClick={onPublishPortal} className="h-7 text-xs bg-purple-600 hover:bg-purple-500">
                    <FileText size={12} className="mr-1" /> Min side + PDF
                  </Button>
                  {property.source_url && (
                    <Button size="sm" variant="outline" className="h-7 text-xs border-blue-500/30 text-blue-300" onClick={() => window.open(`mailto:?subject=${encodeURIComponent(property.title)}&body=${encodeURIComponent(`${property.title}\n${property.price}\n${property.location}\n\n${property.source_url}`)}`)}>
                      <Send size={12} className="mr-1" /> Send lenke
                    </Button>
                  )}
                  <Button size="sm" onClick={onReject} variant="outline" className="h-7 text-xs border-red-500/30 text-red-400">
                    <X size={12} className="mr-1" /> Forkast
                  </Button>
                </>
              )}
              {(property.status === "rejected" || property.status === "archived") && (
                <Button size="sm" onClick={onRestore} variant="outline" className="h-7 text-xs border-blue-500/30 text-blue-300">
                  <RefreshCw size={12} className="mr-1" /> Gjenopprett
                </Button>
              )}
              {property.source_url && (
                <a href={property.source_url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="h-7 text-xs border-slate-600">
                    <ExternalLink size={12} className="mr-1" /> Se annonse
                  </Button>
                </a>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
