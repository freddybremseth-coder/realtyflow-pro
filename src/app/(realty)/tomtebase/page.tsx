"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  MapPin, Plus, Filter, Grid3X3, List,
  Droplets, Zap, X, Upload, FileText,
  Trash2, Pencil, ExternalLink, Navigation,
  Download, Loader2, Mountain,
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
  lat: number;
  lng: number;
  source?: "manual" | "csv" | "xml" | "kml" | "google-maps";
}

const zoningConfig: Record<Zoning, { label: string; className: string; color: string }> = {
  urbano: { label: "Urbano", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", color: "#34d399" },
  rustico: { label: "Rústico", className: "bg-amber-500/20 text-amber-300 border-amber-500/30", color: "#fbbf24" },
  urbanizable: { label: "Urbanizable", className: "bg-blue-500/20 text-blue-300 border-blue-500/30", color: "#60a5fa" },
};

const initialPlots: LandPlot[] = [
  { id: "1", plotNumber: "PIN-2024-001", area: 12500, price: 45000, location: "Partida La Solana, Pinosos", municipality: "Pinosos", zoning: "rustico", water: true, electricity: false, slope: "Lett skrånende (5-10%)", roadAccess: true, notes: "Flott beliggenhet med utsikt over dalen. Nær Pinosos sentrum. Oliventrær på eiendommen.", lat: 38.4013, lng: -1.0411, source: "manual" },
  { id: "2", plotNumber: "MON-2024-002", area: 800, price: 32000, location: "Calle Mayor, Monóvar", municipality: "Monóvar", zoning: "urbano", water: true, electricity: true, slope: "Flat (0-2%)", roadAccess: true, notes: "Byggetomt i sentrum av Monóvar. Alle tilkoblinger klare.", lat: 38.4368, lng: -0.8412, source: "manual" },
  { id: "3", plotNumber: "ELD-2024-003", area: 5200, price: 78000, location: "Partida El Chorrillo, Elda", municipality: "Elda", zoning: "urbanizable", water: true, electricity: true, slope: "Moderat (10-15%)", roadAccess: true, notes: "Stort utviklingsområde i utkanten av Elda. Regulert for boligbygging.", lat: 38.4769, lng: -0.7917, source: "manual" },
  { id: "4", plotNumber: "SAX-2024-004", area: 20000, price: 55000, location: "Camino de la Colonia, Sax", municipality: "Sax", zoning: "rustico", water: false, electricity: false, slope: "Bratt (15-25%)", roadAccess: false, notes: "Stor landbrukstomt med mandel- og oliventrær. Fantastisk utsikt mot Sax-borgen.", lat: 38.5357, lng: -0.8175, source: "manual" },
  { id: "5", plotNumber: "NOV-2024-005", area: 1200, price: 65000, location: "Avenida de la Constitución, Novelda", municipality: "Novelda", zoning: "urbano", water: true, electricity: true, slope: "Flat (0-2%)", roadAccess: true, notes: "Sentralt i Novelda, nær marmormuseet. Perfekt for villabygging.", lat: 38.3847, lng: -0.7676, source: "manual" },
  { id: "6", plotNumber: "PIN-2024-006", area: 8500, price: 38000, location: "Partida La Cañada, Pinosos", municipality: "Pinosos", zoning: "rustico", water: true, electricity: false, slope: "Lett skrånende (5-10%)", roadAccess: true, notes: "Idyllisk landbrukstomt med vanntilgang. Vindrueplantasje.", lat: 38.4221, lng: -1.0538, source: "manual" },
];

const municipalities = ["Alle", "Pinosos", "Monóvar", "Elda", "Sax", "Novelda", "Alicante", "Jávea", "Altea", "Benidorm"];
const zonings: Zoning[] = ["urbano", "rustico", "urbanizable"];

// ─── KML/KMZ Parser ─────────────────────────────────────────
function parseKML(kmlText: string): Partial<LandPlot>[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, "text/xml");
  const placemarks = doc.querySelectorAll("Placemark");
  const results: Partial<LandPlot>[] = [];

  placemarks.forEach((pm, i) => {
    const name = pm.querySelector("name")?.textContent?.trim() || "";
    const desc = pm.querySelector("description")?.textContent?.trim() || "";
    const coordsEl = pm.querySelector("coordinates");
    if (!coordsEl) return;

    const coordsText = coordsEl.textContent?.trim() || "";
    // KML coords are: lng,lat,alt
    const parts = coordsText.split(",").map(s => parseFloat(s.trim()));
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return;

    const lng = parts[0];
    const lat = parts[1];

    // Try to extract data from description or extended data
    const extData: Record<string, string> = {};
    pm.querySelectorAll("ExtendedData Data, ExtendedData SimpleData").forEach(d => {
      const key = d.getAttribute("name") || d.tagName;
      const val = d.querySelector("value")?.textContent?.trim() || d.textContent?.trim() || "";
      if (key && val) extData[key.toLowerCase()] = val;
    });

    results.push({
      plotNumber: name || `KML-${i + 1}`,
      location: extData.location || extData.address || name || "",
      lat,
      lng,
      notes: desc.replace(/<[^>]*>/g, " ").trim(),
      area: parseInt(extData.area || extData.superficie || "0") || 0,
      price: parseInt(extData.price || extData.precio || "0") || 0,
      municipality: extData.municipality || extData.municipio || extData.town || "",
      source: "kml" as const,
    });
  });

  return results;
}

