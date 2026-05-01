"use client";

import { FormEvent, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart3,
  Bath,
  Bed,
  Brain,
  CheckCircle2,
  Copy,
  Database,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Maximize,
  Minus,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

type Comparable = {
  address?: string;
  location?: string;
  price?: number;
  area?: number;
  bedrooms?: number;
  bathrooms?: number;
  source?: string;
  date?: string;
};

type ValuationResult = {
  low: number;
  agent: number;
  high: number;
  pricePerM2: number;
  confidence: number;
  sourceScore: number;
  aiSummary?: string;
  pricingStrategy: string;
  sellerReport: string;
  marketSignals: string[];
  methodology: string[];
  dataSources: string[];
  factors: { label: string; impact: "positive" | "neutral" | "negative"; detail: string }[];
  comparable: Array<Comparable & { pricePerM2: number; adjustedPricePerM2: number; weight: number }>;
};

const propertyTypes = ["Leilighet", "Villa", "Rekkehus", "Penthouse", "Bungalow", "Tomt"];
const conditions = ["Nybygget", "Meget god", "God", "Middels", "Oppussingsobjekt"];
const amenities = [
  "Basseng",
  "Havutsikt",
  "Garasje",
  "Hage",
  "Terrasse",
  "Aircondition",
  "Heis",
  "Nær sjø",
  "Nær golf",
  "Utleiepotensial",
];

const exampleMarketData = `Idealista/CASAFARI/Tinsa/Notariado-data kan limes inn her.
Eksempel:
Altea: 3.350 €/m2, +8,4% siste 12 mnd, lavt tilbud av moderne villaer.
Sammenlignbare boliger med havutsikt ligger ofte 10-20% over snittet.
Gjennomsnittlig tid i markedet for riktig prisede villaer: 60-90 dager.`;

function parseComparables(value: string): Comparable[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(";").map((part) => part.trim());
      return {
        address: parts[0] || "",
        price: Number(parts[1]?.replace(/[^\d]/g, "")) || undefined,
        area: Number(parts[2]?.replace(/[^\d]/g, "")) || undefined,
        bedrooms: Number(parts[3]?.replace(/[^\d]/g, "")) || undefined,
        bathrooms: Number(parts[4]?.replace(/[^\d]/g, "")) || undefined,
        source: parts[5] || "",
        date: parts[6] || "",
      };
    })
    .filter((item) => item.price && item.area);
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function impactIcon(impact: string) {
  if (impact === "positive") return <TrendingUp size={14} className="text-emerald-400" />;
  if (impact === "negative") return <TrendingDown size={14} className="text-red-400" />;
  return <Minus size={14} className="text-amber-400" />;
}

