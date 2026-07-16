"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Domene-hub-panel: viser de åpne oppgavene fra Oppgave-HUB-en som hører til
 * ett forretningsområde, rett på områdets hovedside — pluss snarveier til
 * verktøyene i samme domene. Samme mønster som Forfatter-hub-piloten i
 * Publishing Hub: samme data som /marketing-tasks, én inngang mindre å
 * hoppe mellom.
 */

type WorkItem = {
  id: string;
  title: string;
  description?: string | null;
  priority?: string | null;
  status?: string | null;
  next_action?: string | null;
  source_type?: string | null;
  brand_id?: string | null;
  ai_score?: number | null;
};

export type DomainHubLink = { label: string; href: string; external?: boolean };

export function DomainWorkItems({
  title,
  description,
  icon,
  sources,
  brandIds = [],
  links,
  maxItems = 8,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  sources: string[];
  brandIds?: string[];
  links: DomainHubLink[];
  maxItems?: number;
}) {
  const [tasks, setTasks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/work-items?limit=150", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const items: WorkItem[] = Array.isArray(data.work_items) ? data.work_items : [];
      const mine = items.filter(
        (item) =>
          (sources.includes(String(item.source_type || "")) || brandIds.includes(String(item.brand_id || ""))) &&
          !["DONE", "CANCELLED"].includes(String(item.status || "")),
      );
      setTasks(mine.slice(0, maxItems));
    } catch {
      setError("Kunne ikke hente oppgavene.");
    } finally {
      setLoading(false);
    }
    // sources/brandIds er stabile literals fra kallstedet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function complete(id: string) {
    setCompletingId(id);
    try {
      const res = await fetch("/api/work-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "DONE" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Kunne ikke fullføre oppgaven.");
        return;
      }
      setTasks((prev) => prev.filter((task) => task.id !== id));
    } finally {
      setCompletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {icon}
              {title}
            </CardTitle>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {links.map((link) =>
              link.external ? (
                <Button key={link.href} variant="outline" size="sm" asChild>
                  <a href={link.href} target="_blank" rel="noopener noreferrer">
                    {link.label} <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              ) : (
                <Button key={link.href} variant="outline" size="sm" asChild>
                  <a href={link.href}>{link.label}</a>
                </Button>
              ),
            )}
            <Button variant="ghost" size="sm" onClick={load} disabled={loading} aria-label="Oppdater oppgaver">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
        {tasks.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground">Ingen åpne oppgaver for dette området. 🎉</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              // Syntetiske forslag (crm-…, brand-channel-…) ligger ikke i
              // work_items-tabellen og kan ikke markeres som fullført.
              const isSynthetic = !/^[0-9a-f-]{36}$/i.test(task.id);
              return (
              <div
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {task.title}
                    <Badge
                      variant="outline"
                      className={`ml-2 align-middle text-[10px] ${
                        task.priority === "CRITICAL"
                          ? "border-red-400/60 text-red-500"
                          : task.priority === "HIGH"
                            ? "border-amber-400/60 text-amber-500"
                            : "text-muted-foreground"
                      }`}
                    >
                      {task.priority || "MEDIUM"}
                    </Badge>
                  </p>
                  {task.next_action || task.description ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {task.next_action || task.description}
                    </p>
                  ) : null}
                </div>
                {isSynthetic ? (
                  <span className="text-xs text-muted-foreground">AI-forslag</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => complete(task.id)}
                    disabled={completingId === task.id}
                  >
                    {completingId === task.id ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                    )}
                    Fullført
                  </Button>
                )}
              </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
