"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BRANDS } from "@/lib/constants";
import { PieChart, Bot, Loader2, Copy } from "lucide-react";

export default function BusinessOverviewPage() {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleRunTask = async (brandId: string) => {
    setSelectedBrand(brandId);
    setLoading(true);
    await new Promise((r) => setTimeout(r, 2000));
    const brand = BRANDS.find((b) => b.id === brandId);
    setResult(
      `Analyse for ${brand?.name}:\n\n1. Markedsposisjon: Sterk i nisjen med voksende synlighet\n2. Anbefalte tiltak: Øk innholdsproduksjon med 30%\n3. Neste steg: Fokuser på LinkedIn og Instagram for Q2\n4. ROI-prognose: 15% økning med anbefalt strategi`
    );
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <PieChart className="text-primary-400" size={28} />
          Business Oversikt
        </h1>
        <p className="text-sm text-slate-400 mt-1">AI-drevne oppgaver per brand</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BRANDS.map((brand) => (
          <Card
            key={brand.id}
            className={selectedBrand === brand.id ? "ring-2 ring-primary-400" : ""}
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                  style={{ backgroundColor: brand.color + "33", color: brand.color }}
                >
                  {brand.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">{brand.name}</h3>
                  <p className="text-[10px] text-slate-500">{brand.type}</p>
                </div>
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={() => handleRunTask(brand.id)}
                disabled={loading && selectedBrand === brand.id}
              >
                {loading && selectedBrand === brand.id ? (
                  <Loader2 size={14} className="mr-1 animate-spin" />
                ) : (
                  <Bot size={14} className="mr-1" />
                )}
                Kjør AI-analyse
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {result && (
        <Card className="animate-fade-in">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">
                {BRANDS.find((b) => b.id === selectedBrand)?.name} - Analyse
              </h3>
              <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(result)}>
                <Copy size={14} className="mr-1" />
                Kopier
              </Button>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 text-sm text-slate-200 whitespace-pre-wrap">
              {result}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
