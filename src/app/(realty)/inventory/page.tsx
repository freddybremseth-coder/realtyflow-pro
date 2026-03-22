"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Upload, MapPin, Bed, Bath, Maximize,
  Heart, Eye, Building2, Filter, Grid3X3, List,
  Plus, X, Globe, FileText, Loader2, Link2,
  Euro, Pencil, Trash2, ExternalLink, RefreshCw,
} from "lucide-react";

interface Property {
  id: string;
  title: string;
  description: string;
  location: string;
  price: number;
  type: string;
  bedrooms: number;
  bathrooms: number;
  area: number;
  plotArea: number;
  status: "TILGJENGELIG" | "RESERVERT" | "SOLGT";
  featured: boolean;
  views: number;
  imageColor: string;
  imageUrl?: string;
  externalUrl?: string;
  source: "manual" | "csv" | "xml" | "redsp";
  yearBuilt?: number;
  pool?: boolean;
  garage?: boolean;
  energyRating?: string;
  ref?: string;
}

const INITIAL_PROPERTIES: Property[] = [
  {
    id: "P001", title: "Moderne villa med havutsikt", description: "Spektakulær villa med panoramautsikt over Middelhavet. Moderne design med åpen planløsning.",
    location: "Altea, Costa Blanca", price: 485000, type: "Villa", bedrooms: 4, bathrooms: 3, area: 220, plotArea: 800,
    status: "TILGJENGELIG", featured: true, views: 342, imageColor: "from-blue-600/30 to-cyan-600/20", source: "manual", yearBuilt: 2021, pool: true, garage: true, energyRating: "B",
  },
  {
    id: "P002", title: "Lys toppleilighet med terrasse", description: "Nydelig toppleilighet med stor terrasse og havglimt. Sentralt beliggende.",
    location: "Benidorm, Costa Blanca", price: 189000, type: "Leilighet", bedrooms: 2, bathrooms: 1, area: 85, plotArea: 0,
    status: "TILGJENGELIG", featured: false, views: 218, imageColor: "from-amber-600/30 to-orange-600/20", source: "manual", yearBuilt: 2018, energyRating: "C",
  },
  {
    id: "P003", title: "Eksklusiv penthouse med infinity-basseng", description: "Luksus penthouse på toppen av eksklusivt kompleks med privat basseng på takterrassen.",
    location: "Alicante sentrum", price: 620000, type: "Penthouse", bedrooms: 3, bathrooms: 2, area: 165, plotArea: 0,
    status: "RESERVERT", featured: true, views: 567, imageColor: "from-purple-600/30 to-pink-600/20", source: "manual", yearBuilt: 2023, pool: true, energyRating: "A",
  },
  {
    id: "P004", title: "Sjarmerende rekkehus nær strand", description: "Hyggelig rekkehus kun 5 minutters gange fra stranden. Felles bassengområde.",
    location: "Torrevieja, Costa Blanca", price: 215000, type: "Rekkehus", bedrooms: 3, bathrooms: 2, area: 120, plotArea: 60,
    status: "TILGJENGELIG", featured: false, views: 156, imageColor: "from-emerald-600/30 to-teal-600/20", source: "manual", yearBuilt: 2015, pool: true,
  },
  {
    id: "P005", title: "Luksusvilla med privat basseng", description: "Eksklusiv villa med stort privat basseng, tropisk hage og fantastisk utsikt.",
    location: "Javea, Costa Blanca", price: 750000, type: "Villa", bedrooms: 5, bathrooms: 4, area: 350, plotArea: 1200,
    status: "TILGJENGELIG", featured: true, views: 489, imageColor: "from-rose-600/30 to-red-600/20", source: "manual", yearBuilt: 2022, pool: true, garage: true, energyRating: "A",
  },
  {
    id: "P006", title: "Koselig bungalow i rolig område", description: "Sjarmerende bungalow i rolig nabolag med felles basseng og hage.",
    location: "La Nucia, Costa Blanca", price: 175000, type: "Bungalow", bedrooms: 2, bathrooms: 1, area: 75, plotArea: 40,
    status: "SOLGT", featured: false, views: 98, imageColor: "from-indigo-600/30 to-blue-600/20", source: "manual", yearBuilt: 2010,
  },
];

const propertyTypes = ["Alle", "Villa", "Leilighet", "Penthouse", "Rekkehus", "Bungalow", "Finca", "Duplex", "Byggetomt"];
const bedroomOptions = ["Alle", "1+", "2+", "3+", "4+", "5+"];
const priceRanges = ["Alle", "Under €200K", "€200K - €400K", "€400K - €600K", "Over €600K"];
const gradients = [
  "from-blue-600/30 to-cyan-600/20",
  "from-amber-600/30 to-orange-600/20",
  "from-purple-600/30 to-pink-600/20",
  "from-emerald-600/30 to-teal-600/20",
  "from-rose-600/30 to-red-600/20",
  "from-indigo-600/30 to-blue-600/20",
  "from-cyan-600/30 to-sky-600/20",
  "from-lime-600/30 to-green-600/20",
];

function statusVariant(status: string) {
  switch (status) {
    case "TILGJENGELIG": return "success" as const;
    case "RESERVERT": return "warning" as const;
    case "SOLGT": return "destructive" as const;
    default: return "default" as const;
  }
}

function sourceLabel(source: string) {
  switch (source) {
    case "redsp": return "RedSP";
    case "xml": return "XML";
    case "csv": return "CSV";
    default: return "Manuell";
  }
}

