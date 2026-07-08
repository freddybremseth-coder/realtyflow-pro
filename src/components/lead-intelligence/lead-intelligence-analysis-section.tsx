"use client";

import type { ComponentProps } from "react";

import { LeadIntelligenceAnalysisPreviewCard } from "@/components/lead-intelligence/lead-intelligence-analysis-preview-card";
import { LeadIntelligenceAnalysisResultPanel } from "@/components/lead-intelligence/lead-intelligence-analysis-result-panel";
import { LeadIntelligenceRequestCard } from "@/components/lead-intelligence/lead-intelligence-request-card";

type RequestCardProps = ComponentProps<typeof LeadIntelligenceRequestCard>;
type AnalysisResultPanelProps = ComponentProps<typeof LeadIntelligenceAnalysisResultPanel>;

interface LeadIntelligenceAnalysisSectionProps {
  requestCardProps: RequestCardProps;
  loading: boolean;
  hasResponse: boolean;
  resultPanelProps: AnalysisResultPanelProps | null;
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
