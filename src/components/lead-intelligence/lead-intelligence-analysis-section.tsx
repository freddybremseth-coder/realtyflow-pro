"use client";

import type { ComponentProps } from "react";

import { LeadIntelligenceAnalysisPreviewCard } from "@/components/lead-intelligence/lead-intelligence-analysis-preview-card";
import { LeadIntelligenceAnalysisResultPanel } from "@/components/lead-intelligence/lead-intelligence-analysis-result-panel";
import { LeadIntelligenceRequestCard } from "@/components/lead-intelligence/lead-intelligence-request-card";

export type LeadIntelligenceAnalysisRequestCardProps = ComponentProps<typeof LeadIntelligenceRequestCard>;
export type LeadIntelligenceAnalysisResultPanelProps = ComponentProps<typeof LeadIntelligenceAnalysisResultPanel>;

interface LeadIntelligenceAnalysisSectionProps {
  requestCardProps: LeadIntelligenceAnalysisRequestCardProps;
  loading: boolean;
  hasResponse: boolean;
  resultPanelProps: LeadIntelligenceAnalysisResultPanelProps | null;
}

export function LeadIntelligenceAnalysisSection({
  requestCardProps,
  loading,
  hasResponse,
  resultPanelProps,
}: LeadIntelligenceAnalysisSectionProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <LeadIntelligenceRequestCard {...requestCardProps} />

      <LeadIntelligenceAnalysisPreviewCard loading={loading} hasResponse={hasResponse}>
        {resultPanelProps && <LeadIntelligenceAnalysisResultPanel {...resultPanelProps} />}
      </LeadIntelligenceAnalysisPreviewCard>
    </div>
  );
}
