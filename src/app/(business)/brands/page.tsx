"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRANDS } from "@/lib/constants";
import { Palette, Globe, Mail, ExternalLink, Edit2 } from "lucide-react";

export default function BrandsPage() {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Palette className="text-primary-400" size={28} />
            Brands
          </h1>
          <p className="text-sm text-slate-400 mt-1">Administrer alle dine merkevarer</p>
        </div>
        <Button>Legg til brand</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BRANDS.map((brand) => (
          <Card
            key={brand.id}
            className={`cursor-pointer transition-all ${
              selectedBrand === brand.id ? "ring-2 ring-primary-400" : ""
            }`}
            onClick={() => setSelectedBrand(brand.id === selectedBrand ? null : brand.id)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: brand.color + "33", color: brand.color }}
                  >
                    {brand.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{brand.name}</h3>
                    <Badge variant="secondary" className="text-[10px] mt-0.5">{brand.type}</Badge>
                  </div>
                </div>
                <Button size="icon" variant="ghost">
                  <Edit2 size={14} />
                </Button>
              </div>
              <p className="text-xs text-slate-400 mb-3">{brand.description}</p>

              {selectedBrand === brand.id && (
                <div className="space-y-2 pt-3 border-t border-slate-700/50 animate-fade-in">
                  {brand.website && (
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <Globe size={12} className="text-slate-500" />
                      {brand.website}
                    </div>
                  )}
                  {brand.email && (
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <Mail size={12} className="text-slate-500" />
                      {brand.email}
                    </div>
                  )}
                  {brand.tone && (
                    <p className="text-xs text-slate-400">Tone: {brand.tone}</p>
                  )}
                  {brand.target_audience && (
                    <p className="text-xs text-slate-400">Målgruppe: {brand.target_audience}</p>
                  )}
                  {brand.specialties && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {brand.specialties.map((s) => (
                        <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  )}
                  <Button size="sm" variant="outline" className="mt-2 w-full">
                    <ExternalLink size={12} className="mr-1" />
                    Åpne nettside
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
