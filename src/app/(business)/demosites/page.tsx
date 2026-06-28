"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, CreditCard, ExternalLink, Globe, Loader2, MonitorSmartphone, Rocket, Send, Wallet } from "lucide-react";
import { TempDemoCard } from "@/components/demosites/temp-demo-card";
import { DEMO_SITE_PACKAGES, formatNok, type DemoSiteBillingStatus, type DemoSitePackageId, type DemoSiteStatus } from "@/lib/demosites";

type DemoSiteOrder = {
  id: string;
  order_number: string;
  status: DemoSiteStatus;
  billing_status: DemoSiteBillingStatus;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  company_name: string;
  industry?: string | null;
  website_url?: string | null;
  package_id: DemoSitePackageId;
  setup_fee_nok: number;
  monthly_fee_nok: number;
  setup_cost_nok: number;
  monthly_cost_nok: number;
  template_slug?: string | null;
  target_subdomain?: string | null;
  preview_url?: string | null;
  claim_url?: string | null;
  claimed_at?: string | null;
  expires_at?: string | null;
  production_url?: string | null;
  editable_fields?: Record<string, unknown> | null;
  notes?: string | null;
  created_at?: string;
};

type DemoSiteTemplate = { slug: string; name: string; description?: string; preview_url?: string };
type DemoSiteSummary = { totalOrders: number; activeOrders: number; paidOrders: number; bookedSetupRevenue: number; activeMrr: number; setupCosts: number; monthlyCosts: number; netSetup: number; netMrr: number; arr: number };

type OrderFormState = {
  company_name: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  industry: string;
  website_url: string;
  package_id: DemoSitePackageId;
  template_slug: string;
  setup_cost_nok: string;
  monthly_cost_nok: string;
  notes: string;
};

const EMPTY_SUMMARY: DemoSiteSummary = { totalOrders: 0, activeOrders: 0, paidOrders: 0, bookedSetupRevenue: 0, activeMrr: 0, setupCosts: 0, monthlyCosts: 0, netSetup: 0, netMrr: 0, arr: 0 };
const INITIAL_FORM: OrderFormState = { company_name: "", customer_name: "", customer_email: "", customer_phone: "", industry: "", website_url: "", package_id: "standard", template_slug: "local-service", setup_cost_nok: "0", monthly_cost_nok: "0", notes: "" };

const statusLabel: Record<DemoSiteStatus, string> = { lead: "Lead", draft_preview: "Midlertidig demo", ordered: "Bestilt", in_setup: "Oppsett", preview_ready: "Preview", approved: "Godkjent", deployed: "Live", paused: "Pauset", expired: "Utløpt", cancelled: "Kansellert" };
const billingLabel: Record<DemoSiteBillingStatus, string> = { not_invoiced: "Ikke fakturert", pending: "Venter", paid: "Betalt", overdue: "Forfalt", cancelled: "Stoppet" };

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value));
}

function editableFieldList(order: DemoSiteOrder) {
  const fields = order.editable_fields && typeof order.editable_fields === "object" ? Object.keys(order.editable_fields) : [];
  return fields.length ? fields : ["logo", "adresse", "kontaktinfo", "priser", "tjenester", "produkter", "tekstfelt", "farger"];
}