export default function ValuationPage() {
  const [formData, setFormData] = useState({
    ref: "",
    title: "",
    type: "Villa",
    location: "",
    bedrooms: "",
    bathrooms: "",
    area: "",
    plotSize: "",
    yearBuilt: "",
    condition: "God",
    askingPrice: "",
    sellerName: "",
    sellerEmail: "",
    sellerPhone: "",
    sellerNotes: "",
    marketData: "",
    comparablesText: "",
    selectedAmenities: [] as string[],
  });
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sendToSeller, setSendToSeller] = useState(false);
  const [status, setStatus] = useState("");

  const comparables = useMemo(() => parseComparables(formData.comparablesText), [formData.comparablesText]);

  function updateField(field: keyof typeof formData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function handleAmenityToggle(amenity: string) {
    setFormData((prev) => ({
      ...prev,
      selectedAmenities: prev.selectedAmenities.includes(amenity)
        ? prev.selectedAmenities.filter((item) => item !== amenity)
        : [...prev.selectedAmenities, amenity],
    }));
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setStatus("");
    setResult(null);

    const response = await fetch("/api/valuations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...formData,
        amenities: formData.selectedAmenities,
        comparables,
        marketData: formData.marketData,
        sendToSeller,
      }),
    });

    const data = await response.json().catch(() => ({}));
    setIsLoading(false);

    if (!response.ok) {
      setStatus(data.error || "Kunne ikke lage vurdering.");
      return;
    }

    setResult(data.analysis);
    if (data.saveWarning) {
      setStatus(`Vurdering laget, men ikke lagret i database: ${data.saveWarning}`);
    } else if (sendToSeller) {
      setStatus(data.emailResult?.success ? "Vurderingen er sendt til selger." : data.emailResult?.error || "Vurdering lagret, men e-post ble ikke sendt.");
    } else {
      setStatus("Vurdering lagret i RealtyFlow.");
    }
  }

  async function copyReport() {
    if (!result) return;
    await navigator.clipboard.writeText(result.sellerReport);
    setStatus("Rapporttekst kopiert.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="text-purple-400" size={28} />
            AI Eiendomsvurdering
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Lag en datadrevet prisvurdering med selgerinformasjon, markedsdata, sammenlignbare objekter og profesjonell rapport.
          </p>
        </div>
        <Badge className="w-fit border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          <Database size={12} className="mr-1" />
          Klar for Idealista, CASAFARI og egne scanner-data
        </Badge>
      </div>

      <form onSubmit={handleGenerate} className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Eiendom og selger</CardTitle>
              <CardDescription>Jo mer presis input, desto bedre confidence-score.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Referanse" value={formData.ref} onChange={(event) => updateField("ref", event.target.value)} />
                <Input placeholder="Tittel/navn" value={formData.title} onChange={(event) => updateField("title", event.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <select value={formData.type} onChange={(event) => updateField("type", event.target.value)} className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                  {propertyTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
                <select value={formData.condition} onChange={(event) => updateField("condition", event.target.value)} className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                  {conditions.map((condition) => <option key={condition}>{condition}</option>)}
                </select>
              </div>

              <div className="relative">
                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input className="pl-9" placeholder="Område, f.eks. Altea, Finestrat, Calpe" value={formData.location} onChange={(event) => updateField("location", event.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <Bed size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input className="pl-9" placeholder="Soverom" type="number" value={formData.bedrooms} onChange={(event) => updateField("bedrooms", event.target.value)} />
                </div>
                <div className="relative">
                  <Bath size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input className="pl-9" placeholder="Bad" type="number" value={formData.bathrooms} onChange={(event) => updateField("bathrooms", event.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="relative">
                  <Maximize size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input className="pl-9" placeholder="Bolig m2" type="number" value={formData.area} onChange={(event) => updateField("area", event.target.value)} required />
                </div>
                <Input placeholder="Tomt m2" type="number" value={formData.plotSize} onChange={(event) => updateField("plotSize", event.target.value)} />
                <Input placeholder="Byggeår" type="number" value={formData.yearBuilt} onChange={(event) => updateField("yearBuilt", event.target.value)} />
              </div>

              <Input placeholder="Selgers ønskede pris, hvis kjent" type="number" value={formData.askingPrice} onChange={(event) => updateField("askingPrice", event.target.value)} />

              <div className="flex flex-wrap gap-2">
                {amenities.map((amenity) => (
                  <button
                    key={amenity}
                    type="button"
                    onClick={() => handleAmenityToggle(amenity)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      formData.selectedAmenities.includes(amenity)
                        ? "border-primary-500/30 bg-primary-500/20 text-primary-300"
                        : "border-slate-600 bg-slate-700/50 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    {amenity}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Selger og utsending</CardTitle>
              <CardDescription>Brukes i rapporttekst og valgfri e-post.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Selgers navn" value={formData.sellerName} onChange={(event) => updateField("sellerName", event.target.value)} />
              <Input placeholder="Selgers e-post" type="email" value={formData.sellerEmail} onChange={(event) => updateField("sellerEmail", event.target.value)} />
              <Input placeholder="Telefon" value={formData.sellerPhone} onChange={(event) => updateField("sellerPhone", event.target.value)} />
              <textarea
                className="min-h-24 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500"
                placeholder="Notater om motivasjon, tidslinje, eiersituasjon, ønsket salgspris..."
                value={formData.sellerNotes}
                onChange={(event) => updateField("sellerNotes", event.target.value)}
              />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={sendToSeller} onChange={(event) => setSendToSeller(event.target.checked)} />
                Send prisvurdering direkte til selger
              </label>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Markedsdata og sammenlignbare objekter</CardTitle>
              <CardDescription>
                Lim inn tall fra Idealista, CASAFARI, Tinsa, Notariado, egne scanner-funn eller meglerrapporter.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                className="min-h-36 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500"
                placeholder={exampleMarketData}
                value={formData.marketData}
                onChange={(event) => updateField("marketData", event.target.value)}
              />
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Sammenlignbare objekter</label>
                  <span className="text-xs text-slate-500">{comparables.length} gyldige</span>
                </div>
                <textarea
                  className="min-h-28 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500"
                  placeholder={"Ett objekt per linje:\nAdresse/område; pris; m2; soverom; bad; kilde; dato\nAltea Hills villa; 895000; 245; 4; 3; Idealista; 2026-04"}
                  value={formData.comparablesText}
                  onChange={(event) => updateField("comparablesText", event.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button disabled={isLoading} type="submit">
                  {isLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}
                  {sendToSeller ? "Generer og send" : "Generer vurdering"}
                </Button>
                {result && (
                  <Button type="button" variant="outline" onClick={copyReport}>
                    <Copy size={16} className="mr-2" />
                    Kopier rapport
                  </Button>
                )}
              </div>
              {status && <p className="text-sm text-slate-300">{status}</p>}
            </CardContent>
          </Card>

          {!result && !isLoading && (
            <Card className="min-h-80">
              <CardContent className="flex min-h-80 items-center justify-center">
                <div className="max-w-md text-center">
                  <FileText size={56} className="mx-auto mb-4 text-slate-600" />
                  <h3 className="mb-2 text-lg font-semibold text-slate-300">Klar for profesjonell prisvurdering</h3>
                  <p className="text-sm text-slate-500">
                    Best resultat får du med område, areal, standard, 3-6 sammenlignbare objekter og ferske markedsnotater fra Idealista/CASAFARI eller egne scanner-funn.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {isLoading && (
            <Card className="min-h-80">
              <CardContent className="flex min-h-80 items-center justify-center">
                <div className="text-center">
                  <Loader2 size={44} className="mx-auto mb-4 animate-spin text-purple-400" />
                  <h3 className="text-lg font-semibold text-slate-300">Bygger vurderingsgrunnlag...</h3>
                  <p className="text-sm text-slate-500">Vekter markedsdata, sammenlignbare objekter, kvaliteter og selgerrapport.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {result && !isLoading && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-base">Estimert verdi</CardTitle>
                    <div className="flex gap-2">
                      <Badge variant="success"><CheckCircle2 size={12} className="mr-1" />{result.confidence}% sikkerhet</Badge>
                      <Badge className="border border-blue-500/30 bg-blue-500/10 text-blue-300">{result.sourceScore}% kildescore</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid grid-cols-3 gap-4">
                    <div className="rounded-lg border border-slate-700/30 bg-slate-900/50 p-4 text-center">
                      <p className="mb-1 text-xs text-slate-500">Lav</p>
                      <p className="text-xl font-bold text-slate-300">{formatEuro(result.low)}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-center">
                      <p className="mb-1 text-xs text-emerald-400">Anbefalt meglerverdi</p>
                      <p className="text-2xl font-bold text-emerald-400">{formatEuro(result.agent)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-700/30 bg-slate-900/50 p-4 text-center">
                      <p className="mb-1 text-xs text-slate-500">Høy</p>
                      <p className="text-xl font-bold text-slate-300">{formatEuro(result.high)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-300">{result.aiSummary || result.pricingStrategy}</p>
                  <p className="mt-3 text-xs text-slate-500">Beregnet pris per m2: {result.pricePerM2.toLocaleString("nb-NO")} €/m2</p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><BarChart3 size={16} className="text-purple-400" />Påvirkningsfaktorer</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {result.factors.map((factor, index) => (
                      <div key={index} className="flex items-start gap-3 rounded-lg bg-slate-900/30 p-3">
                        {impactIcon(factor.impact)}
                        <div>
                          <p className="text-sm font-medium text-slate-200">{factor.label}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{factor.detail}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><Database size={16} className="text-blue-400" />Datagrunnlag</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {result.dataSources.map((source) => <Badge key={source} className="mr-2 border border-slate-600 bg-slate-800 text-slate-300">{source}</Badge>)}
                    <div className="space-y-2 pt-2">
                      {result.methodology.map((item, index) => <p key={index} className="text-xs text-slate-400">- {item}</p>)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Sammenlignbare objekter</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {result.comparable.length ? result.comparable.map((item, index) => (
                    <div key={index} className="grid gap-2 rounded-lg bg-slate-900/30 p-3 md:grid-cols-[1fr_auto]">
                      <div>
                        <p className="text-sm text-slate-200">{item.address || item.location || "Sammenlignbart objekt"}</p>
                        <p className="text-xs text-slate-500">{item.area} m2 · {item.bedrooms || "-"} sov · {item.source || "Kilde ikke oppgitt"} · vekt {item.weight.toFixed(2)}</p>
                      </div>
                      <p className="text-sm font-semibold text-emerald-400">{formatEuro(item.price || 0)} / {item.adjustedPricePerM2.toLocaleString("nb-NO")} €/m2</p>
                    </div>
                  )) : <p className="text-sm text-slate-500">Ingen sammenlignbare objekter lagt inn. Legg inn 3-6 for høyere sikkerhet.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><Mail size={16} className="text-emerald-400" />Selgerrapport</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm leading-relaxed text-slate-200">{result.sellerReport}</pre>
                  <div className="mt-3 flex gap-3">
                    <Button type="button" variant="outline" onClick={copyReport}><Copy size={16} className="mr-2" />Kopier</Button>
                    <Button type="button" variant="outline" onClick={() => setSendToSeller(true)}><Send size={16} className="mr-2" />Klar for utsending</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
