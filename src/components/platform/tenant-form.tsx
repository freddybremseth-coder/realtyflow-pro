"use client";

import { useState, type FormEvent } from "react";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PlatformCommandInput } from "@/lib/platform/validation";

interface TenantFormProps {
  busy: boolean;
  onCommand: (input: PlatformCommandInput) => Promise<boolean>;
}

export function TenantForm({ busy, onCommand }: TenantFormProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [customerType, setCustomerType] = useState<"customer" | "partner" | "reseller">("customer");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onCommand({
      command: "upsert_tenant",
      payload: {
        name,
        slug,
        contactEmail,
        customerType,
        status: "active",
        defaultLocale: "nb-NO",
        defaultCurrency: "EUR",
        timezone: "Europe/Madrid",
        dataRegion: "eu",
      },
    });
    if (saved) {
      setName("");
      setSlug("");
      setContactEmail("");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus size={18} /> Ny SaaS-kunde
        </CardTitle>
        <CardDescription>
          Oppretter en isolert tenant. Juridiske selskaper og fakturaoppsett kobles til senere.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-1.5 text-sm text-slate-300">
            Navn
            <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} />
          </label>
          <label className="space-y-1.5 text-sm text-slate-300">
            Slug
            <Input
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              placeholder="kunde-navn"
              pattern="[a-z0-9][a-z0-9-]{1,62}"
              required
            />
          </label>
          <label className="space-y-1.5 text-sm text-slate-300">
            Kontakt-e-post
            <Input
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="kunde@eksempel.no"
            />
          </label>
          <label className="space-y-1.5 text-sm text-slate-300">
            Kundetype
            <select
              value={customerType}
              onChange={(event) => setCustomerType(event.target.value as typeof customerType)}
              className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
            >
              <option value="customer">Kunde</option>
              <option value="partner">Partner</option>
              <option value="reseller">Forhandler</option>
            </select>
          </label>
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy || !name.trim() || !slug.trim()}>
              <Building2 size={16} className="mr-2" /> Opprett tenant
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
