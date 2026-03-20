"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Upload, MapPin, Bed, Bath, Maximize,
  Heart, Eye, Building2, Filter, Grid3X3, List,
} from "lucide-react";

interface Property {
  id: string;
  title: string;
  location: string;
  price: number;
  type: string;
  bedrooms: number;
  bathrooms: number;
  area: number;
  status: "TILGJENGELIG" | "RESERVERT" | "SOLGT";
  featured: boolean;
  views: number;
  imageColor: string;
}

const properties: Property[] = [
  {
    id: "P001",
    title: "Moderne villa med havutsikt",
    location: "Altea, Costa Blanca",
    price: 485000,
    type: "Villa",
    bedrooms: 4,
    bathrooms: 3,
    area: 220,
    status: "TILGJENGELIG",
    featured: true,
    views: 342,
    imageColor: "from-blue-600/30 to-cyan-600/20",
  },
  {
    id: "P002",
    title: "Lys toppleilighet med terrasse",
    location: "Benidorm, Costa Blanca",
    price: 189000,
    type: "Leilighet",
    bedrooms: 2,
    bathrooms: 1,
    area: 85,
    status: "TILGJENGELIG",
    featured: false,
    views: 218,
    imageColor: "from-amber-600/30 to-orange-600/20",
  },
  {
    id: "P003",
    title: "Eksklusiv penthouse med infinity-basseng",
    location: "Alicante sentrum",
    price: 620000,
    type: "Penthouse",
    bedrooms: 3,
    bathrooms: 2,
    area: 165,
    status: "RESERVERT",
    featured: true,
    views: 567,
    imageColor: "from-purple-600/30 to-pink-600/20",
  },
  {
    id: "P004",
    title: "Sjarmerende rekkehus nær strand",
    location: "Torrevieja, Costa Blanca",
    price: 215000,
    type: "Rekkehus",
    bedrooms: 3,
    bathrooms: 2,
    area: 120,
    status: "TILGJENGELIG",
    featured: false,
    views: 156,
    imageColor: "from-emerald-600/30 to-teal-600/20",
  },
  {
    id: "P005",
    title: "Luksusvilla med privat basseng",
    location: "Javea, Costa Blanca",
    price: 750000,
    type: "Villa",
    bedrooms: 5,
    bathrooms: 4,
    area: 350,
    status: "TILGJENGELIG",
    featured: true,
    views: 489,
    imageColor: "from-rose-600/30 to-red-600/20",
  },
  {
    id: "P006",
    title: "Koselig bungalow i rolig omrade",
    location: "La Nucia, Costa Blanca",
    price: 175000,
    type: "Bungalow",
    bedrooms: 2,
    bathrooms: 1,
    area: 75,
    status: "SOLGT",
    featured: false,
    views: 98,
    imageColor: "from-indigo-600/30 to-blue-600/20",
  },
];

const propertyTypes = ["Alle", "Villa", "Leilighet", "Penthouse", "Rekkehus", "Bungalow"];
const bedroomOptions = ["Alle", "1+", "2+", "3+", "4+", "5+"];
const priceRanges = [
  "Alle",
  "Under €200K",
  "€200K - €400K",
  "€400K - €600K",
  "Over €600K",
];

function statusVariant(status: string) {
  switch (status) {
    case "TILGJENGELIG":
      return "success" as const;
    case "RESERVERT":
      return "warning" as const;
    case "SOLGT":
      return "destructive" as const;
    default:
      return "default" as const;
  }
}

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("Alle");
  const [priceFilter, setPriceFilter] = useState("Alle");
  const [bedroomFilter, setBedroomFilter] = useState("Alle");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Eiendomsportefolje</h1>
          <p className="text-sm text-slate-400 mt-1">
            {filtered.length} av {properties.length} eiendommer
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Upload size={14} className="mr-1.5" />
            Importer XML/CSV
          </Button>
          <Button size="sm">
            <Building2 size={14} className="mr-1.5" />
            Legg til eiendom
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Sok etter eiendommer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Filter size={14} className="text-slate-400" />
                <span className="text-xs text-slate-400">Filter:</span>
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-primary-500 focus:outline-none"
              >
                {propertyTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select
                value={priceFilter}
                onChange={(e) => setPriceFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-primary-500 focus:outline-none"
              >
                {priceRanges.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <select
                value={bedroomFilter}
                onChange={(e) => setBedroomFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-primary-500 focus:outline-none"
              >
                {bedroomOptions.map((b) => (
                  <option key={b} value={b}>{b === "Alle" ? "Soverom" : `${b} soverom`}</option>
                ))}
              </select>
              <div className="flex border border-slate-600 rounded-lg overflow-hidden ml-auto">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 ${viewMode === "grid" ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
                >
                  <Grid3X3 size={16} />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-2 ${viewMode === "list" ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
                >
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
          <Card key={property.id} className="overflow-hidden hover:border-slate-500 transition-all group">
            {/* Image Placeholder */}
            <div className={`relative h-48 bg-gradient-to-br ${property.imageColor} flex items-center justify-center`}>
              <Building2 size={48} className="text-slate-400/30" />
              {property.featured && (
                <Badge className="absolute top-3 left-3 bg-amber-500/90 text-white border-0 text-[10px]">
                  Fremhevet
                </Badge>
              )}
              <Badge variant={statusVariant(property.status)} className="absolute top-3 right-3 text-[10px]">
                {property.status}
              </Badge>
              <button
                onClick={() => toggleFavorite(property.id)}
                className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-slate-900/60 backdrop-blur-sm flex items-center justify-center hover:bg-slate-900/80 transition-colors"
              >
                <Heart
                  size={16}
                  className={favorites.has(property.id) ? "text-red-400 fill-red-400" : "text-white"}
                />
              </button>
              <div className="absolute bottom-3 left-3 flex items-center gap-1 text-xs text-white/70">
                <Eye size={12} />
                <span>{property.views}</span>
              </div>
            </div>

            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-100 truncate">
                    {property.title}
                  </h3>
                  <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                    <MapPin size={12} />
                    <span>{property.location}</span>
                  </div>
                </div>
              </div>

              <p className="text-xl font-bold text-emerald-400 mb-3">
                {"\u20AC"}{property.price.toLocaleString("nb-NO")}
              </p>

              <div className="flex items-center gap-4 text-xs text-slate-300">
                <div className="flex items-center gap-1">
                  <Bed size={14} className="text-slate-400" />
                  <span>{property.bedrooms} sov</span>
                </div>
                <div className="flex items-center gap-1">
                  <Bath size={14} className="text-slate-400" />
                  <span>{property.bathrooms} bad</span>
                </div>
                <div className="flex items-center gap-1">
                  <Maximize size={14} className="text-slate-400" />
                  <span>{property.area} m{"\u00B2"}</span>
                </div>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {property.type}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
