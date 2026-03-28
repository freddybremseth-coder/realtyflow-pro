"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles, Copy, CheckCircle2, Loader2, Bot,
  Instagram, Facebook, Linkedin, Twitter, Youtube,
  Wand2, Palette, Target, MessageSquare,
  Music, RefreshCw, Send, Clock, FileText, Video,
  BookOpen, Clapperboard, History,
} from "lucide-react";
import { BRANDS } from "@/lib/constants";

const platforms = [
  { id: "instagram", name: "Instagram", icon: Instagram, color: "text-pink-400" },
  { id: "facebook", name: "Facebook", icon: Facebook, color: "text-blue-400" },
  { id: "linkedin", name: "LinkedIn", icon: Linkedin, color: "text-sky-400" },
  { id: "twitter", name: "Twitter/X", icon: Twitter, color: "text-slate-300" },
  { id: "youtube", name: "YouTube", icon: Youtube, color: "text-red-400" },
  { id: "tiktok", name: "TikTok", icon: Music, color: "text-emerald-400" },
];

const contentTypes = [
  { id: "post", name: "Post", icon: FileText },
  { id: "story", name: "Story", icon: Clapperboard },
  { id: "reel", name: "Reel", icon: Video },
  { id: "article", name: "Artikkel", icon: BookOpen },
  { id: "video-script", name: "Videomanus", icon: Video },
];

const tones = [
  "Profesjonell", "Inspirerende", "Casual", "Humoristisk",
  "Informativ", "Salgsfremmende", "Emosjonell", "Eksklusiv",
];

const activeAgents = [
  { name: "Clara Content", status: "Online", color: "bg-purple-500" },
  { name: "Sam SEO Expert", status: "Online", color: "bg-emerald-500" },
];

interface HistoryEntry {
  id: string;
  brand: string;
  platforms: string[];
  contentType: string;
  tone: string;
  prompt: string;
  content: string;
  createdAt: Date;
}