// ─── CSV Parser ─────────────────────────────────────────────
function parseCSVPlots(csvText: string): Partial<LandPlot>[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(/[,;\t]/).map(h => h.trim().toLowerCase().replace(/["']/g, ""));
  const findCol = (...names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)));

  const nameIdx = findCol("name", "nombre", "plotnumber", "plot", "tomt", "ref");
  const latIdx = findCol("lat", "latitude", "latitud");
  const lngIdx = findCol("lng", "lon", "longitude", "longitud");
  const areaIdx = findCol("area", "areal", "superficie", "m2", "size");
  const priceIdx = findCol("price", "pris", "precio");
  const locIdx = findCol("location", "sted", "ubicacion", "address", "adresse");
  const munIdx = findCol("municipality", "kommune", "municipio", "town", "ciudad");
  const zoningIdx = findCol("zoning", "regulering", "uso", "clasificacion");
  const notesIdx = findCol("notes", "notat", "description", "beskrivelse");

  const results: Partial<LandPlot>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(/[,;\t]/).map(v => v.trim().replace(/^["']|["']$/g, ""));
    if (vals.length < 2) continue;

    const lat = latIdx >= 0 ? parseFloat(vals[latIdx]) : 0;
    const lng = lngIdx >= 0 ? parseFloat(vals[lngIdx]) : 0;
    if (latIdx >= 0 && (isNaN(lat) || lat === 0)) continue;

    results.push({
      plotNumber: nameIdx >= 0 ? vals[nameIdx] : `CSV-${i}`,
      lat: lat || 38.4,
      lng: lng || -1.0,
      area: areaIdx >= 0 ? parseInt(vals[areaIdx].replace(/[^\d]/g, "")) || 0 : 0,
      price: priceIdx >= 0 ? parseInt(vals[priceIdx].replace(/[^\d]/g, "")) || 0 : 0,
      location: locIdx >= 0 ? vals[locIdx] : "",
      municipality: munIdx >= 0 ? vals[munIdx] : "",
      notes: notesIdx >= 0 ? vals[notesIdx] : "",
      zoning: zoningIdx >= 0 ? (vals[zoningIdx].toLowerCase() as Zoning) : undefined,
      source: "csv" as const,
    });
  }
  return results;
}

// ─── Google Maps URL coordinate extractor ────────────────────
function extractGoogleMapsCoords(url: string): { lat: number; lng: number } | null {
  // Try @lat,lng,zoom format
  const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };

  // Try q=lat,lng format
  const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };

  // Try ll=lat,lng format
  const llMatch = url.match(/ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (llMatch) return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]) };

  return null;
}

// ─── Map Component (dynamic import to avoid SSR) ─────────────
function LeafletMap({
  plots,
  selectedId,
  onSelectPlot,
  center,
  zoom,
}: {
  plots: LandPlot[];
  selectedId: string | null;
  onSelectPlot: (plot: LandPlot) => void;
  center: [number, number];
  zoom: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const initMap = async () => {
      const L = (await import("leaflet")).default;
      // @ts-ignore - CSS import for leaflet styles
      await import("leaflet/dist/leaflet.css");

      const map = L.map(mapRef.current!, {
        center,
        zoom,
        scrollWheelZoom: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;

      // Refresh map size after render
      setTimeout(() => map.invalidateSize(), 100);
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update markers when plots change
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const updateMarkers = async () => {
      const L = (await import("leaflet")).default;
      const map = mapInstanceRef.current;

      // Clear existing markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      plots.forEach(plot => {
        if (!plot.lat || !plot.lng) return;

        const isSelected = plot.id === selectedId;
        const zoneColor = zoningConfig[plot.zoning]?.color || "#94a3b8";

        const icon = L.divIcon({
          className: "custom-marker",
          html: `<div style="
            width: ${isSelected ? 28 : 22}px;
            height: ${isSelected ? 28 : 22}px;
            background: ${zoneColor};
            border: 3px solid ${isSelected ? '#fff' : 'rgba(0,0,0,0.3)'};
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            cursor: pointer;
            transition: all 0.2s;
            ${isSelected ? 'transform: scale(1.3); z-index: 1000;' : ''}
          "></div>`,
          iconSize: [isSelected ? 28 : 22, isSelected ? 28 : 22],
          iconAnchor: [isSelected ? 14 : 11, isSelected ? 14 : 11],
        });

        const marker = L.marker([plot.lat, plot.lng], { icon }).addTo(map);

        marker.bindTooltip(
          `<div style="font-size:12px;font-weight:600">${plot.plotNumber}</div>
           <div style="font-size:11px;color:#666">${plot.location || plot.municipality}</div>
           <div style="font-size:11px">${plot.area.toLocaleString("nb-NO")} m² · €${plot.price.toLocaleString("nb-NO")}</div>`,
          { direction: "top", offset: [0, -12] }
        );

        marker.on("click", () => onSelectPlot(plot));
        markersRef.current.push(marker);
      });

      // Fit bounds if we have plots
      if (plots.length > 0 && plots.some(p => p.lat && p.lng)) {
        const validPlots = plots.filter(p => p.lat && p.lng);
        const bounds = L.latLngBounds(validPlots.map(p => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    };

    updateMarkers();
  }, [plots, selectedId, onSelectPlot]);

  return <div ref={mapRef} className="w-full h-full rounded-lg" />;
}

// ─── Extract price/area from notes text ──────────────────────
function extractPriceFromNotes(notes: string): number {
  const m = notes.match(/(?:precio|price|pris)?[:\s]*(?:€\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:€|euros?|EUR)/i)
    || notes.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(?:€|euros?)/i)
    || notes.match(/€\s*(\d{1,3}(?:[.,]\d{3})*)/i);
  return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : 0;
}

function extractAreaFromNotes(notes: string): number {
  const m = notes.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(?:m2|m²|sqm|metros?)/i);
  return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : 0;
}

function enrichPlot<T extends { price: number; area: number; notes: string }>(plot: T): T {
  let { price, area, notes } = plot;
  if ((!price || price === 0) && notes) {
    const extracted = extractPriceFromNotes(notes);
    if (extracted) price = extracted;
  }
  if ((!area || area === 0) && notes) {
    const extracted = extractAreaFromNotes(notes);
    if (extracted) area = extracted;
  }
  return { ...plot, price, area };
}

// ─── Helper to sync plots to Supabase ─────────────────────────
async function syncToSupabase(plots: LandPlot | LandPlot[]): Promise<LandPlot[]> {
  try {
    const res = await fetch('/api/plots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Array.isArray(plots) ? plots : [plots]),
    });
    const data = await res.json();
    if (data.plots) {
      return data.plots.map((p: any) => ({
        id: p.id,
        plotNumber: p.plot_number,
        area: p.area,
        price: p.price,
        location: p.location,
        municipality: p.municipality,
        zoning: p.zoning,
        water: p.water,
        electricity: p.electricity,
        slope: p.slope,
        roadAccess: p.road_access,
        notes: p.notes,
        lat: p.lat,
        lng: p.lng,
        source: p.source,
      }));
    }
  } catch (e) {
    console.error('Failed to sync to Supabase:', e);
  }
  return [];
}

