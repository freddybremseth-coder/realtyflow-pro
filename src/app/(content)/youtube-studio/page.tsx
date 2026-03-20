"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Youtube, Play, Eye, ThumbsUp, Clock, Calendar,
  FileText, Wand2, Search as SearchIcon, Tag, Image,
  TrendingUp, Sparkles, Loader2, CheckCircle2,
  Copy, BarChart3, ArrowUpRight,
} from "lucide-react";

interface Video {
  id: string;
  title: string;
  channel: string;
  views: number;
  likes: number;
  comments: number;
  publishedAt: string;
  duration: string;
  status: "published" | "processing" | "draft";
  thumbnail: string;
}

const videos: Video[] = [
  {
    id: "V001",
    title: "Villa med havutsikt i Altea - Virtuell tur | Soleada Eiendom",
    channel: "Soleada",
    views: 12450,
    likes: 342,
    comments: 56,
    publishedAt: "2024-03-10",
    duration: "8:24",
    status: "published",
    thumbnail: "from-blue-600/30 to-cyan-600/20",
  },
  {
    id: "V002",
    title: "Midnight Pulse - Neural Beat | Official Visualizer",
    channel: "Neural Beat",
    views: 8920,
    likes: 567,
    comments: 89,
    publishedAt: "2024-03-08",
    duration: "3:45",
    status: "published",
    thumbnail: "from-purple-600/30 to-pink-600/20",
  },
  {
    id: "V003",
    title: "5 tips for a kjope eiendom i Spania som nordmann",
    channel: "Freddy Bremseth",
    views: 5230,
    likes: 198,
    comments: 34,
    publishedAt: "2024-03-05",
    duration: "12:15",
    status: "published",
    thumbnail: "from-amber-600/30 to-orange-600/20",
  },
  {
    id: "V004",
    title: "Zen Eco Homes - Barekraftig luksus pa Costa Blanca",
    channel: "Zen Eco Homes",
    views: 0,
    likes: 0,
    comments: 0,
    publishedAt: "",
    duration: "6:30",
    status: "draft",
    thumbnail: "from-emerald-600/30 to-teal-600/20",
  },
];

const toolCategories = [
  {
    id: "script",
    label: "Manus",
    icon: FileText,
    description: "Generer videomanus med AI",
    placeholder: "Beskriv videoen du vil lage...",
    buttonText: "Generer Manus",
  },
  {
    id: "title",
    label: "Tittel",
    icon: Wand2,
    description: "Optimaliser videotittelen for CTR",
    placeholder: "Skriv inn din novaerende tittel...",
    buttonText: "Optimaliser Tittel",
  },
  {
    id: "seo",
    label: "SEO Beskrivelse",
    icon: SearchIcon,
    description: "Generer SEO-optimalisert beskrivelse",
    placeholder: "Kort oppsummering av videoen...",
    buttonText: "Generer Beskrivelse",
  },
  {
    id: "tags",
    label: "Tags",
    icon: Tag,
    description: "Generer relevante tags og keywords",
    placeholder: "Emne eller niche for videoen...",
    buttonText: "Generer Tags",
  },
  {
    id: "thumbnail",
    label: "Thumbnail-konsepter",
    icon: Image,
    description: "Fa AI-forslag til miniatyrbilder",
    placeholder: "Beskriv stilen du onsker...",
    buttonText: "Generer Konsepter",
  },
];

