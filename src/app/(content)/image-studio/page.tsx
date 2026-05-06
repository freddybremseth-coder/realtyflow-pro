"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/ui/image-upload";
import {
  Image as ImageIcon, Wand2, Download, Loader2, Copy, Trash2,
  Clock, Star, RefreshCw, AlertCircle, Send, CheckCircle,
  Upload, Sparkles, Link as LinkIcon,
} from "lucide-react";

interface GeneratedImage {
  id: string;
  prompt: string;
  aspectRatio: string;
  style: string;
  brand: string;
  imageUrl: string | null;
  textDescription: string;
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

const brands = [
  "Zen Eco Homes", "Soleada.no", "ChatGenius.pro",
  "Dona Anna", "Freddy Bremseth", "Pinoso Ecolife", "Neural Beat",
];

const ASPECT_RATIOS = [
  { id: "1:1", label: "1:1", desc: "Instagram" },
  { id: "16:9", label: "16:9", desc: "Facebook/LinkedIn" },
  { id: "9:16", label: "9:16", desc: "Stories/Reels" },
  { id: "4:5", label: "4:5", desc: "Instagram Feed" },
];

export default function ImageStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [style, setStyle] = useState("photo");
  const [brand, setBrand] = useState("Zen Eco Homes");
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [sendingToHub, setSendingToHub] = useState<string | null>(null);
  const [sentToHub, setSentToHub] = useState<Set<string>>(new Set());
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [variantInstructions, setVariantInstructions] = useState("");
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantError, setVariantError] = useState("");

  const sendToContentHub = async (img: GeneratedImage) => {
    setSendingToHub(img.id);
    try {
      const brandId = brands.indexOf(img.brand) >= 0
        ? img.brand.toLowerCase().replace(/[.\s]/g, "-")
        : "zeneco";
      const res = await fetch("/api/marketing-kit/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drafts: [{
            brand_id: brandId,
            content_type: "image_post",
            title: `AI-bilde: ${img.prompt.substring(0, 80)}`,
            description: img.prompt,
            tags: [img.style, img.aspectRatio],
            ai_image_url: img.imageUrl,
          }],
        }),
      });
      if (res.ok) {
        setSentToHub((prev) => new Set(prev).add(img.id));
      }
    } catch (err) {
      console.error("Failed to send to Content Hub:", err);
    } finally {
      setSendingToHub(null);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/image-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, style, aspectRatio, brand, persist: true, bankKind: "image" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Kunne ikke generere bilde");
        // Still save as text-only result if we got a text response
        if (data.textResponse) {
          const newImage: GeneratedImage = {
            id: `img-${Date.now()}`,
            prompt,
            aspectRatio,
            style,
            brand,
            imageUrl: null,
            textDescription: data.textResponse,
            timestamp: new Date().toLocaleString("nb-NO"),
            starred: false,
          };
          setHistory((prev) => [newImage, ...prev]);
        }
        return;
      }

      const newImage: GeneratedImage = {
        id: `img-${Date.now()}`,
        prompt,
        aspectRatio,
        style,
        brand,
        imageUrl: data.imageUrl,
        textDescription: data.textResponse || data.revisedPrompt || "",
        timestamp: new Date().toLocaleString("nb-NO"),
        starred: false,
      };

      setHistory((prev) => [newImage, ...prev]);
      setPrompt("");
    } catch (err) {
      console.error("Image generation failed:", err);
      setError("Kunne ikke nå bildegenereringstjenesten. Prøv igjen.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateVariant = async () => {
    if (!uploadedUrl || !variantInstructions.trim()) return;
    setVariantLoading(true);
    setVariantError("");

    try {
      const res = await fetch("/api/image-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: variantInstructions,
          instructions: variantInstructions,
          sourceImageUrl: uploadedUrl,
          style,
          aspectRatio,
          brand,
          persist: true,
          bankKind: "variant",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke generere variant");

      const newImage: GeneratedImage = {
        id: `variant-${Date.now()}`,
        prompt: `Variant av produktbilde: ${variantInstructions}`,
        aspectRatio,
        style,
        brand,
        imageUrl: data.imageUrl,
        textDescription: data.textResponse || data.revisedPrompt || "",
        timestamp: new Date().toLocaleString("nb-NO"),
        starred: true,
      };

      setHistory((prev) => [newImage, ...prev]);
      setVariantInstructions("");
    } catch (err) {
      setVariantError(err instanceof Error ? err.message : "Kunne ikke generere variant");
    } finally {
      setVariantLoading(false);
    }
  };

  const toggleStar = (id: string) => {
    setHistory((prev) =>
      prev.map((img) => (img.id === id ? { ...img, starred: !img.starred } : img))
    );
  };

  const deleteImage = (id: string) => {
    setHistory((prev) => prev.filter((img) => img.id !== id));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadImage = (imageUrl: string, filename: string) => {
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <ImageIcon className="text-primary-400" size={28} />
          Bilde Studio
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          AI-drevet bildegenerering for markedsføring og sosiale medier
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Totalt generert", value: history.length, color: "text-primary-400" },
          { label: "Favoritter", value: history.filter((i) => i.starred).length, color: "text-amber-400" },
          { label: "Med bilde", value: history.filter((i) => i.imageUrl).length, color: "text-emerald-400" },
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
      {/* ─── Upload reference / product image ───────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload size={18} className="text-emerald-400" />
            Last opp produktbilde
          </CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Last opp et produktbilde til biblioteket. Bruk URL-en i Ad Campaign-wizard, Content Studio eller andre verktøy.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ImageUpload
            value={uploadedUrl}
            onChange={setUploadedUrl}
            label="Velg eller dra et bilde hit"
            allowUrlEntry={false}
            uploadFields={{
              save_to_bank: "true",
              bank_kind: "product",
              bank_owner: brand,
              bank_name: `Produktbilde ${brand}`,
              bank_tags: `product,${brand}`,
            }}
          />
          {uploadedUrl && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={uploadedUrl}
                  className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-xs font-mono text-slate-300"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(uploadedUrl);
                    setCopiedUrl(true);
                    setTimeout(() => setCopiedUrl(false), 2000);
                  }}
                  className="gap-1.5"
                >
                  {copiedUrl ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedUrl ? "Kopiert" : "Kopier URL"}
                </Button>
              </div>
              <Link href="/ad-campaigns/new">
                <Button size="sm" className="gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  Bruk i ny Ad Campaign
                </Button>
              </Link>
              <div className="pt-3 space-y-2">
                <label className="text-xs font-medium text-slate-300 block">
                  Generer produktvariant med instruks
                </label>
                <textarea
                  value={variantInstructions}
                  onChange={(e) => setVariantInstructions(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 resize-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  placeholder="F.eks. plasser flasken på et middelhavskjøkken med varm morgensol, sitroner og olivengren. Behold etiketten og flasken tydelig."
                />
                {variantError && (
                  <p className="text-xs text-red-400">{variantError}</p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={variantLoading || !variantInstructions.trim()}
                  onClick={handleGenerateVariant}
                  className="gap-1.5"
                >
                  {variantLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                  {variantLoading ? "Lager variant..." : "Lag variant"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 size={18} className="text-purple-400" />
            Generer nytt bilde
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-300 mb-1.5 block">
              Beskriv bildet du vil generere
            </label>
            <textarea
              placeholder="F.eks. 'Luksus villa med infinity pool, solnedgang over Middelhavet, moderne arkitektur, drone-perspektiv'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-24 resize-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">Format</label>
              <div className="flex flex-wrap gap-2">
                {ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio.id}
                    onClick={() => setAspectRatio(ratio.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      aspectRatio === ratio.id
                        ? "bg-primary-500/20 text-primary-300 border border-primary-500/30"
                        : "bg-slate-700/50 text-slate-400 border border-slate-600 hover:border-slate-500"
                    }`}
                    title={ratio.desc}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {ASPECT_RATIOS.find((r) => r.id === aspectRatio)?.desc}
              </p>
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

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            {loading ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Wand2 size={16} className="mr-2" />
            )}
            {loading ? "Genererer bilde..." : "Generer bilde"}
          </Button>

          {loading && (
            <p className="text-xs text-slate-500">
              Bildegenerering kan ta 10-30 sekunder...
            </p>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock size={18} className="text-slate-400" />
            Genererte bilder ({history.length})
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

                  {/* Image or placeholder */}
                  {img.imageUrl ? (
                    <div className="rounded-lg overflow-hidden mb-3 bg-slate-800">
                      <img
                        src={img.imageUrl}
                        alt={img.prompt}
                        className="w-full h-auto object-cover"
                      />
                    </div>
                  ) : (
                    <div className={`bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg mb-3 flex items-center justify-center ${
                      img.aspectRatio === "16:9" ? "aspect-video" :
                      img.aspectRatio === "9:16" ? "aspect-[9/16] max-h-48" :
                      img.aspectRatio === "4:5" ? "aspect-[4/5] max-h-48" :
                      "aspect-square max-h-48"
                    }`}>
                      <div className="text-center p-4">
                        <ImageIcon size={32} className="text-slate-500 mx-auto mb-2" />
                        <p className="text-[10px] text-slate-500">Bilde ikke tilgjengelig</p>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-400 mb-2">
                    <span className="text-slate-500">Prompt:</span> {img.prompt}
                  </p>

                  {img.textDescription && (
                    <p className="text-sm text-slate-300 mb-3">{img.textDescription}</p>
                  )}

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[10px] text-slate-500">{img.timestamp}</span>
                    <div className="flex gap-2 flex-wrap">
                      {img.imageUrl && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => downloadImage(img.imageUrl!, `${img.brand}-${img.id}.png`)}
                          >
                            <Download size={12} className="mr-1" /> Last ned
                          </Button>
                          <Button
                            size="sm"
                            disabled={sendingToHub === img.id || sentToHub.has(img.id)}
                            className={`text-xs ${sentToHub.has(img.id) ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                            onClick={() => sendToContentHub(img)}
                          >
                            {sendingToHub === img.id ? (
                              <><Loader2 size={12} className="mr-1 animate-spin" /> Lagrer...</>
                            ) : sentToHub.has(img.id) ? (
                              <><CheckCircle size={12} className="mr-1" /> I Hub</>
                            ) : (
                              <><Send size={12} className="mr-1" /> Til Content Hub</>
                            )}
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(img.prompt)}>
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
      )}

      {history.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <ImageIcon size={48} className="text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-300 mb-2">Ingen bilder generert ennå</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Beskriv bildet du vil lage ovenfor, velg stil og format, og klikk &quot;Generer bilde&quot;.
              Perfekt for Instagram, Facebook, LinkedIn og mer.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
