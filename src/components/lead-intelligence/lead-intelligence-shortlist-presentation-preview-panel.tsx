"use client";

import { AlertTriangle, CheckCircle2, Clipboard, Loader2, MessageSquareText, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "failed";

interface LeadIntelligenceShortlistPresentationPreviewPanelProps {
  title: string;
  subtitle: string;
  needBullets: string[];
  verificationBullets: string[];
  copyState: CopyState;
  loading: boolean;
  onSave: () => void;
  onCopyPresentation: () => void;
  onCopyEmailDraft: () => void;
}

export function LeadIntelligenceShortlistPresentationPreviewPanel({
  title,
  subtitle,
  needBullets,
  verificationBullets,
  copyState,
  loading,
  onSave,
  onCopyPresentation,
  onCopyEmailDraft,
}: LeadIntelligenceShortlistPresentationPreviewPanelProps) {
  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary-100">
            <MessageSquareText className="h-4 w-4" />
            Profesjonelt presentasjonsutkast
          </p>
          <p className="mt-1 text-xs text-primary-100/75">
            {title} · {subtitle}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Dette er bare en preview basert på shortlist-utkastet. Ingen e-post er sendt,
            og ingen presentasjon er lagret eller publisert.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" size="sm" onClick={onSave} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Lagre presentasjonsutkast
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCopyPresentation}>
            <Clipboard className="mr-2 h-4 w-4" />
            Kopier presentasjon
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCopyEmailDraft}>
            <Clipboard className="mr-2 h-4 w-4" />
            Kopier e-postutkast
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Kundens behov
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-200">
            {needBullets.map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Før videre deling må dette avklares
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-200">
            {verificationBullets.slice(0, 5).map((item) => (
              <li key={item} className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sikkerhetsstatus
          </p>
          <div className="mt-3 space-y-2 text-sm text-slate-200">
            <p>E-post sendt: nei</p>
            <p>Leads opprettet: nei</p>
            <p>Kontakter opprettet: nei</p>
            <p>Presentasjon publisert: nei</p>
          </div>
          {copyState === "copied" && (
            <p className="mt-3 text-xs text-emerald-300">Presentasjonstekst kopiert.</p>
          )}
          {copyState === "failed" && (
            <p className="mt-3 text-xs text-red-300">Kunne ikke kopiere presentasjonen.</p>
          )}
        </div>
      </div>
    </>
  );
}