export default function ContentStudioPage() {
  const [selectedBrand, setSelectedBrand] = useState(BRANDS[0].id);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram"]);
  const [selectedContentType, setSelectedContentType] = useState("post");
  const [selectedTone, setSelectedTone] = useState("Profesjonell");
  const [prompt, setPrompt] = useState("");
  const [audience, setAudience] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [generatedPerPlatform, setGeneratedPerPlatform] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [savingToHub, setSavingToHub] = useState(false);
  const [savedToHub, setSavedToHub] = useState(false);

  const currentBrand = BRANDS.find((b) => b.id === selectedBrand) ?? BRANDS[0];

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setGeneratedContent("");
    setGeneratedPerPlatform({});

    const results: Record<string, string> = {};

    // Generate content for each platform separately
    for (const platformId of selectedPlatforms) {
      const platformName = platforms.find((p) => p.id === platformId)?.name ?? platformId;
      try {
        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: "marketing",
            tasks: [
              {
                type: "create_content",
                parameters: {
                  brand: selectedBrand,
                  platform: platformId,
                  content_type: selectedContentType,
                  tone: selectedTone,
                  audience: audience || undefined,
                  topic: prompt,
                  language: "no",
                },
              },
            ],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const output =
            data.results?.[0]?.output ||
            data.results?.[0]?.result ||
            "Ingen innhold generert";
          results[platformId] = typeof output === "string" ? output : JSON.stringify(output, null, 2);
        } else {
          results[platformId] = `[Feil fra API - status ${res.status}]`;
        }
      } catch (err) {
        console.error(`AI generation failed for ${platformName}:`, err);
        results[platformId] = `[Feil] Kunne ikke generere innhold for ${platformName}.`;
      }
    }

    setGeneratedPerPlatform(results);
    // Show combined view for copying
    const combined = Object.entries(results)
      .map(([pid, text]) => text)
      .join("\n\n---\n\n");
    setGeneratedContent(combined);

    const entry: HistoryEntry = {
      id: `h-${Date.now()}`,
      brand: currentBrand.name,
      platforms: [...selectedPlatforms],
      contentType: selectedContentType,
      tone: selectedTone,
      prompt,
      content: combined,
      createdAt: new Date(),
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));
    setIsGenerating(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveToHub = async () => {
    if (!generatedContent) return;
    setSavingToHub(true);
    setSavedToHub(false);
    try {
      // Create one draft per platform with only that platform's content
      const drafts = Object.entries(generatedPerPlatform).map(([pid, content]) => {
        const platformName = platforms.find((p) => p.id === pid)?.name ?? pid;
        return {
          brand_id: selectedBrand,
          content_type: selectedContentType,
          title: `${currentBrand.name} – ${selectedContentType} (${platformName})`,
          description: content,
          tags: [pid],
        };
      });

      // Fallback: if generatedPerPlatform is empty, save as single draft
      if (drafts.length === 0) {
        drafts.push({
          brand_id: selectedBrand,
          content_type: selectedContentType,
          title: `${currentBrand.name} – ${selectedContentType}`,
          description: generatedContent,
          tags: selectedPlatforms,
        });
      }

      const res = await fetch("/api/marketing-kit/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drafts }),
      });
      if (res.ok) {
        setSavedToHub(true);
        setTimeout(() => setSavedToHub(false), 3000);
      }
    } catch (err) {
      console.error("Failed to save to Content Hub:", err);
    } finally {
      setSavingToHub(false);
    }
  };

  const loadFromHistory = (entry: HistoryEntry) => {
    setSelectedBrand(BRANDS.find((b) => b.name === entry.brand)?.id ?? BRANDS[0].id);
    setSelectedPlatforms(entry.platforms);
    setSelectedContentType(entry.contentType);
    setSelectedTone(entry.tone);
    setPrompt(entry.prompt);
    setGeneratedContent(entry.content);
    setShowHistory(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wand2 className="text-purple-400" size={28} />
            AI Innholdsstudio
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Generer profesjonelt innhold for alle plattformer med AI
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
          className="text-xs"
        >
          <History size={14} className="mr-1.5" />
          Historikk ({history.length})
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration - Left column */}
        <div className="lg:col-span-1 space-y-4">
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
                {BRANDS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 mt-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: currentBrand.color }}
                />
                <span className="text-xs text-slate-400">
                  {currentBrand.description}
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
              <div className="grid grid-cols-2 gap-2">
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
                    <p.icon
                      size={16}
                      className={selectedPlatforms.includes(p.id) ? p.color : ""}
                    />
                    <span className="text-xs">{p.name}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Content Type Selector */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText size={16} className="text-cyan-400" />
                Innholdstype
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {contentTypes.map((ct) => (
                  <button
                    key={ct.id}
                    onClick={() => setSelectedContentType(ct.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-all ${
                      selectedContentType === ct.id
                        ? "border-primary-500/50 bg-primary-500/10 text-slate-100"
                        : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    <ct.icon size={16} />
                    <span className="text-xs">{ct.name}</span>
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
        </div>

        {/* Input & Output - Right column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Prompt Input */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target size={16} className="text-rose-400" />
                Tema og maalgruppe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                  Tema / prompt
                </label>
                <textarea
                  placeholder="F.eks. Ny luksusvilla i Altea med havutsikt, 3 soverom og basseng..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 resize-none focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                  Maalgruppe (valgfritt)
                </label>
                <Input
                  placeholder="F.eks. Norske pensjonister 55-70 aar"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                />
              </div>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Genererer innhold...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} className="mr-2" />
                    Generer innhold
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Active Agents */}
          {isGenerating && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot size={16} className="text-purple-400" />
                  Aktive agenter
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activeAgents.map((agent) => (
                    <div
                      key={agent.name}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-900/50"
                    >
                      <div
                        className={`w-8 h-8 rounded-full ${agent.color} flex items-center justify-center`}
                      >
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
          )}

          {/* Generated Content */}
          <Card className="min-h-[300px]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Generert innhold</CardTitle>
                {generatedContent && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="text-xs"
                    >
                      <RefreshCw size={12} className="mr-1" />
                      Regenerer
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      className="text-xs"
                    >
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
                    <Button
                      size="sm"
                      onClick={handleSaveToHub}
                      disabled={savingToHub}
                      className={`text-xs ${savedToHub ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                    >
                      {savingToHub ? (
                        <><Loader2 size={12} className="mr-1 animate-spin" /> Lagrer...</>
                      ) : savedToHub ? (
                        <><CheckCircle2 size={12} className="mr-1" /> Sendt til Hub!</>
                      ) : (
                        <><Send size={12} className="mr-1" /> Send til Content Hub</>
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
                      <Sparkles
                        size={24}
                        className="absolute inset-0 m-auto text-purple-400"
                      />
                    </div>
                    <p className="text-sm text-slate-400">AI genererer innhold...</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Tilpasser for {selectedPlatforms.length} plattform(er) &middot;{" "}
                      {contentTypes.find((c) => c.id === selectedContentType)?.name}
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
                          <platform.icon
                            size={10}
                            className={`mr-1 ${platform.color}`}
                          />
                          {platform.name}
                        </Badge>
                      ) : null;
                    })}
                    <Badge variant="secondary" className="text-[10px]">
                      {contentTypes.find((c) => c.id === selectedContentType)?.name}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {selectedTone}
                    </Badge>
                  </div>

                  {Object.keys(generatedPerPlatform).length > 1 ? (
                    <div className="space-y-3">
                      {Object.entries(generatedPerPlatform).map(([pid, content]) => {
                        const platform = platforms.find((p) => p.id === pid);
                        return (
                          <div key={pid} className="p-4 rounded-lg bg-slate-900/50 border border-slate-700/30">
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700/30">
                              {platform && <platform.icon size={14} className={platform.color} />}
                              <span className="text-xs font-medium text-slate-300">{platform?.name || pid}</span>
                              <button
                                onClick={() => { navigator.clipboard.writeText(content); }}
                                className="ml-auto text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                              >
                                Kopier
                              </button>
                            </div>
                            <pre className="text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                              {content}
                            </pre>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700/30">
                      <pre className="text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                        {generatedContent}
                      </pre>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    Innholdet er optimalisert for {currentBrand.name}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <Wand2 size={48} className="mx-auto text-slate-600 mb-3" />
                    <p className="text-sm text-slate-400">
                      Konfigurer innstillingene og klikk &quot;Generer innhold&quot;
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

      {/* History Section */}
      {showHistory && history.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock size={16} className="text-slate-400" />
              Genereringshistorikk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => loadFromHistory(entry)}
                  className="w-full text-left p-3 rounded-lg border border-slate-700 bg-slate-800/50 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {entry.brand}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {contentTypes.find((c) => c.id === entry.contentType)?.name}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {entry.tone}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {entry.createdAt.toLocaleTimeString("nb-NO", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">{entry.prompt}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {entry.content.slice(0, 100)}...
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showHistory && history.length === 0 && (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-slate-500 text-center">
              Ingen genereringer ennaa. Lag ditt forste innhold ovenfor!
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
