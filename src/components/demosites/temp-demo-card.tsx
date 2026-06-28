"use client";

import { FormEvent, useState } from "react";
import { Rocket, Loader2, ExternalLink, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_SITE_PACKAGES, type DemoSitePackageId } from "@/lib/demosites";

type DemoRequestFormState = {
  company_name: string;
  customer_email: string;
  customer_phone: string;
  website_url: string;
  industry: string;
  services: string;
  package_id: DemoSitePackageId;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  notes: string;
};

type CreatedDemo = {
  actionUrl?: string;
  previewUrl?: string;
  expiresAt?: string;
};

type AssetUploadResponse = {
  logoUrl?: string | null;
  imageUrls?: string[];
};

const INITIAL_FORM: DemoRequestFormState = {
  company_name: "",
  customer_email: "",
  customer_phone: "",
  website_url: "",
  industry: "",
  services: "",
  package_id: "standard",
  primary_color: "#0f9f8f",
  secondary_color: "#0f172a",
  accent_color: "#14b8a6",
  notes: "",
};

function formatDate(value?: string) {
  if (!value) return "7 dager";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value));
}

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}

async function uploadAssets(logoFile: File | null, imageFiles: File[]) {
  if (!logoFile && imageFiles.length === 0) return { logoUrl: null, imageUrls: [] } as AssetUploadResponse;

  const formData = new FormData();
  if (logoFile) formData.append("logo", logoFile);
  imageFiles.slice(0, 3).forEach((file) => formData.append("images", file));

  const response = await fetch("/api/saas/demosites/assets", { method: "POST", body: formData });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Kunne ikke laste opp logo/bilder.");
  return data as AssetUploadResponse;
}

export function TempDemoCard({ onCreated }: { onCreated: () => Promise<void> }) {
  const [form, setForm] = useState<DemoRequestFormState>(INITIAL_FORM);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [createdDemo, setCreatedDemo] = useState<CreatedDemo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setCreatedDemo(null);

    try {
      if (![form.primary_color, form.secondary_color, form.accent_color].every(isHexColor)) {
        throw new Error("HEX-farger må være i formatet #123ABC.");
      }

      const assets = await uploadAssets(logoFile, imageFiles);
      const response = await fetch("/api/saas/demosites/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          brand_color: form.primary_color,
          logo_url: assets.logoUrl,
          image_urls: assets.imageUrls || [],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke lage demo.");
      setCreatedDemo({ actionUrl: data.claimUrl, previewUrl: data.previewUrl, expiresAt: data.expiresAt });
      setForm(INITIAL_FORM);
      setLogoFile(null);
      setImageFiles([]);
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lage demo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-emerald-500/20 bg-slate-800/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white"><Rocket className="h-5 w-5 text-emerald-300" />Lag midlertidig demo</CardTitle>
        <CardDescription>Kunden får en privat lenke. Legg inn logo, farger og bilder for at demoen skal ligne mer på kundens egen side.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{error}</div>}
        <form onSubmit={createDemo} className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <Input label="Bedriftsnavn" required value={form.company_name} onChange={(value) => setForm((prev) => ({ ...prev, company_name: value }))} />
          <Input label="Kundens e-post" required type="email" value={form.customer_email} onChange={(value) => setForm((prev) => ({ ...prev, customer_email: value }))} />
          <Input label="Telefon" value={form.customer_phone} onChange={(value) => setForm((prev) => ({ ...prev, customer_phone: value }))} />
          <Input label="Eksisterende nettside" value={form.website_url} onChange={(value) => setForm((prev) => ({ ...prev, website_url: value }))} />
          <Input label="Bransje" value={form.industry} onChange={(value) => setForm((prev) => ({ ...prev, industry: value }))} />
          <Select label="Pakke" value={form.package_id} onChange={(value) => setForm((prev) => ({ ...prev, package_id: value as DemoSitePackageId }))} options={DEMO_SITE_PACKAGES.map((pkg) => ({ value: pkg.id, label: pkg.shortName }))} />
          <div className="lg:col-span-2"><Input label="Tjenester" value={form.services} onChange={(value) => setForm((prev) => ({ ...prev, services: value }))} /></div>

          <FileInput label="Logo" help={logoFile?.name || "PNG, JPG, WEBP, SVG"} onChange={(files) => setLogoFile(files[0] || null)} />
          <FileInput label="Bilde 1" help={imageFiles[0]?.name || "Valgfritt bilde"} onChange={(files) => setImageFiles((prev) => [files[0], prev[1], prev[2]].filter(Boolean) as File[])} />
          <FileInput label="Bilde 2" help={imageFiles[1]?.name || "Valgfritt bilde"} onChange={(files) => setImageFiles((prev) => [prev[0], files[0], prev[2]].filter(Boolean) as File[])} />
          <FileInput label="Bilde 3" help={imageFiles[2]?.name || "Valgfritt bilde"} onChange={(files) => setImageFiles((prev) => [prev[0], prev[1], files[0]].filter(Boolean) as File[])} />

          <ColorInput label="Primær HEX" value={form.primary_color} onChange={(value) => setForm((prev) => ({ ...prev, primary_color: value }))} />
          <ColorInput label="Sekundær HEX" value={form.secondary_color} onChange={(value) => setForm((prev) => ({ ...prev, secondary_color: value }))} />
          <ColorInput label="Accent HEX" value={form.accent_color} onChange={(value) => setForm((prev) => ({ ...prev, accent_color: value }))} />
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-400">
            <ImagePlus className="mb-1 h-4 w-4 text-emerald-300" /> Disse verdiene brukes direkte i preview-siden.
          </div>

          <div className="lg:col-span-3"><textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} rows={2} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" placeholder="Kort info om bedriften, ønsker, farger, tilbud, åpningstid osv." /></div>
          <Button type="submit" disabled={saving} className="h-full min-h-10 bg-emerald-600 hover:bg-emerald-500">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}Lag demo</Button>
        </form>
        {createdDemo && <div className="grid grid-cols-1 gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 md:grid-cols-3"><Info label="Kundelenke" value={createdDemo.actionUrl || "Ikke klar"} href={createdDemo.actionUrl} /><Info label="Preview" value={createdDemo.previewUrl || "Ikke klar"} href={createdDemo.previewUrl} /><Info label="Utløper" value={formatDate(createdDemo.expiresAt)} /></div>}
      </CardContent>
    </Card>
  );
}

function Input({ label, value, onChange, required, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) { return <div><label className="mb-1 block text-xs font-medium text-slate-300">{label}</label><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-500" /></div>; }
function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div><label className="mb-1 block text-xs font-medium text-slate-300">{label}</label><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="#0f9f8f" className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 font-mono text-sm text-white outline-none focus:border-emerald-500" /></div>; }
function FileInput({ label, help, onChange }: { label: string; help: string; onChange: (files: File[]) => void }) { return <div><label className="mb-1 block text-xs font-medium text-slate-300">{label}</label><input type="file" accept="image/*" onChange={(event) => onChange(Array.from(event.target.files || []))} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-emerald-500" /><div className="mt-1 truncate text-[10px] text-slate-500">{help}</div></div>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { return <div><label className="mb-1 block text-xs font-medium text-slate-300">{label}</label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-500">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>; }
function Info({ label, value, href }: { label: string; value: string; href?: string }) { return <div className="rounded-lg bg-slate-950/60 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 truncate text-sm text-emerald-300 hover:text-emerald-200">{value}<ExternalLink className="h-3 w-3" /></a> : <div className="mt-1 truncate text-sm text-slate-300">{value}</div>}</div>; }
