"use client";

import { useState, type FormEvent } from "react";
import { Globe, Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PlatformApp, PlatformBranding, PlatformDomain, PlatformTenant } from "@/lib/platform/types";
import type { PlatformCommandInput } from "@/lib/platform/validation";

interface WhiteLabelPanelProps {
  tenant: PlatformTenant;
  branding: PlatformBranding | null;
  domains: PlatformDomain[];
  apps: PlatformApp[];
  busy: boolean;
  onCommand: (input: PlatformCommandInput) => Promise<boolean>;
}

export function WhiteLabelPanel({ tenant, branding, domains, apps, busy, onCommand }: WhiteLabelPanelProps) {
  const [appName, setAppName] = useState(branding?.appName ?? tenant.name);
  const [logoUrl, setLogoUrl] = useState(branding?.logoUrl ?? "");
  const [primaryColor, setPrimaryColor] = useState(branding?.primaryColor ?? "#06b6d4");
  const [accentColor, setAccentColor] = useState(branding?.accentColor ?? "#8b5cf6");
  const [supportEmail, setSupportEmail] = useState(branding?.supportEmail ?? tenant.contactEmail ?? "");
  const [hostname, setHostname] = useState("");
  const [appSlug, setAppSlug] = useState(apps[0]?.slug ?? "");

  async function saveBranding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCommand({
      command: "upsert_branding",
      payload: {
        tenantId: tenant.id,
        appName,
        logoUrl,
        faviconUrl: "",
        primaryColor,
        accentColor,
        supportEmail,
        emailFromName: appName,
        locale: tenant.defaultLocale,
        customCss: "",
      },
    });
  }

  async function saveDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onCommand({
      command: "upsert_domain",
      payload: {
        tenantId: tenant.id,
        appSlug,
        hostname,
        domainType: "custom",
        status: "pending",
        isPrimary: domains.length === 0,
      },
    });
    if (saved) setHostname("");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette size={18} /> Visuell profil</CardTitle>
          <CardDescription>Navn, logo, farger og avsender som kunden møter.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={saveBranding}>
            <label className="block space-y-1.5 text-sm text-slate-300">Appnavn<Input value={appName} onChange={(event) => setAppName(event.target.value)} required /></label>
            <label className="block space-y-1.5 text-sm text-slate-300">Logo-URL<Input type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://..." /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-sm text-slate-300">Primærfarge<div className="flex gap-2"><Input type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} className="w-14 p-1" /><Input value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} /></div></label>
              <label className="space-y-1.5 text-sm text-slate-300">Aksentfarge<div className="flex gap-2"><Input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} className="w-14 p-1" /><Input value={accentColor} onChange={(event) => setAccentColor(event.target.value)} /></div></label>
            </div>
            <label className="block space-y-1.5 text-sm text-slate-300">Support-e-post<Input type="email" value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} /></label>
            <div className="rounded-lg border border-slate-700 p-4" style={{ borderColor: primaryColor }}>
              <p className="font-semibold" style={{ color: accentColor }}>{appName || tenant.name}</p>
              <p className="mt-1 text-xs text-slate-400">Forhåndsvisning av kundens white-label-identitet</p>
            </div>
            <Button type="submit" disabled={busy || !appName.trim()}>Lagre profil</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe size={18} /> Domener</CardTitle>
          <CardDescription>Registrering oppretter verifikasjonsgrunnlaget. DNS-automatisering kommer i neste fase.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={saveDomain}>
            <label className="block space-y-1.5 text-sm text-slate-300">
              App
              <select value={appSlug} onChange={(event) => setAppSlug(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm">
                {apps.map((app) => <option key={app.id} value={app.slug}>{app.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm text-slate-300">Vertsnavn<Input value={hostname} onChange={(event) => setHostname(event.target.value.toLowerCase())} placeholder="app.kundedomenet.no" required /></label>
            <Button type="submit" size="sm" disabled={busy || !hostname || !appSlug}>Legg til domene</Button>
          </form>
          <div className="mt-5 space-y-3">
            {domains.length === 0 && <p className="text-sm text-slate-500">Ingen domener registrert.</p>}
            {domains.map((domain) => (
              <div key={domain.id} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-slate-200">{domain.hostname}</span>
                  <Badge variant={domain.status === "active" ? "success" : "warning"}>{domain.status}</Badge>
                </div>
                <p className="mt-2 break-all font-mono text-[11px] text-slate-500">Verifikasjon: {domain.verificationToken}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
