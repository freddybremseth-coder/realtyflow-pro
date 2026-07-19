"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Feather, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Universell «Skriv i Forfatterstudio»-knapp. Kan brukes hvor som helst i
 * appen der AI/Victoria foreslår å lage eller skrive noe. Oppretter et
 * prosjekt via forfattermotoren (create_project) og dyplenker rett inn i
 * studioet, der brukeren utvikler det med to-pass-skriving, løft,
 * kvalitetsscore, research, bilder og eksport.
 *
 * `getPayload` kalles ved klikk, så tittel/innhold hentes fra siste state.
 */
export type ForfatterPayload = {
  title: string;
  source_text?: string;
  brief?: string;
  doc_type?: "book" | "analyse" | "presentation" | "article";
  language?: string;
  audience?: string;
  source?: string;
};

export function SendToForfatterstudio({
  getPayload,
  label = "Skriv i Forfatterstudio",
  variant = "outline",
  size = "sm",
  className,
}: {
  getPayload: () => ForfatterPayload | null;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const payload = getPayload();
    if (!payload || !payload.title?.trim()) {
      setError("Gi det en tittel først.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/publishing/author-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "create_project", source: "content-hub", ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.studio_url) throw new Error(data.error || "Kunne ikke opprette prosjektet.");
      router.push(data.studio_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke opprette prosjektet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant={variant} size={size} onClick={run} disabled={busy} className={className}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Feather className="mr-2 h-4 w-4" />}
        {label}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
