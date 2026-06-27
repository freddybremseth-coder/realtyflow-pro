"use client";

import { FormEvent, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_SITE_PACKAGES, type DemoSitePackageId } from "@/lib/demosites";

type DemoGeneratorCardProps = {
  templates: { slug: string; name: string }[];
  onCreated: () => Promise<void> | void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

const initialForm = {
  company_name: "",
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  industry: "",
  website_url: "",
  logo_url: "",
  brand_color: "#0f9f8f",
  services: "",
  package_id: "standard" as DemoSitePackageId,
  template_slug: "local-service",
  notes: "",
};

export function DemoGeneratorCard({ templates, onCreated, onError, onSuccess }: DemoGeneratorCardProps) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/saas/demosites/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Demo-generering feilet.");
      setForm(initialForm);
      onSuccess("Demo-preview er opprettet i DemoSites CRM.");
      await onCreated();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Demo-generering feilet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-purple-500/20 bg-slate-800/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Wand2 className="h-5 w-5 text-purple-300" /> Lag demo før kundemøte
        </CardTitle>
        <CardDescription>
          Lim inn nettside, logo, kontaktinfo og tjenester. RealtyFlow lager en intern demo-preview som kan forbedres før kunden ser den.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Bedriftsnavn" required value={form.company_name} onChange={(value) => setForm((prev) => ({ ...prev, company_name: value }))} />
          <Field label="Kontaktperson" value={form.customer_name} onChange={(value) => setForm((prev) => ({ ...prev, customer_name: value }))} />
          <Field label="E-post" type="email" value={form.customer_email} onChange={(value) => setForm((prev) => ({ ...prev, customer_email: value }))} />
          <Field label="Telefon" value={form.customer_phone} onChange={(value) => setForm((prev) => ({ ...prev, customer_phone: value }))} />
          <Field label="Eksisterende nettside / URL" value={form.website_url} onChange={(value) => setForm((prev) => ({ ...prev, website_url: value }))} />
          <Field label="Logo-URL" value={form.logo_url} onChange={(value) => setForm((prev) => ({ ...prev, logo_url: value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brandfarge" value={form.brand_color} onChange={(value) => setForm((prev) => ({ ...prev, brand_color: value }))} />
            <Field label="Bransje" value={form.industry} onChange={(value) => setForm((prev) => ({ ...prev, industry: value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Pakke" value={form.package_id} onChange={(value) => setForm((prev) => ({ ...prev, package_id: value as DemoSitePackageId }))} options={DEMO_SITE_PACKAGES.map((pkg) => ({ value: pkg.id, label: pkg.shortName }))} />
            <SelectField label="Mal" value={form.template_slug} onChange={(value) => setForm((prev) => ({ ...prev, template_slug: value }))} options={(templates.length ? templates : [{ slug: "local-service", name: "Lokal service" }]).map((template) => ({ value: template.slug, label: template.name }))} />
          </div>
          <textarea value={form.services} onChange={(event) => setForm((prev) => ({ ...prev, services: event.target.value }))} rows={2} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500" placeholder="Tjenester/produkter, separert med komma eller linjeskift" />
          <textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500" placeholder="Notater, priser, ønsket uttrykk, tekster og ting som må inn på demoen" />
          <Button type="submit" disabled={saving} className="w-full bg-purple-600 hover:bg-purple-500">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />} Lag demo-preview
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, required, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <div><label className="mb-1 block text-xs font-medium text-slate-300">{label}</label><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-purple-500" /></div>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <div><label className="mb-1 block text-xs font-medium text-slate-300">{label}</label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-purple-500">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}
