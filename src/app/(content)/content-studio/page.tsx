"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles, Copy, CheckCircle2, Loader2, Bot,
  Instagram, Facebook, Linkedin, Twitter, Youtube,
  Wand2, Palette, Target, Users, MessageSquare,
  Music, RefreshCw,
} from "lucide-react";

const brands = [
  { id: "soleada", name: "Soleada", color: "bg-amber-500" },
  { id: "zen-eco", name: "Zen Eco Homes", color: "bg-emerald-500" },
  { id: "chatgenius", name: "ChatGenius", color: "bg-blue-500" },
  { id: "dona-anna", name: "Dona Anna", color: "bg-rose-500" },
  { id: "freddy", name: "Freddy Bremseth", color: "bg-purple-500" },
  { id: "neural-beat", name: "Neural Beat", color: "bg-pink-500" },
];

const platforms = [
  { id: "instagram", name: "Instagram", icon: Instagram, color: "text-pink-400" },
  { id: "facebook", name: "Facebook", icon: Facebook, color: "text-blue-400" },
  { id: "linkedin", name: "LinkedIn", icon: Linkedin, color: "text-sky-400" },
  { id: "twitter", name: "Twitter/X", icon: Twitter, color: "text-slate-300" },
  { id: "youtube", name: "YouTube", icon: Youtube, color: "text-red-400" },
  { id: "tiktok", name: "TikTok", icon: Music, color: "text-emerald-400" },
];

const tones = [
  "Profesjonell", "Inspirerende", "Casual", "Humoristisk",
  "Informativ", "Salgsfremmende", "Emosjonell", "Eksklusiv",
];

const activeAgents = [
  { name: "Clara Content", status: "Analyserer merkevare...", color: "bg-purple-500" },
  { name: "Sam SEO Expert", status: "Optimaliserer hashtags...", color: "bg-emerald-500" },
];

export default function ContentStudioPage() {
  const [selectedBrand, setSelectedBrand] = useState("soleada");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram"]);
  const [selectedTone, setSelectedTone] = useState("Profesjonell");
  const [goal, setGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [copied, setCopied] = useState(false);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

    const handleGenerate = async () => {
    if (!goal.trim() && !audience.trim()) return;
    setIsGenerating(true);
    setGeneratedContent("");
    try {
      const prompt = `Lag innhald for ${selectedPlatforms.join(", ")} med ${selectedTone}-tone for merkevaren ${selectedBrand}. Mal: ${goal}. Maelgruppe: ${audience}.`;
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Generering feilet");
      const output =
        data.output ||
        data.content ||
        data.result?.output ||
        data.result?.content ||
        data.text ||
        (typeof data.result === "string" ? data.result : null) ||
        JSON.stringify(data, null, 2);
      setGeneratedContent(output);
    } catch (err) {
      console.error("Content generation error:", err);
      setGeneratedContent("Feil: " + (err instanceof Error ? err.message : "Noe gjekk gale. Sjekk at API-nokkel er konfigurert i Innstillinger."));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wand2 className="text-purple-400" size={28} />
          AI Innholdsstudio
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Generer profesjonelt innhold for alle plattformer med AI
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration */}
        <div className="space-y-4">
          {/* Brand Selector */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Palette size={16} className="text-amber-400" />
                Merkevare
              </CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-primary-500 focus:outline-none"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <div className="flex items-center gap-2 mt-2">
                <div className={`w-3 h-3 rounded-full ${brands.find((b) => b.id === selectedBrand)?.color}`} />
                <span className="text-xs text-slate-400">
                  Innholdet tilpasses merkevareretningslinjene
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Platform Selector */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target size={16} className="text-blue-400" />
                Plattformer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {platforms.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-all ${
                      selectedPlatforms.includes(p.id)
                        ? "border-primary-500/50 bg-primary-500/10 text-slate-100"
                        : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    <p.icon size={16} className={selectedPlatforms.includes(p.id) ? p.color : ""} />
                    <span className="text-xs">{p.name}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tone Selector */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare size={16} className="text-emerald-400" />
                Tonalitet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {tones.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTone(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selectedTone === t
                        ? "bg-primary-500/20 text-primary-300 border border-primary-500/30"
                        : "bg-slate-700/50 text-slate-400 border border-slate-600 hover:border-slate-500"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Goal & Audience */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target size={16} className="text-rose-400" />
                Mal & Malgruppe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Mal med innholdet</label>
                <Input
                  placeholder="F.eks. Generere leads for villaer i Altea"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Malgruppe</label>
                <Input
                  placeholder="F.eks. Norske pensjonister 55-70 ar"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleGenerate} disabled={isGenerating} className="w-full" size="lg">
            {isGenerating ? (
              <>
                <Loader2 size={18} className="mr-2 animate-spin" />
                Genererer innhold...
              </>
            ) : (
              <>
                <Sparkles size={18} className="mr-2" />
                Generer Innhold
              </>
            )}
          </Button>
        </div>

        {/* Output */}
        <div className="space-y-4">
          {/* Active Agents */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bot size={16} className="text-purple-400" />
                Aktive Agenter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {activeAgents.map((agent) => (
                  <div key={agent.name} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-900/50">
                    <div className={`w-8 h-8 rounded-full ${agent.color} flex items-center justify-center`}>
                      <Bot size={14} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-200">{agent.name}</p>
                      <p className="text-xs text-slate-400">{agent.status}</p>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Generated Content */}
          <Card className="min-h-[400px]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Generert Innhold</CardTitle>
                {generatedContent && (
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={handleGenerate} className="text-xs">
                      <RefreshCw size={12} className="mr-1" />
                      Regenerer
                    </Button>
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
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isGenerating ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="relative mx-auto w-16 h-16 mb-4">
                      <div className="absolute inset-0 rounded-full border-2 border-purple-500/20" />
                      <div className="absolute inset-0 rounded-full border-2 border-t-purple-400 animate-spin" />
                      <Sparkles size={24} className="absolute inset-0 m-auto text-purple-400" />
                    </div>
                    <p className="text-sm text-slate-400">AI genererer innhold...</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Tilpasser for {selectedPlatforms.length} plattform(er)
                    </p>
                  </div>
                </div>
              ) : generatedContent ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {selectedPlatforms.map((pid) => {
                      const platform = platforms.find((p) => p.id === pid);
                      return platform ? (
                        <Badge key={pid} variant="outline" className="text-[10px]">
                          <platform.icon size={10} className={`mr-1 ${platform.color}`} />
                          {platform.name}
                        </Badge>
                      ) : null;
                    })}
                    <Badge variant="secondary" className="text-[10px]">{selectedTone}</Badge>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700/30">
                    <pre className="text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                      {generatedContent}
                    </pre>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    Innholdet er optimalisert for{" "}
                    {brands.find((b) => b.id === selectedBrand)?.name}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <Wand2 size={48} className="mx-auto text-slate-600 mb-3" />
                    <p className="text-sm text-slate-400">
                      Konfigurer innstillingene og klikk &quot;Generer Innhold&quot;
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      AI vil tilpasse innholdet til valgt merkevare og plattform
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
