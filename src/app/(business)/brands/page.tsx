"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BRANDS } from "@/lib/constants";
import {
  Palette, Globe, Mail, Phone, Youtube, Instagram, Linkedin,
  Settings, Plus, X, Pencil, Trash2, Check,
} from "lucide-react";

interface BrandSettings {
  youtubeChannel: string;
  youtubeChannelId: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  email: string;
  emails: string[];
  imapServer: string;
  imapPort: string;
  apiKey: string;
  phone: string;
  address: string;
}

interface BrandEntry {
  id: string;
  name: string;
  type: string;
  description: string;
  color: string;
  website?: string;
  tone?: string;
  target_audience?: string;
  specialties?: string[];
  settings: BrandSettings;
}

const emptySettings: BrandSettings = {
  youtubeChannel: "",
  youtubeChannelId: "",
  instagram: "",
  facebook: "",
  linkedin: "",
  email: "",
  emails: [],
  imapServer: "",
  imapPort: "",
  apiKey: "",
  phone: "",
  address: "",
};

const typeColors: Record<string, string> = {
  real_estate: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  saas: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  agriculture: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  personal: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  music: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  tourism: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  ecommerce: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  other: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const typeLabels: Record<string, string> = {
  real_estate: "Eiendom",
  saas: "SaaS",
  agriculture: "Jordbruk",
  personal: "Personlig",
  music: "Musikk",
  tourism: "Turisme",
  ecommerce: "E-handel",
  other: "Annet",
};

export default function BrandsPage() {
  const [brands, setBrands] = useState<BrandEntry[]>(
    BRANDS.map((b) => ({ ...b, settings: { ...emptySettings } }))
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [renamingBrand, setRenamingBrand] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingBrand, setDeletingBrand] = useState<string | null>(null);
  const [newBrand, setNewBrand] = useState({
    name: "",
    type: "real_estate",
    description: "",
    color: "#3b82f6",
    website: "",
    tone: "",
    target_audience: "",
    specialties: "",
  });

  const [newEmailInput, setNewEmailInput] = useState("");

  const selectedBrand = brands.find((b) => b.id === selectedId) || null;

  const saveSettings = useCallback(async (brandId: string) => {
    const brand = brands.find((b) => b.id === brandId);
    if (!brand) return;
    setSaving(true);
    try {
      const res = await fetch("/api/brands/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brandId,
          settings: {
            ...brand.settings,
            custom_name: brand.name,
            website: brand.website,
            description: brand.description,
            tone: brand.tone,
            target_audience: brand.target_audience,
            specialties: brand.specialties,
          },
        }),
      });
      if (res.ok) {
        setSavedToast(true);
        setTimeout(() => setSavedToast(false), 2000);
      }
    } catch {
      // silent fail
    } finally {
      setSaving(false);
    }
  }, [brands]);

  const updateSettings = (field: keyof BrandSettings, value: string) => {
    if (!selectedId) return;
    setBrands((prev) =>
      prev.map((b) =>
        b.id === selectedId
          ? { ...b, settings: { ...b.settings, [field]: value } }
          : b
      )
    );
  };

  const updateBrandField = (field: keyof BrandEntry, value: string | string[]) => {
    if (!selectedId) return;
    setBrands((prev) =>
      prev.map((b) =>
        b.id === selectedId ? { ...b, [field]: value } : b
      )
    );
  };

  const addEmail = () => {
    if (!selectedId || !newEmailInput.trim()) return;
    setBrands((prev) =>
      prev.map((b) =>
        b.id === selectedId
          ? { ...b, settings: { ...b.settings, emails: [...(b.settings.emails || []), newEmailInput.trim()] } }
          : b
      )
    );
    setNewEmailInput("");
  };

  const removeEmail = (index: number) => {
    if (!selectedId) return;
    setBrands((prev) =>
      prev.map((b) =>
        b.id === selectedId
          ? { ...b, settings: { ...b.settings, emails: (b.settings.emails || []).filter((_, i) => i !== index) } }
          : b
      )
    );
  };

  const addBrand = async () => {
    if (!newBrand.name) return;
    const id = newBrand.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const specialtiesArr = newBrand.specialties.split(",").map((s) => s.trim()).filter(Boolean);
    const brandEntry: BrandEntry = {
      id,
      name: newBrand.name,
      type: newBrand.type,
      description: newBrand.description,
      color: newBrand.color,
      website: newBrand.website,
      tone: newBrand.tone,
      target_audience: newBrand.target_audience,
      specialties: specialtiesArr,
      settings: { ...emptySettings },
    };
    setBrands((prev) => [...prev, brandEntry]);

    // Persist to Supabase via brand_settings
    try {
      await fetch("/api/brands/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: id,
          settings: {
            custom_name: newBrand.name,
            type: newBrand.type,
            description: newBrand.description,
            color: newBrand.color,
            website: newBrand.website,
            tone: newBrand.tone,
            target_audience: newBrand.target_audience,
            specialties: specialtiesArr,
            is_custom_brand: true,
          },
        }),
      });
    } catch {
      // Brand is at least in local state
    }

    setNewBrand({
      name: "",
      type: "real_estate",
      description: "",
      color: "#3b82f6",
      website: "",
      tone: "",
      target_audience: "",
      specialties: "",
    });
    setShowNewModal(false);
  };

  const renameBrand = async (brandId: string) => {
    if (!renameValue.trim()) return;
    try {
      const res = await fetch("/api/brands/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, action: "rename", new_name: renameValue.trim() }),
      });
      if (res.ok) {
        setBrands((prev) => prev.map((b) => b.id === brandId ? { ...b, name: renameValue.trim() } : b));
        setRenamingBrand(null);
        setSavedToast(true);
        setTimeout(() => setSavedToast(false), 2000);
      }
    } catch { /* silent */ }
  };

  const deleteBrand = async (brandId: string) => {
    try {
      const res = await fetch("/api/brands/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, action: "delete" }),
      });
      if (res.ok) {
        setBrands((prev) => prev.filter((b) => b.id !== brandId));
        if (selectedId === brandId) setSelectedId(null);
        setDeletingBrand(null);
      }
    } catch { /* silent */ }
  };

  // Apply custom names from brand_settings + load custom brands
  useEffect(() => {
    fetch("/api/brands/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings && Object.keys(data.settings).length > 0) {
          setBrands((prev) => {
            const existingIds = new Set(prev.map((b) => b.id));
            // Update existing brands with saved settings
            let updated = prev
              .filter((b) => !data.settings[b.id]?.deleted)
              .map((b) => {
                const s = data.settings[b.id];
                return s
                  ? {
                      ...b,
                      name: s.custom_name || b.name,
                      type: s.type || b.type,
                      website: s.website || b.website,
                      description: s.description || b.description,
                      color: s.color || b.color,
                      tone: s.tone || b.tone,
                      target_audience: s.target_audience || b.target_audience,
                      specialties: s.specialties || b.specialties,
                      settings: { ...emptySettings, ...s },
                    }
                  : b;
              });
            // Add custom brands that aren't in the hardcoded list
            for (const [brandId, settings] of Object.entries(data.settings)) {
              const s = settings as Record<string, unknown>;
              if (!existingIds.has(brandId) && s.is_custom_brand && !s.deleted) {
                updated.push({
                  id: brandId,
                  name: (s.custom_name as string) || brandId,
                  type: (s.type as string) || 'other',
                  description: (s.description as string) || '',
                  color: (s.color as string) || '#3b82f6',
                  website: (s.website as string) || '',
                  tone: (s.tone as string) || '',
                  target_audience: (s.target_audience as string) || '',
                  specialties: (s.specialties as string[]) || [],
                  settings: { ...emptySettings, ...(s as Record<string, string>) },
                });
              }
            }
            return updated;
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Palette className="text-primary-400" size={28} />
            Brands
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Administrer alle dine merkevarer og innstillinger
          </p>
        </div>
        <Button onClick={() => setShowNewModal(true)}>
          <Plus size={16} className="mr-2" />
          Ny Brand
        </Button>
      </div>

      {/* New Brand Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowNewModal(false)}
        >
          <Card
            className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Ny Brand</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowNewModal(false)}
                >
                  <X size={18} />
                </Button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                    Navn
                  </label>
                  <Input
                    value={newBrand.name}
                    onChange={(e) =>
                      setNewBrand((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="Brand navn"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                    Type
                  </label>
                  <select
                    value={newBrand.type}
                    onChange={(e) =>
                      setNewBrand((p) => ({ ...p, type: e.target.value }))
                    }
                    className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                  >
                    <option value="real_estate">Eiendom</option>
                    <option value="saas">SaaS</option>
                    <option value="agriculture">Jordbruk</option>
                    <option value="personal">Personlig</option>
                    <option value="music">Musikk</option>
                    <option value="tourism">Turisme</option>
                    <option value="ecommerce">E-handel</option>
                    <option value="other">Annet</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                    Beskrivelse
                  </label>
                  <Input
                    value={newBrand.description}
                    onChange={(e) =>
                      setNewBrand((p) => ({
                        ...p,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Kort beskrivelse"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                      Farge
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={newBrand.color}
                        onChange={(e) =>
                          setNewBrand((p) => ({ ...p, color: e.target.value }))
                        }
                        className="w-10 h-10 rounded border border-slate-600 bg-transparent cursor-pointer"
                      />
                      <Input
                        value={newBrand.color}
                        onChange={(e) =>
                          setNewBrand((p) => ({ ...p, color: e.target.value }))
                        }
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                      Nettside
                    </label>
                    <Input
                      value={newBrand.website}
                      onChange={(e) =>
                        setNewBrand((p) => ({ ...p, website: e.target.value }))
                      }
                      placeholder="https://"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                    Tone
                  </label>
                  <Input
                    value={newBrand.tone}
                    onChange={(e) =>
                      setNewBrand((p) => ({ ...p, tone: e.target.value }))
                    }
                    placeholder="profesjonell, varm, innovativ"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                    Målgruppe
                  </label>
                  <Input
                    value={newBrand.target_audience}
                    onChange={(e) =>
                      setNewBrand((p) => ({
                        ...p,
                        target_audience: e.target.value,
                      }))
                    }
                    placeholder="Hvem er målgruppen?"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                    Spesialiteter (kommaseparert)
                  </label>
                  <Input
                    value={newBrand.specialties}
                    onChange={(e) =>
                      setNewBrand((p) => ({
                        ...p,
                        specialties: e.target.value,
                      }))
                    }
                    placeholder="eiendom, luksus, costa blanca"
                  />
                </div>
                <Button
                  onClick={addBrand}
                  className="w-full"
                  disabled={!newBrand.name}
                >
                  <Plus size={16} className="mr-1" />
                  Opprett Brand
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Brand Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {brands.map((brand) => (
          <Card
            key={brand.id}
            className={`cursor-pointer transition-all hover:border-slate-500 ${
              selectedId === brand.id
                ? "ring-2 ring-primary-400 border-primary-500/50"
                : ""
            }`}
            onClick={() =>
              setSelectedId(brand.id === selectedId ? null : brand.id)
            }
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                    style={{
                      backgroundColor: brand.color + "22",
                      color: brand.color,
                    }}
                  >
                    {brand.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white text-sm truncate">
                      {brand.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: brand.color }}
                      />
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                          typeColors[brand.type] || "bg-slate-500/20 text-slate-300 border-slate-500/30"
                        }`}
                      >
                        {typeLabels[brand.type] || brand.type}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-400 mb-3 line-clamp-2">
                {brand.description}
              </p>

              {brand.website && (
                <a
                  href={brand.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 mb-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Globe size={12} />
                  {brand.website.replace(/^https?:\/\//, "")}
                </a>
              )}

              <p className="text-[10px] text-slate-500 mb-1">
                Tone: {brand.tone}
              </p>
              <p className="text-[10px] text-slate-500 mb-2">
                Målgruppe: {brand.target_audience}
              </p>

              <div className="flex flex-wrap gap-1">
                {(brand.specialties || []).map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className="text-[10px] px-1.5"
                  >
                    {s}
                  </Badge>
                ))}
              </div>

              {/* Rename / Delete actions */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                {renamingBrand === brand.id ? (
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      placeholder="Nytt navn"
                      className="h-7 text-xs"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && renameBrand(brand.id)}
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => renameBrand(brand.id)}>
                      <Check size={12} className="text-emerald-400" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setRenamingBrand(null)}>
                      <X size={12} />
                    </Button>
                  </div>
                ) : deletingBrand === brand.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs text-red-400">Slett {brand.name}?</span>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => deleteBrand(brand.id)}>
                      Ja, slett
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDeletingBrand(null)}>
                      Avbryt
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-slate-400 hover:text-white"
                      onClick={() => { setRenamingBrand(brand.id); setRenameValue(brand.name); }}
                    >
                      <Pencil size={12} className="mr-1" />
                      Endre navn
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-red-400/60 hover:text-red-400"
                      onClick={() => setDeletingBrand(brand.id)}
                    >
                      <Trash2 size={12} className="mr-1" />
                      Slett
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detail / Settings Modal */}
      {selectedBrand && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setSelectedId(null)}
        >
          <Card
            className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg"
                    style={{
                      backgroundColor: selectedBrand.color + "22",
                      color: selectedBrand.color,
                    }}
                  >
                    {selectedBrand.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {selectedBrand.name}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: selectedBrand.color }}
                      />
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
                          typeColors[selectedBrand.type] || "bg-slate-500/20 text-slate-300 border-slate-500/30"
                        }`}
                      >
                        {typeLabels[selectedBrand.type] || selectedBrand.type}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedId(null)}
                >
                  <X size={18} />
                </Button>
              </div>

              {/* Brand Info - Editable */}
              <div className="mb-6 p-4 rounded-lg bg-slate-900/50 border border-slate-700/30 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
                  <Palette size={16} className="text-primary-400" />
                  Merkevareinformasjon
                </h3>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Nettside</label>
                  <Input
                    value={selectedBrand.website || ""}
                    onChange={(e) => updateBrandField("website", e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Beskrivelse</label>
                  <textarea
                    value={selectedBrand.description || ""}
                    onChange={(e) => updateBrandField("description", e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 resize-none focus:border-primary-500 focus:outline-none h-16"
                    placeholder="Kort beskrivelse av merkevaren"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Tone</label>
                  <Input
                    value={selectedBrand.tone || ""}
                    onChange={(e) => updateBrandField("tone", e.target.value)}
                    placeholder="profesjonell, varm, innovativ"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Målgruppe</label>
                  <Input
                    value={selectedBrand.target_audience || ""}
                    onChange={(e) => updateBrandField("target_audience", e.target.value)}
                    placeholder="Hvem er målgruppen?"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Spesialiteter (kommaseparert)</label>
                  <Input
                    value={(selectedBrand.specialties || []).join(", ")}
                    onChange={(e) => updateBrandField("specialties", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                    placeholder="eiendom, luksus, costa blanca"
                  />
                </div>

                {/* Emails */}
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">E-postadresser</label>
                  <div className="space-y-1.5 mb-2">
                    {(selectedBrand.settings.emails || []).map((email, i) => (
                      <div key={i} className="flex items-center gap-2 p-1.5 rounded-md bg-slate-800 border border-slate-700">
                        <Mail size={12} className="text-slate-500 shrink-0" />
                        <span className="text-xs text-slate-300 flex-1 truncate">{email}</span>
                        <button
                          onClick={() => removeEmail(i)}
                          className="text-red-400/60 hover:text-red-400 shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={newEmailInput}
                      onChange={(e) => setNewEmailInput(e.target.value)}
                      placeholder="ny@epost.no"
                      className="flex-1"
                      onKeyDown={(e) => e.key === "Enter" && addEmail()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={addEmail}
                      disabled={!newEmailInput.trim()}
                    >
                      <Plus size={14} className="mr-1" />
                      Legg til
                    </Button>
                  </div>
                </div>
              </div>

              {/* Settings Sections */}
              <div className="space-y-5">
                {/* YouTube */}
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                    <Youtube size={16} className="text-red-400" />
                    YouTube-kanal
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 block">
                        Kanalnavn
                      </label>
                      <Input
                        value={selectedBrand.settings.youtubeChannel}
                        onChange={(e) =>
                          updateSettings("youtubeChannel", e.target.value)
                        }
                        placeholder="Mitt kanalnavnet"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 block">
                        Kanal-ID
                      </label>
                      <Input
                        value={selectedBrand.settings.youtubeChannelId}
                        onChange={(e) =>
                          updateSettings("youtubeChannelId", e.target.value)
                        }
                        placeholder="UC..."
                      />
                    </div>
                  </div>
                </div>

                {/* Social Media */}
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                    <Instagram size={16} className="text-pink-400" />
                    Sosiale medier
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 block">
                        Instagram
                      </label>
                      <Input
                        value={selectedBrand.settings.instagram}
                        onChange={(e) =>
                          updateSettings("instagram", e.target.value)
                        }
                        placeholder="@brukernavn"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 block">
                        Facebook
                      </label>
                      <Input
                        value={selectedBrand.settings.facebook}
                        onChange={(e) =>
                          updateSettings("facebook", e.target.value)
                        }
                        placeholder="facebook.com/side"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                        <Linkedin size={10} />
                        LinkedIn
                      </label>
                      <Input
                        value={selectedBrand.settings.linkedin}
                        onChange={(e) =>
                          updateSettings("linkedin", e.target.value)
                        }
                        placeholder="linkedin.com/company/..."
                      />
                    </div>
                  </div>
                </div>

                {/* Email / IMAP */}
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                    <Mail size={16} className="text-blue-400" />
                    E-post / IMAP
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 block">
                        E-postadresse
                      </label>
                      <Input
                        value={selectedBrand.settings.email}
                        onChange={(e) =>
                          updateSettings("email", e.target.value)
                        }
                        placeholder="post@eksempel.no"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 block">
                        IMAP-server
                      </label>
                      <Input
                        value={selectedBrand.settings.imapServer}
                        onChange={(e) =>
                          updateSettings("imapServer", e.target.value)
                        }
                        placeholder="imap.gmail.com"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 block">
                        Port
                      </label>
                      <Input
                        value={selectedBrand.settings.imapPort}
                        onChange={(e) =>
                          updateSettings("imapPort", e.target.value)
                        }
                        placeholder="993"
                      />
                    </div>
                  </div>
                </div>

                {/* API Keys */}
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                    <Settings size={16} className="text-slate-400" />
                    API-nøkler
                  </h3>
                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">
                      API-nøkkel
                    </label>
                    <Input
                      type="password"
                      value={selectedBrand.settings.apiKey}
                      onChange={(e) =>
                        updateSettings("apiKey", e.target.value)
                      }
                      placeholder="sk-..."
                    />
                  </div>
                </div>

                {/* Contact */}
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                    <Phone size={16} className="text-green-400" />
                    Kontaktinfo
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 block">
                        Telefon
                      </label>
                      <Input
                        value={selectedBrand.settings.phone}
                        onChange={(e) =>
                          updateSettings("phone", e.target.value)
                        }
                        placeholder="+47 123 45 678"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 block">
                        Adresse
                      </label>
                      <Input
                        value={selectedBrand.settings.address}
                        onChange={(e) =>
                          updateSettings("address", e.target.value)
                        }
                        placeholder="Gate 1, 0000 By"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="mt-6 flex items-center justify-end gap-3">
                {savedToast && (
                  <Badge className="bg-green-500/20 text-green-300 border-green-500/30 animate-pulse">
                    Lagret!
                  </Badge>
                )}
                <Button
                  onClick={() => saveSettings(selectedBrand.id)}
                  disabled={saving}
                >
                  {saving ? "Lagrer..." : "Lagre innstillinger"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
