"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReviewCriterionRow } from "@/components/lead-intelligence/lead-intelligence-client-helpers";

export type CriterionApprovalStatus = "pending" | "approved" | "rejected";

export interface CriterionReviewState {
  approvalStatus: CriterionApprovalStatus;
  customerConfirmed: boolean;
}

interface LeadIntelligenceCriteriaReviewPanelProps {
  criteria: ReviewCriterionRow[];
  reviews: Record<string, CriterionReviewState>;
  reviewedCount: number;
  allCriteriaReviewed: boolean;
  onReviewChange: (id: string, patch: Partial<CriterionReviewState>) => void;
}

export function LeadIntelligenceCriteriaReviewPanel({
  criteria,
  reviews,
  reviewedCount,
  allCriteriaReviewed,
  onReviewChange,
}: LeadIntelligenceCriteriaReviewPanelProps) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-950 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Godkjenn kriterier</h2>
          <p className="mt-1 text-xs text-slate-500">
            Hvert krav, ønske og avvisningskriterium må godkjennes eller avvises før buyer profile lagres.
          </p>
        </div>
        <Badge variant={allCriteriaReviewed ? "success" : "secondary"}>
          {reviewedCount}/{criteria.length} vurdert
        </Badge>
      </div>

      <div className="max-h-[32rem] space-y-3 overflow-auto pr-1">
        {criteria.map((criterion) => {
          const state = reviews[criterion.id] || {
            approvalStatus: "pending",
            customerConfirmed: false,
          };
          return (
            <div key={criterion.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-200">{criterion.label}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {criterion.key} · {criterion.criterionType}
                  </p>
                </div>
                <Badge
                  variant={
                    state.approvalStatus === "approved"
                      ? "success"
                      : state.approvalStatus === "rejected"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {state.approvalStatus === "approved"
                    ? "Godkjent"
                    : state.approvalStatus === "rejected"
                      ? "Avvist"
                      : "Venter"}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-slate-300">{criterion.detail}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={state.approvalStatus === "approved" ? "default" : "outline"}
                  size="sm"
                  onClick={() => onReviewChange(criterion.id, { approvalStatus: "approved" })}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Godkjenn
                </Button>
                <Button
                  type="button"
                  variant={state.approvalStatus === "rejected" ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => onReviewChange(criterion.id, { approvalStatus: "rejected" })}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Avvis
                </Button>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={state.customerConfirmed}
                    onChange={(event) =>
                      onReviewChange(criterion.id, { customerConfirmed: event.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                  />
                  Kunden har bekreftet
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
