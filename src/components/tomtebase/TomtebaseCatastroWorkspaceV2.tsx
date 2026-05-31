"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PlotAssetsPanel } from "@/components/plots/plot-assets-panel";
import { Download, ExternalLink, Filter, MapPin, Navigation, Search } from "lucide-react";

type Zoning = "urbano" | "rustico" | "urbanizable";

type LandPlot = {
  id: string;
  plotNumber: string;
  area: number;
  price: number;
  location: string;
  municipality: string;
  zoning: Zoning;
  water: boolean;
  electricity: boolean;
  slope?: string;
  roadAccess?: boolean;
  notes?: string;
  lat: number;
  lng: number;
  source?: string;
};

const CATASTRO_WMS_URL = "https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx";
const CATASTRO_MAP_URL = "https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx";
const CATASTRO_REF_PATTERN = /\b\d{5}[A-Z]\d{7}[A-Z0-9]{7}\b/i;

const zoningConfig: Record<Zoning, { label: string; className: string; color: string }> = {
  urbano: { label: "Urbano", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", color: "#34d399" },
  rustico: { label: "Rústico", className: "bg-amber-500/20 text-amber-300 border-amber-500/30", color: "#fbbf24" },
  urbanizable: { label: "Urbanizable", className: "bg-blue-500/20 text-blue-300 border-blue-500/30", color: "#60a5fa" },
};

function normalize(value?: string | number | null) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function normalizeNumber(value?: string | number | null) {
  return String(value || "").replace(/[^0-9]/g, "").replace(/^0+/, "");
}

function cleanCatastroRef(value?: string | number | null) {
  const normalized = String(value || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  return normalized.match(CATASTRO_REF_PATTERN)?.[0] || String(value || "").toUpperCase().match(CATASTRO_REF_PATTERN)?.[0] || "";
}

function getCatastroRef(plot: LandPlot) {
  return cleanCatastroRef([plot.notes, plot.location, plot.municipality, plot.plotNumber].filter(Boolean).join(" "));
}

function getPolygonFromRef(ref: string) {
  return normalizeNumber(ref.match(/^\d{5}[A-Z](\d{3})/i)?.[1]);
}

function getParcelFromRef(ref: string) {
  return normalizeNumber(ref.match(/^\d{5}[A-Z]\d{3}(\d{5})/i)?.[1]);
}

function getPolygon(plot: LandPlot) {
  const fromText = [plot.notes, plot.location, plot.plotNumber].join(" ").match(/pol[ií]gono\s*[:#-]?\s*(\d+)/i)?.[1];
  return normalizeNumber(fromText) || getPolygonFromRef(getCatastroRef(plot));
}

function getParcel(plot: LandPlot) {
  const fromText = [plot.notes, plot.location, plot.plotNumber].join(" ").match(/parcela\s*[:#-]?\s*(\d+)/i)?.[1];
  return normalizeNumber(fromText) || getParcelFromRef(getCatastroRef(plot));
}

function catastroUrl(refcat: string) {
  const url = new URL(CATASTRO_MAP_URL);
  url.searchParams.set("refcat", refcat);
  return url.toString();
}

function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function formatEuro(value: number) {
  if (!value) return "Pris ikke oppgitt";
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function mapPlot(raw: any): LandPlot {
  return {
    id: raw.id,
    plotNumber: raw.plot_number || raw.plotNumber || raw.ref || raw.id,
    area: Number(raw.area || 0),
    price: Number(raw.price || 0),
    location: raw.location || "",
    municipality: raw.municipality || "",
    zoning: (raw.zoning || "rustico") as Zoning,
    water: Boolean(raw.water),
    electricity: Boolean(raw.electricity),
    slope: raw.slope || "",
    roadAccess: Boolean(raw.road_access ?? raw.roadAccess),
    notes: raw.notes || "",
    lat: Number(raw.lat || 0),
    lng: Number(raw.lng || 0),
    source: raw.source || "",
  };
}

function plotSearchText(plot: LandPlot) {
  return normalize([plot.plotNumber, plot.location, plot.municipality, plot.zoning, plot.notes, getCatastroRef(plot), getPolygon(plot), getParcel(plot)].filter(Boolean).join(" "));
}

function matchesPolygonParcel(plot: LandPlot, polygon: string, parcel: string) {
  const selectedPolygon = normalizeNumber(polygon);
  const selectedParcel = normalizeNumber(parcel);
  if (!selectedPolygon && !selectedParcel) return true;
  const ref = getCatastroRef(plot);
  return (!selectedPolygon || normalizeNumber(getPolygon(plot)) === selectedPolygon || ref.includes(selectedPolygon.padStart(3, "0"))) &&
    (!selectedParcel || normalizeNumber(getParcel(plot)) === selectedParcel || ref.includes(selectedParcel.padStart(5, "0")));
}

function ButtonLink({ href, children, className = "", variant }: { href: string; children: React.ReactNode; className?: string; variant?: "outline" }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block">
      <Button variant={variant} className={`w-full ${className}`}>{children}</Button>
    </a>
  );
}

function LeafletMap({ plots, selectedId, onSelectPlot, catastroEnabled }: { plots: LandPlot[]; selectedId: string | null; onSelectPlot: (plot: LandPlot) => void; catastroEnabled: boolean }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const catastroLayerRef = useRef<any>(null);
  const lastFitKeyRef = useRef("");
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let mounted = true;

    async function initMap() {
      const L = (await import("leaflet")).default;
      if (!mounted || !mapRef.current || mapInstanceRef.current) return;

      const map = L.map(mapRef.current, { center: [38.4, -0.9], zoom: 10, scrollWheelZoom: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "OpenStreetMap", maxZoom: 19 }).addTo(map);

      const catastro = L.tileLayer.wms(CATASTRO_WMS_URL, {
        layers: "Catastro",
        format: "image/png",
        transparent: true,
        version: "1.1.1",
        attribution: "Dirección General del Catastro",
        maxZoom: 22,
      });

      const markerLayer = L.layerGroup().addTo(map);
      catastroLayerRef.current = catastro;
      markersLayerRef.current = markerLayer;
      if (catastroEnabled) catastro.addTo(map);
      mapInstanceRef.current = map;
      setTimeout(() => map.invalidateSize(), 100);
      setMapReady(true);
    }

    initMap();
    return () => {
      mounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = catastroLayerRef.current;
    if (!map || !layer) return;
    if (catastroEnabled && !map.hasLayer(layer)) layer.addTo(map);
    if (!catastroEnabled && map.hasLayer(layer)) map.removeLayer(layer);
  }, [catastroEnabled, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !markersLayerRef.current) return;

    async function updateMarkers() {
      const L = (await import("leaflet")).default;
      const map = mapInstanceRef.current;
      const markerLayer = markersLayerRef.current;
      markerLayer.clearLayers();

      const validPlots = plots.filter((plot) => Number.isFinite(plot.lat) && Number.isFinite(plot.lng) && plot.lat !== 0 && plot.lng !== 0);

      validPlots.forEach((plot) => {
        const isSelected = plot.id === selectedId;
        const zoneColor = zoningConfig[plot.zoning]?.color || "#22d3ee";
        const refcat = getCatastroRef(plot);
        const marker = L.circleMarker([plot.lat, plot.lng], {
          radius: isSelected ? 11 : 7,
          color: isSelected ? "#ffffff" : "#0f172a",
          weight: isSelected ? 4 : 2,
          fillColor: zoneColor,
          fillOpacity: 0.95,
          opacity: 1,
          pane: "markerPane",
        }).addTo(markerLayer);

        marker.bindTooltip(
          `<strong>${plot.plotNumber}</strong><br>${plot.location || plot.municipality}<br>${plot.area.toLocaleString("nb-NO")} m² · ${formatEuro(plot.price)}${refcat ? `<br>Catastro: ${refcat}` : ""}<br><em>Klikk for å se tomtedetaljer</em>`,
          { direction: "top", sticky: true },
        );
        marker.on("click", () => onSelectPlot(plot));
        marker.bringToFront();
      });

      const fitKey = validPlots.map((plot) => plot.id).join("|");
      if (validPlots.length && fitKey !== lastFitKeyRef.current) {
        const bounds = L.latLngBounds(validPlots.map((plot) => [plot.lat, plot.lng]));
        map.fitBounds(bounds, { padding: [42, 42], maxZoom: 14 });
        lastFitKeyRef.current = fitKey;
      }
    }

    updateMarkers();
  }, [plots, selectedId, onSelectPlot, mapReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const selected = plots.find((plot) => plot.id === selectedId);
    if (mapReady && map && selected?.lat && selected?.lng) {
      map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 14), { duration: 0.45 });
    }
  }, [selectedId, plots, mapReady]);

  return <div ref={mapRef} className="w-full h-full min-h-[600px] rounded-lg" />;
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-950/50 border border-slate-700/60 p-2"><p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">{label}</p><p className="text-slate-200 font-semibold mt-0.5 break-words">{value}</p></div>;
}

function SelectedPlotPanel({ plot, onClose }: { plot: LandPlot | null; onClose: () => void }) {
  if (!plot) return <Card><CardContent className="p-6 text-center"><Navigation size={34} className="text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-300 font-medium">Klikk på en markør i kartet</p><p className="text-xs text-slate-500 mt-1">Da vises tomtedata, Catastro og PDF-knapp her.</p></CardContent></Card>;
  const refcat = getCatastroRef(plot);
  const polygon = getPolygon(plot);
  const parcel = getParcel(plot);

  return <Card className="border-cyan-500/30 shadow-xl shadow-cyan-950/20"><CardContent className="p-4 space-y-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white text-xl leading-tight">{plot.plotNumber}</h2><p className="text-xs text-slate-400 flex items-center gap-1 mt-1"><MapPin size={12} />{plot.location || plot.municipality || "Ukjent sted"}</p></div><button onClick={onClose} className="text-slate-400 hover:text-white">×</button></div><Badge className={zoningConfig[plot.zoning]?.className || zoningConfig.rustico.className}>{zoningConfig[plot.zoning]?.label || plot.zoning}</Badge><div className="grid grid-cols-2 gap-3"><div className="bg-slate-950/60 rounded-xl p-3 text-center border border-slate-700/70"><p className="text-xl font-bold text-white">{plot.area.toLocaleString("nb-NO")}</p><p className="text-xs text-slate-400">m²</p></div><div className="bg-slate-950/60 rounded-xl p-3 text-center border border-slate-700/70"><p className="text-xl font-bold text-emerald-400">{formatEuro(plot.price)}</p><p className="text-xs text-slate-400">Pris</p></div></div><div className="grid grid-cols-2 gap-2 text-xs"><InfoTile label="Polígono" value={polygon || "Ikke oppgitt"} /><InfoTile label="Parcela" value={parcel || "Ikke oppgitt"} /><InfoTile label="Vann" value={plot.water ? "Ja" : "Ikke oppgitt"} /><InfoTile label="Strøm" value={plot.electricity ? "Ja" : "Ikke oppgitt"} /><InfoTile label="Vei" value={plot.roadAccess ? "Ja" : "Ikke oppgitt"} /><InfoTile label="GPS" value={plot.lat && plot.lng ? `${plot.lat.toFixed(5)}, ${plot.lng.toFixed(5)}` : "Ikke oppgitt"} /></div>{refcat && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><p className="text-[10px] uppercase tracking-wide text-amber-300 font-bold">Referencia catastral</p><p className="text-sm text-white font-mono mt-1 break-all">{refcat}</p></div>}{plot.notes && <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">{plot.notes}</p>}<div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-700/60"><ButtonLink href={`/api/plots/${plot.id}/catastro-pdf`} className="bg-cyan-600 hover:bg-cyan-500"><Download size={15} className="mr-2" />Last ned PDF med all info</ButtonLink>{refcat ? <ButtonLink href={catastroUrl(refcat)} variant="outline"><ExternalLink size={15} className="mr-2" />Åpne i Catastro</ButtonLink> : <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-400">Ingen Catastro-referanse funnet. Legg inn Cadastral Number i notater for presis Catastro-lenke og PDF.</div>}<ButtonLink href={googleMapsUrl(plot.lat, plot.lng)} variant="outline"><MapPin size={15} className="mr-2" />Åpne i Google Maps</ButtonLink></div><div className="pt-3 border-t border-slate-700/60"><PlotAssetsPanel plotId={plot.id} /></div></CardContent></Card>;
}

function StatCard({ label, value, tone = "text-white" }: { label: string; value: string | number; tone?: string }) {
  return <Card><CardContent className="p-4"><p className={`text-2xl font-bold ${tone}`}>{value}</p><p className="text-xs text-slate-400 mt-1">{label}</p></CardContent></Card>;
}

export default function TomtebaseCatastroWorkspaceV2() {
  const [plots, setPlots] = useState<LandPlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlot, setSelectedPlot] = useState<LandPlot | null>(null);
  const [catastroEnabled, setCatastroEnabled] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [filterPolygon, setFilterPolygon] = useState("");
  const [filterParcel, setFilterParcel] = useState("");
  const [filterZoning, setFilterZoning] = useState("alle");
  const [filterMinArea, setFilterMinArea] = useState("");
  const [filterMaxPrice, setFilterMaxPrice] = useState("");

  useEffect(() => {
    fetch("/api/plots").then((res) => res.json()).then((data) => {
      const mapped = Array.isArray(data.plots) ? data.plots.map(mapPlot) : [];
      setPlots(mapped);
      if (mapped.length > 0) setSelectedPlot(mapped.find((plot: LandPlot) => plot.lat && plot.lng) || mapped[0]);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => plots.filter((plot) => (!searchText || plotSearchText(plot).includes(normalize(searchText))) && matchesPolygonParcel(plot, filterPolygon, filterParcel) && (filterZoning === "alle" || plot.zoning === filterZoning) && (!filterMinArea || plot.area >= Number(filterMinArea)) && (!filterMaxPrice || plot.price <= Number(filterMaxPrice))), [plots, searchText, filterPolygon, filterParcel, filterZoning, filterMinArea, filterMaxPrice]);

  useEffect(() => {
    if (selectedPlot && !filtered.some((plot) => plot.id === selectedPlot.id)) setSelectedPlot(filtered[0] || null);
  }, [filtered, selectedPlot]);

  const handleSelectPlot = useCallback((plot: LandPlot) => setSelectedPlot(plot), []);
  const stats = { total: filtered.length, withCatastro: filtered.filter((plot) => getCatastroRef(plot) || getPolygon(plot) || getParcel(plot)).length, withCoords: filtered.filter((plot) => plot.lat && plot.lng).length };

  return <div className="space-y-4"><div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3"><div><h1 className="text-2xl font-bold text-white">Tomtebase</h1><p className="text-sm text-slate-400">Alle markører vises automatisk. Klikk på en markør for tomtedata, Catastro og PDF-rapport.</p></div><div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={() => setShowFilters((value) => !value)}><Filter size={14} className="mr-1.5" />{showFilters ? "Skjul filter" : "Vis filter"}</Button><Button variant={catastroEnabled ? "default" : "outline"} size="sm" onClick={() => setCatastroEnabled((value) => !value)}><Navigation size={14} className="mr-1.5" />{catastroEnabled ? "Catastro på" : "Catastro av"}</Button>{selectedPlot && <a href={`/api/plots/${selectedPlot.id}/catastro-pdf`} target="_blank" rel="noopener noreferrer"><Button size="sm" className="bg-cyan-600 hover:bg-cyan-500"><Download size={14} className="mr-1.5" />PDF valgt tomt</Button></a>}</div></div><div className="grid grid-cols-1 md:grid-cols-4 gap-3"><StatCard label="Tomter vist" value={stats.total} /><StatCard label="Catastro / polígono / parcela" value={stats.withCatastro} tone="text-amber-300" /><StatCard label="Med kartposisjon" value={stats.withCoords} tone="text-cyan-300" /><StatCard label="Kartlag" value="WMS" tone="text-emerald-300" /></div><Card><CardContent className="p-3 space-y-3"><div className="grid grid-cols-1 md:grid-cols-5 gap-3"><div className="relative md:col-span-2"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><Input placeholder="Søk tomt, sted, Catastro-ref eller notat" value={searchText} onChange={(e) => setSearchText(e.target.value)} className="pl-9" /></div><Input placeholder="Polígono" value={filterPolygon} onChange={(e) => setFilterPolygon(e.target.value)} inputMode="numeric" /><Input placeholder="Parcela" value={filterParcel} onChange={(e) => setFilterParcel(e.target.value)} inputMode="numeric" /><select value={filterZoning} onChange={(e) => setFilterZoning(e.target.value)} className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"><option value="alle">Alle reguleringer</option><option value="rustico">Rústico</option><option value="urbano">Urbano</option><option value="urbanizable">Urbanizable</option></select></div>{showFilters && <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-700"><Input type="number" placeholder="Min areal m²" value={filterMinArea} onChange={(e) => setFilterMinArea(e.target.value)} /><Input type="number" placeholder="Maks pris €" value={filterMaxPrice} onChange={(e) => setFilterMaxPrice(e.target.value)} /></div>}</CardContent></Card><div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4" style={{ minHeight: "680px" }}><div className="rounded-xl overflow-hidden border border-slate-700 relative bg-slate-900 min-h-[600px]">{loading ? <div className="h-full min-h-[600px] flex items-center justify-center text-slate-400">Laster tomter...</div> : <LeafletMap plots={filtered} selectedId={selectedPlot?.id || null} onSelectPlot={handleSelectPlot} catastroEnabled={catastroEnabled} />}</div><div className="space-y-3 xl:max-h-[680px] xl:overflow-y-auto pr-1"><SelectedPlotPanel plot={selectedPlot} onClose={() => setSelectedPlot(null)} /><Card><CardContent className="p-3"><p className="text-xs font-semibold text-slate-400 mb-2">Tomter i filteret</p><div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">{filtered.map((plot) => <button key={plot.id} onClick={() => setSelectedPlot(plot)} className={`w-full text-left p-2.5 rounded-lg border transition-all ${selectedPlot?.id === plot.id ? "border-cyan-500/60 bg-slate-800" : "border-slate-700/50 bg-slate-900/50 hover:bg-slate-800/60"}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-white truncate">{plot.plotNumber}</span><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: zoningConfig[plot.zoning]?.color || "#94a3b8" }} /></div><div className="flex items-center justify-between gap-2 mt-0.5"><span className="text-xs text-slate-400 truncate">{plot.location || plot.municipality}</span><span className="text-xs text-emerald-400 flex-shrink-0">{formatEuro(plot.price)}</span></div></button>)}</div></CardContent></Card></div></div></div>;
}
