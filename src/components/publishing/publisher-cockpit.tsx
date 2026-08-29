"use client";

import { useMemo } from "react";
import { AlertTriangle, ArrowRight, BookPlus, PenLine, Send, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { publisherCockpitTargets, type BookProjectWorkflowRow } from "@/lib/publishing/book-workflow";

type PublisherCockpitProps<T extends BookProjectWorkflowRow> = {
  projects: T[];
  onCreate: () => void;
  onFindIdea: () => void;
  onOpen: (id: string) => void;
};

export function PublisherCockpit<T extends BookProjectWorkflowRow>({ projects, onCreate, onFindIdea, onOpen }: PublisherCockpitProps<T>) {
  const targets = useMemo(() => publisherCockpitTargets(projects), [projects]);
  const continueProject = targets.continueProject;
  const publishProject = targets.publishProject;
  const growthProject = targets.growthProject;

  return (
    <section className="space-y-3" aria-labelledby="publisher-cockpit-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="publisher-cockpit-title" className="text-lg font-semibold">Hva vil du gjøre?</h2>
          <p className="text-sm text-muted-foreground">Book OS viser bare neste meningsfulle handling. Detaljverktøy ligger inne i den valgte boken.</p>
        </div>
        {targets.attentionCount > 0 ? (
          <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {targets.attentionCount} trenger oppmerksomhet</Badge>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-primary/35 bg-primary/5">
          <CardContent className="flex h-full flex-col gap-3 pt-5">
            <BookPlus className="h-6 w-6 text-primary" />
            <div className="flex-1">
              <h3 className="font-semibold">1. Lag en ny bok</h3>
              <p className="mt-1 text-xs text-muted-foreground">Velg serie, tema og mål. OpenAI bygger bibel og canon først.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onCreate}>Start ny bok</Button>
              <Button size="sm" variant="ghost" onClick={onFindIdea}>Finn idé</Button>
            </div>
          </CardContent>
        </Card>

        <Card className={targets.attentionCount > 0 ? "border-amber-500/50 bg-amber-500/5" : ""}>
          <CardContent className="flex h-full flex-col gap-3 pt-5">
            <PenLine className="h-6 w-6 text-blue-600" />
            <div className="flex-1">
              <h3 className="font-semibold">2. Fortsett en bok</h3>
              <p className="mt-1 text-xs text-muted-foreground">{continueProject ? continueProject.title || "Aktivt bokprosjekt" : "Ingen bok venter på videre arbeid."}</p>
            </div>
            <Button size="sm" variant="outline" disabled={!continueProject} onClick={() => continueProject && onOpen(continueProject.id)}>
              {targets.attentionCount > 0 ? "Se hva som stoppet" : "Fortsett arbeidet"}<ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex h-full flex-col gap-3 pt-5">
            <Send className="h-6 w-6 text-emerald-600" />
            <div className="flex-1">
              <h3 className="font-semibold">3. Publiser en bok</h3>
              <p className="mt-1 text-xs text-muted-foreground">{publishProject ? `${publishProject.title || "Boken"} er klar for sluttkontroll.` : "Ingen bok er klar for sluttgodkjenning akkurat nå."}</p>
            </div>
            <Button size="sm" variant="outline" disabled={!publishProject} onClick={() => publishProject && onOpen(publishProject.id)}>
              Kontroller og godkjenn<ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex h-full flex-col gap-3 pt-5">
            <TrendingUp className="h-6 w-6 text-violet-600" />
            <div className="flex-1">
              <h3 className="font-semibold">4. Selg og forbedre</h3>
              <p className="mt-1 text-xs text-muted-foreground">{growthProject ? `Åpne vekstplanen for ${growthProject.title || "godkjent bok"}.` : "Godkjenn en bok før vekstsløyfen aktiveres."}</p>
            </div>
            {growthProject ? (
              <Button size="sm" variant="outline" asChild>
                <a href={`/book-growth?project=${encodeURIComponent(growthProject.id)}`}>Åpne Book Growth<ArrowRight className="ml-1 h-4 w-4" /></a>
              </Button>
            ) : <Button size="sm" variant="outline" disabled>Åpne Book Growth</Button>}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
