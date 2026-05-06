"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, Loader2, X, Image as ImageIcon, Check } from "lucide-react";
import { Button } from "./button";

interface ImageUploadProps {
  /** Current image URL (controlled) */
  value: string;
  /** Called with the public URL after upload */
  onChange: (url: string) => void;
  /** Optional: also called with the raw File before upload starts */
  onFileSelect?: (file: File | null) => void;
  /** Max size in MB (default 10) */
  maxSizeMB?: number;
  /** Accepted MIME types (default jpeg/png/webp) */
  accept?: string;
  /** Label text (default "Last opp bilde") */
  label?: string;
  /** Placeholder hint */
  hint?: string;
  /** Show URL input as alternative entry */
  allowUrlEntry?: boolean;
  /** Optional className for the outer wrapper */
  className?: string;
  /** Extra form fields sent to /api/upload-image */
  uploadFields?: Record<string, string>;
}

/**
 * Reusable image upload component.
 * Drag & drop, click-to-pick, or paste a URL. Uploads to /api/upload-image
 * which stores in Supabase Storage `content-images` bucket and returns a
 * public URL via onChange.
 */
export function ImageUpload({
  value,
  onChange,
  onFileSelect,
  maxSizeMB = 10,
  accept = "image/jpeg,image/png,image/webp",
  label = "Last opp produktbilde",
  hint = "JPG, PNG eller WebP — maks 10MB",
  allowUrlEntry = true,
  className = "",
  uploadFields,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const upload = useCallback(async (file: File) => {
    setError("");
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setError("Ugyldig filtype. Kun JPG, PNG eller WebP.");
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`Filen er for stor (maks ${maxSizeMB}MB).`);
      return;
    }
    onFileSelect?.(file);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (uploadFields) {
        Object.entries(uploadFields).forEach(([key, fieldValue]) => {
          fd.append(key, fieldValue);
        });
      }
      const res = await fetch("/api/upload-image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Opplasting feilet");
      onChange(data.url || data.publicUrl || data.imageUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }, [maxSizeMB, onChange, onFileSelect, uploadFields]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  const clear = () => {
    onChange("");
    onFileSelect?.(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-xs text-gray-400 block">{label}</label>

      {value ? (
        // ─── Preview ──────────────────────────────────
        <div className="relative inline-block max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="uploaded"
            className="rounded-md border border-gray-700 max-h-48 object-contain bg-gray-900"
          />
          <div className="absolute top-2 left-2">
            <span className="bg-emerald-500/90 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
              <Check className="w-3 h-3" /> Lastet opp
            </span>
          </div>
          <button
            onClick={clear}
            className="absolute top-2 right-2 bg-black/70 hover:bg-black/90 text-white rounded-md p-1.5 transition-colors"
            aria-label="Fjern bilde"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        // ─── Drop zone ────────────────────────────────
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-md p-6 cursor-pointer transition-colors
            ${dragOver ? "border-amber-400 bg-amber-400/10" : "border-gray-700 hover:border-gray-500"}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2 text-gray-400">
            {uploading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                <span className="text-sm">Laster opp…</span>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6" />
                <span className="text-sm font-medium">Klikk eller dra fil hit</span>
                <span className="text-xs">{hint}</span>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400">{error}</div>
      )}

      {allowUrlEntry && !value && (
        <div className="pt-2 border-t border-gray-800">
          <label className="text-xs text-gray-500 block mb-1">Eller lim inn URL:</label>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://..."
              className="flex-1 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-md text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) onChange(v);
                }
              }}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v) onChange(v);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
