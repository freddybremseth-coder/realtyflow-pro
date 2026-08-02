"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Library, Loader2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReferenceAsset {
  id: string;
  title?: string | null;
  media_type: string;
  public_url?: string | null;
  thumbnail_url?: string | null;
  provider?: string | null;
  created_at: string;
}

interface ReferenceMediaPickerProps {
  value: string;
  onChange: (url: string) => void;
  brandId?: string;
  title?: string;
  description?: string;
}

function messageFrom(data: unknown, status: number) {
  if (data && typeof data === "object") {
    const row = data as { error?: string | { message?: string }; message?: string };
    if (typeof row.error === "string") return row.error;
    if (row.error && typeof row.error === "object" && row.error.message) return row.error.message;
    if (row.message) return row.message;
  }
  return `Forespørselen feilet (${status}).`;
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(messageFrom(data, response.status));
  return data as T;
}

export function ReferenceMediaPicker({
  value,
  onChange,
  brandId,
  title = "Referansebilde",
  description = "Last opp et bilde eller velg et eksisterende bilde fra Media Library.",
}: ReferenceMediaPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [assets, setAssets] = useState<ReferenceAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const result = await readJson<{ assets: ReferenceAsset[] }>("/api/media/assets?limit=120&mediaType=image");
      setAssets((result.assets || []).filter((asset) => Boolean(asset.public_url)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke laste Media Library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.public_url === value),
    [assets, value],
  );

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      if (brandId) form.set("brandId", brandId);
      form.set("title", file.name.replace(/\.[^.]+$/, ""));
      const result = await readJson<{ asset: ReferenceAsset }>("/api/media/assets/upload", {
        method: "POST",
        body: form,
      });
      setAssets((current) => [result.asset, ...current.filter((asset) => asset.id !== result.asset.id)]);
      onChange(result.asset.public_url || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke laste opp bildet.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-primary-500/25 bg-primary-500/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-100"><ImageIcon size={16} className="text-primary-300" />{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
        </div>
        {value && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")} className="shrink-0 gap-1.5 text-slate-300">
            <X size={14} /> Fjern
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(event) => void upload(event.target.files?.[0])}
          />
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading} className="w-full gap-2">
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
            {uploading ? "Laster opp ..." : "Last opp bilde"}
          </Button>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs text-slate-400"><Library size={13} />Velg fra Media Library</label>
            <select
              value={selectedAsset?.id || ""}
              onChange={(event) => {
                const asset = assets.find((item) => item.id === event.target.value);
                onChange(asset?.public_url || "");
              }}
              disabled={loading}
              className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 disabled:opacity-50"
            >
              <option value="">{loading ? "Laster bilder ..." : "Velg bilde"}</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>{asset.title || "Bilde"} · {asset.provider || "upload"}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Eller lim inn bilde-URL</label>
            <input
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="https://..."
              className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-primary-400"
            />
          </div>
        </div>

        <div className="flex min-h-44 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
          {value ? (
            <img src={selectedAsset?.thumbnail_url || value} alt={selectedAsset?.title || "Referansebilde"} className="max-h-72 w-full object-contain" />
          ) : (
            <div className="px-5 text-center text-xs text-slate-500">
              <ImageIcon size={28} className="mx-auto mb-2" />
              Bildet vises her og sendes som referanse til image-to-image, image-to-video, portrett- og produktjobber.
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 p-2 text-xs text-red-200">{error}</p>}
      <p className="mt-3 text-[11px] text-slate-500">Maks 25 MB. JPG, PNG, WebP eller GIF. Bruk bare bilder du har rettighet og nødvendig samtykke til å behandle.</p>
    </div>
  );
}