// Parse RedSP XML feed - matches actual RedSP v3 format:
// <root><property>...<title><no>...</no></title><surface_area><built>...</built></surface_area>...</property></root>
function parseRedSPXml(xmlText: string): Property[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("Ugyldig XML-format");

  const propertyNodes = doc.querySelectorAll("property");
  if (propertyNodes.length === 0) {
    throw new Error("Ingen eiendommer funnet i XML-feeden. Forventet <property>-elementer.");
  }

  const properties: Property[] = [];
  propertyNodes.forEach(node => {
    const prop = parseRedSPPropertyNode(node);
    if (prop) properties.push(prop);
  });

  return properties;
}

// Get direct text content of a child element (not nested text)
function getDirectChild(parent: Element, tagName: string): string {
  const el = parent.querySelector(`:scope > ${tagName}`);
  if (!el) return "";
  // If the element has child elements, don't return all nested text
  if (el.children.length > 0) return "";
  return el.textContent?.trim() || "";
}

// Get text from a nested multilingual element like <title><no>...</no></title>
function getMultilangText(parent: Element, tagName: string, lang: string = "no"): string {
  const container = parent.querySelector(`:scope > ${tagName}`);
  if (!container) return "";
  // Try preferred language first, then en, es, then any first child
  for (const tryLang of [lang, "en", "es"]) {
    const langEl = container.querySelector(`:scope > ${tryLang}`);
    if (langEl?.textContent?.trim()) return langEl.textContent.trim();
  }
  // Fallback: first child with text
  const firstChild = container.querySelector("*");
  return firstChild?.textContent?.trim() || container.textContent?.trim() || "";
}

function parseRedSPPropertyNode(node: Element): Property | null {
  // Title: <title><no>Norwegian title</no></title>
  const title = getMultilangText(node, "title", "no") || "Eiendom uten tittel";

  // Description: <desc><no>Norwegian description</no></desc>
  const description = getMultilangText(node, "desc", "no") || "";

  // Price: <price>485000</price>
  const priceText = getDirectChild(node, "price");
  const price = parseInt(priceText.replace(/[^\d]/g, "")) || 0;

  // Location: <town>Jávea Xàbia</town>, <province>Alicante</province>, <costa>Costa Blanca North</costa>
  const town = getDirectChild(node, "town");
  const province = getDirectChild(node, "province");
  const costa = getDirectChild(node, "costa");
  const locationDetail = getDirectChild(node, "location_detail");
  const location = [town, locationDetail || costa || province].filter(Boolean).join(", ") || "Ukjent";

  // Type: <type>Villa</type>
  const typeRaw = getDirectChild(node, "type");
  const typeMap: Record<string, string> = {
    "villa": "Villa", "chalet": "Villa", "apartment": "Leilighet", "apartamento": "Leilighet",
    "piso": "Leilighet", "flat": "Leilighet", "penthouse": "Penthouse", "atico": "Penthouse",
    "townhouse": "Rekkehus", "town house": "Rekkehus", "adosado": "Rekkehus",
    "semi-detached": "Rekkehus", "bungalow": "Bungalow", "finca": "Finca",
    "country house": "Finca", "duplex": "Duplex", "land": "Byggetomt", "plot": "Byggetomt",
    "terreno": "Byggetomt", "casa de campo": "Finca",
  };
  const type = typeMap[typeRaw.toLowerCase()] || typeRaw || "Villa";

  // Beds/baths: <beds>4</beds> <baths>3</baths>
  const bedrooms = parseInt(getDirectChild(node, "beds")) || 0;
  const bathrooms = parseInt(getDirectChild(node, "baths")) || 0;

  // Area: <surface_area><built>220</built><plot>800</plot></surface_area>
  const surfaceArea = node.querySelector(":scope > surface_area");
  const builtArea = surfaceArea?.querySelector(":scope > built")?.textContent?.trim() || "";
  const plotAreaText = surfaceArea?.querySelector(":scope > plot")?.textContent?.trim() || "";
  const area = parseInt(builtArea.replace(/[^\d]/g, "")) || 0;
  const plotArea = parseInt(plotAreaText.replace(/[^\d]/g, "")) || 0;

  // Ref: <ref>SP1521</ref>
  const ref = getDirectChild(node, "ref") || getDirectChild(node, "id") || "";

  // Images: <images><image>...<url>https://...</url></image>...</images>
  const imagesContainer = node.querySelector(":scope > images");
  let imageUrl = "";
  if (imagesContainer) {
    const firstImage = imagesContainer.querySelector(":scope > image");
    if (firstImage) {
      const imgUrl = firstImage.querySelector(":scope > url");
      imageUrl = imgUrl?.textContent?.trim() || firstImage.textContent?.trim() || "";
    }
  }

  // URL: <url><no>https://...</no></url> or <url>https://...</url>
  let externalUrl = getMultilangText(node, "url", "no") || getDirectChild(node, "url") || "";

  // Pool: <pool>1</pool>
  const poolVal = getDirectChild(node, "pool");
  const pool = ["1", "yes", "true", "si", "sí"].includes(poolVal.toLowerCase());

  // New build: <new_build>1</new_build>
  const newBuild = getDirectChild(node, "new_build") === "1";

  // Energy rating: <energy_rating><consumption>B</consumption></energy_rating>
  const energyNode = node.querySelector(":scope > energy_rating");
  const energyRating = energyNode?.querySelector(":scope > consumption")?.textContent?.trim() || "";

  // Location coordinates: <location><latitude>38.7</latitude><longitude>0.19</longitude></location>
  const locationNode = node.querySelector(":scope > location");
  const lat = locationNode?.querySelector(":scope > latitude")?.textContent?.trim() || "";
  const lng = locationNode?.querySelector(":scope > longitude")?.textContent?.trim() || "";

  // Distance to beach: <distance_to_beach_m>300</distance_to_beach_m>
  const beachDist = parseInt(getDirectChild(node, "distance_to_beach_m")) || undefined;

  // Tags/features
  const tagsContainer = node.querySelector(":scope > tags");
  const tags: string[] = [];
  if (tagsContainer) {
    tagsContainer.querySelectorAll(":scope > tag").forEach(t => {
      if (t.textContent?.trim()) tags.push(t.textContent.trim());
    });
  }

  return {
    id: `REDSP-${ref || Math.random().toString(36).substr(2, 8)}`,
    title,
    description: description.length > 300 ? description.substring(0, 300) + "..." : description,
    location,
    price,
    type,
    bedrooms,
    bathrooms,
    area,
    plotArea,
    status: "TILGJENGELIG",
    featured: newBuild || price > 500000,
    views: 0,
    imageColor: gradients[Math.floor(Math.random() * gradients.length)],
    imageUrl: imageUrl || undefined,
    externalUrl: externalUrl || undefined,
    source: "redsp",
    ref: ref || undefined,
    pool,
    energyRating: energyRating || undefined,
  };
}

