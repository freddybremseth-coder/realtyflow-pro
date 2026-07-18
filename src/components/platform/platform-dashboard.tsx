"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Boxes,
  Building2,
  CheckCircle2,
  Layers3,
  Loader2,
  PackageCheck,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Users,
} from "lucide-react";
import { PlatformAccessPanel } from "@/components/platform/platform-access-panel";
import { TenantForm } from "@/components/platform/tenant-form";
import { WhiteLabelPanel } from "@/components/platform/white-label-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PlatformSnapshot } from "@/lib/platform/types";
import type { PlatformCommandInput } from "@/lib/platform/validation";

interface PlatformDashboardProps {
  initialSnapshot: PlatformSnapshot;
}

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  internal: "Intern",
  customer: "Kunde",
  partner: "Partner",
  reseller: "Forhandler",
};

function statusVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
  if (["active", "verified", "trialing"].includes(status)) return "success";
  if (["past_due", "pending", "suspended"].includes(status)) return "warning";
  if (["failed", "revoked", "expired"].includes(status)) return "destructive";
  return "secondary";
}

export function PlatformDashboard({ initialSnapshot }: PlatformDashboardProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedTenantId, setSelectedTenantId] = useState(
    initialSnapshot.tenants.find((tenant) => tenant.customerType === "customer")?.id
      ?? initialSnapshot.tenants[0]?.id
      ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedTenant = useMemo(
    () => snapshot.tenants.find((tenant) => tenant.id === selectedTenantId) ?? null,
    [selectedTenantId, snapshot.tenants],
  );

  const refresh = useCallback(async () => {
    const response = await fetch("/api/platform", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Kunne ikke oppdatere Platform Core.");
    setSnapshot(body as PlatformSnapshot);
  }, []);

  const runCommand = useCallback(async (input: PlatformCommandInput) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/platform/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Plattformhandlingen mislyktes.");
      await refresh();
      setNotice("Endringen er lagret.");
      return true;
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : "Plattformhandlingen mislyktes.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const selectedTenantModules = selectedTenant
    ? snapshot.tenantModules.filter((item) => item.tenantId === selectedTenant.id)
    : [];
  const selectedSubscriptions = selectedTenant
    ? snapshot.subscriptions.filter((item) => item.tenantId === selectedTenant.id)
    : [];
  const selectedMemberships = selectedTenant
    ? snapshot.memberships.filter((item) => item.tenantId === selectedTenant.id)
    : [];
  const selectedEntitlements = selectedTenant
    ? snapshot.entitlements.filter((item) => item.tenantId === selectedTenant.id)
    : [];
  const selectedDomains = selectedTenant
    ? snapshot.domains.filter((item) => item.tenantId === selectedTenant.id)
    : [];
  const selectedBranding = selectedTenant
    ? snapshot.branding.find((item) => item.tenantId === selectedTenant.id) ?? null
    : null;

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-primary-300">
            <Boxes size={17} /> Platform Core v1
          </div>
          <h1 className="text-2xl font-bold text-slate-100 md:text-3xl">Platform & moduler</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Én kilde for SaaS-kunder, app-pakker, modultilgang, entitlements og white-label-oppsett.
            Eksisterende RealtyFlow-brands er bevart som interne tenants.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try { await refresh(); } catch (refreshError) {
              setError(refreshError instanceof Error ? refreshError.message : "Oppdatering mislyktes.");
            } finally { setBusy(false); }
          }}
        >
          {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
          Oppdater
        </Button>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Plattformstatus">
        {[
          { label: "Tenants", value: snapshot.summary.tenantCount, icon: Building2 },
          { label: "SaaS-kunder", value: snapshot.summary.customerCount, icon: Users },
          { label: "Salgbare apper", value: snapshot.summary.sellableAppCount, icon: Rocket },
          { label: "Moduler", value: snapshot.summary.moduleCount, icon: Layers3 },
          { label: "Aktive abonnement", value: snapshot.summary.activeSubscriptionCount, icon: PackageCheck },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <CardContent className="flex items-center justify-between p-4">
                <div><p className="text-xs uppercase tracking-wide text-slate-500">{metric.label}</p><p className="mt-1 text-2xl font-semibold text-slate-100">{metric.value}</p></div>
                <Icon size={22} className="text-primary-400" />
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Tabs defaultValue="overview">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="overview">Produktkart</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="access" disabled={!selectedTenant}>Tilgang & abonnement</TabsTrigger>
          <TabsTrigger value="branding" disabled={!selectedTenant}>White-label</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-slate-100">Salgbare apper</h2><p className="text-sm text-slate-400">Selvstendige produkter satt sammen av samme modulbase.</p></div>
              <Badge variant="outline">Prisplaner settes senere</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {snapshot.apps.filter((app) => app.isSellable).map((app) => {
                const moduleNames = snapshot.appModules
                  .filter((item) => item.appId === app.id)
                  .map((item) => snapshot.modules.find((module) => module.id === item.moduleId)?.name)
                  .filter(Boolean);
                return (
                  <Card key={app.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle>{app.name}</CardTitle>
                        <Badge variant="success">Klar for pakking</Badge>
                      </div>
                      <CardDescription>{app.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {moduleNames.map((name) => <Badge key={name} variant="secondary">{name}</Badge>)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-100">Modulkatalog</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {snapshot.modules.map((module) => (
                <Card key={module.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="font-medium text-slate-100">{module.name}</p><p className="mt-1 text-xs text-slate-400">{module.description}</p></div>
                      {module.isCore ? <ShieldCheck size={18} className="shrink-0 text-emerald-400" /> : <CheckCircle2 size={18} className="shrink-0 text-primary-400" />}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{module.category}</span><code>v{module.version}</code></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="tenants" className="space-y-5">
          <TenantForm busy={busy} onCommand={runCommand} />
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {snapshot.tenants.map((tenant) => {
              const active = tenant.id === selectedTenantId;
              const moduleCount = snapshot.tenantModules.filter((item) => item.tenantId === tenant.id && ["active", "trialing"].includes(item.status)).length;
              return (
                <button key={tenant.id} type="button" onClick={() => setSelectedTenantId(tenant.id)} className={`rounded-xl border p-4 text-left transition ${active ? "border-primary-500 bg-primary-500/10" : "border-slate-700 bg-slate-800/50 hover:border-slate-600"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate font-semibold text-slate-100">{tenant.name}</p><p className="mt-1 font-mono text-xs text-slate-500">{tenant.slug}</p></div>
                      <Badge variant={statusVariant(tenant.status)}>{tenant.status}</Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-400"><span>{CUSTOMER_TYPE_LABELS[tenant.customerType] ?? tenant.customerType}</span><span>{moduleCount} moduler</span></div>
                </button>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="access">
          {selectedTenant && (
            <PlatformAccessPanel
              key={selectedTenant.id}
              tenant={selectedTenant}
              apps={snapshot.apps}
              modules={snapshot.modules}
              plans={snapshot.plans}
              tenantModules={selectedTenantModules}
              subscriptions={selectedSubscriptions}
              memberships={selectedMemberships}
              entitlements={selectedEntitlements}
              busy={busy}
              onCommand={runCommand}
            />
          )}
        </TabsContent>

        <TabsContent value="branding">
          {selectedTenant && (
            <WhiteLabelPanel
              key={selectedTenant.id}
              tenant={selectedTenant}
              branding={selectedBranding}
              domains={selectedDomains}
              apps={snapshot.apps}
              busy={busy}
              onCommand={runCommand}
            />
          )}
        </TabsContent>
      </Tabs>

      <p className="text-right text-xs text-slate-600">
        Sist lest {new Date(snapshot.generatedAt).toLocaleString("nb-NO")}
      </p>
    </main>
  );
}
