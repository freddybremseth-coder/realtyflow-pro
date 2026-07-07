"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface LeadIntelligenceEnvironmentAlertsProps {
  featureEnabled: boolean;
  persistenceEnabled: boolean;
}

export function LeadIntelligenceEnvironmentAlerts({
  featureEnabled,
  persistenceEnabled,
}: LeadIntelligenceEnvironmentAlertsProps) {
  return (
    <>
      {!featureEnabled && (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 pt-5 text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
            <div>
              <p className="font-semibold">Lead Intelligence er deaktivert i dette miljøet.</p>
              <p className="text-sm text-amber-100/80">
                Serveren må ha REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true for å åpne
                analysepreviewet.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {featureEnabled && !persistenceEnabled && (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 pt-5 text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
            <div>
              <p className="font-semibold">Lagring er deaktivert i dette miljøet.</p>
              <p className="text-sm text-amber-100/80">
                Analysepreviewet kan brukes, men kontaktkandidatoppslag og lagring krever
                REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=true på serveren.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
