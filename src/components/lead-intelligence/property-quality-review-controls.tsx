"use client";

import {
  AlertTriangle,
  CheckCircle2,
  MessageSquareText,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type PropertyQualityReviewStatus =
  | "unreviewed"
  | "client_ready"
  | "needs_review"
  | "rejected"
  | "ask_agent"
  | "verify_price_availability";

export type SavedPropertyQualityReviewStatus = Exclude<PropertyQualityReviewStatus, "unreviewed">;

export type PropertyQualityReviewState = {
  status: PropertyQualityReviewStatus;
  note: string;
  checkedAt: string | null;
  checkedBy: string | null;
};

const reviewStatuses = [
  "client_ready",
  "needs_review",
  "rejected",
  "ask_agent",
  "verify_price_availability",
] as const;

export function defaultPropertyQualityReview(): PropertyQualityReviewState {
  return {
    status: "unreviewed",
    note: "",
    checkedAt: null,
    checkedBy: null,
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function propertyQualityReviewLabel(status: PropertyQualityReviewStatus) {
  switch (status) {
    case "client_ready":
      return "Klar for kunde";
    case "needs_review":
      return "Må sjekkes";
    case "rejected":
      return "Ikke aktuell";
    case "ask_agent":
      return "Spør utbygger/megler";
    case "verify_price_availability":
      return "Pris/tilgjengelighet må verifiseres";
    case "unreviewed":
    default:
      return "Ikke kvalitetssjekket";
  }
}

function propertyQualityReviewVariant(status: PropertyQualityReviewStatus) {
  switch (status) {
    case "client_ready":
      return "success";
    case "rejected":
      return "destructive";
    case "ask_agent":
    case "verify_price_availability":
    case "needs_review":
      return "warning";
    case "unreviewed":
    default:
      return "secondary";
  }
}

function StatusIcon({ status }: { status: SavedPropertyQualityReviewStatus }) {
  if (status === "client_ready") return <CheckCircle2 className="mr-2 h-4 w-4 shrink-0" />;
  if (status === "needs_review") return <AlertTriangle className="mr-2 h-4 w-4 shrink-0" />;
  if (status === "rejected") return <XCircle className="mr-2 h-4 w-4 shrink-0" />;
  if (status === "ask_agent") return <MessageSquareText className="mr-2 h-4 w-4 shrink-0" />;
  return <ShieldCheck className="mr-2 h-4 w-4 shrink-0" />;
}

export function PropertyQualityReviewControls({
  propertyId,
  idPrefix,
  review,
  onStatusChange,
  onNoteChange,
}: {
  propertyId: string;
  idPrefix: string;
  review: PropertyQualityReviewState;
  onStatusChange(propertyId: string, status: PropertyQualityReviewStatus): void;
  onNoteChange(propertyId: string, note: string): void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-100">
            Kvalitetssjekk før kunde
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Bare boliger markert «Klar for kunde» brukes i presentasjons- og e-postutkast.
          </p>
        </div>
        <Badge variant={propertyQualityReviewVariant(review.status)}>
          {propertyQualityReviewLabel(review.status)}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {reviewStatuses.map((status) => (
          <Button
            key={status}
            type="button"
            size="sm"
            variant={review.status === status ? "default" : "outline"}
            onClick={() => onStatusChange(propertyId, status)}
            className="h-auto min-h-8 justify-start whitespace-normal text-left leading-tight"
          >
            <StatusIcon status={status} />
            <span>{propertyQualityReviewLabel(status)}</span>
          </Button>
        ))}
      </div>

      <label
        htmlFor={`${idPrefix}-quality-note-${propertyId}`}
        className="mt-3 block text-xs font-semibold text-slate-300"
      >
        Notat fra kvalitetssjekk
      </label>
      <textarea
        id={`${idPrefix}-quality-note-${propertyId}`}
        value={review.note}
        onChange={(event) => onNoteChange(propertyId, event.target.value)}
        rows={2}
        placeholder="F.eks. pris bekreftet, må ringe megler, usikker tilgjengelighet..."
        className="mt-1 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500"
      />
      <p className="mt-2 text-xs text-slate-500">
        Siste sjekk: {formatDateTime(review.checkedAt)} · Sjekket av: {review.checkedBy || "Ikke satt"}
      </p>
    </div>
  );
}
