"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type CompactRequirementStatus = "pending" | "approved" | "rejected";

export interface CompactRequirementRow {
  id: string;
  label: string;
  detail: string;
  category: "hard_requirement" | "preference" | "exclusion" | "missing_information";
  status: CompactRequirementStatus;
  customerConfirmed: boolean;
}

export interface LeadRequirementsCompactEditorProps {
  rows: CompactRequirementRow[];
  disabled?: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onToggleCustomerConfirmed: (id: string) => void;
}

function statusLabel(status: CompactRequirementStatus) {
  switch (status) {
    case "approved":
      return "Godkjent";
    case "rejected":
      return "Avvist";
    case "pending":
      return "Må sjekkes";
  }
}

function categoryLabel(category: CompactRequirementRow["category"]) {
  switch (category) {
    case "hard_requirement":
      return "Krav";
    case "preference":
      return "Ønske";
    case "exclusion":
      return "Ikke aktuelt";
    case "missing_information":
      return "Mangler info";
  }
}

export function LeadRequirementsCompactEditor({
  rows,
  disabled = false,
  onApprove,
  onReject,
  onToggleCustomerConfirmed,
}: LeadRequirementsCompactEditorProps) {
  return (
    <Card className="border-slate-800 bg-slate-950/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-100">Krav og ønsker</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-400">
            Ingen krav eller ønsker funnet ennå.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{categoryLabel(row.category)}</Badge>
                  <Badge variant={row.status === "approved" ? "default" : "outline"}>{statusLabel(row.status)}</Badge>
                  {row.customerConfirmed && <Badge variant="outline">Bekreftet av kunde</Badge>}
                </div>
                <div className="truncate text-sm font-medium text-slate-100">{row.label}</div>
                <div className="line-clamp-2 text-sm text-slate-400">{row.detail}</div>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant={row.customerConfirmed ? "secondary" : "outline"}
                  disabled={disabled}
                  onClick={() => onToggleCustomerConfirmed(row.id)}
                >
                  Kunde bekreftet
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onReject(row.id)}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Avvis
                </Button>
                <Button type="button" size="sm" disabled={disabled} onClick={() => onApprove(row.id)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Godkjenn
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
