"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Image as ImageIcon, Wand2, Download, Loader2, Copy, Trash2, Clock, Star, RefreshCw } from "lucide-react";

interface GeneratedImage {
  id: string;
  prompt: string;
  aspectRatio: string;
  style: string;
  brand: string;
  result: string;
  timestamp: string;
  starred: boolean;
}

const styles = [
  { id: "photo", label: "Fotorealistisk" },
  { id: "illustration", label: "Illustrasjon" },
  { id: "3d", label: "3D Render" },
  { id: "watercolor", label: "Akvarell" },
  { id: "minimal", label: "Minimalistisk" },
  { id: "luxury", label: "Luksus/Premium" },
];

const brands = ["Soleada.no", "Zen Eco Homes", "ChatGenius.pro", "Dona Anna", "Freddy Bremseth", "Pinosos Ecolife", "Neural Beat"];

const mockResults = [
  "En vakker villa med uendelighetsbasseng som speiler solnedgangen over Middelhavet. Hvite vegger, oliventrær i forgrunnen, og en blåaktig himmel med rosa skyer. Perfekt for Instagram-post med luksusfølelse.",
  "Moderne kjøkken i åpen planløsning med marmorbenkeplater, integrerte hvitevarer fra Siemens, og store vinduer med utsikt til hagen. Varmt lys fra pendellamper over kjøkkenøya.",
  "Drone-bilde over en eco-vennlig boligutvikling i Pinosos med solcellepaneler på takene, grønne hager, og fjellene i bakgrunnen. Bærekraftig og naturlig følelse.",
  "Nærbilde av premium olivenolje som helles fra en designflaske med Dona Anna-etiketten. Rustikt trebord, friske oliven og urter rundt. Myk, gylden belysning.",
  "Abstrakt EDM-inspirert bakgrunn med neonfarger, geometriske former og lysbølger. Futuristisk, energisk stemning for Neural Beat musikkvideo-thumbnail.",
];

export default function ImageStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [style, setStyle] = useState("photo");
  const [brand, setBrand] = useState("Soleada.no");
  const [history, setHistory] = useState<GeneratedImage[]>([
    { id: "1", prompt: "Luxury villa with infinity pool overlooking Mediterranean sea at sunset", aspectRatio: "16:9", style: "photo", brand: "Soleada.no", result: mockResults[0], timestamp: "2026-03-20 09:15", starred: true },
    { id: "2", prompt: "Modern open-plan kitchen with marble countertops", aspectRatio: "1:1", style: "photo", brand: "Zen Eco Homes", result: mockResults[1], timestamp: "2026-03-19 14:30", starred: false },
    { id: "3", prompt: "Aerial view of eco-friendly housing development in Pinosos", aspectRatio: "16:9", style: "photo", brand: "Pinosos Ecolife", result: mockResults[2], timestamp: "2026-03-18 11:00", starred: true },
  ]);

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setTimeout(() => {
      const result = mockResults[Math.floor(Math.random() * mockResults.length)];
      const newImage: GeneratedImage = {
        id: `img-${Date.now()}`,
        prompt,
        aspectRatio,
        style,
        brand,
        result,
        timestamp: new Date().toLocaleString("no-NO"),
        starred: false,
      };
      setHistory((prev) => [newImage, ...prev]);
      setPrompt("");
      setLoading(false);
    }, 2000);
  };

  const toggleStar = (id: string) => {
    setHistory((prev) => prev.map((img) => (img.id === id ? { ...img, starred: !img.starred } : img)));
  };

  const deleteImage = (id: string) => {
    setHistory((prev) => prev.filter((img) => img.id !== id));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const aspectRatioSizes: Record<string, string> = {
    "1:1": "aspect-square",
    "16:9": "aspect-video",
    "9:16": "aspect-[9/16]",
    "4:5": "aspect-[4/5]",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <ImageIcon className="text-primary-400" size={28} />
          Bilde Studio
        </h1>
        <p className="text-sm text-slate-400 mt-1">AI-drevet bildegenerering for markedsføring og innhold</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Totalt generert", value: history.length, color: "text-primary-400" },
          { label: "Favoritter", value: history.filter((i) => i.starred).length, color: "text-amber-400" },
          { label: "Denne uken", value: history.filter((i) => i.timestamp.includes("2026-03-")).length, color: "text-emerald-400" },
          { label: "Brands brukt", value: new Set(history.map((i) => i.brand)).size, color: "text-purple-400" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-slate-400">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 size={18} className="text-purple-400" />
            Generer nytt bilde
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-300 mb-1.5 block">Beskriv bildet</label>
            <textarea
              placeholder="Beskriv bildet du vil generere... F.eks. 'Luksus villa med havutsikt, solnedgang, moderne arkitektur'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-24 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">Format</label>
              <div className="flex flex-wrap gap-2">
                {["1:1", "16:9", "9:16", "4:5"].map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      aspectRatio === ratio
                        ? "bg-primary-500/20 text-primary-300 border border-primary-500/30"
                        : "bg-slate-700/50 text-slate-400 border border-slate-600"
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">Stil</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
              >
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">Brand</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
              >
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={loading || !prompt.trim()} className="w-full sm:w-auto">
            {loading ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Wand2 size={16} className="mr-2" />
            )}
            {loading ? "Genererer..." : "Generer bilde"}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Clock size={18} className="text-slate-400" />
          Genereringshistorikk ({history.length})
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {history.map((img) => (
            <Card key={img.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{img.brand}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{img.aspectRatio}</Badge>
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {styles.find((s) => s.id === img.style)?.label || img.style}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleStar(img.id)} className="p-1 hover:bg-slate-700 rounded">
                      <Star size={14} className={img.starred ? "text-amber-400 fill-amber-400" : "text-slate-500"} />
                    </button>
                    <button onClick={() => deleteImage(img.id)} className="p-1 hover:bg-slate-700 rounded">
                      <Trash2 size={14} className="text-slate-500 hover:text-red-400" />
                    </button>
                  </div>
                </div>

                {/* Mock image placeholder */}
                <div className={`bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg mb-3 flex items-center justify-center ${
                  img.aspectRatio === "16:9" ? "aspect-video" : img.aspectRatio === "9:16" ? "aspect-[9/16] max-h-48" : img.aspectRatio === "4:5" ? "aspect-[4/5] max-h-48" : "aspect-square max-h-48"
                }`}>
                  <div className="text-center p-4">
                    <ImageIcon size={32} className="text-slate-500 mx-auto mb-2" />
                    <p className="text-[10px] text-slate-500">AI-generert bilde</p>
                  </div>
                </div>

                <p className="text-xs text-slate-400 mb-2"><span className="text-slate-500">Prompt:</span> {img.prompt}</p>
                <p className="text-sm text-slate-200 mb-3">{img.result}</p>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">{img.timestamp}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => copyToClipboard(img.result)}>
                      <Copy size={12} className="mr-1" /> Kopier
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPrompt(img.prompt)}>
                      <RefreshCw size={12} className="mr-1" /> Gjenbruk
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