async function deleteFromSupabase(id: string) {
  try {
    await fetch('/api/plots', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  } catch (e) {
    console.error('Failed to delete from Supabase:', e);
  }
}

export default function TomtebasePage() {
  const [plots, setPlots] = useState<LandPlot[]>(initialPlots);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "grid" | "list">("map");
  const [showFilters, setShowFilters] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedPlot, setSelectedPlot] = useState<LandPlot | null>(null);
  const [editPlot, setEditPlot] = useState<LandPlot | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import state
  const [importTab, setImportTab] = useState<"coordinates" | "csv" | "kml" | "google">("coordinates");
  const [importResult, setImportResult] = useState<{ count: number; error?: string } | null>(null);
  const [coordInput, setCoordInput] = useState("");
  const [googleUrl, setGoogleUrl] = useState("");

  // New plot form
  const [newPlot, setNewPlot] = useState({
    plotNumber: "", area: "", price: "", location: "", municipality: "Pinosos",
    zoning: "rustico" as Zoning, water: false, electricity: false, slope: "",
    roadAccess: false, notes: "", lat: "", lng: "",
  });

  // Filters
  const [filterMunicipality, setFilterMunicipality] = useState("Alle");
  const [filterZoning, setFilterZoning] = useState("alle");
  const [filterMinArea, setFilterMinArea] = useState("");
  const [filterMaxArea, setFilterMaxArea] = useState("");
  const [filterMinPrice, setFilterMinPrice] = useState("");
  const [filterMaxPrice, setFilterMaxPrice] = useState("");
  const [searchText, setSearchText] = useState("");

  // Load plots from Supabase on mount
  useEffect(() => {
    fetch('/api/plots')
      .then(res => res.json())
      .then(data => {
        if (data.plots && data.plots.length > 0) {
          const mapped = data.plots.map((p: any) => ({
            id: p.id,
            plotNumber: p.plot_number,
            area: p.area,
            price: p.price,
            location: p.location,
            municipality: p.municipality,
            zoning: p.zoning,
            water: p.water,
            electricity: p.electricity,
            slope: p.slope,
            roadAccess: p.road_access,
            notes: p.notes,
            lat: p.lat,
            lng: p.lng,
            source: p.source,
          }));
          setPlots(mapped);
        }
        setDbLoaded(true);
      })
      .catch(() => setDbLoaded(false));
  }, []);

  const handleSelectPlot = useCallback((plot: LandPlot) => {
    setSelectedPlot(plot);
  }, []);

  const filtered = plots.filter(p => {
    if (searchText && !p.plotNumber.toLowerCase().includes(searchText.toLowerCase()) &&
      !p.location.toLowerCase().includes(searchText.toLowerCase()) &&
      !p.municipality.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (filterMunicipality !== "Alle" && p.municipality !== filterMunicipality) return false;
    if (filterZoning !== "alle" && p.zoning !== filterZoning) return false;
    if (filterMinArea && p.area < parseInt(filterMinArea)) return false;
    if (filterMaxArea && p.area > parseInt(filterMaxArea)) return false;
    if (filterMinPrice && p.price < parseInt(filterMinPrice)) return false;
    if (filterMaxPrice && p.price > parseInt(filterMaxPrice)) return false;
    return true;
  });

  const stats = {
    total: plots.length,
    totalArea: plots.reduce((s, p) => s + p.area, 0),
    avgPriceM2: plots.length > 0 ? Math.round(plots.reduce((s, p) => s + (p.price / (p.area || 1)), 0) / plots.length) : 0,
    withCoords: plots.filter(p => p.lat && p.lng).length,
  };

  const handleAddPlot = () => {
    const plot: LandPlot = enrichPlot({
      id: `T-${Date.now()}`,
      plotNumber: newPlot.plotNumber || `TOMT-${Date.now().toString(36).toUpperCase()}`,
      area: parseInt(newPlot.area) || 0,
      price: parseInt(newPlot.price) || 0,
      location: newPlot.location,
      municipality: newPlot.municipality,
      zoning: newPlot.zoning,
      water: newPlot.water,
      electricity: newPlot.electricity,
      slope: newPlot.slope,
      roadAccess: newPlot.roadAccess,
      notes: newPlot.notes,
      lat: parseFloat(newPlot.lat) || 0,
      lng: parseFloat(newPlot.lng) || 0,
      source: "manual" as const,
    });
    setPlots(prev => [plot, ...prev]);
    setShowNewModal(false);
    setNewPlot({ plotNumber: "", area: "", price: "", location: "", municipality: "Pinosos", zoning: "rustico", water: false, electricity: false, slope: "", roadAccess: false, notes: "", lat: "", lng: "" });
    // Sync to Supabase and update with server-generated ID
    syncToSupabase(plot).then(saved => {
      if (saved.length > 0) {
        setPlots(prev => prev.map(p => p.id === plot.id ? saved[0] : p));
      }
    });
  };

  const handleDeletePlot = (id: string) => {
    setPlots(prev => prev.filter(p => p.id !== id));
    if (selectedPlot?.id === id) setSelectedPlot(null);
    deleteFromSupabase(id);
  };

  const handleSaveEdit = () => {
    if (!editPlot) return;
    const enriched = enrichPlot(editPlot);
    setPlots(prev => prev.map(p => p.id === enriched.id ? enriched : p));
    setEditPlot(null);
    if (selectedPlot?.id === enriched.id) setSelectedPlot(enriched);
    syncToSupabase(enriched);
  };

  // Import coordinates (one per line: lat,lng or lat,lng,name)
  const handleCoordsImport = () => {
    const lines = coordInput.trim().split("\n").filter(Boolean);
    const imported: LandPlot[] = [];
    for (const line of lines) {
      const parts = line.split(/[,;\t]+/).map(s => s.trim());
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (isNaN(lat) || isNaN(lng)) continue;
      imported.push({
        id: `COORD-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        plotNumber: parts[2] || `PUNKT-${imported.length + 1}`,
        lat, lng,
        area: 0, price: 0, location: parts[2] || "", municipality: "",
        zoning: "rustico", water: false, electricity: false, slope: "",
        roadAccess: false, notes: "", source: "manual",
      });
    }
    if (imported.length > 0) {
      setPlots(prev => [...imported, ...prev]);
      setImportResult({ count: imported.length });
      setCoordInput("");
      // Sync to Supabase and update with server IDs
      syncToSupabase(imported).then(saved => {
        if (saved.length > 0) {
          setPlots(prev => {
            const importedIds = new Set(imported.map(p => p.id));
            const withoutImported = prev.filter(p => !importedIds.has(p.id));
            return [...saved, ...withoutImported];
          });
        }
      });
    } else {
      setImportResult({ count: 0, error: "Ingen gyldige koordinater funnet. Format: lat,lng per linje" });
    }
  };

  // Import from Google Maps URL
  const handleGoogleImport = () => {
    const coords = extractGoogleMapsCoords(googleUrl);
    if (!coords) {
      setImportResult({ count: 0, error: "Kunne ikke hente koordinater fra URL-en" });
      return;
    }
    const plot: LandPlot = {
      id: `GMAP-${Date.now()}`,
      plotNumber: `GMAP-${Date.now().toString(36).toUpperCase()}`,
      lat: coords.lat, lng: coords.lng,
      area: 0, price: 0, location: "", municipality: "",
      zoning: "rustico", water: false, electricity: false, slope: "",
      roadAccess: false, notes: `Importert fra Google Maps`, source: "google-maps",
    };
    setPlots(prev => [plot, ...prev]);
    setImportResult({ count: 1 });
    setGoogleUrl("");
    // Sync to Supabase and update with server ID
    syncToSupabase(plot).then(saved => {
      if (saved.length > 0) {
        setPlots(prev => prev.map(p => p.id === plot.id ? saved[0] : p));
      }
    });
  };

  // Import file (CSV, KML, KMZ)
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        let parsed: Partial<LandPlot>[] = [];

        if (file.name.endsWith(".kml") || file.name.endsWith(".xml")) {
          parsed = parseKML(text);
        } else if (file.name.endsWith(".csv") || file.name.endsWith(".tsv") || file.name.endsWith(".txt")) {
          parsed = parseCSVPlots(text);
        } else {
          // Try KML first, then CSV
          try { parsed = parseKML(text); } catch { parsed = parseCSVPlots(text); }
        }

        if (parsed.length === 0) throw new Error("Ingen tomter funnet i filen");

        const newPlots: LandPlot[] = parsed.map((p, i) => enrichPlot({
          id: `IMP-${Date.now()}-${i}`,
          plotNumber: p.plotNumber || `IMP-${i + 1}`,
          area: p.area || 0,
          price: p.price || 0,
          location: p.location || "",
          municipality: p.municipality || "",
          zoning: p.zoning || "rustico",
          water: p.water || false,
          electricity: p.electricity || false,
          slope: p.slope || "",
          roadAccess: p.roadAccess || false,
          notes: p.notes || "",
          lat: p.lat || 0,
          lng: p.lng || 0,
          source: p.source || "csv",
        }));

        setPlots(prev => [...newPlots, ...prev]);
        setImportResult({ count: newPlots.length });
        // Sync to Supabase and update with server IDs
        syncToSupabase(newPlots).then(saved => {
          if (saved.length > 0) {
            setPlots(prev => {
              const importedIds = new Set(newPlots.map(p => p.id));
              const withoutImported = prev.filter(p => !importedIds.has(p.id));
              return [...saved, ...withoutImported];
            });
          }
        });
      } catch (err) {
        setImportResult({ count: 0, error: err instanceof Error ? err.message : "Feil ved parsing" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Tomtebase</h1>
          <p className="text-sm text-slate-400">{filtered.length} tomter · {stats.totalArea.toLocaleString("nb-NO")} m² totalt · {stats.withCoords} med koordinater</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowImportModal(true); setImportResult(null); }}>
            <Upload size={14} className="mr-1.5" />Importer
          </Button>
          <Button size="sm" onClick={() => setShowNewModal(true)}>
            <Plus size={14} className="mr-1.5" />Ny tomt
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Totalt tomter", value: stats.total, color: "text-white" },
          { label: "Totalt areal", value: `${(stats.totalArea / 10000).toFixed(1)} ha`, color: "text-emerald-400" },
          { label: "Snitt €/m²", value: `€${stats.avgPriceM2}`, color: "text-cyan-400" },
          { label: "Med GPS", value: stats.withCoords, color: "text-amber-400" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* View mode + search + filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input placeholder="Søk tomter..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
                <Filter size={14} className="mr-1" />{showFilters ? "Skjul" : "Filter"}
              </Button>
              <div className="flex border border-slate-600 rounded-lg overflow-hidden">
                {[
                  { mode: "map" as const, icon: Navigation, label: "Kart" },
                  { mode: "grid" as const, icon: Grid3X3, label: "Rutenett" },
                  { mode: "list" as const, icon: List, label: "Liste" },
                ].map(v => (
                  <button key={v.mode} onClick={() => setViewMode(v.mode)} title={v.label}
                    className={`p-2 ${viewMode === v.mode ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
                    <v.icon size={16} />
                  </button>
                ))}
              </div>
              {/* Zoning legend */}
              <div className="flex items-center gap-2 ml-2">
                {zonings.map(z => (
                  <button key={z} onClick={() => setFilterZoning(filterZoning === z ? "alle" : z)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${filterZoning === z ? zoningConfig[z].className + " ring-1 ring-white/20" : "text-slate-400 hover:text-slate-200"}`}>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: zoningConfig[z].color }} />
                    {zoningConfig[z].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-700">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Kommune</label>
                <select value={filterMunicipality} onChange={e => setFilterMunicipality(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                  {municipalities.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Min areal (m²)</label>
                <Input type="number" value={filterMinArea} onChange={e => setFilterMinArea(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Maks areal (m²)</label>
                <Input type="number" value={filterMaxArea} onChange={e => setFilterMaxArea(e.target.value)} placeholder="100000" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Prisrange (€)</label>
                <div className="flex gap-1">
                  <Input type="number" value={filterMinPrice} onChange={e => setFilterMinPrice(e.target.value)} placeholder="Min" />
                  <Input type="number" value={filterMaxPrice} onChange={e => setFilterMaxPrice(e.target.value)} placeholder="Maks" />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========== MAP VIEW ========== */}
      {viewMode === "map" && (
        <div className="flex gap-4" style={{ height: "calc(100vh - 380px)", minHeight: "500px" }}>
          {/* Map */}
          <div className="flex-1 rounded-xl overflow-hidden border border-slate-700 relative" style={{ zIndex: 1 }}>
            <LeafletMap
              plots={filtered}
              selectedId={selectedPlot?.id || null}
              onSelectPlot={handleSelectPlot}
              center={[38.4, -0.9]}
              zoom={10}
            />
          </div>

          {/* Side panel */}
          <div className="w-80 flex-shrink-0 overflow-y-auto space-y-2">
            {selectedPlot ? (
              <Card className="border-cyan-500/30">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-white text-lg">{selectedPlot.plotNumber}</h3>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin size={11} />{selectedPlot.location || selectedPlot.municipality}
                      </p>
                    </div>
                    <button onClick={() => setSelectedPlot(null)} className="text-slate-400 hover:text-white"><X size={16} /></button>
                  </div>

                  <Badge className={zoningConfig[selectedPlot.zoning].className + " mb-3"}>{zoningConfig[selectedPlot.zoning].label}</Badge>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-slate-900/50 rounded p-2 text-center">
                      <p className="text-lg font-bold text-white">{selectedPlot.area.toLocaleString("nb-NO")}</p>
                      <p className="text-xs text-slate-400">m²</p>
                    </div>
                    <div className="bg-slate-900/50 rounded p-2 text-center">
                      <p className="text-lg font-bold text-emerald-400">€{selectedPlot.price.toLocaleString("nb-NO")}</p>
                      <p className="text-xs text-slate-400">Pris</p>
                    </div>
                  </div>

                  {selectedPlot.area > 0 && selectedPlot.price > 0 && (
                    <p className="text-xs text-slate-400 mb-3">€{(selectedPlot.price / selectedPlot.area).toFixed(2)}/m²</p>
                  )}

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {selectedPlot.water && <Badge variant="outline" className="text-[10px]"><Droplets size={10} className="mr-1" />Vann</Badge>}
                    {selectedPlot.electricity && <Badge variant="outline" className="text-[10px]"><Zap size={10} className="mr-1" />Strøm</Badge>}
                    {selectedPlot.roadAccess && <Badge variant="outline" className="text-[10px]">Veiadgang</Badge>}
                    {selectedPlot.slope && <Badge variant="outline" className="text-[10px]"><Mountain size={10} className="mr-1" />{selectedPlot.slope}</Badge>}
                  </div>

                  {selectedPlot.notes && <p className="text-xs text-slate-300 mb-3">{selectedPlot.notes}</p>}

                  <div className="text-[10px] text-slate-500 mb-3">
                    GPS: {selectedPlot.lat.toFixed(6)}, {selectedPlot.lng.toFixed(6)}
                    {selectedPlot.source && selectedPlot.source !== "manual" && ` · Kilde: ${selectedPlot.source}`}
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditPlot({ ...selectedPlot })}>
                      <Pencil size={12} className="mr-1" />Rediger
                    </Button>
                    <Button size="sm" variant="outline" onClick={() =>
                      window.open(`https://www.google.com/maps?q=${selectedPlot.lat},${selectedPlot.lng}`, "_blank")}>
                      <ExternalLink size={12} />
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-400 hover:text-red-300 border-red-500/30"
                      onClick={() => handleDeletePlot(selectedPlot.id)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-8">
                <Navigation size={32} className="text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Klikk på en markør i kartet</p>
                <p className="text-xs text-slate-500">for å se detaljer</p>
              </div>
            )}

            {/* Plot list in sidebar */}
            <div className="space-y-1.5">
              {filtered.map(plot => (
                <button key={plot.id} onClick={() => handleSelectPlot(plot)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                    selectedPlot?.id === plot.id ? "border-cyan-500/50 bg-slate-800" : "border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60"
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white truncate">{plot.plotNumber}</span>
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: zoningConfig[plot.zoning].color }} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400 truncate">{plot.location || plot.municipality}</span>
                    <span className="text-xs text-emerald-400 flex-shrink-0">€{plot.price.toLocaleString("nb-NO")}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== GRID VIEW ========== */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(plot => (
            <Card key={plot.id} className="hover:border-slate-500 transition-all cursor-pointer" onClick={() => { setSelectedPlot(plot); setViewMode("map"); }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-white">{plot.plotNumber}</h3>
                    <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin size={11} />{plot.location || plot.municipality}</p>
                  </div>
                  <Badge className={zoningConfig[plot.zoning].className + " text-[10px]"}>{zoningConfig[plot.zoning].label}</Badge>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-bold text-emerald-400">€{plot.price.toLocaleString("nb-NO")}</span>
                  <span className="text-sm text-slate-300">{plot.area.toLocaleString("nb-NO")} m²</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {plot.water && <Badge variant="outline" className="text-[10px]"><Droplets size={10} className="mr-1" />Vann</Badge>}
                  {plot.electricity && <Badge variant="outline" className="text-[10px]"><Zap size={10} className="mr-1" />Strøm</Badge>}
                  {plot.roadAccess && <Badge variant="outline" className="text-[10px]">Vei</Badge>}
                  {plot.lat > 0 && <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30"><Navigation size={10} className="mr-1" />GPS</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ========== LIST VIEW ========== */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs text-slate-400">
                  <th className="p-3">Tomt</th>
                  <th className="p-3">Sted</th>
                  <th className="p-3">Regulering</th>
                  <th className="p-3 text-right">Areal</th>
                  <th className="p-3 text-right">Pris</th>
                  <th className="p-3 text-center">Infrastruktur</th>
                  <th className="p-3 text-center">GPS</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(plot => (
                  <tr key={plot.id} className="border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer"
                    onClick={() => { setSelectedPlot(plot); setViewMode("map"); }}>
                    <td className="p-3 font-medium text-white">{plot.plotNumber}</td>
                    <td className="p-3 text-slate-300">{plot.location || plot.municipality}</td>
                    <td className="p-3"><Badge className={zoningConfig[plot.zoning].className + " text-[10px]"}>{zoningConfig[plot.zoning].label}</Badge></td>
                    <td className="p-3 text-right text-slate-300">{plot.area.toLocaleString("nb-NO")} m²</td>
                    <td className="p-3 text-right text-emerald-400 font-medium">€{plot.price.toLocaleString("nb-NO")}</td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-1">
                        {plot.water && <Droplets size={14} className="text-blue-400" />}
                        {plot.electricity && <Zap size={14} className="text-yellow-400" />}
                      </div>
                    </td>
                    <td className="p-3 text-center">{plot.lat > 0 ? <Navigation size={14} className="text-cyan-400 mx-auto" /> : <span className="text-slate-600">—</span>}</td>
                    <td className="p-3">
                      <button onClick={e => { e.stopPropagation(); handleDeletePlot(plot.id); }} className="text-slate-500 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ========== NEW PLOT MODAL ========== */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4" style={{ zIndex: 9999 }} onClick={() => setShowNewModal(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Ny tomt</h2>
              <button onClick={() => setShowNewModal(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-slate-400 mb-1 block">Tomtnummer</label><Input placeholder="PIN-2024-007" value={newPlot.plotNumber} onChange={e => setNewPlot({ ...newPlot, plotNumber: e.target.value })} /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Beliggenhet</label><Input placeholder="Partida La Solana" value={newPlot.location} onChange={e => setNewPlot({ ...newPlot, location: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="text-xs text-slate-400 mb-1 block">Kommune</label>
                  <select value={newPlot.municipality} onChange={e => setNewPlot({ ...newPlot, municipality: e.target.value })}
                    className="w-full h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100">
                    {municipalities.filter(m => m !== "Alle").map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 mb-1 block">Regulering</label>
                  <select value={newPlot.zoning} onChange={e => setNewPlot({ ...newPlot, zoning: e.target.value as Zoning })}
                    className="w-full h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100">
                    {zonings.map(z => <option key={z} value={z}>{zoningConfig[z].label}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 mb-1 block">Helning</label><Input placeholder="Flat (0-2%)" value={newPlot.slope} onChange={e => setNewPlot({ ...newPlot, slope: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-slate-400 mb-1 block">Areal (m²)</label><Input type="number" placeholder="12500" value={newPlot.area} onChange={e => setNewPlot({ ...newPlot, area: e.target.value })} /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Pris (€)</label><Input type="number" placeholder="45000" value={newPlot.price} onChange={e => setNewPlot({ ...newPlot, price: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-slate-400 mb-1 block">Breddegrad (lat)</label><Input type="number" step="0.000001" placeholder="38.4013" value={newPlot.lat} onChange={e => setNewPlot({ ...newPlot, lat: e.target.value })} /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Lengdegrad (lng)</label><Input type="number" step="0.000001" placeholder="-1.0411" value={newPlot.lng} onChange={e => setNewPlot({ ...newPlot, lng: e.target.value })} /></div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer"><input type="checkbox" checked={newPlot.water} onChange={e => setNewPlot({ ...newPlot, water: e.target.checked })} className="w-4 h-4" /><Droplets size={14} className="text-blue-400" />Vann</label>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer"><input type="checkbox" checked={newPlot.electricity} onChange={e => setNewPlot({ ...newPlot, electricity: e.target.checked })} className="w-4 h-4" /><Zap size={14} className="text-yellow-400" />Strøm</label>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer"><input type="checkbox" checked={newPlot.roadAccess} onChange={e => setNewPlot({ ...newPlot, roadAccess: e.target.checked })} className="w-4 h-4" />Veiadgang</label>
              </div>
              <div><label className="text-xs text-slate-400 mb-1 block">Notater</label>
                <textarea className="w-full h-20 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                  value={newPlot.notes} onChange={e => setNewPlot({ ...newPlot, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-700">
              <Button variant="outline" onClick={() => setShowNewModal(false)}>Avbryt</Button>
              <Button onClick={handleAddPlot}><Plus size={14} className="mr-1.5" />Legg til</Button>
            </div>
          </div>
        </div>
      )}

      {/* ========== IMPORT MODAL ========== */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4" style={{ zIndex: 9999 }} onClick={() => setShowImportModal(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Importer tomter</h2>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            <div className="flex border-b border-slate-700">
              {[
                { key: "coordinates" as const, label: "Koordinater" },
                { key: "google" as const, label: "Google Maps" },
                { key: "kml" as const, label: "KML/XML" },
                { key: "csv" as const, label: "CSV" },
              ].map(tab => (
                <button key={tab.key} onClick={() => { setImportTab(tab.key); setImportResult(null); }}
                  className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
                    importTab === tab.key ? "text-cyan-400 border-b-2 border-cyan-400 bg-slate-700/30" : "text-slate-400 hover:text-slate-200"
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-4">
              {importTab === "coordinates" && (
                <>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Koordinater (én per linje: lat,lng eller lat,lng,navn)</label>
                    <textarea className="w-full h-32 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 font-mono focus:border-cyan-500 focus:outline-none"
                      placeholder={"38.4013,-1.0411,Tomt A\n38.4368,-0.8412,Tomt B\n38.4769,-0.7917"}
                      value={coordInput} onChange={e => setCoordInput(e.target.value)} />
                  </div>
                  <Button onClick={handleCoordsImport} disabled={!coordInput.trim()} className="w-full">
                    <Navigation size={14} className="mr-1.5" />Importer koordinater
                  </Button>
                </>
              )}

              {importTab === "google" && (
                <>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Google Maps URL</label>
                    <Input placeholder="https://www.google.com/maps/@38.4,-1.0,12z/..." value={googleUrl} onChange={e => setGoogleUrl(e.target.value)} />
                    <p className="text-xs text-slate-500 mt-1">Kopier URL fra Google Maps for å legge til et punkt</p>
                  </div>
                  <Button onClick={handleGoogleImport} disabled={!googleUrl.trim()} className="w-full">
                    <MapPin size={14} className="mr-1.5" />Legg til fra Google Maps
                  </Button>
                  <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                    <p className="text-xs text-slate-400">For å importere hele Google Maps-kartet ditt med alle pins:</p>
                    <ol className="text-xs text-slate-400 mt-2 space-y-1 list-decimal list-inside">
                      <li>Åpne Google My Maps</li>
                      <li>Klikk de tre prikkene (⋮) → <strong>Eksporter til KML/KMZ</strong></li>
                      <li>Last ned KML-filen</li>
                      <li>Gå til <strong>KML/XML</strong>-fanen her og last opp filen</li>
                    </ol>
                  </div>
                </>
              )}

              {importTab === "kml" && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Last opp KML, KMZ, eller XML-fil</label>
                  <input type="file" ref={fileInputRef} accept=".kml,.kmz,.xml" onChange={handleFileImport} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full h-32 border-2 border-dashed border-slate-600 rounded-lg hover:border-cyan-500/50 transition-colors flex flex-col items-center justify-center gap-2">
                    <Upload size={24} className="text-slate-500" />
                    <span className="text-sm text-slate-400">Klikk for å velge fil</span>
                    <span className="text-xs text-slate-500">KML fra Google My Maps, XML, eller lignende</span>
                  </button>
                </div>
              )}

              {importTab === "csv" && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Last opp CSV-fil med tomter</label>
                  <input type="file" ref={fileInputRef} accept=".csv,.tsv,.txt" onChange={handleFileImport} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full h-32 border-2 border-dashed border-slate-600 rounded-lg hover:border-cyan-500/50 transition-colors flex flex-col items-center justify-center gap-2">
                    <FileText size={24} className="text-slate-500" />
                    <span className="text-sm text-slate-400">Klikk for å velge CSV-fil</span>
                  </button>
                  <p className="text-xs text-slate-500 mt-2">Forventet: lat, lng, name, area, price, municipality, zoning</p>
                </div>
              )}

              {importResult && (
                <div className={`p-3 rounded-lg border ${importResult.error
                  ? "bg-red-500/10 border-red-500/30 text-red-300"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                } text-sm`}>
                  {importResult.error ? importResult.error : `Importerte ${importResult.count} tomter!`}
                </div>
              )}
            </div>

            <div className="flex justify-end p-5 border-t border-slate-700">
              <Button variant="outline" onClick={() => setShowImportModal(false)}>Lukk</Button>
            </div>
          </div>
        </div>
      )}

      {/* ========== EDIT MODAL ========== */}
      {editPlot && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4" style={{ zIndex: 9999 }} onClick={() => setEditPlot(null)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Rediger {editPlot.plotNumber}</h2>
              <button onClick={() => setEditPlot(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-slate-400 mb-1 block">Tomtnummer</label><Input value={editPlot.plotNumber} onChange={e => setEditPlot({ ...editPlot, plotNumber: e.target.value })} /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Beliggenhet</label><Input value={editPlot.location} onChange={e => setEditPlot({ ...editPlot, location: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="text-xs text-slate-400 mb-1 block">Kommune</label>
                  <select value={editPlot.municipality} onChange={e => setEditPlot({ ...editPlot, municipality: e.target.value })}
                    className="w-full h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100">
                    {municipalities.filter(m => m !== "Alle").map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 mb-1 block">Regulering</label>
                  <select value={editPlot.zoning} onChange={e => setEditPlot({ ...editPlot, zoning: e.target.value as Zoning })}
                    className="w-full h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100">
                    {zonings.map(z => <option key={z} value={z}>{zoningConfig[z].label}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 mb-1 block">Helning</label><Input value={editPlot.slope} onChange={e => setEditPlot({ ...editPlot, slope: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-slate-400 mb-1 block">Areal (m²)</label><Input type="number" value={editPlot.area} onChange={e => setEditPlot({ ...editPlot, area: parseInt(e.target.value) || 0 })} /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Pris (€)</label><Input type="number" value={editPlot.price} onChange={e => setEditPlot({ ...editPlot, price: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-slate-400 mb-1 block">Breddegrad</label><Input type="number" step="0.000001" value={editPlot.lat} onChange={e => setEditPlot({ ...editPlot, lat: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Lengdegrad</label><Input type="number" step="0.000001" value={editPlot.lng} onChange={e => setEditPlot({ ...editPlot, lng: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer"><input type="checkbox" checked={editPlot.water} onChange={e => setEditPlot({ ...editPlot, water: e.target.checked })} className="w-4 h-4" />Vann</label>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer"><input type="checkbox" checked={editPlot.electricity} onChange={e => setEditPlot({ ...editPlot, electricity: e.target.checked })} className="w-4 h-4" />Strøm</label>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer"><input type="checkbox" checked={editPlot.roadAccess} onChange={e => setEditPlot({ ...editPlot, roadAccess: e.target.checked })} className="w-4 h-4" />Veiadgang</label>
              </div>
              <div><label className="text-xs text-slate-400 mb-1 block">Notater</label>
                <textarea className="w-full h-20 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                  value={editPlot.notes} onChange={e => setEditPlot({ ...editPlot, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-700">
              <Button variant="outline" onClick={() => setEditPlot(null)}>Avbryt</Button>
              <Button onClick={handleSaveEdit}>Lagre endringer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