export default function DemoSitesPage() {
  const [orders, setOrders] = useState<DemoSiteOrder[]>([]);
  const [templates, setTemplates] = useState<DemoSiteTemplate[]>([]);
  const [summary, setSummary] = useState<DemoSiteSummary>(EMPTY_SUMMARY);
  const [form, setForm] = useState<OrderFormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/saas/demosites", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke hente DemoSites CRM.");
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
      setSummary(data.summary || EMPTY_SUMMARY);
      if (data.error) setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente DemoSites CRM.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/saas/demosites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, setup_cost_nok: Number(form.setup_cost_nok) || 0, monthly_cost_nok: Number(form.monthly_cost_nok) || 0 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bestilling feilet.");
      setForm(INITIAL_FORM);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bestilling feilet.");
    } finally {
      setSaving(false);
    }
  }

  async function updateOrder(order: DemoSiteOrder, patch: Partial<DemoSiteOrder>) {
    const response = await fetch("/api/saas/demosites", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: order.id, ...patch }) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Oppdatering feilet.");
    await loadData();
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-purple-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-white"><MonitorSmartphone className="text-purple-400" /> DemoSites CRM</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Bestillingsflyt, kundeoversikt, preview-URL og MRR for nettsidepakker på ChatGenius.pro.</p>
        </div>
        <a href="https://github.com/freddybremseth-coder/demosites" target="_blank" rel="noopener noreferrer"><Button variant="outline" className="border-slate-600">Demosites repo <ExternalLink className="ml-2 h-4 w-4" /></Button></a>
      </div>

      {error && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <Metric label="Bestillinger" value={String(summary.totalOrders)} />
        <Metric label="Aktive" value={String(summary.activeOrders)} />
        <Metric label="Betalt" value={String(summary.paidOrders)} />
        <Metric label="MRR" value={formatNok(summary.activeMrr)} />
        <Metric label="Netto MRR" value={formatNok(summary.netMrr)} />
        <Metric label="ARR" value={formatNok(summary.arr)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {DEMO_SITE_PACKAGES.map((pkg) => <Card key={pkg.id} className={`border-slate-700/50 bg-slate-800/50 ${pkg.recommended ? "ring-1 ring-purple-500/60" : ""}`}><CardHeader><CardTitle className="text-white">{pkg.shortName}</CardTitle><CardDescription>{pkg.tagline}</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold text-white">{formatNok(pkg.setupFeeNok)}</div><div className="text-sm text-emerald-300">+ {formatNok(pkg.monthlyFeeNok)} / mnd</div><p className="mt-3 text-xs text-slate-400">{pkg.salesAngle}</p></CardContent></Card>)}
      </div>

      <TempDemoCard onCreated={loadData} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="border-purple-500/20 bg-slate-800/50">
          <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Send className="h-5 w-5 text-purple-300" />Ny bestilling</CardTitle><CardDescription>Få valg, enkel bestilling og automatisk forslag til preview-subdomene.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={createOrder} className="space-y-3">
              <Input label="Bedriftsnavn" required value={form.company_name} onChange={(value) => setForm((prev) => ({ ...prev, company_name: value }))} />
              <Input label="Kontaktperson" required value={form.customer_name} onChange={(value) => setForm((prev) => ({ ...prev, customer_name: value }))} />
              <Input label="E-post" required type="email" value={form.customer_email} onChange={(value) => setForm((prev) => ({ ...prev, customer_email: value }))} />
              <Input label="Telefon" value={form.customer_phone} onChange={(value) => setForm((prev) => ({ ...prev, customer_phone: value }))} />
              <Input label="Bransje" value={form.industry} onChange={(value) => setForm((prev) => ({ ...prev, industry: value }))} />
              <Input label="Eksisterende nettside" value={form.website_url} onChange={(value) => setForm((prev) => ({ ...prev, website_url: value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Pakke" value={form.package_id} onChange={(value) => setForm((prev) => ({ ...prev, package_id: value as DemoSitePackageId }))} options={DEMO_SITE_PACKAGES.map((pkg) => ({ value: pkg.id, label: pkg.shortName }))} />
                <Select label="Mal" value={form.template_slug} onChange={(value) => setForm((prev) => ({ ...prev, template_slug: value }))} options={(templates.length ? templates : [{ slug: "local-service", name: "Lokal service" }]).map((template) => ({ value: template.slug, label: template.name }))} />
              </div>
              <div className="grid grid-cols-2 gap-3"><Input label="Setup-kost" type="number" value={form.setup_cost_nok} onChange={(value) => setForm((prev) => ({ ...prev, setup_cost_nok: value }))} /><Input label="Mnd-kost" type="number" value={form.monthly_cost_nok} onChange={(value) => setForm((prev) => ({ ...prev, monthly_cost_nok: value }))} /></div>
              <textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500" placeholder="Logo, farger, tjenester, produkter, priser og tekst som skal endres" />
              <Button type="submit" disabled={saving} className="w-full bg-purple-600 hover:bg-purple-500">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Opprett bestilling</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Globe className="h-5 w-5 text-blue-300" />Kunder og bestillinger</CardTitle><CardDescription>Her ser du demo, claim-lenke, betaling, valgt pakke og utløpsdato.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {orders.length === 0 ? <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">Ingen bestillinger ennå.</div> : orders.map((order) => (
              <div key={order.id} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between"><div><h3 className="text-lg font-semibold text-white">{order.company_name}</h3><p className="text-xs text-slate-500">{order.order_number} · {order.customer_name} · {order.customer_email} · {formatDate(order.created_at)}</p></div><div className="flex flex-wrap gap-2"><Badge>{statusLabel[order.status]}</Badge><Badge variant="outline" className="border-slate-600 text-slate-300">{billingLabel[order.billing_status]}</Badge>{order.claimed_at && <Badge className="bg-emerald-600 text-white">Claimet</Badge>}</div></div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6"><Info label="Pakke" value={order.package_id} /><Info label="Pris" value={`${formatNok(order.setup_fee_nok)} + ${formatNok(order.monthly_fee_nok)}/mnd`} /><Info label="Preview" value={order.preview_url ? "Åpne preview" : "Ikke klar"} href={order.preview_url || undefined} /><Info label="Claim" value={order.claim_url ? "Åpne claim" : "Ikke klar"} href={order.claim_url || undefined} /><Info label="Claimet" value={formatDate(order.claimed_at) || "Ikke claimet"} /><Info label="Utløper" value={formatDate(order.expires_at) || "Ikke satt"} /></div>
                <div className="mt-3 flex flex-wrap gap-1.5">{editableFieldList(order).slice(0, 8).map((field) => <Badge key={field} variant="outline" className="border-slate-600 text-[10px] text-slate-300">{field}</Badge>)}</div>
                <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" className="border-slate-600" onClick={() => updateOrder(order, { status: "in_setup" })}>Oppsett</Button><Button size="sm" variant="outline" className="border-purple-500/40 text-purple-200" onClick={() => updateOrder(order, { status: "preview_ready" })}>Preview klar</Button><Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-200" onClick={() => updateOrder(order, { status: "approved" })}><CheckCircle className="mr-1 h-3.5 w-3.5" />Godkjent</Button><Button size="sm" className="bg-green-600 hover:bg-green-500" onClick={() => updateOrder(order, { status: "deployed" })}><Rocket className="mr-1 h-3.5 w-3.5" />Live</Button><Button size="sm" className="bg-emerald-600 hover:bg-emerald-500" onClick={() => updateOrder(order, { billing_status: "paid" })}><CreditCard className="mr-1 h-3.5 w-3.5" />Betalt</Button></div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <Card className="border-slate-700/50 bg-slate-800/50"><CardContent className="p-4 text-center"><Wallet className="mx-auto mb-2 h-5 w-5 text-purple-300" /><div className="text-xl font-bold text-white">{value}</div><div className="text-xs text-slate-500">{label}</div></CardContent></Card>; }
function Input({ label, value, onChange, required, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) { return <div><label className="mb-1 block text-xs font-medium text-slate-300">{label}</label><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-purple-500" /></div>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { return <div><label className="mb-1 block text-xs font-medium text-slate-300">{label}</label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-purple-500">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>; }
function Info({ label, value, href }: { label: string; value: string; href?: string }) { return <div className="rounded-lg bg-slate-950/60 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 truncate text-sm text-purple-300 hover:text-purple-200">{value}<ExternalLink className="h-3 w-3" /></a> : <div className="mt-1 truncate text-sm text-slate-300">{value}</div>}</div>; }