const mockOutputs: Record<string, string> = {
  script: `INTRO (0:00 - 0:30)
[Drone-opptak av kystlinjen i Altea med solnedgang]

VOICEOVER: "Forestill deg a vakne til lyden av Middelhavet, med solstraler som fyller rommet ditt..."

HOVEDDEL (0:30 - 6:00)
Scene 1: Eiendomsvisning
- Vis inngangsparti med moderne design
- Panorering over stue med havutsikt
- Zoom pa detaljer: marmorgulv, integrert belysning

Scene 2: Uteomrader
- Infinity-basseng med havutsikt
- Utekjokken og loungeomrade
- Hageanlekk med middelhavsplanter

OUTRO (6:00 - 6:30)
CTA: Kontakt oss for en privat visning!`,
  title: `Her er 5 optimaliserte tittelvarianter:

1. "Denne Villaen i Altea Vil Blase Deg - Virtuell Tur" (CTR: Hoy)
2. "Luksus Villa Spania: Slik Bor Nordmenn pa Costa Blanca" (CTR: Hoy)
3. "Vi Fant Droemmeboligen i Spania - Se Selv!" (CTR: Meget Hoy)
4. "Villa med Havutsikt Altea - Fra 485.000 EUR | Norsk Megler" (CTR: Middels)
5. "Norges Hemmelige Paradis pa Costa Blanca - Full Visning" (CTR: Hoy)`,
  seo: `Oppdag denne fantastiske villaen med panoramisk havutsikt i Altea, Costa Blanca. Soleada Eiendom tar deg med pa en komplett virtuell visning av denne eksklusive eiendommen med 4 soverom, 3 bad, infinity-basseng og moderne design.

TIDSSTEMPLER:
00:00 Intro - Droemmeboligen i Spania
00:30 Inngangsparti og fasade
02:00 Stue og kjokken
03:30 Soverom og bad
05:00 Basseng og uteareal
06:00 Kontaktinformasjon`,
  tags: `#Spania #CostaBlanca #Altea #VillaSpania #EiendomSpania #NorskeISpania #Boligkjop #Feriebolig #Middelhavet #Havutsikt #Luksusbolig #Soleada #NorskMegler #Pensjonist #InvestereISpania #VirtuellVisning #Droemmehjemmet #SolOgStrand #AlteaHills #CostaBlancaEiendom`,
  thumbnail: `Konsept 1: "Emosjonell Kontrast"
- Bilde: Split-screen av norsk vinter vs. solrik terrasse
- Tekst: "FRA DETTE... TIL DETTE"
- Farge: Bla/gull gradient

Konsept 2: "Luksus Reveal"
- Bilde: POV gjennom store glassdorer mot havutsikt
- Tekst: "485.000 EUR" med stor pil ned
- Farge: Sort/gull

Konsept 3: "Livsstil"
- Bilde: Person som nyter frokost pa terrasse med havutsikt
- Tekst: "Norsk i Spania"
- Farge: Varm solnedgang`,
};

