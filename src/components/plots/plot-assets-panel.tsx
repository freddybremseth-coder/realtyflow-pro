"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Upload, File as FileIcon, Image as ImageIcon, Video, FileText,
  Globe, EyeOff, Send, Trash2, Loader2, Check, ExternalLink,
  ChevronDown, Mail, Sparkles, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PlotAsset } from "@/types/plot-assets";

interface PlotAssetsPanelProps {
  plotId: string;
}

const KIND_ICON: Record<string, React.ElementType> = {
  image: ImageIcon,
  photo: ImageIcon,
  video: Video,
  document: FileText,
  plan: FileText,
  other: FileIcon,
};

export function PlotAssetsPanel({ plotId }: PlotAssetsPanelProps) {
  const [assets, setAssets] = useState<PlotAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busyAsset, setBusyAsset] = useState<string>("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/plots/${plotId}/assets`);
    const data = await res.json();
    setAssets(data.assets ?? []);
    setLoading(false);
  }, [plotId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError("");
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("title", file.name.replace(/\.[^.]+$/, ""));
        const res = await fetch(`/api/plots/${plotId}/assets`, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Opplasting feilet");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const patchAsset = async (assetId: string, body: Partial<PlotAsset>) => {
    setBusyAsset(assetId);
    try {
      const res = await fetch(`/api/plots/${plotId}/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Oppdatering feilet");
      setAssets((prev) => prev.map((a) => (a.id === assetId ? data.asset : a)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAsset("");
    }
  };

  const deleteAsset = async (assetId: string) => {
    if (!confirm("Slett denne filen?")) return;
    setBusyAsset(assetId);
    try {
      const res = await fetch(`/api/plots/${plotId}/assets/${assetId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Sletting feilet");
      }
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAsset("");
    }
  };

  const distribute = async (assetId: string, target: string, extras?: Record<string, unknown>) => {
    setBusyAsset(assetId);
    try {
      const res = await fetch(`/api/plots/${plotId}/assets/${assetId}/distribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, ...(extras ?? {}) }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || "Distribusjon feilet");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAsset("");
    }
  };

  return (
    <div className="space-y-3">
      {/* Header + upload */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200">Dokumenter & bilder</h4>
        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip"
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
          />
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-1.5">
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            Last opp
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 p-2 bg-red-500/10 border border-red-500/30 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-slate-500 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Laster…
        </div>
      ) : assets.length === 0 ? (
        <div className="text-xs text-slate-500 italic">Ingen filer ennå. Last opp PDF, bilder, videoer eller plantegninger.</div>
      ) : (
        <div className="space-y-2">
          {assets.map((a) => (
            <AssetRow
              key={a.id}
              asset={a}
              busy={busyAsset === a.id}
              onPatch={(body) => patchAsset(a.id, body)}
              onDelete={() => deleteAsset(a.id)}
              onDistribute={(target, extras) => distribute(a.id, target, extras)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single asset row ─────────────────────────────────────────────
function AssetRow({
  asset, busy, onPatch, onDelete, onDistribute,
}: {
  asset: PlotAsset;
  busy: boolean;
  onPatch: (body: Partial<PlotAsset>) => void;
  onDelete: () => void;
  onDistribute: (target: string, extras?: Record<string, unknown>) => void;
}) {
  const Icon = KIND_ICON[asset.kind] || FileIcon;
  const [menuOpen, setMenuOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");

  const isImage = asset.kind === "image" || asset.kind === "photo";
  const sizeKb = Math.round(asset.size_bytes / 1024);
  const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 space-y-2">
      <div className="flex items-start gap-2.5">
        {/* Thumbnail / icon */}
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.public_url} alt={asset.title || asset.filename}
            loading="lazy" decoding="async"
            className="w-12 h-12 object-cover rounded border border-slate-700" />
        ) : (
          <div className="w-12 h-12 rounded border border-slate-700 bg-slate-900 flex items-center justify-center">
            <Icon className="w-5 h-5 text-slate-400" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="text-sm text-white truncate">{asset.title || asset.filename}</div>
          <div className="text-[10px] text-slate-500">{asset.kind} · {sizeStr}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {asset.show_on_website && (
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]">
                <Globe className="w-2.5 h-2.5 mr-0.5" /> nettsiden
              </Badge>
            )}
            {asset.visible_in_portal && (
              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-[10px]">
                <User className="w-2.5 h-2.5 mr-0.5" /> Min side
              </Badge>
            )}
            {asset.visible_to_customer_ids?.length > 0 && (
              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-[10px]">
                {asset.visible_to_customer_ids.length} kunde(r)
              </Badge>
            )}
            {asset.distribution_log?.length > 0 && (
              <span className="text-[10px] text-slate-500">
                {asset.distribution_log.length} distribusjon(er)
              </span>
            )}
          </div>
        </div>

        <a href={asset.public_url} target="_blank" rel="noreferrer"
          className="text-slate-400 hover:text-white p-1">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Quick toggles */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-700/40">
        <button
          onClick={() => onPatch({ show_on_website: !asset.show_on_website })}
          disabled={busy}
          className={`text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors ${
            asset.show_on_website
              ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
              : "text-slate-400 hover:bg-slate-700/50"
          }`}
        >
          {asset.show_on_website ? <Globe className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {asset.show_on_website ? "På nettsiden" : "Vis på nettsiden"}
        </button>

        <button
          onClick={() => onPatch({ visible_in_portal: !asset.visible_in_portal })}
          disabled={busy}
          className={`text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors ${
            asset.visible_in_portal
              ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
              : "text-slate-400 hover:bg-slate-700/50"
          }`}
        >
          <User className="w-3 h-3" />
          {asset.visible_in_portal ? "I portal" : "Vis i Min side"}
        </button>

        <div className="relative ml-auto">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={busy}
            className="text-xs px-2 py-1 rounded text-slate-300 hover:bg-slate-700/50 flex items-center gap-1"
          >
            <Send className="w-3 h-3" /> Send <ChevronDown className="w-3 h-3" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-slate-900 border border-slate-700 rounded-md shadow-lg z-10 py-1 text-xs">
              <MenuItem icon={Sparkles} label="Til Content Studio"
                onClick={() => { setMenuOpen(false); onDistribute("content_studio"); }} />
              <MenuItem icon={Mail} label="Send på e-post"
                onClick={() => { setMenuOpen(false); setEmailOpen(true); }} />
            </div>
          )}
        </div>

        <button onClick={onDelete} disabled={busy}
          className="text-xs px-1.5 py-1 rounded text-red-400 hover:bg-red-500/10">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Email mini-form */}
      {emailOpen && (
        <div className="pt-2 border-t border-slate-700/40 space-y-2">
          <input
            type="email"
            placeholder="mottaker@example.com"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs"
          />
          <div className="flex gap-1.5 justify-end">
            <Button size="sm" variant="outline" onClick={() => setEmailOpen(false)}>Avbryt</Button>
            <Button size="sm" disabled={!emailTo || busy}
              onClick={() => {
                onDistribute("email", { email: emailTo });
                setEmailOpen(false);
                setEmailTo("");
              }}
              className="gap-1"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full px-3 py-1.5 hover:bg-slate-800 flex items-center gap-2 text-slate-200">
      <Icon className="w-3 h-3 text-slate-400" />
      {label}
    </button>
  );
}
