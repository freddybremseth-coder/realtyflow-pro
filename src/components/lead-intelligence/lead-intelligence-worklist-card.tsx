"use client";

import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { LeadIntelligenceWorklistCardHeader } from "@/components/lead-intelligence/lead-intelligence-worklist-card-header";

interface LeadIntelligenceWorklistCardProps {
  persistenceEnabled: boolean;
  worklistLoading: boolean;
  onLoadWorklist: () => void;
  children: ReactNode;
}

export function LeadIntelligenceWorklistCard({
  persistenceEnabled,
  worklistLoading,
  onLoadWorklist,
  children,
}: LeadIntelligenceWorklistCardProps) {
  return (
    <Card>
      <LeadIntelligenceWorklistCardHeader
        persistenceEnabled={persistenceEnabled}
        worklistLoading={worklistLoading}
        onLoadWorklist={onLoadWorklist}
      />
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