export default function YouTubeStudioPage() {
  const [selectedTool, setSelectedTool] = useState("script");
  const [toolInput, setToolInput] = useState("");
  const [toolOutput, setToolOutput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    setIsProcessing(true);
    setToolOutput("");
    setTimeout(() => {
      setToolOutput(mockOutputs[selectedTool] || "");
      setIsProcessing(false);
    }, 2000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(toolOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Youtube className="text-red-400" size={28} />
          YouTube Studio
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Administrer videoer og bruk AI-verktoy for a optimalisere innhold
        </p>
      </div>

      <Tabs defaultValue="videos">
        <TabsList>
          <TabsTrigger value="videos">
            <Play size={14} className="mr-1.5" />
            Videoer
          </TabsTrigger>
          <TabsTrigger value="tools">
            <Wand2 size={14} className="mr-1.5" />
            Verktoy
          </TabsTrigger>
        </TabsList>

        {/* Videos Tab */}
        <TabsContent value="videos">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Totale visninger", value: "26.6K", icon: Eye, color: "text-blue-400" },
              { label: "Abonnenter", value: "1,240", icon: TrendingUp, color: "text-emerald-400" },
              { label: "Likes", value: "1,107", icon: ThumbsUp, color: "text-amber-400" },
              { label: "Videoer", value: videos.length.toString(), icon: Play, color: "text-red-400" },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">{stat.label}</p>
                      <p className="text-xl font-bold text-white mt-0.5">{stat.value}</p>
                    </div>
                    <stat.icon size={20} className={`${stat.color} opacity-60`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Video List */}
          <div className="space-y-3">
            {videos.map((video) => (
              <Card key={video.id} className="hover:border-slate-500 transition-all">
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {/* Thumbnail */}
                    <div className={`w-40 h-24 rounded-lg bg-gradient-to-br ${video.thumbnail} flex-shrink-0 flex items-center justify-center relative`}>
                      <Play size={24} className="text-white/40" />
                      <span className="absolute bottom-1 right-1 text-[10px] bg-black/70 text-white px-1 rounded">
                        {video.duration}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-100 line-clamp-2">
                          {video.title}
                        </h3>
                        <Badge
                          variant={
                            video.status === "published"
                              ? "success"
                              : video.status === "processing"
                              ? "warning"
                              : "secondary"
                          }
                          className="text-[10px] flex-shrink-0"
                        >
                          {video.status === "published"
                            ? "Publisert"
                            : video.status === "processing"
                            ? "Behandles"
                            : "Utkast"}
                        </Badge>
                      </div>

                      <p className="text-xs text-slate-500 mt-1">{video.channel}</p>

                      <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                        <div className="flex items-center gap-1">
                          <Eye size={12} />
                          <span>{video.views.toLocaleString("nb-NO")}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ThumbsUp size={12} />
                          <span>{video.likes.toLocaleString("nb-NO")}</span>
                        </div>
                        {video.publishedAt && (
                          <div className="flex items-center gap-1">
                            <Calendar size={12} />
                            <span>{video.publishedAt}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="text-xs">
                        <BarChart3 size={12} className="mr-1" />
                        Analyse
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs">
                        <ArrowUpRight size={12} className="mr-1" />
                        Apne
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tools Tab */}
        <TabsContent value="tools">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tool Selector */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">AI Verktoy</CardTitle>
                  <CardDescription>Velg et verktoy og beskriv oppgaven</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {toolCategories.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => {
                        setSelectedTool(tool.id);
                        setToolOutput("");
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                        selectedTool === tool.id
                          ? "border-primary-500/50 bg-primary-500/10"
                          : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        selectedTool === tool.id ? "bg-primary-500/20 text-primary-300" : "bg-slate-700 text-slate-400"
                      }`}>
                        <tool.icon size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">{tool.label}</p>
                        <p className="text-xs text-slate-500">{tool.description}</p>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-3">
                  <textarea
                    value={toolInput}
                    onChange={(e) => setToolInput(e.target.value)}
                    placeholder={toolCategories.find((t) => t.id === selectedTool)?.placeholder}
                    className="w-full h-32 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary-500 focus:outline-none resize-none"
                  />
                  <Button onClick={handleGenerate} disabled={isProcessing} className="w-full">
                    {isProcessing ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Genererer...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} className="mr-2" />
                        {toolCategories.find((t) => t.id === selectedTool)?.buttonText}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Output */}
            <Card className="min-h-[500px]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Resultat</CardTitle>
                  {toolOutput && (
                    <Button variant="outline" size="sm" onClick={handleCopy} className="text-xs">
                      {copied ? (
                        <>
                          <CheckCircle2 size={12} className="mr-1 text-emerald-400" />
                          Kopiert!
                        </>
                      ) : (
                        <>
                          <Copy size={12} className="mr-1" />
                          Kopier
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isProcessing ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <Loader2 size={32} className="mx-auto text-red-400 animate-spin mb-3" />
                      <p className="text-sm text-slate-400">AI behandler foresporselen...</p>
                    </div>
                  </div>
                ) : toolOutput ? (
                  <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700/30">
                    <pre className="text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                      {toolOutput}
                    </pre>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <Wand2 size={48} className="mx-auto text-slate-600 mb-3" />
                      <p className="text-sm text-slate-400">Velg et verktoy og generer innhold</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
