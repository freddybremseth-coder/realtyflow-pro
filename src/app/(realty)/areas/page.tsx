"use client";

/**
 * /areas — område-profiler.
 *
 * Per merke (brand) lar denne siden megleren bygge opp gjenbrukbare beskrivelser
 * av steder (Calpe, Altea, Pinoso, ...). AI hjelper til med å skrive første utkast
 * og utvide felt-for-felt. Når en eiendom har `location` som matcher et områdes
 * navn/slug, plukker PDF-genratoren automatisk opp profilen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Sparkles,
  Plus,
  Trash2,
  Loader2,
  Save,
  Wand2,
  RefreshCw,
} from "lucide-react";
import { BRANDS } from "@/lib/constants";

interface AreaProfile {
  id?: string;
  brand_id: string;
  name: string;
  slug?: string;
  country?: string | null;
  region?: string | null;
  hero_blurb?: string | null;
  description?: string | null;
  highlights?: string[] | null;
  climate?: string | null;
  lifestyle?: string | null;
  photo_url?: string | null;
  updated_at?: string;
}

const REALTY_BRANDS = BRANDS.filter((b) => b.type === "real_estate");

const BLANK: AreaProfile = {
  brand_id: REALTY_BRANDS[0]?.id || "",
  name: "",
  country: "Spania",
  region: "",
  hero_blurb: "",
  description: "",
  highlights: [],
  climate: "",
  lifestyle: "",
  photo_url: "",
};

export default function AreasPage() {
  const [brandId, setBrandId] = useState<string>(REALTY_BRANDS[0]?.id || "");
  const [profiles, setProfiles] = useState<AreaProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AreaProfile>(BLANK);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null); // "save" | "ai-create" | "ai-expand" | "ai-section:<field>"

  const loadProfiles = useCallback(async (bid: string) => {
    if (!bid) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/area-profiles?brandId=${encodeURIComponent(bid)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Kunne ikke laste områder");
      setProfiles((data.profiles || []) as AreaProfile[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lasting feilet");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles(brandId);
  }, [brandId, loadProfiles]);

  const startNew = () => {
    setEditing({ ...BLANK, brand_id: brandId });
    setEditingId(null);
  };

  const startEdit = (p: AreaProfile) => {
    setEditing({ ...p });
    setEditingId(p.id || null);
  };

  const updateField = <K extends keyof AreaProfile>(k: K, v: AreaProfile[K]) =>
    setEditing((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!editing.name.trim()) {
      setError("Navn er påkrevd");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const r = await fetch("/api/area-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          brandId: editing.brand_id || brandId,
          name: editing.name,
          slug: editing.slug,
          country: editing.country,
          region: editing.region,
          heroBlurb: editing.hero_blurb,
          description: editing.description,
          highlights: editing.highlights || [],
          climate: editing.climate,
          lifestyle: editing.lifestyle,
          photoUrl: editing.photo_url,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Lagring feilet");
      const saved = data.profile as AreaProfile;
      setEditing(saved);
      setEditingId(saved.id || null);
      await loadProfiles(brandId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lagring feilet");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string | undefined) => {
    if (!id) return;
    if (!confirm("Slette dette området?")) return;
    setBusy("delete");
    try {
      const r = await fetch(`/api/area-profiles/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || "Sletting feilet");
      }
      if (editingId === id) startNew();
      await loadProfiles(brandId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sletting feilet");
    } finally {
      setBusy(null);
    }
  };

  const aiGenerate = async (mode: "create" | "expand") => {
    if (!editing.name.trim()) {
      setError("Skriv inn et stedsnavn først");
      return;
    }
    setBusy(`ai-${mode}`);
    setError(null);
    try {
      const r = await fetch("/api/area-profiles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editing.name,
          country: editing.country,
          region: editing.region,
          mode,
          existing:
            mode === "expand"
              ? {
                  description: editing.description,
                  hero_blurb: editing.hero_blurb,
                  highlights: editing.highlights,
                  climate: editing.climate,
                  lifestyle: editing.lifestyle,
                }
              : undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "AI-generering feilet");
      setEditing((prev) => ({
        ...prev,
        hero_blurb: data.hero_blurb || prev.hero_blurb,
        description: data.description || prev.description,
        highlights: Array.isArray(data.highlights) && data.highlights.length
          ? data.highlights
          : prev.highlights,
        climate: data.climate || prev.climate,
        lifestyle: data.lifestyle || prev.lifestyle,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI-generering feilet");
    } finally {
      setBusy(null);
    }
  };

  const aiSection = async (
    section: "description" | "hero_blurb" | "highlights" | "climate" | "lifestyle",
  ) => {
    if (!editing.name.trim()) {
      setError("Skriv inn et stedsnavn først");
      return;
    }
    setBusy(`ai-section:${section}`);
    setError(null);
    try {
      const r = await fetch("/api/area-profiles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editing.name,
          country: editing.country,
          region: editing.region,
          mode: "section",
          section,
          existing: {
            description: editing.description,
            hero_blurb: editing.hero_blurb,
            highlights: editing.highlights,
            climate: editing.climate,
            lifestyle: editing.lifestyle,
          },
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "AI-generering feilet");
      if (section === "highlights") {
        updateField("highlights", Array.isArray(data.value) ? data.value : []);
      } else {
        updateField(section, typeof data.value === "string" ? data.value : "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI-generering feilet");
    } finally {
      setBusy(null);
    }
  };

  const highlightsText = useMemo(
    () => (editing.highlights || []).join("\n"),
    [editing.highlights],
  );

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Områder</h1>
            <p className="text-sm text-muted-foreground">
              Gjenbrukbare beskrivelser av byer og områder. Brukes automatisk i PDF-prospekt for eiendommer i samme område.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            {REALTY_BRANDS.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <Button onClick={startNew} variant="default" size="sm">
            <Plus className="w-4 h-4 mr-1" /> Nytt område
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="lg:col-span-1 space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Lagrede områder</span>
                <span className="text-xs text-muted-foreground">{profiles.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[640px] overflow-auto">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Laster ...
                </div>
              ) : profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Ingen områder ennå. Klikk "Nytt område" for å begynne.
                </p>
              ) : (
                profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => startEdit(p)}
                    className={`w-full text-left p-3 rounded-md border transition ${
                      editingId === p.id
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-input hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.region || p.country || ""}
                        </div>
                        {p.hero_blurb ? (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {p.hero_blurb}
                          </div>
                        ) : null}
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {(p.highlights?.length || 0)}
                      </Badge>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Editor */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>{editingId ? `Rediger ${editing.name || "område"}` : "Nytt område"}</span>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => aiGenerate(editingId ? "expand" : "create")}
                    size="sm"
                    variant="secondary"
                    disabled={!!busy}
                  >
                    {busy === "ai-create" || busy === "ai-expand" ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-1" />
                    )}
                    {editingId ? "Utvid med AI" : "Generer med AI"}
                  </Button>
                  <Button onClick={save} size="sm" disabled={!!busy}>
                    {busy === "save" ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-1" />
                    )}
                    Lagre
                  </Button>
                  {editingId ? (
                    <Button
                      onClick={() => remove(editingId)}
                      size="sm"
                      variant="ghost"
                      disabled={!!busy}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  ) : null}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Basics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Navn (matches property.location)</label>
                  <Input
                    value={editing.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="Calpe"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Region</label>
                  <Input
                    value={editing.region || ""}
                    onChange={(e) => updateField("region", e.target.value)}
                    placeholder="Costa Blanca"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Land</label>
                  <Input
                    value={editing.country || ""}
                    onChange={(e) => updateField("country", e.target.value)}
                    placeholder="Spania"
                  />
                </div>
              </div>

              {/* Hero blurb */}
              <FieldWithAi
                label="Tagline (1 setning)"
                onAi={() => aiSection("hero_blurb")}
                busy={busy === "ai-section:hero_blurb"}
                disabled={!!busy}
              >
                <Input
                  value={editing.hero_blurb || ""}
                  onChange={(e) => updateField("hero_blurb", e.target.value)}
                  placeholder="Sjarmerende fiskeby ved foten av Peñón de Ifach"
                />
              </FieldWithAi>

              {/* Description */}
              <FieldWithAi
                label="Beskrivelse"
                onAi={() => aiSection("description")}
                busy={busy === "ai-section:description"}
                disabled={!!busy}
              >
                <textarea
                  value={editing.description || ""}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="3–5 avsnitt om stedet"
                  rows={8}
                  className="w-full p-3 rounded-md border border-input bg-background text-sm resize-y"
                />
              </FieldWithAi>

              {/* Highlights */}
              <FieldWithAi
                label="Høydepunkter (ett per linje, 5–8 stk.)"
                onAi={() => aiSection("highlights")}
                busy={busy === "ai-section:highlights"}
                disabled={!!busy}
              >
                <textarea
                  value={highlightsText}
                  onChange={(e) =>
                    updateField(
                      "highlights",
                      e.target.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
                    )
                  }
                  placeholder={"5 min til strand\nInternasjonal skole 10 min unna\nUkemarked på torsdager\n..."}
                  rows={6}
                  className="w-full p-3 rounded-md border border-input bg-background text-sm resize-y font-mono"
                />
              </FieldWithAi>

              {/* Climate */}
              <FieldWithAi
                label="Klima"
                onAi={() => aiSection("climate")}
                busy={busy === "ai-section:climate"}
                disabled={!!busy}
              >
                <textarea
                  value={editing.climate || ""}
                  onChange={(e) => updateField("climate", e.target.value)}
                  rows={3}
                  className="w-full p-3 rounded-md border border-input bg-background text-sm resize-y"
                />
              </FieldWithAi>

              {/* Lifestyle */}
              <FieldWithAi
                label="Hverdagsliv"
                onAi={() => aiSection("lifestyle")}
                busy={busy === "ai-section:lifestyle"}
                disabled={!!busy}
              >
                <textarea
                  value={editing.lifestyle || ""}
                  onChange={(e) => updateField("lifestyle", e.target.value)}
                  rows={4}
                  className="w-full p-3 rounded-md border border-input bg-background text-sm resize-y"
                />
              </FieldWithAi>

              {/* Photo URL */}
              <div>
                <label className="text-xs text-muted-foreground">Bilde-URL (valgfritt)</label>
                <Input
                  value={editing.photo_url || ""}
                  onChange={(e) => updateField("photo_url", e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <p className="text-xs text-muted-foreground border-t pt-3">
                <RefreshCw className="w-3 h-3 inline mr-1" />
                Eiendommer hvor <strong>location</strong> matcher dette stedets navn (slug: <code>{slugify(editing.name)}</code>) får automatisk en "Om {editing.name || "stedet"}"-seksjon i PDF-prospektet.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---------------------------------------------------------------

function FieldWithAi({
  label,
  children,
  onAi,
  busy,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onAi: () => void;
  busy: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        <Button
          type="button"
          onClick={onAi}
          size="sm"
          variant="ghost"
          disabled={disabled}
          className="h-7 px-2 text-xs"
        >
          {busy ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Wand2 className="w-3 h-3 mr-1" />
          )}
          AI
        </Button>
      </div>
      {children}
    </div>
  );
}

function slugify(input: string | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
