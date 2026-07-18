"use client";

import { useState, type FormEvent } from "react";
import { Check, KeyRound, Package, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  PlatformApp,
  PlatformEntitlement,
  PlatformMembership,
  PlatformModule,
  PlatformPlan,
  PlatformSubscription,
  PlatformTenant,
  PlatformTenantModule,
} from "@/lib/platform/types";
import type { PlatformCommandInput } from "@/lib/platform/validation";

interface PlatformAccessPanelProps {
  tenant: PlatformTenant;
  apps: PlatformApp[];
  modules: PlatformModule[];
  plans: PlatformPlan[];
  tenantModules: PlatformTenantModule[];
  subscriptions: PlatformSubscription[];
  memberships: PlatformMembership[];
  entitlements: PlatformEntitlement[];
  busy: boolean;
  onCommand: (input: PlatformCommandInput) => Promise<boolean>;
}

export function PlatformAccessPanel({
  tenant,
  apps,
  modules,
  plans,
  tenantModules,
  subscriptions,
  memberships,
  entitlements,
  busy,
  onCommand,
}: PlatformAccessPanelProps) {
  const [appSlug, setAppSlug] = useState(apps.find((app) => app.isSellable)?.slug ?? apps[0]?.slug ?? "");
  const [planSlug, setPlanSlug] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [entitlementKey, setEntitlementKey] = useState("");
  const [entitlementValue, setEntitlementValue] = useState("true");

  const activeModuleIds = new Set(
    tenantModules
      .filter((item) => item.status === "active" || item.status === "trialing")
      .map((item) => item.moduleId),
  );
  const selectedApp = apps.find((app) => app.slug === appSlug);
  const availablePlans = selectedApp ? plans.filter((plan) => plan.appId === selectedApp.id) : [];

  async function saveSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appSlug) return;
    await onCommand({
      command: "upsert_subscription",
      payload: {
        tenantId: tenant.id,
        appSlug,
        planSlug,
        status: "active",
        provider: "manual",
        cancelAtPeriodEnd: false,
      },
    });
  }

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onCommand({
      command: "upsert_membership",
      payload: {
        tenantId: tenant.id,
        userEmail: memberEmail,
        role: memberRole,
        isOwner: memberRole === "owner",
        status: "invited",
      },
    });
    if (saved) setMemberEmail("");
  }

  async function saveEntitlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let value: unknown = entitlementValue;
    if (entitlementValue === "true" || entitlementValue === "false") value = entitlementValue === "true";
    else if (entitlementValue.trim() && Number.isFinite(Number(entitlementValue))) value = Number(entitlementValue);
    const saved = await onCommand({
      command: "set_entitlement",
      payload: {
        tenantId: tenant.id,
        moduleSlug: "",
        entitlementKey,
        value,
        status: "active",
        source: "manual",
      },
    });
    if (saved) {
      setEntitlementKey("");
      setEntitlementValue("true");
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Package size={18} /> Modultilgang</CardTitle>
          <CardDescription>Aktiver bare det kunden har kjøpt. Plattformkjernen kan ikke slås av.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {modules.map((module) => {
            const active = activeModuleIds.has(module.id);
            return (
              <div key={module.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-100">{module.name}</p>
                    {module.isCore && <Badge variant="secondary">Kjerne</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{module.description}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={active ? "secondary" : "outline"}
                  disabled={busy || (module.isCore && active)}
                  onClick={() => onCommand({
                    command: "set_module",
                    payload: {
                      tenantId: tenant.id,
                      moduleSlug: module.slug,
                      status: active ? "disabled" : "active",
                      source: "manual",
                    },
                  })}
                  aria-label={`${active ? "Deaktiver" : "Aktiver"} ${module.name}`}
                >
                  {active ? <Check size={15} /> : <X size={15} />}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">App og abonnement</CardTitle>
            <CardDescription>Koble en kommersiell app eller suite til kunden.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={saveSubscription}>
              <label className="block space-y-1.5 text-sm text-slate-300">
                App
                <select
                  value={appSlug}
                  onChange={(event) => {
                    setAppSlug(event.target.value);
                    setPlanSlug("");
                  }}
                  className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm"
                >
                  {apps.map((app) => <option key={app.id} value={app.slug}>{app.name}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5 text-sm text-slate-300">
                Plan (valgfritt)
                <select
                  value={planSlug}
                  onChange={(event) => setPlanSlug(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm"
                >
                  <option value="">Manuell / ingen prisplan</option>
                  {availablePlans.map((plan) => <option key={plan.id} value={plan.slug}>{plan.name}</option>)}
                </select>
              </label>
              <Button type="submit" size="sm" disabled={busy || !appSlug}>Aktiver app</Button>
            </form>
            {subscriptions.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-slate-700 pt-3">
                {subscriptions.map((subscription) => {
                  const app = apps.find((item) => item.id === subscription.appId);
                  return (
                    <div key={subscription.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{app?.name ?? subscription.appId}</span>
                      <Badge variant={subscription.status === "active" ? "success" : "warning"}>{subscription.status}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><UserPlus size={16} /> Medlemmer</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={saveMember}>
              <Input type="email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="bruker@kunde.no" required />
              <div className="flex gap-2">
                <select value={memberRole} onChange={(event) => setMemberRole(event.target.value)} className="h-9 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm">
                  <option value="owner">Eier</option>
                  <option value="admin">Admin</option>
                  <option value="member">Bruker</option>
                  <option value="viewer">Lesetilgang</option>
                </select>
                <Button type="submit" size="sm" disabled={busy || !memberEmail}>Inviter</Button>
              </div>
            </form>
            <div className="mt-3 space-y-2">
              {memberships.map((membership) => (
                <div key={membership.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-slate-300">{membership.userEmail}</span>
                  <Badge variant={membership.status === "active" ? "success" : "secondary"}>{membership.role} · {membership.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound size={16} /> Entitlements</CardTitle>
            <CardDescription>Individuelle funksjoner eller kvoter uten å lage ny plan.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={saveEntitlement}>
              <Input value={entitlementKey} onChange={(event) => setEntitlementKey(event.target.value.toLowerCase())} placeholder="crm.contacts.limit" required />
              <div className="flex gap-2">
                <Input value={entitlementValue} onChange={(event) => setEntitlementValue(event.target.value)} placeholder="true eller 2500" />
                <Button type="submit" size="sm" disabled={busy || !entitlementKey}>Lagre</Button>
              </div>
            </form>
            <div className="mt-3 space-y-2">
              {entitlements.map((entitlement) => (
                <div key={entitlement.id} className="flex items-center justify-between gap-3 text-sm">
                  <code className="truncate text-xs text-slate-300">{entitlement.entitlementKey}</code>
                  <Badge variant="outline">{JSON.stringify(entitlement.value)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