// Parse CSV
function parseCsvProperties(csvText: string): Property[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV-filen må ha en header-rad og minst én data-rad");

  const headers = lines[0].split(/[,;\t]/).map(h => h.trim().toLowerCase().replace(/["']/g, ""));
  const properties: Property[] = [];

  const findCol = (...names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)));

  const titleIdx = findCol("title", "tittel", "titulo", "nombre", "name");
  const priceIdx = findCol("price", "pris", "precio");
  const locationIdx = findCol("location", "sted", "ciudad", "city", "town", "localidad");
  const typeIdx = findCol("type", "tipo", "eiendomstype");
  const bedroomsIdx = findCol("bedroom", "soverom", "dormitorio", "beds");
  const bathroomsIdx = findCol("bathroom", "bad", "baño", "baths");
  const areaIdx = findCol("area", "areal", "superficie", "m2", "size");
  const descIdx = findCol("description", "beskrivelse", "descripcion");

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(/[,;\t]/).map(v => v.trim().replace(/^["']|["']$/g, ""));
    if (vals.length < 2) continue;

    properties.push({
      id: `CSV-${i}-${Date.now()}`,
      title: (titleIdx >= 0 ? vals[titleIdx] : "") || `Eiendom ${i}`,
      description: descIdx >= 0 ? vals[descIdx] || "" : "",
      location: (locationIdx >= 0 ? vals[locationIdx] : "") || "Ukjent",
      price: parseInt((priceIdx >= 0 ? vals[priceIdx] : "0").replace(/[^\d]/g, "")) || 0,
      type: (typeIdx >= 0 ? vals[typeIdx] : "") || "Villa",
      bedrooms: parseInt(bedroomsIdx >= 0 ? vals[bedroomsIdx] : "0") || 0,
      bathrooms: parseInt(bathroomsIdx >= 0 ? vals[bathroomsIdx] : "0") || 0,
      area: parseInt((areaIdx >= 0 ? vals[areaIdx] : "0").replace(/[^\d]/g, "")) || 0,
      plotArea: 0,
      status: "TILGJENGELIG",
      featured: false,
      views: 0,
      imageColor: gradients[Math.floor(Math.random() * gradients.length)],
      source: "csv",
    });
  }

  return properties;
}

// Map a Supabase DB row (snake_case) to the page's Property interface (camelCase)
function dbRowToProperty(row: Record<string, unknown>): Property {
  return {
    id: String(row.id || ""),
    title: String(row.title || row.title_no || ""),
    description: String(row.description || row.description_no || ""),
    location: String(row.location || ""),
    price: Number(row.price) || 0,
    type: String(row.property_type || row.type || "Villa"),
    bedrooms: Number(row.bedrooms) || 0,
    bathrooms: Number(row.bathrooms) || 0,
    area: Number(row.built_area || row.area) || 0,
    plotArea: Number(row.plot_size || row.plotArea) || 0,
    status: (row.status as Property["status"]) || "TILGJENGELIG",
    featured: Boolean(row.featured),
    views: Number(row.views) || 0,
    imageColor: String(row.image_color || row.imageColor || gradients[Math.floor(Math.random() * gradients.length)]),
    imageUrl: (row.primary_image || row.imageUrl || undefined) as string | undefined,
    externalUrl: (row.external_url || row.externalUrl || undefined) as string | undefined,
    source: (row.source as Property["source"]) || "manual",
    yearBuilt: row.year_built != null ? Number(row.year_built) : (row.yearBuilt != null ? Number(row.yearBuilt) : undefined),
    pool: Boolean(row.pool),
    garage: Boolean(row.garage),
    energyRating: (row.energy_rating || row.energyRating || undefined) as string | undefined,
    ref: (row.ref || undefined) as string | undefined,
  };
}

// Map a Property object to Supabase DB row format for insert/update
function propertyToDbRow(p: Partial<Property> & { id?: string }) {
  const row: Record<string, unknown> = {};
  if (p.title !== undefined) { row.title = p.title; row.title_no = p.title; }
  if (p.description !== undefined) { row.description = p.description; row.description_no = p.description; }
  if (p.location !== undefined) row.location = p.location;
  if (p.price !== undefined) row.price = p.price;
  if (p.type !== undefined) row.property_type = p.type;
  if (p.bedrooms !== undefined) row.bedrooms = p.bedrooms;
  if (p.bathrooms !== undefined) row.bathrooms = p.bathrooms;
  if (p.area !== undefined) row.built_area = p.area;
  if (p.plotArea !== undefined) row.plot_size = p.plotArea;
  if (p.status !== undefined) row.status = p.status;
  if (p.featured !== undefined) row.featured = p.featured;
  if (p.views !== undefined) row.views = p.views;
  if (p.imageColor !== undefined) row.image_color = p.imageColor;
  if (p.imageUrl !== undefined) row.primary_image = p.imageUrl;
  if (p.externalUrl !== undefined) row.external_url = p.externalUrl;
  if (p.source !== undefined) row.source = p.source;
  if (p.yearBuilt !== undefined) row.year_built = p.yearBuilt;
  if (p.pool !== undefined) row.pool = p.pool;
  if (p.garage !== undefined) row.garage = p.garage;
  if (p.energyRating !== undefined) row.energy_rating = p.energyRating;
  if (p.ref !== undefined) row.ref = p.ref;
  return row;
}

// Fire-and-forget helper for API calls (errors logged but don't break UI)
async function apiSaveProperty(property: Property) {
  try {
    await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(propertyToDbRow(property)),
    });
  } catch (err) {
    console.error('Failed to save property to DB:', err);
  }
}

async function apiUpdateProperty(property: Property) {
  try {
    await fetch(`/api/properties?id=${encodeURIComponent(property.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(propertyToDbRow(property)),
    });
  } catch (err) {
    console.error('Failed to update property in DB:', err);
  }
}

async function apiDeleteProperty(id: string) {
  try {
    await fetch(`/api/properties?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.error('Failed to delete property from DB:', err);
  }
}

async function apiSaveProperties(properties: Property[]) {
  try {
    await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(properties.map(propertyToDbRow)),
    });
  } catch (err) {
    console.error('Failed to save properties to DB:', err);
  }
}

