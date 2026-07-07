"use client";

import { ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function LeadIntelligencePageHeader() {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary-400" />
          <Badge variant="default">Preview</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white">AI Lead Inbox</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Lim inn en henvendelse og få et strukturert forslag til kontakt, kjøpsstatus,
          budsjett, krav, ønsker og avvisningskriterier. Previewet skriver ikke til CRM.
        </p>
      </div>
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />
          <div>
            <p className="font-semibold">Freddy kontrollerer før noe lagres.</p>
            <p className="text-emerald-200/80">
              Ingen data lagres før du godkjenner i en senere fase. Ingen melding sendes til kunden.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
