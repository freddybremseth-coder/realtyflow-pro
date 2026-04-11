"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Youtube, Upload, Eye, Home, MapPin, Bed, Bath, Maximize, Euro,
  Loader2, Sparkles, ChevronLeft, ChevronRight, Play, Pause, Globe,
  Image as ImageIcon, Copy, Check, ExternalLink, Tag, X,
} from "lucide-react";
import { BRANDS } from "@/lib/constants";

interface Property {
  id: string;
  ref: string;
  title: string;
  description: string;
  location: string;
  town: string;
  price: number;
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  built_area: number;
  plot_size: number;
  pool: boolean;
  garage: boolean;
  year_built: number;
  energy_rating: string;
  primary_image: string;
  gallery: string[];
  status: string;
}

const realEstateBrands = BRANDS.filter((b) => b.type === "real_estate");

function PropertyVideoContent() {
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("id");
  const [selectedBrand, setSelectedBrand] = useState(realEstateBrands[0]?.id || "");
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [loadingProperties, setLoadingProperties] = useState(false);

  // SEO generation
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoTags, setSeoTags] = useState<string[]>([]);
  const [seoLanguage, setSeoLanguage] = useState("en");
  const [generatingSeo, setGeneratingSeo] = useState(false);
  const [seoError, setSeoError] = useState<string | null>(null);

  // Slideshow preview
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const slideTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ videoId: string; url: string } | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Auto-render pipeline
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState<string>("");
  const [renderStep, setRenderStep] = useState(0);

  const brand = BRANDS.find((b) => b.id === selectedBrand);

  const fetchProperties = useCallback(async () => {
    setLoadingProperties(true);
    try {
      const res = await fetch("/api/properties");
      const data = await res.json();
      if (Array.isArray(data)) {
        setProperties(
          data.map((row: Record<string, unknown>) => ({
            id: String(row.id || ""),
            ref: String(row.ref || ""),
            title: String(row.title || row.title_no || row.title_en || row.title_es || ""),
            description: String(row.description || row.description_no || row.description_en || ""),
            location: String(row.location || ""),
            town: String(row.town || ""),
            price: Number(row.price || 0),
            property_type: String(row.property_type || ""),
            bedrooms: Number(row.bedrooms || 0),
            bathrooms: Number(row.bathrooms || 0),
            built_area: Number(row.built_area || 0),
            plot_size: Number(row.plot_size || 0),
            pool: Boolean(row.pool),
            garage: Boolean(row.garage),
            year_built: Number(row.year_built || 0),
            energy_rating: String(row.energy_rating || ""),
            primary_image: String(row.primary_image || ""),
            gallery: Array.isArray(row.gallery) ? row.gallery : [],
            floorplans: Array.isArray(row.floorplans) ? row.floorplans : [],
            status: String(row.status || ""),
          }))
        );
      }
    } catch (err) {
      console.error("Failed to fetch properties:", err);
    }
    setLoadingProperties(false);
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  // Auto-select property from URL query param
  useEffect(() => {
    if (preselectedId && properties.length > 0 && !selectedProperty) {
      const match = properties.find((p) => p.id === preselectedId);
      if (match) selectProperty(match);
    }
  }, [preselectedId, properties, selectedProperty]);

  const allImages = selectedProperty
    ? [selectedProperty.primary_image, ...(selectedProperty.gallery || [])].filter(Boolean)
    : [];

  // Slideshow auto-play
  useEffect(() => {
    if (isPlaying && allImages.length > 1) {
      slideTimer.current = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % allImages.length);
      }, 3000);
    }
    return () => {
      if (slideTimer.current) clearInterval(slideTimer.current);
    };
  }, [isPlaying, allImages.length]);

  const generateSeo = async () => {
    if (!selectedProperty) return;
    setGeneratingSeo(true);
    setSeoError(null);
    try {
      const brandPayload = brand
        ? { name: brand.name, website: brand.website }
        : { name: "Real Estate Agency", website: "" };
      const res = await fetch("/api/property-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_seo",
          property: selectedProperty,
          brand: brandPayload,
          language: seoLanguage,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        setSeoError(`API feil (${res.status}): ${errText}`);
        setGeneratingSeo(false);
        return;
      }
      const data = await res.json();
      if (data.error) {
        setSeoError(data.error);
      }
      if (data.title) setSeoTitle(data.title);
      if (data.description) setSeoDescription(data.description);
      if (data.tags) setSeoTags(data.tags);
    } catch (err) {
      setSeoError(err instanceof Error ? err.message : "Nettverksfeil");
    }
    setGeneratingSeo(false);
  };

  const uploadToYouTube = async () => {
    if (!videoFile || !seoTitle) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", videoFile);
      formData.append("title", seoTitle);
      formData.append("description", seoDescription);
      formData.append("tags", seoTags.join(","));
      formData.append("categoryId", "22"); // People & Blogs / Real Estate
      formData.append("privacyStatus", "private"); // Start as private so user can review

      const res = await fetch("/api/youtube", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.videoId) {
        setUploadResult({ videoId: data.videoId, url: data.youtubeUrl || `https://youtube.com/watch?v=${data.videoId}` });
      }
    } catch (err) {
      console.error("Upload failed:", err);
    }
    setUploading(false);
  };

  const renderAndUpload = async () => {
    if (!selectedProperty || !seoTitle || allImages.length === 0) return;
    setRendering(true);
    setRenderProgress("Starter...");
    setRenderStep(0);
    setUploadResult(null);

    try {
      const res = await fetch("/api/property-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "render_and_upload",
          imageUrls: allImages,
          title: seoTitle,
          description: seoDescription,
          tags: seoTags,
          privacyStatus: "private",
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Kunne ikke starte rendering");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "heartbeat") continue;
            if (data.message) setRenderProgress(data.message);
            if (data.step) setRenderStep(data.step);
            if (data.completed && data.youtubeUrl) {
              setUploadResult({ videoId: data.videoId, url: data.youtubeUrl });
            }
            if (data.error) {
              setRenderProgress(`Feil: ${data.error}`);
            }
          } catch {}
        }
      }
    } catch (err) {
      setRenderProgress(`Feil: ${err instanceof Error ? err.message : "Ukjent feil"}`);
    } finally {
      setRendering(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const selectProperty = (p: Property) => {
    setSelectedProperty(p);
    setCurrentSlide(0);
    setIsPlaying(false);
    setSeoTitle("");
    setSeoDescription("");
    setSeoTags([]);
    setUploadResult(null);
    setVideoFile(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center">
            <Youtube className="text-red-400" size={20} />
          </div>
          Eiendomsvideo for YouTube
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Velg eiendom, generer SEO-innhold, og publiser på YouTube
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Property selection */}
        <div className="space-y-4">
          {/* Brand filter */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Velg brand</p>
              <div className="flex flex-wrap gap-2">
                {realEstateBrands.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBrand(b.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      selectedBrand === b.id
                        ? "text-white shadow-lg"
                        : "text-slate-400 bg-slate-800 hover:bg-slate-700"
                    }`}
                    style={selectedBrand === b.id ? { backgroundColor: b.color } : {}}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Property list */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Velg eiendom ({properties.length})
              </p>
              {loadingProperties ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {properties.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">Ingen eiendommer funnet</p>
                  ) : (
                    properties.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectProperty(p)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          selectedProperty?.id === p.id
                            ? "border-primary-400 bg-primary-400/5"
                            : "border-slate-700 hover:border-slate-600 bg-slate-800/50"
                        }`}
                      >
                        <div className="flex gap-3">
                          {p.primary_image ? (
                            <img src={p.primary_image} alt="" className="w-16 h-12 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-16 h-12 rounded bg-slate-700 flex items-center justify-center flex-shrink-0">
                              <Home size={16} className="text-slate-500" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-200 truncate">{p.title || p.ref || "Eiendom"}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                              <span className="flex items-center gap-0.5"><MapPin size={10} />{p.town || p.location}</span>
                              <span>€{Number(p.price || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-600">
                              {p.bedrooms > 0 && <span>{p.bedrooms} sov</span>}
                              {p.built_area > 0 && <span>{p.built_area}m²</span>}
                              {(p.gallery?.length || 0) > 0 && (
                                <span className="flex items-center gap-0.5"><ImageIcon size={8} />{(p.gallery?.length || 0) + (p.primary_image ? 1 : 0)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Center: Preview + SEO */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedProperty ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Home size={48} className="mx-auto text-slate-600 mb-4" />
                <h2 className="text-lg font-semibold text-slate-400">Velg en eiendom</h2>
                <p className="text-sm text-slate-500 mt-1">Velg eiendom fra listen til venstre for å starte</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Image Slideshow Preview */}
              <Card>
                <CardContent className="p-0 relative">
                  <div className="aspect-video bg-black rounded-t-lg overflow-hidden relative">
                    {allImages.length > 0 ? (
                      <>
                        <img
                          src={allImages[currentSlide]}
                          alt={`Slide ${currentSlide + 1}`}
                          className="w-full h-full object-cover transition-opacity duration-500"
                        />
                        {/* Text overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30">
                          {/* Top: Brand */}
                          <div className="absolute top-4 left-4 flex items-center gap-2">
                            <div className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: brand?.color || "#06b6d4" }}>
                              {brand?.name}
                            </div>
                          </div>
                          {/* Top right: website */}
                          <div className="absolute top-4 right-4">
                            <div className="flex items-center gap-1 text-xs text-white/80 bg-black/40 px-2 py-1 rounded">
                              <Globe size={10} />
                              {brand?.website?.replace("https://", "")}
                            </div>
                          </div>
                          {/* Bottom: Property info */}
                          <div className="absolute bottom-0 left-0 right-0 p-4">
                            <h3 className="text-lg font-bold text-white mb-2 drop-shadow-lg">
                              {selectedProperty.title || `${selectedProperty.property_type} in ${selectedProperty.town}`}
                            </h3>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-white/90">
                              <span className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded">
                                <Euro size={14} className="text-emerald-400" />
                                {Number(selectedProperty.price || 0).toLocaleString()}
                              </span>
                              {selectedProperty.bedrooms > 0 && (
                                <span className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded">
                                  <Bed size={14} className="text-blue-400" />
                                  {selectedProperty.bedrooms}
                                </span>
                              )}
                              {selectedProperty.bathrooms > 0 && (
                                <span className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded">
                                  <Bath size={14} className="text-cyan-400" />
                                  {selectedProperty.bathrooms}
                                </span>
                              )}
                              {selectedProperty.built_area > 0 && (
                                <span className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded">
                                  <Maximize size={14} className="text-amber-400" />
                                  {selectedProperty.built_area}m²
                                </span>
                              )}
                              <span className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded">
                                <MapPin size={14} className="text-red-400" />
                                {selectedProperty.town || selectedProperty.location}
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <ImageIcon size={48} className="mx-auto text-slate-600 mb-2" />
                          <p className="text-sm text-slate-500">Ingen bilder tilgjengelig</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Slideshow controls */}
                  {allImages.length > 1 && (
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setCurrentSlide((prev) => (prev - 1 + allImages.length) % allImages.length)}>
                          <ChevronLeft size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsPlaying(!isPlaying)}>
                          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setCurrentSlide((prev) => (prev + 1) % allImages.length)}>
                          <ChevronRight size={14} />
                        </Button>
                      </div>
                      <span className="text-xs text-slate-400">{currentSlide + 1} / {allImages.length} bilder</span>
                      {/* Slide indicators */}
                      <div className="flex gap-1">
                        {allImages.slice(0, 10).map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setCurrentSlide(idx)}
                            className={`w-2 h-2 rounded-full transition-colors ${currentSlide === idx ? "bg-primary-400" : "bg-slate-600"}`}
                          />
                        ))}
                        {allImages.length > 10 && <span className="text-[10px] text-slate-500">+{allImages.length - 10}</span>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Image Gallery Thumbnails */}
              {allImages.length > 1 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <ImageIcon size={14} className="text-blue-400" />
                        Bildegalleri ({allImages.length} bilder)
                      </h3>
                      <span className="text-xs text-slate-400">Klikk for å velge startbilde</span>
                    </div>
                    <div className="grid grid-cols-5 gap-2 max-h-[240px] overflow-y-auto">
                      {allImages.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentSlide(idx)}
                          className={`relative aspect-video rounded-md overflow-hidden border-2 transition-all ${
                            currentSlide === idx ? "border-primary-400 ring-1 ring-primary-400/50" : "border-slate-700 hover:border-slate-500"
                          }`}
                        >
                          <img src={img} alt={`Bilde ${idx + 1}`} className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 right-0 bg-black/70 text-[9px] text-white px-1 rounded-tl">{idx + 1}</span>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Floor Plans Tab */}
              {selectedProperty && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                      <Maximize size={14} className="text-green-400" />
                      Plantegninger
                    </h3>
                    {(() => {
                      // Floor plans: use dedicated floorplans field, fallback to URL pattern in gallery
                      const dedicatedPlans = selectedProperty?.floorplans || [];
                      const galleryPlans = allImages.filter(img =>
                        /plan[oe]|floor.?plan|plantegning/i.test(img)
                      );
                      const floorPlanImages = dedicatedPlans.length > 0 ? dedicatedPlans : galleryPlans;
                      if (floorPlanImages.length > 0) {
                        return (
                          <div className="grid grid-cols-2 gap-3">
                            {floorPlanImages.map((img, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  const slideIdx = allImages.indexOf(img);
                                  if (slideIdx >= 0) setCurrentSlide(slideIdx);
                                }}
                                className="aspect-video rounded-lg overflow-hidden border border-slate-700 hover:border-green-500/50 transition-all"
                              >
                                <img src={img} alt={`Plantegning ${idx + 1}`} className="w-full h-full object-contain bg-white" />
                              </button>
                            ))}
                          </div>
                        );
                      }
                      return (
                        <p className="text-xs text-slate-500 py-4 text-center">
                          Ingen plantegninger funnet. Plantegninger vises automatisk hvis de er inkludert i bildegalleriet.
                        </p>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* SEO Generation */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Sparkles size={14} className="text-amber-400" />
                      YouTube SEO & Metadata
                    </h3>
                    <div className="flex items-center gap-2">
                      <select
                        value={seoLanguage}
                        onChange={(e) => setSeoLanguage(e.target.value)}
                        className="h-8 rounded-md border border-slate-600 bg-slate-800 px-2 text-xs text-slate-100"
                      >
                        <option value="en">English</option>
                        <option value="no">Norsk</option>
                        <option value="es">Español</option>
                        <option value="de">Deutsch</option>
                      </select>
                      <Button size="sm" onClick={generateSeo} disabled={generatingSeo}>
                        {generatingSeo ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Sparkles size={14} className="mr-1" />}
                        Generer SEO
                      </Button>
                    </div>
                  </div>

                  {/* SEO Error */}
                  {seoError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
                      <X size={14} className="text-red-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-red-300">{seoError}</p>
                    </div>
                  )}

                  {/* Title */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-400">Tittel</label>
                      {seoTitle && (
                        <button onClick={() => copyToClipboard(seoTitle, "title")} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
                          {copied === "title" ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                          Kopier
                        </button>
                      )}
                    </div>
                    <Input
                      value={seoTitle}
                      onChange={(e) => setSeoTitle(e.target.value)}
                      placeholder="Klikk 'Generer SEO' for å lage tittel..."
                      className="text-sm"
                    />
                    <p className="text-[10px] text-slate-600 mt-0.5">{seoTitle.length}/70 tegn</p>
                  </div>

                  {/* Description */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-400">Beskrivelse</label>
                      {seoDescription && (
                        <button onClick={() => copyToClipboard(seoDescription, "desc")} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
                          {copied === "desc" ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                          Kopier
                        </button>
                      )}
                    </div>
                    <textarea
                      value={seoDescription}
                      onChange={(e) => setSeoDescription(e.target.value)}
                      placeholder="AI-generert beskrivelse med CTA..."
                      className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-40 resize-none"
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-400">Tags</label>
                      {seoTags.length > 0 && (
                        <button onClick={() => copyToClipboard(seoTags.join(", "), "tags")} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
                          {copied === "tags" ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                          Kopier
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-lg border border-slate-600 bg-slate-800/50">
                      {seoTags.length > 0 ? (
                        seoTags.map((tag, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] gap-1">
                            <Tag size={8} />
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-slate-600">AI-genererte tags vises her...</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Auto Render & Upload */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sparkles size={14} className="text-amber-400" />
                    Auto-render &amp; YouTube-opplasting
                  </h3>
                  <p className="text-xs text-slate-400">
                    Lag automatisk en slideshow-video fra eiendomsbildene og last opp til YouTube.
                    Generer SEO-innhold f&oslash;rst.
                  </p>

                  {rendering && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-slate-300">
                        <Loader2 size={14} className="animate-spin text-amber-400" />
                        {renderProgress}
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-amber-500 to-red-500 h-2 rounded-full transition-all"
                          style={{ width: `${(renderStep / 5) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={renderAndUpload}
                    disabled={!seoTitle || allImages.length === 0 || rendering}
                    className="w-full bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500"
                  >
                    {rendering ? (
                      <><Loader2 size={16} className="mr-2 animate-spin" />Rendrer &amp; laster opp...</>
                    ) : (
                      <><Youtube size={16} className="mr-2" />Render video &amp; last opp til YouTube</>
                    )}
                  </Button>

                  {uploadResult && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-sm text-emerald-400 font-medium">Video publisert!</p>
                      <a
                        href={uploadResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-emerald-300 hover:underline flex items-center gap-1 mt-1"
                      >
                        <ExternalLink size={10} />
                        {uploadResult.url}
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Upload to YouTube (manual) */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Upload size={14} className="text-red-400" />
                    Manuell opplasting
                  </h3>

                  {/* Video file selector */}
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1.5 block">Videofil</label>
                    <div className="relative">
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className="w-full h-20 rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/50 flex items-center justify-center hover:border-slate-500 transition-colors">
                        {videoFile ? (
                          <div className="text-center">
                            <Play size={16} className="mx-auto text-emerald-400 mb-1" />
                            <p className="text-xs text-slate-300">{videoFile.name}</p>
                            <p className="text-[10px] text-slate-500">{(videoFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <Upload size={20} className="mx-auto text-slate-500 mb-1" />
                            <p className="text-xs text-slate-500">Velg MP4-fil eller dra og slipp</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-600">
                    Videoen lastes opp som privat. Du kan endre synlighet i YouTube Studio etterpå.
                  </p>

                  <Button
                    onClick={uploadToYouTube}
                    disabled={!videoFile || !seoTitle || uploading}
                    className="w-full bg-red-600 hover:bg-red-700"
                  >
                    {uploading ? (
                      <><Loader2 size={16} className="mr-2 animate-spin" />Laster opp...</>
                    ) : (
                      <><Youtube size={16} className="mr-2" />Last opp til YouTube</>
                    )}
                  </Button>

                  {uploadResult && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-sm text-emerald-400 font-medium">Video lastet opp!</p>
                      <a
                        href={uploadResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-emerald-300 hover:underline flex items-center gap-1 mt-1"
                      >
                        <ExternalLink size={10} />
                        {uploadResult.url}
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PropertyVideoPage() {
  return (
    <Suspense>
      <PropertyVideoContent />
    </Suspense>
  );
}
