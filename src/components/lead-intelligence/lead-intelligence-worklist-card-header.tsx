"use client";

import { Loader2, RefreshCw, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle } from "@/components/ui/card";

interface LeadIntelligenceWorklistCardHeaderProps {
  persistenceEnabled: boolean;
  worklistLoading: boolean;
  onLoadWorklist: () => void;
}

export function LeadIntelligenceWorklistCardHeader({
  persistenceEnabled,
  worklistLoading,
  onLoadWorklist,
}: LeadIntelligenceWorklistCardHeaderProps) {
  return (
    <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary-400" />
          Lagrede tester og kjøperprofiler
        </CardTitle>
        <p className="mt-1 text-sm text-slate-400">
          Tidligere lagrede tester ligger her. Velg en lagret buyer profile for å fortsette med
          eiendomsmatch uten å analysere henvendelsen på nytt.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onLoadWorklist}
        disabled={!persistenceEnabled || worklistLoading}
      >
        {worklistLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        Oppdater lagrede saker
      </Button>
    </CardHeader>
  );
}
