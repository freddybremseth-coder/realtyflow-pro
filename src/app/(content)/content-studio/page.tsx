"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles, Copy, CheckCircle2, Loader2, Bot,
  Instagram, Facebook, Linkedin, Twitter, Youtube,
  Wand2, Palette, Target, MessageSquare,
  Music, RefreshCw, Send, Clock, FileText, Video,
  BookOpen, Clapperboard, History, Upload, Image,
  Mail, Users, Filter, Search, Building2, MapPin,
  Eye, ChevronDown, X, Plus, Newspaper,
} from "lucide-react";
import { BRANDS, LEAD_STATUSES } from "@/lib/constants";

const platforms = [
  { id: "instagram", name: "Instagram", icon: Instagram, color: "text-pink-400" },
  { id: "facebook", name: "Facebook", icon: Facebook, color: "text-blue-400" },
  { id: "linkedin", name: "LinkedIn", icon: Linkedin, color: "text-sky-400" },
  { id: "twitter", name: "Twitter/X", icon: Twitter, color: "text-slate-300" },
  { id: "youtube", name: "YouTube", icon: Youtube, color: "text-red-400" },
  { id: "tiktok", name: "TikTok", icon: Music, color: "text-emerald-400" },
  { id: "pinterest", name: "Pinterest", icon: Target, color: "text-rose-400" },
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

interface Contact {
  id: string;
  name: string;
  email: string;
  pipeline_status: string;
  brand_id: string;
  phone?: string;
  property_interest?: string;
}

interface Property {
  id: string;
  title: string;
  location: string;
  price: number;
  bedrooms?: number;
  bathrooms?: number;
  area_m2?: number;
  image_url?: string;
  description?: string;
  property_type?: string;
  brand_id?: string;
}

interface Plot {
  id: string;
  title: string;
  municipality: string;
  price: number;
  area_m2?: number;
  description?: string;
  brand_id?: string;
}

interface MarketReport {
  id: string;
  template_id: string;
  title: string;
  summary?: string;
  content_html?: string;
  content_text?: string;
  generated_at: string;
}

const PIPELINE_LABELS: Record<string, string> = {
  NEW: "Ny",
  CONTACT: "Kontaktet",
  QUALIFIED: "Kvalifisert",
  VIEWING: "Visning",
  NEGOTIATION: "Forhandling",
  WON: "Vunnet",
  ON_HOLD: "På vent",
  LOST: "Tapt",
};

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
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  // Tab state
  const [activeTab, setActiveTab] = useState<"generate" | "newsletter">("generate");

  // Newsletter state
  const [nlBrand, setNlBrand] = useState(BRANDS[0].id);
  const [nlSubject, setNlSubject] = useState("");
  const [nlBodyHtml, setNlBodyHtml] = useState("");
  const [nlRecipientMode, setNlRecipientMode] = useState<"all" | "pipeline_phase" | "brand" | "individual">("all");
  const [nlPipelinePhase, setNlPipelinePhase] = useState("NEW");
  const [nlBrandFilter, setNlBrandFilter] = useState("");
  const [nlIndividualEmails, setNlIndividualEmails] = useState<string[]>([]);
  const [nlContacts, setNlContacts] = useState<Contact[]>([]);
  const [nlContactSearch, setNlContactSearch] = useState("");
  const [nlProperties, setNlProperties] = useState<Property[]>([]);
  const [nlPlots, setNlPlots] = useState<Plot[]>([]);
  const [nlSelectedProperties, setNlSelectedProperties] = useState<Property[]>([]);
  const [nlSelectedPlots, setNlSelectedPlots] = useState<Plot[]>([]);
  const [nlPropertyMode, setNlPropertyMode] = useState<"none" | "main_topic" | "featured">("none");
  const [nlReports, setNlReports] = useState<MarketReport[]>([]);
  const [nlSelectedReport, setNlSelectedReport] = useState<MarketReport | null>(null);
  const [nlUseReport, setNlUseReport] = useState(false);
  const [nlLoading, setNlLoading] = useState(false);
  const [nlSending, setNlSending] = useState(false);
  const [nlSendResult, setNlSendResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [nlGeneratingDraft, setNlGeneratingDraft] = useState(false);
  const [nlShowPreview, setNlShowPreview] = useState(false);
  const [nlPropertySearch, setNlPropertySearch] = useState("");
  const [nlPlotSearch, setNlPlotSearch] = useState("");

  const currentBrand = BRANDS.find((b) => b.id === selectedBrand) ?? BRANDS[0];
  const nlCurrentBrand = BRANDS.find((b) => b.id === nlBrand) ?? BRANDS[0];

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
          let cleanOutput = typeof output === "string" ? output : JSON.stringify(output, null, 2);
          // Remove platform headers like "Facebook:", "Instagram:", "LinkedIn:", etc.
          cleanOutput = cleanOutput.replace(/^(Facebook|Instagram|LinkedIn|Twitter|YouTube|TikTok|Pinterest|X)\s*:\s*/gim, "").trim();
          results[platformId] = cleanOutput;
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
      const result = await res.json();
      if (res.ok && result.drafts_created > 0) {
        setSavedToHub(true);
        setTimeout(() => setSavedToHub(false), 3000);
      } else {
        console.error("[Content Studio] Save failed:", result);
        alert(`Kunne ikke lagre til Content Hub: ${result.error || result.results?.map((r: { error?: string }) => r.error).filter(Boolean).join(', ') || 'Ukjent feil'}`);
      }
    } catch (err) {
      console.error("Failed to save to Content Hub:", err);
      alert(`Feil ved lagring: ${err instanceof Error ? err.message : 'Nettverksfeil'}`);
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

  // ─── Newsletter functions ──────────────────────────────────────────
  const fetchNewsletterData = useCallback(async () => {
    setNlLoading(true);
    try {
      const [contactsRes, propertiesRes, plotsRes, reportsRes] = await Promise.all([
        fetch("/api/contacts"),
        fetch("/api/properties"),
        fetch("/api/plots"),
        fetch("/api/reports?limit=20"),
      ]);
      if (contactsRes.ok) {
        const data = await contactsRes.json();
        setNlContacts(data.contacts || []);
      }
      if (propertiesRes.ok) {
        const data = await propertiesRes.json();
        setNlProperties(data.properties || data || []);
      }
      if (plotsRes.ok) {
        const data = await plotsRes.json();
        setNlPlots(data.plots || data || []);
      }
      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setNlReports(data.reports || []);
      }
    } catch (err) {
      console.error("Failed to fetch newsletter data:", err);
    }
    setNlLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === "newsletter") {
      fetchNewsletterData();
    }
  }, [activeTab, fetchNewsletterData]);

  const getRecipientCount = () => {
    let contacts = nlContacts;
    if (nlRecipientMode === "individual") return nlIndividualEmails.length;
    if (nlRecipientMode === "pipeline_phase") {
      contacts = contacts.filter((c) => c.pipeline_status === nlPipelinePhase);
    }
    if (nlRecipientMode === "brand" && nlBrandFilter) {
      contacts = contacts.filter((c) => c.brand_id === nlBrandFilter);
    }
    return contacts.filter((c) => c.email && c.email.includes("@")).length;
  };

  const filteredContacts = nlContacts
    .filter((c) => c.email && c.email.includes("@"))
    .filter((c) => {
      if (!nlContactSearch) return true;
      const q = nlContactSearch.toLowerCase();
      return (c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
    });

  const filteredProperties = nlProperties.filter((p) => {
    if (!nlPropertySearch) return true;
    const q = nlPropertySearch.toLowerCase();
    return (
      p.title?.toLowerCase().includes(q) ||
      p.location?.toLowerCase().includes(q) ||
      p.property_type?.toLowerCase().includes(q)
    );
  });

  const filteredPlots = nlPlots.filter((p) => {
    if (!nlPlotSearch) return true;
    const q = nlPlotSearch.toLowerCase();
    return (
      p.title?.toLowerCase().includes(q) ||
      p.municipality?.toLowerCase().includes(q)
    );
  });

  const toggleIndividualEmail = (email: string) => {
    setNlIndividualEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const toggleProperty = (property: Property) => {
    setNlSelectedProperties((prev) =>
      prev.find((p) => p.id === property.id)
        ? prev.filter((p) => p.id !== property.id)
        : [...prev, property]
    );
  };

  const togglePlot = (plot: Plot) => {
    setNlSelectedPlots((prev) =>
      prev.find((p) => p.id === plot.id)
        ? prev.filter((p) => p.id !== plot.id)
        : [...prev, plot]
    );
  };

  const buildPropertyHtml = () => {
    if (nlSelectedProperties.length === 0 && nlSelectedPlots.length === 0) return "";
    let html = "";

    if (nlPropertyMode === "featured") {
      html += `<hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0" />`;
      html += `<h2 style="color:#1e293b;font-size:20px;margin-bottom:16px">Utvalgte eiendommer for deg</h2>`;
    }

    for (const prop of nlSelectedProperties) {
      html += `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:16px;background:#f8fafc">`;
      if (prop.image_url) {
        html += `<img src="${prop.image_url}" alt="${prop.title}" style="width:100%;max-height:240px;object-fit:cover;border-radius:8px;margin-bottom:12px" />`;
      }
      html += `<h3 style="color:#1e293b;font-size:18px;margin:0 0 8px">${prop.title}</h3>`;
      html += `<p style="color:#64748b;font-size:14px;margin:0 0 8px"><strong>📍 ${prop.location}</strong></p>`;
      html += `<p style="color:#0ea5e9;font-size:20px;font-weight:bold;margin:0 0 8px">€${prop.price?.toLocaleString("no-NO")}</p>`;
      const details = [];
      if (prop.bedrooms) details.push(`${prop.bedrooms} soverom`);
      if (prop.bathrooms) details.push(`${prop.bathrooms} bad`);
      if (prop.area_m2) details.push(`${prop.area_m2} m²`);
      if (details.length) html += `<p style="color:#94a3b8;font-size:13px;margin:0">${details.join(" · ")}</p>`;
      if (prop.description) {
        const shortDesc = prop.description.length > 200 ? prop.description.slice(0, 200) + "..." : prop.description;
        html += `<p style="color:#475569;font-size:14px;margin:8px 0 0">${shortDesc}</p>`;
      }
      html += `</div>`;
    }

    for (const plot of nlSelectedPlots) {
      html += `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:16px;background:#f0fdf4">`;
      html += `<h3 style="color:#1e293b;font-size:18px;margin:0 0 8px">🌿 ${plot.title}</h3>`;
      html += `<p style="color:#64748b;font-size:14px;margin:0 0 8px"><strong>📍 ${plot.municipality}</strong></p>`;
      html += `<p style="color:#16a34a;font-size:20px;font-weight:bold;margin:0 0 8px">€${plot.price?.toLocaleString("no-NO")}</p>`;
      if (plot.area_m2) html += `<p style="color:#94a3b8;font-size:13px;margin:0">${plot.area_m2} m²</p>`;
      if (plot.description) {
        const shortDesc = plot.description.length > 200 ? plot.description.slice(0, 200) + "..." : plot.description;
        html += `<p style="color:#475569;font-size:14px;margin:8px 0 0">${shortDesc}</p>`;
      }
      html += `</div>`;
    }

    return html;
  };

  const handleGenerateNewsletter = async () => {
    setNlGeneratingDraft(true);
    try {
      const propertyContext = nlSelectedProperties.map((p) => `${p.title} i ${p.location}, €${p.price?.toLocaleString("no-NO")}, ${p.bedrooms || "?"} soverom`).join("; ");
      const plotContext = nlSelectedPlots.map((p) => `${p.title} i ${p.municipality}, €${p.price?.toLocaleString("no-NO")}, ${p.area_m2 || "?"} m²`).join("; ");
      const reportContext = nlUseReport && nlSelectedReport ? (nlSelectedReport.content_text || nlSelectedReport.summary || "") : "";

      let aiPrompt = `Skriv et profesjonelt nyhetsbrev/e-post for ${nlCurrentBrand.name} (${nlCurrentBrand.description}).`;
      aiPrompt += `\nTonalitet: ${nlCurrentBrand.tone}`;
      aiPrompt += `\nMålgruppe: ${nlCurrentBrand.target_audience}`;

      if (reportContext) {
        aiPrompt += `\n\nBruk følgende markedsinformasjon som grunnlag:\n${reportContext.slice(0, 2000)}`;
      }

      if (nlPropertyMode === "main_topic" && propertyContext) {
        aiPrompt += `\n\nSkriv e-posten om disse eiendommene som hovedtema:\n${propertyContext}`;
      } else if (nlPropertyMode === "featured" && propertyContext) {
        aiPrompt += `\n\nInkluder en generell oppdatering og nevn at vi har utvalgte eiendommer (de legges til automatisk i bunnen).`;
      }

      if (plotContext) {
        aiPrompt += `\n\nTomter tilgjengelig: ${plotContext}`;
      }

      aiPrompt += `\n\nFormater output som ren HTML for e-post (inline CSS, ingen eksterne stylesheets). Bruk profesjonelt design med farger som matcher brandet. Maks 300 ord.`;

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "marketing",
          tasks: [{
            type: "create_content",
            parameters: {
              brand: nlBrand,
              platform: "email",
              content_type: "newsletter",
              tone: nlCurrentBrand.tone,
              topic: aiPrompt,
              language: "no",
            },
          }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let output = data.results?.[0]?.output || data.results?.[0]?.result || "";
        if (typeof output !== "string") output = JSON.stringify(output);

        // Clean up: extract HTML if wrapped in code blocks
        const htmlMatch = output.match(/```html\n?([\s\S]*?)```/);
        if (htmlMatch) output = htmlMatch[1];

        // Append featured properties section if mode is "featured"
        if (nlPropertyMode === "featured") {
          output += buildPropertyHtml();
        } else if (nlPropertyMode === "main_topic") {
          output += buildPropertyHtml();
        }

        setNlBodyHtml(output);
      } else {
        alert("Feil ved generering av nyhetsbrev");
      }
    } catch (err) {
      console.error("Newsletter generation failed:", err);
      alert("Feil ved generering av nyhetsbrev");
    }
    setNlGeneratingDraft(false);
  };

  const handleSendNewsletter = async () => {
    if (!nlSubject.trim() || !nlBodyHtml.trim()) {
      alert("Du må ha emne og innhold før du kan sende");
      return;
    }
    if (getRecipientCount() === 0) {
      alert("Ingen mottakere valgt");
      return;
    }

    const confirmed = window.confirm(
      `Send nyhetsbrev til ${getRecipientCount()} mottaker(e)?\n\nEmne: ${nlSubject}\nFra: ${nlCurrentBrand.name}`
    );
    if (!confirmed) return;

    setNlSending(true);
    setNlSendResult(null);
    try {
      const payload: Record<string, unknown> = {
        brand_id: nlBrand,
        subject: nlSubject,
        body_html: nlBodyHtml,
        body_text: nlBodyHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
        recipients: nlRecipientMode,
      };

      if (nlRecipientMode === "pipeline_phase") payload.pipeline_phase = nlPipelinePhase;
      if (nlRecipientMode === "brand") payload.brand_filter = nlBrandFilter;
      if (nlRecipientMode === "individual") payload.individual_emails = nlIndividualEmails;

      const res = await fetch("/api/email/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setNlSendResult({ sent: data.sent, failed: data.failed, total: data.total });
      } else {
        alert(`Feil: ${data.error}`);
      }
    } catch (err) {
      console.error("Newsletter send failed:", err);
      alert("Feil ved sending av nyhetsbrev");
    }
    setNlSending(false);
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
        <div className="flex items-center gap-2">
          {activeTab === "generate" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs"
            >
              <History size={14} className="mr-1.5" />
              Historikk ({history.length})
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab("generate")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "generate"
              ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
              : "text-slate-400 hover:text-slate-300"
          }`}
        >
          <Sparkles size={16} />
          Generer innhold
        </button>
        <button
          onClick={() => setActiveTab("newsletter")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "newsletter"
              ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
              : "text-slate-400 hover:text-slate-300"
          }`}
        >
          <Mail size={16} />
          E-post / Nyhetsbrev
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* GENERATE TAB */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === "generate" && (<>
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

              {/* File Upload */}
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                  Last opp bilder / video (valgfritt)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.multiple = true;
                      input.accept = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";
                      input.onchange = (e) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files) {
                          setUploadedFiles((prev) => [...prev, ...Array.from(files)]);
                        }
                      };
                      input.click();
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-slate-600 bg-slate-800/50 text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-colors text-sm"
                  >
                    <Upload size={16} />
                    Velg filer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/jpeg,image/png,image/webp";
                      input.onchange = (e) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files) {
                          setUploadedFiles((prev) => [...prev, ...Array.from(files)]);
                        }
                      };
                      input.click();
                    }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300 transition-colors text-xs"
                  >
                    <Image size={14} />
                    Bilde
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "video/mp4,video/quicktime,video/webm";
                      input.onchange = (e) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files) {
                          setUploadedFiles((prev) => [...prev, ...Array.from(files)]);
                        }
                      };
                      input.click();
                    }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300 transition-colors text-xs"
                  >
                    <Video size={14} />
                    Video
                  </button>
                </div>
                {uploadedFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {uploadedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 rounded px-2 py-1">
                        {file.type.startsWith("video/") ? <Video size={12} /> : <Image size={12} />}
                        <span className="flex-1 truncate">{file.name}</span>
                        <span className="text-slate-600">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                        <button
                          onClick={() => setUploadedFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-slate-500 hover:text-red-400"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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

      {/* History Section -- still inside generate tab */}
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
      </>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* NEWSLETTER TAB */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === "newsletter" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Configuration */}
          <div className="lg:col-span-1 space-y-4">
            {/* Brand Selector */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette size={16} className="text-amber-400" />
                  Avsender (Brand)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <select
                  value={nlBrand}
                  onChange={(e) => setNlBrand(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-primary-500 focus:outline-none"
                >
                  {BRANDS.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: nlCurrentBrand.color }} />
                  <span className="text-xs text-slate-400">{nlCurrentBrand.description}</span>
                </div>
              </CardContent>
            </Card>

            {/* Recipient Selector */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users size={16} className="text-blue-400" />
                  Mottakere
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {getRecipientCount()} stk
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "all" as const, label: "Alle kontakter", icon: Users },
                    { id: "pipeline_phase" as const, label: "Pipeline-fase", icon: Filter },
                    { id: "brand" as const, label: "Per brand", icon: Palette },
                    { id: "individual" as const, label: "Velg enkelt", icon: Search },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setNlRecipientMode(mode.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-all ${
                        nlRecipientMode === mode.id
                          ? "border-blue-500/50 bg-blue-500/10 text-slate-100"
                          : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      <mode.icon size={14} />
                      <span className="text-xs">{mode.label}</span>
                    </button>
                  ))}
                </div>

                {nlRecipientMode === "pipeline_phase" && (
                  <select
                    value={nlPipelinePhase}
                    onChange={(e) => setNlPipelinePhase(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>{PIPELINE_LABELS[s] || s}</option>
                    ))}
                  </select>
                )}

                {nlRecipientMode === "brand" && (
                  <select
                    value={nlBrandFilter}
                    onChange={(e) => setNlBrandFilter(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Alle brands</option>
                    {BRANDS.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}

                {nlRecipientMode === "individual" && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Søk kontakter..."
                        value={nlContactSearch}
                        onChange={(e) => setNlContactSearch(e.target.value)}
                        className="w-full h-9 rounded-lg border border-slate-600 bg-slate-800 pl-9 pr-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
                      {filteredContacts.slice(0, 50).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => toggleIndividualEmail(c.email)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                            nlIndividualEmails.includes(c.email)
                              ? "bg-blue-500/15 border border-blue-500/30"
                              : "bg-slate-800/50 border border-slate-700 hover:border-slate-600"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                            nlIndividualEmails.includes(c.email)
                              ? "bg-blue-500 border-blue-500 text-white"
                              : "border-slate-600"
                          }`}>
                            {nlIndividualEmails.includes(c.email) && "✓"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-200 truncate">{c.name || "Ukjent"}</p>
                            <p className="text-[10px] text-slate-500 truncate">{c.email}</p>
                          </div>
                          <Badge variant="outline" className="text-[9px] shrink-0">
                            {PIPELINE_LABELS[c.pipeline_status] || c.pipeline_status}
                          </Badge>
                        </button>
                      ))}
                    </div>
                    {nlIndividualEmails.length > 0 && (
                      <p className="text-[10px] text-blue-400">{nlIndividualEmails.length} valgt</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Market Intelligence Import */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Newspaper size={16} className="text-emerald-400" />
                  Market Intelligence
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={nlUseReport}
                    onChange={(e) => {
                      setNlUseReport(e.target.checked);
                      if (!e.target.checked) setNlSelectedReport(null);
                    }}
                    className="rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-slate-300">Bruk markedsdata i e-post</span>
                </label>

                {nlUseReport && (
                  <div className="space-y-1.5">
                    {nlReports.length === 0 ? (
                      <p className="text-xs text-slate-500">Ingen rapporter funnet. Generer i Market Intelligence først.</p>
                    ) : (
                      <div className="max-h-36 overflow-y-auto space-y-1 scrollbar-thin">
                        {nlReports.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => setNlSelectedReport(r)}
                            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                              nlSelectedReport?.id === r.id
                                ? "border-emerald-500/50 bg-emerald-500/10"
                                : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                            }`}
                          >
                            <p className="text-xs text-slate-200 truncate">{r.title}</p>
                            <p className="text-[10px] text-slate-500">
                              {new Date(r.generated_at).toLocaleDateString("nb-NO")}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Content & Properties */}
          <div className="lg:col-span-2 space-y-4">
            {/* Email Subject & Content */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail size={16} className="text-blue-400" />
                  E-postinnhold
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Emne</label>
                  <Input
                    placeholder="F.eks. Nye eiendommer i Costa Blanca - april 2026"
                    value={nlSubject}
                    onChange={(e) => setNlSubject(e.target.value)}
                  />
                </div>

                {/* Property/Plot Picker */}
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                    Eiendommer / Tomter i e-post
                  </label>
                  <div className="flex gap-2 mb-2">
                    {[
                      { id: "none" as const, label: "Ingen" },
                      { id: "main_topic" as const, label: "Hovedtema" },
                      { id: "featured" as const, label: "Utvalgte (bunn)" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setNlPropertyMode(m.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          nlPropertyMode === m.id
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            : "bg-slate-700/50 text-slate-400 border border-slate-600 hover:border-slate-500"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {nlPropertyMode !== "none" && (
                    <div className="space-y-2">
                      {/* Properties */}
                      <div className="border border-slate-700 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Building2 size={14} className="text-cyan-400" />
                          <span className="text-xs font-medium text-slate-300">Eiendommer</span>
                          {nlSelectedProperties.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] ml-auto">{nlSelectedProperties.length} valgt</Badge>
                          )}
                        </div>
                        <div className="relative mb-2">
                          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                          <input
                            type="text"
                            placeholder="Søk eiendommer..."
                            value={nlPropertySearch}
                            onChange={(e) => setNlPropertySearch(e.target.value)}
                            className="w-full h-8 rounded border border-slate-600 bg-slate-800 pl-8 pr-3 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1 scrollbar-thin">
                          {filteredProperties.slice(0, 30).map((p) => (
                            <button
                              key={p.id}
                              onClick={() => toggleProperty(p)}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                                nlSelectedProperties.find((sp) => sp.id === p.id)
                                  ? "bg-cyan-500/15 border border-cyan-500/30"
                                  : "bg-slate-800/30 border border-transparent hover:bg-slate-800/60"
                              }`}
                            >
                              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] ${
                                nlSelectedProperties.find((sp) => sp.id === p.id)
                                  ? "bg-cyan-500 border-cyan-500 text-white"
                                  : "border-slate-600"
                              }`}>
                                {nlSelectedProperties.find((sp) => sp.id === p.id) && "✓"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-200 truncate">{p.title}</p>
                                <p className="text-[10px] text-slate-500">{p.location} · €{p.price?.toLocaleString("no-NO")}</p>
                              </div>
                            </button>
                          ))}
                          {filteredProperties.length === 0 && (
                            <p className="text-xs text-slate-500 py-2 text-center">Ingen eiendommer funnet</p>
                          )}
                        </div>
                      </div>

                      {/* Plots */}
                      <div className="border border-slate-700 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <MapPin size={14} className="text-green-400" />
                          <span className="text-xs font-medium text-slate-300">Tomter</span>
                          {nlSelectedPlots.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] ml-auto">{nlSelectedPlots.length} valgt</Badge>
                          )}
                        </div>
                        <div className="relative mb-2">
                          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                          <input
                            type="text"
                            placeholder="Søk tomter..."
                            value={nlPlotSearch}
                            onChange={(e) => setNlPlotSearch(e.target.value)}
                            className="w-full h-8 rounded border border-slate-600 bg-slate-800 pl-8 pr-3 text-xs text-slate-100 focus:border-green-500 focus:outline-none"
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1 scrollbar-thin">
                          {filteredPlots.slice(0, 30).map((p) => (
                            <button
                              key={p.id}
                              onClick={() => togglePlot(p)}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                                nlSelectedPlots.find((sp) => sp.id === p.id)
                                  ? "bg-green-500/15 border border-green-500/30"
                                  : "bg-slate-800/30 border border-transparent hover:bg-slate-800/60"
                              }`}
                            >
                              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] ${
                                nlSelectedPlots.find((sp) => sp.id === p.id)
                                  ? "bg-green-500 border-green-500 text-white"
                                  : "border-slate-600"
                              }`}>
                                {nlSelectedPlots.find((sp) => sp.id === p.id) && "✓"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-200 truncate">{p.title}</p>
                                <p className="text-[10px] text-slate-500">{p.municipality} · €{p.price?.toLocaleString("no-NO")}</p>
                              </div>
                            </button>
                          ))}
                          {filteredPlots.length === 0 && (
                            <p className="text-xs text-slate-500 py-2 text-center">Ingen tomter funnet</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Generate or Write Content */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleGenerateNewsletter}
                    disabled={nlGeneratingDraft}
                    className="flex-1"
                  >
                    {nlGeneratingDraft ? (
                      <><Loader2 size={16} className="mr-2 animate-spin" /> Genererer...</>
                    ) : (
                      <><Sparkles size={16} className="mr-2" /> Generer med AI</>
                    )}
                  </Button>
                </div>

                {/* Content Editor */}
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                    E-post innhold (HTML)
                  </label>
                  <textarea
                    value={nlBodyHtml}
                    onChange={(e) => setNlBodyHtml(e.target.value)}
                    rows={12}
                    placeholder="Skriv e-postinnhold her eller generer med AI..."
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 resize-none focus:border-blue-500 focus:outline-none font-mono text-xs"
                  />
                </div>

                {/* Preview Toggle */}
                {nlBodyHtml && (
                  <div>
                    <button
                      onClick={() => setNlShowPreview(!nlShowPreview)}
                      className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <Eye size={14} />
                      {nlShowPreview ? "Skjul forhåndsvisning" : "Vis forhåndsvisning"}
                    </button>
                    {nlShowPreview && (
                      <div className="mt-2 border border-slate-600 rounded-lg p-4 bg-white">
                        <div
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: nlBodyHtml }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Send Section */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium text-slate-200">Klar til sending</p>
                    <p className="text-xs text-slate-400">
                      {getRecipientCount()} mottaker(e) · Fra {nlCurrentBrand.name}
                    </p>
                  </div>
                  <Button
                    onClick={handleSendNewsletter}
                    disabled={nlSending || !nlSubject.trim() || !nlBodyHtml.trim() || getRecipientCount() === 0}
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {nlSending ? (
                      <><Loader2 size={18} className="mr-2 animate-spin" /> Sender...</>
                    ) : (
                      <><Send size={18} className="mr-2" /> Send nyhetsbrev</>
                    )}
                  </Button>
                </div>

                {nlSendResult && (
                  <div className={`p-3 rounded-lg border ${
                    nlSendResult.failed === 0
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : "bg-amber-500/10 border-amber-500/30"
                  }`}>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className={nlSendResult.failed === 0 ? "text-emerald-400" : "text-amber-400"} />
                      <span className="text-sm text-slate-200">
                        {nlSendResult.sent} av {nlSendResult.total} e-poster sendt
                        {nlSendResult.failed > 0 && ` (${nlSendResult.failed} feilet)`}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