export default function InventoryPage() {
  const [properties, setProperties] = useState<Property[]>(INITIAL_PROPERTIES);
  const [dbLoaded, setDbLoaded] = useState(false);

  // Load properties from Supabase on mount
  useEffect(() => {
    fetch('/api/properties')
      .then(res => res.json())
      .then((data: Record<string, unknown>[] | { error: string }) => {
        if (Array.isArray(data) && data.length > 0) {
          setProperties(data.map(dbRowToProperty));
        }
        // If API returns empty array, keep INITIAL_PROPERTIES as fallback
        setDbLoaded(true);
      })
      .catch(() => {
        // On error, keep INITIAL_PROPERTIES as fallback
        setDbLoaded(false);
      });
  }, []);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("Alle");
  const [priceFilter, setPriceFilter] = useState("Alle");
  const [bedroomFilter, setBedroomFilter] = useState("Alle");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<Property | null>(null);
  const [showEditModal, setShowEditModal] = useState<Property | null>(null);

  // Import state
  const [importTab, setImportTab] = useState<"redsp" | "xml" | "csv">("redsp");
  const [redspUrl, setRedspUrl] = useState("https://xml.redsp.net/files/901/46721pms78l/21-3-25-all-extended.xml");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number; error?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add form
  const [addForm, setAddForm] = useState({
    title: "", description: "", location: "", price: "", type: "Villa",
    bedrooms: "3", bathrooms: "2", area: "", plotArea: "", externalUrl: "",
    yearBuilt: "", pool: false, garage: false, energyRating: "",
  });

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteProperty = (id: string) => {
    setProperties(prev => prev.filter(p => p.id !== id));
    if (showDetailModal?.id === id) setShowDetailModal(null);
    apiDeleteProperty(id);
  };

  const handleAddProperty = () => {
    const newProp: Property = {
      id: `M-${Date.now()}`,
      title: addForm.title || "Ny eiendom",
      description: addForm.description,
      location: addForm.location || "Ukjent",
      price: parseInt(addForm.price) || 0,
      type: addForm.type,
      bedrooms: parseInt(addForm.bedrooms) || 0,
      bathrooms: parseInt(addForm.bathrooms) || 0,
      area: parseInt(addForm.area) || 0,
      plotArea: parseInt(addForm.plotArea) || 0,
      status: "TILGJENGELIG",
      featured: false,
      views: 0,
      imageColor: gradients[Math.floor(Math.random() * gradients.length)],
      source: "manual",
      externalUrl: addForm.externalUrl || undefined,
      yearBuilt: parseInt(addForm.yearBuilt) || undefined,
      pool: addForm.pool,
      garage: addForm.garage,
      energyRating: addForm.energyRating || undefined,
    };
    setProperties(prev => [newProp, ...prev]);
    apiSaveProperty(newProp);
    setShowAddModal(false);
    setAddForm({
      title: "", description: "", location: "", price: "", type: "Villa",
      bedrooms: "3", bathrooms: "2", area: "", plotArea: "", externalUrl: "",
      yearBuilt: "", pool: false, garage: false, energyRating: "",
    });
  };

  // Import from RedSP XML URL
  const handleRedspImport = async () => {
    if (!redspUrl.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      // Fetch XML through our API proxy to avoid CORS
      const res = await fetch(`/api/properties/import?url=${encodeURIComponent(redspUrl.trim())}`);
      const text = await res.text();

      // Check if we got an error JSON back
      if (res.headers.get("content-type")?.includes("application/json")) {
        const err = JSON.parse(text);
        throw new Error(err.error || "Feil ved henting av XML");
      }

      if (!res.ok) throw new Error(`Serverfeil: ${res.status}`);

      const imported = parseRedSPXml(text);
      if (imported.length === 0) throw new Error("Ingen eiendommer funnet i XML-feeden");
      setProperties(prev => [...imported, ...prev]);
      apiSaveProperties(imported);
      setImportResult({ count: imported.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ukjent feil";
      setImportResult({ count: 0, error: msg });
    } finally {
      setImporting(false);
    }
  };

  // Import XML file
  const handleXmlFileImport = (file: File) => {
    setImporting(true);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const xmlText = e.target?.result as string;
        const imported = parseRedSPXml(xmlText);
        if (imported.length === 0) throw new Error("Ingen eiendommer funnet i XML-filen");
        imported.forEach(p => p.source = "xml");
        setProperties(prev => [...imported, ...prev]);
        apiSaveProperties(imported);
        setImportResult({ count: imported.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ukjent feil";
        setImportResult({ count: 0, error: msg });
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
  };

  // Import CSV file
  const handleCsvFileImport = (file: File) => {
    setImporting(true);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string;
        const imported = parseCsvProperties(csvText);
        if (imported.length === 0) throw new Error("Ingen eiendommer funnet i CSV-filen");
        setProperties(prev => [...imported, ...prev]);
        apiSaveProperties(imported);
        setImportResult({ count: imported.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ukjent feil";
        setImportResult({ count: 0, error: msg });
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (importTab === "csv") {
      handleCsvFileImport(file);
    } else {
      handleXmlFileImport(file);
    }
    e.target.value = "";
  };

  const handleSaveEdit = () => {
    if (!showEditModal) return;
    setProperties(prev => prev.map(p => p.id === showEditModal.id ? showEditModal : p));
    apiUpdateProperty(showEditModal);
    setShowEditModal(null);
  };

  const filtered = properties.filter((p) => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.location.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== "Alle" && p.type !== typeFilter) return false;
    if (bedroomFilter !== "Alle") {
      const min = parseInt(bedroomFilter);
      if (p.bedrooms < min) return false;
    }
    if (priceFilter !== "Alle") {
      if (priceFilter === "Under €200K" && p.price >= 200000) return false;
      if (priceFilter === "€200K - €400K" && (p.price < 200000 || p.price >= 400000)) return false;
      if (priceFilter === "€400K - €600K" && (p.price < 400000 || p.price >= 600000)) return false;
      if (priceFilter === "Over €600K" && p.price < 600000) return false;
    }
    return true;
  });

  const stats = {
    total: properties.length,
    available: properties.filter(p => p.status === "TILGJENGELIG").length,
    reserved: properties.filter(p => p.status === "RESERVERT").length,
    sold: properties.filter(p => p.status === "SOLGT").length,
    totalValue: properties.reduce((sum, p) => sum + p.price, 0),
    fromRedsp: properties.filter(p => p.source === "redsp").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Eiendomsportefølje</h1>
          <p className="text-sm text-slate-400 mt-1">
            {filtered.length} av {properties.length} eiendommer · Totalverdi: €{stats.totalValue.toLocaleString("nb-NO")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowImportModal(true); setImportResult(null); }}>
            <Upload size={14} className="mr-1.5" />
            Importer
          </Button>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus size={14} className="mr-1.5" />
            Legg til eiendom
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Totalt", value: stats.total, color: "text-slate-100" },
          { label: "Tilgjengelig", value: stats.available, color: "text-emerald-400" },
          { label: "Reservert", value: stats.reserved, color: "text-amber-400" },
          { label: "Solgt", value: stats.sold, color: "text-red-400" },
          { label: "Fra RedSP", value: stats.fromRedsp, color: "text-cyan-400" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input placeholder="Søk etter eiendommer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Filter size={14} className="text-slate-400" />
                <span className="text-xs text-slate-400">Filter:</span>
              </div>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-primary-500 focus:outline-none">
                {propertyTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={priceFilter} onChange={(e) => setPriceFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-primary-500 focus:outline-none">
                {priceRanges.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={bedroomFilter} onChange={(e) => setBedroomFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-primary-500 focus:outline-none">
                {bedroomOptions.map(b => <option key={b} value={b}>{b === "Alle" ? "Soverom" : `${b} soverom`}</option>)}
              </select>
              <div className="flex border border-slate-600 rounded-lg overflow-hidden ml-auto">
                <button onClick={() => setViewMode("grid")} className={`p-2 ${viewMode === "grid" ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
                  <Grid3X3 size={16} />
                </button>
                <button onClick={() => setViewMode("list")} className={`p-2 ${viewMode === "list" ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
                  <List size={16} />
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Property Grid */}
      <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" : "space-y-3"}>
        {filtered.map((property) => (
          <Card key={property.id} className="overflow-hidden hover:border-slate-500 transition-all group cursor-pointer"
            onClick={() => setShowDetailModal(property)}>
            {viewMode === "grid" ? (
              <>
                <div className={`relative h-48 bg-gradient-to-br ${property.imageColor} flex items-center justify-center`}>
                  {property.imageUrl ? (
                    <img src={property.imageUrl} alt={property.title} className="w-full h-full object-cover" />
                  ) : (
                    <Building2 size={48} className="text-slate-400/30" />
                  )}
                  {property.featured && (
                    <Badge className="absolute top-3 left-3 bg-amber-500/90 text-white border-0 text-[10px]">Fremhevet</Badge>
                  )}
                  <Badge variant={statusVariant(property.status)} className="absolute top-3 right-3 text-[10px]">{property.status}</Badge>
                  <button onClick={(e) => { e.stopPropagation(); toggleFavorite(property.id); }}
                    className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-slate-900/60 backdrop-blur-sm flex items-center justify-center hover:bg-slate-900/80 transition-colors">
                    <Heart size={16} className={favorites.has(property.id) ? "text-red-400 fill-red-400" : "text-white"} />
                  </button>
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs text-white/70 bg-slate-900/40 px-2 py-0.5 rounded-full">
                      <Eye size={12} /><span>{property.views}</span>
                    </div>
                    {property.source !== "manual" && (
                      <Badge variant="outline" className="text-[10px] bg-slate-900/40 border-slate-500/50 text-slate-200">
                        {sourceLabel(property.source)}
                      </Badge>
                    )}
                  </div>
                </div>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-slate-100 truncate">{property.title}</h3>
                      <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                        <MapPin size={12} /><span>{property.location}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-emerald-400 mb-3">€{property.price.toLocaleString("nb-NO")}</p>
                  <div className="flex items-center gap-4 text-xs text-slate-300">
                    <div className="flex items-center gap-1"><Bed size={14} className="text-slate-400" /><span>{property.bedrooms} sov</span></div>
                    <div className="flex items-center gap-1"><Bath size={14} className="text-slate-400" /><span>{property.bathrooms} bad</span></div>
                    <div className="flex items-center gap-1"><Maximize size={14} className="text-slate-400" /><span>{property.area} m²</span></div>
                    <Badge variant="outline" className="text-[10px] ml-auto">{property.type}</Badge>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-20 h-20 rounded-lg bg-gradient-to-br ${property.imageColor} flex items-center justify-center flex-shrink-0`}>
                  <Building2 size={24} className="text-slate-400/30" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-slate-100 truncate">{property.title}</h3>
                    <Badge variant={statusVariant(property.status)} className="text-[10px]">{property.status}</Badge>
                    {property.source !== "manual" && <Badge variant="outline" className="text-[10px]">{sourceLabel(property.source)}</Badge>}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400"><MapPin size={11} /><span>{property.location}</span></div>
                  <div className="flex items-center gap-4 text-xs text-slate-300 mt-1.5">
                    <span className="text-base font-bold text-emerald-400">€{property.price.toLocaleString("nb-NO")}</span>
                    <span>{property.bedrooms} sov</span>
                    <span>{property.bathrooms} bad</span>
                    <span>{property.area} m²</span>
                    <span className="text-slate-500">{property.type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); toggleFavorite(property.id); }}>
                    <Heart size={16} className={favorites.has(property.id) ? "text-red-400 fill-red-400" : "text-slate-500 hover:text-red-400"} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setShowEditModal({...property}); }}>
                    <Pencil size={14} className="text-slate-500 hover:text-slate-200" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteProperty(property.id); }}>
                    <Trash2 size={14} className="text-slate-500 hover:text-red-400" />
                  </button>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Building2 size={48} className="text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">Ingen eiendommer funnet</p>
          <p className="text-sm text-slate-500 mt-1">Prøv å endre søkekriteriene eller importer fra RedSP</p>
        </div>
      )}

      {/* ========== ADD PROPERTY MODAL ========== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Legg til eiendom</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Tittel *</label>
                <Input placeholder="F.eks. Moderne villa med havutsikt" value={addForm.title} onChange={e => setAddForm({...addForm, title: e.target.value})} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Beskrivelse</label>
                <textarea className="w-full h-20 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                  placeholder="Beskriv eiendommen..." value={addForm.description} onChange={e => setAddForm({...addForm, description: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Beliggenhet *</label>
                  <Input placeholder="F.eks. Altea, Costa Blanca" value={addForm.location} onChange={e => setAddForm({...addForm, location: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Pris (€) *</label>
                  <Input type="number" placeholder="485000" value={addForm.price} onChange={e => setAddForm({...addForm, price: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Type</label>
                  <select value={addForm.type} onChange={e => setAddForm({...addForm, type: e.target.value})}
                    className="w-full h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100">
                    {propertyTypes.filter(t => t !== "Alle").map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Soverom</label>
                  <Input type="number" value={addForm.bedrooms} onChange={e => setAddForm({...addForm, bedrooms: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Bad</label>
                  <Input type="number" value={addForm.bathrooms} onChange={e => setAddForm({...addForm, bathrooms: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Boligareal (m²)</label>
                  <Input type="number" placeholder="220" value={addForm.area} onChange={e => setAddForm({...addForm, area: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Tomteareal (m²)</label>
                  <Input type="number" placeholder="800" value={addForm.plotArea} onChange={e => setAddForm({...addForm, plotArea: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Byggeår</label>
                  <Input type="number" placeholder="2022" value={addForm.yearBuilt} onChange={e => setAddForm({...addForm, yearBuilt: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Energiklasse</label>
                  <select value={addForm.energyRating} onChange={e => setAddForm({...addForm, energyRating: e.target.value})}
                    className="w-full h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100">
                    <option value="">Velg...</option>
                    {["A", "B", "C", "D", "E", "F", "G"].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300 pt-5 cursor-pointer">
                  <input type="checkbox" checked={addForm.pool} onChange={e => setAddForm({...addForm, pool: e.target.checked})}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-900" />
                  Basseng
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300 pt-5 cursor-pointer">
                  <input type="checkbox" checked={addForm.garage} onChange={e => setAddForm({...addForm, garage: e.target.checked})}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-900" />
                  Garasje
                </label>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Ekstern URL (valgfritt)</label>
                <Input placeholder="https://..." value={addForm.externalUrl} onChange={e => setAddForm({...addForm, externalUrl: e.target.value})} />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-700">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>Avbryt</Button>
              <Button onClick={handleAddProperty} disabled={!addForm.title.trim()}>
                <Plus size={14} className="mr-1.5" />Legg til
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========== IMPORT MODAL ========== */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowImportModal(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Importer eiendommer</h2>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-700">
              {[
                { key: "redsp" as const, label: "RedSP XML-feed", icon: Globe },
                { key: "xml" as const, label: "XML-fil", icon: FileText },
                { key: "csv" as const, label: "CSV-fil", icon: FileText },
              ].map(tab => (
                <button key={tab.key} onClick={() => { setImportTab(tab.key); setImportResult(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors
                    ${importTab === tab.key ? "text-cyan-400 border-b-2 border-cyan-400 bg-slate-700/30" : "text-slate-400 hover:text-slate-200"}`}>
                  <tab.icon size={14} />{tab.label}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-4">
              {importTab === "redsp" && (
                <>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">RedSP XML-feed URL</label>
                    <div className="flex gap-2">
                      <Input placeholder="https://feed.redsp.com/din-feed.xml" value={redspUrl} onChange={e => setRedspUrl(e.target.value)}
                        className="flex-1" />
                      <Button onClick={handleRedspImport} disabled={importing || !redspUrl.trim()}>
                        {importing ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
                        {importing ? "Henter..." : "Hent"}
                      </Button>
                    </div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                    <h4 className="text-xs font-medium text-slate-300 mb-2">Slik fungerer det:</h4>
                    <ul className="text-xs text-slate-400 space-y-1.5">
                      <li className="flex items-start gap-2"><span className="text-cyan-400 mt-0.5">1.</span> Lim inn URL-en til din RedSP XML-feed</li>
                      <li className="flex items-start gap-2"><span className="text-cyan-400 mt-0.5">2.</span> Systemet henter og parser alle eiendommer automatisk</li>
                      <li className="flex items-start gap-2"><span className="text-cyan-400 mt-0.5">3.</span> Støtter standard RedSP-format og Idealista/Kyero-feeds</li>
                      <li className="flex items-start gap-2"><span className="text-cyan-400 mt-0.5">4.</span> Eiendommer legges til i porteføljen med kilde-merke "RedSP"</li>
                    </ul>
                  </div>
                </>
              )}

              {importTab === "xml" && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Last opp XML-fil</label>
                  <input type="file" ref={fileInputRef} accept=".xml" onChange={handleFileChange} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full h-32 border-2 border-dashed border-slate-600 rounded-lg hover:border-cyan-500/50 transition-colors flex flex-col items-center justify-center gap-2">
                    {importing ? <Loader2 size={24} className="text-cyan-400 animate-spin" /> : <Upload size={24} className="text-slate-500" />}
                    <span className="text-sm text-slate-400">{importing ? "Importerer..." : "Klikk for å velge XML-fil"}</span>
                  </button>
                </div>
              )}

              {importTab === "csv" && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Last opp CSV-fil</label>
                  <input type="file" ref={fileInputRef} accept=".csv,.tsv,.txt" onChange={handleFileChange} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full h-32 border-2 border-dashed border-slate-600 rounded-lg hover:border-cyan-500/50 transition-colors flex flex-col items-center justify-center gap-2">
                    {importing ? <Loader2 size={24} className="text-cyan-400 animate-spin" /> : <Upload size={24} className="text-slate-500" />}
                    <span className="text-sm text-slate-400">{importing ? "Importerer..." : "Klikk for å velge CSV-fil"}</span>
                  </button>
                  <p className="text-xs text-slate-500 mt-2">Forventet format: title, price, location, type, bedrooms, bathrooms, area</p>
                </div>
              )}

              {/* Import result */}
              {importResult && (
                <div className={`p-4 rounded-lg border ${importResult.error
                  ? "bg-red-500/10 border-red-500/30 text-red-300"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"}`}>
                  {importResult.error ? (
                    <p className="text-sm">Feil: {importResult.error}</p>
                  ) : (
                    <p className="text-sm">Importerte {importResult.count} eiendommer!</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end p-5 border-t border-slate-700">
              <Button variant="outline" onClick={() => setShowImportModal(false)}>Lukk</Button>
            </div>
          </div>
        </div>
      )}

      {/* ========== DETAIL MODAL ========== */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowDetailModal(null)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className={`relative h-56 bg-gradient-to-br ${showDetailModal.imageColor} flex items-center justify-center`}>
              {showDetailModal.imageUrl ? (
                <img src={showDetailModal.imageUrl} alt={showDetailModal.title} className="w-full h-full object-cover" />
              ) : (
                <Building2 size={64} className="text-slate-400/20" />
              )}
              <button onClick={() => setShowDetailModal(null)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-900/60 flex items-center justify-center text-white hover:bg-slate-900/80">
                <X size={18} />
              </button>
              <Badge variant={statusVariant(showDetailModal.status)} className="absolute top-4 left-4">{showDetailModal.status}</Badge>
              {showDetailModal.source !== "manual" && (
                <Badge variant="outline" className="absolute bottom-4 left-4 bg-slate-900/60 border-slate-500/50 text-white">
                  Kilde: {sourceLabel(showDetailModal.source)}
                </Badge>
              )}
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-white">{showDetailModal.title}</h2>
                  <div className="flex items-center gap-1 text-sm text-slate-400 mt-1">
                    <MapPin size={14} />{showDetailModal.location}
                  </div>
                </div>
                <p className="text-2xl font-bold text-emerald-400">€{showDetailModal.price.toLocaleString("nb-NO")}</p>
              </div>

              {showDetailModal.description && (
                <p className="text-sm text-slate-300 mb-4">{showDetailModal.description}</p>
              )}

              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <Bed size={18} className="text-slate-400 mx-auto mb-1" />
                  <p className="text-lg font-semibold text-white">{showDetailModal.bedrooms}</p>
                  <p className="text-xs text-slate-400">Soverom</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <Bath size={18} className="text-slate-400 mx-auto mb-1" />
                  <p className="text-lg font-semibold text-white">{showDetailModal.bathrooms}</p>
                  <p className="text-xs text-slate-400">Bad</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <Maximize size={18} className="text-slate-400 mx-auto mb-1" />
                  <p className="text-lg font-semibold text-white">{showDetailModal.area}</p>
                  <p className="text-xs text-slate-400">m² bolig</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <MapPin size={18} className="text-slate-400 mx-auto mb-1" />
                  <p className="text-lg font-semibold text-white">{showDetailModal.plotArea || "—"}</p>
                  <p className="text-xs text-slate-400">m² tomt</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="outline">{showDetailModal.type}</Badge>
                {showDetailModal.ref && <Badge variant="outline">Ref: {showDetailModal.ref}</Badge>}
                {showDetailModal.yearBuilt && <Badge variant="outline">Bygget {showDetailModal.yearBuilt}</Badge>}
                {showDetailModal.energyRating && <Badge variant="outline">Energi: {showDetailModal.energyRating}</Badge>}
                {showDetailModal.pool && <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30">Basseng</Badge>}
                {showDetailModal.garage && <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30">Garasje</Badge>}
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => { setShowEditModal({...showDetailModal}); setShowDetailModal(null); }}>
                  <Pencil size={14} className="mr-1.5" />Rediger
                </Button>
                {showDetailModal.externalUrl && (
                  <Button variant="outline" size="sm" onClick={() => window.open(showDetailModal.externalUrl, "_blank")}>
                    <ExternalLink size={14} className="mr-1.5" />Vis original
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => toggleFavorite(showDetailModal.id)}>
                  <Heart size={14} className={`mr-1.5 ${favorites.has(showDetailModal.id) ? "text-red-400 fill-red-400" : ""}`} />
                  {favorites.has(showDetailModal.id) ? "Fjern favoritt" : "Favoritt"}
                </Button>
                <select value={showDetailModal.status}
                  onChange={e => {
                    const newStatus = e.target.value as Property["status"];
                    setProperties(prev => prev.map(p => p.id === showDetailModal.id ? {...p, status: newStatus} : p));
                    setShowDetailModal({...showDetailModal, status: newStatus});
                    apiUpdateProperty({...showDetailModal, status: newStatus});
                  }}
                  className="ml-auto h-9 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100">
                  <option value="TILGJENGELIG">Tilgjengelig</option>
                  <option value="RESERVERT">Reservert</option>
                  <option value="SOLGT">Solgt</option>
                </select>
                <Button variant="outline" size="sm" className="text-red-400 hover:text-red-300 border-red-500/30"
                  onClick={() => deleteProperty(showDetailModal.id)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== EDIT MODAL ========== */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowEditModal(null)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Rediger eiendom</h2>
              <button onClick={() => setShowEditModal(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Tittel</label>
                <Input value={showEditModal.title} onChange={e => setShowEditModal({...showEditModal, title: e.target.value})} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Beskrivelse</label>
                <textarea className="w-full h-20 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                  value={showEditModal.description} onChange={e => setShowEditModal({...showEditModal, description: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Beliggenhet</label>
                  <Input value={showEditModal.location} onChange={e => setShowEditModal({...showEditModal, location: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Pris (€)</label>
                  <Input type="number" value={showEditModal.price} onChange={e => setShowEditModal({...showEditModal, price: parseInt(e.target.value) || 0})} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Type</label>
                  <select value={showEditModal.type} onChange={e => setShowEditModal({...showEditModal, type: e.target.value})}
                    className="w-full h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100">
                    {propertyTypes.filter(t => t !== "Alle").map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Soverom</label>
                  <Input type="number" value={showEditModal.bedrooms} onChange={e => setShowEditModal({...showEditModal, bedrooms: parseInt(e.target.value) || 0})} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Bad</label>
                  <Input type="number" value={showEditModal.bathrooms} onChange={e => setShowEditModal({...showEditModal, bathrooms: parseInt(e.target.value) || 0})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Boligareal (m²)</label>
                  <Input type="number" value={showEditModal.area} onChange={e => setShowEditModal({...showEditModal, area: parseInt(e.target.value) || 0})} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Tomteareal (m²)</label>
                  <Input type="number" value={showEditModal.plotArea} onChange={e => setShowEditModal({...showEditModal, plotArea: parseInt(e.target.value) || 0})} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Status</label>
                <select value={showEditModal.status} onChange={e => setShowEditModal({...showEditModal, status: e.target.value as Property["status"]})}
                  className="w-full h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100">
                  <option value="TILGJENGELIG">Tilgjengelig</option>
                  <option value="RESERVERT">Reservert</option>
                  <option value="SOLGT">Solgt</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-700">
              <Button variant="outline" onClick={() => setShowEditModal(null)}>Avbryt</Button>
              <Button onClick={handleSaveEdit}>Lagre endringer</Button>
            </div>
          </div>
        </div>
      )}

      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
    </div>
  );
}
