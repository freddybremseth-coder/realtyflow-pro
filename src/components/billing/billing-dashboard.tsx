"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Banknote, Building2, CheckCircle2, Clock3, FilePlus2, FileText, Package, Plus, ReceiptText, RefreshCw, Search, Settings2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addDecimalAmounts, decimalToMinorUnits, formatBillingCurrency } from "@/lib/billing/money";
import type { BillingCustomer, BillingDocument, BillingOrganization, BillingProduct, BillingTaxRule } from "@/lib/billing/types";

type Tab = "overview" | "documents" | "customers" | "products" | "tax" | "settings";
type Bootstrap = {
  organization: BillingOrganization;
  settings: Record<string, any> | null;
  customers: BillingCustomer[];
  products: BillingProduct[];
  taxRules: BillingTaxRule[];
  documents: BillingDocument[];
  payments: Array<Record<string, any>>;
  refunds: Array<Record<string, any>>;
  series: Array<Record<string, any>>;
  jobs: Array<Record<string, any>>;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Kladd", ready: "Klar", issued: "Utstedt", sent: "Sendt", opened: "Åpnet",
  partially_paid: "Delvis betalt", paid: "Betalt", overdue: "Forfalt", partially_credited: "Delvis kreditert",
  fully_credited: "Fullt kreditert", credited: "Kreditert", replaced: "Erstattet",
};
const TYPE_LABELS: Record<string, string> = { quote: "Tilbud", proforma: "Proforma", invoice: "Faktura", credit_note: "Kreditnota" };

function badgeVariant(status: string) {
  if (status === "paid") return "success" as const;
  if (["overdue", "credited", "fully_credited"].includes(status)) return "destructive" as const;
  if (["partially_paid", "partially_credited", "ready"].includes(status)) return "warning" as const;
  if (["draft", "replaced"].includes(status)) return "secondary" as const;
  return "default" as const;
}

function amountsByCurrency(documents: BillingDocument[], selector: (document: BillingDocument) => string | number, predicate: (document: BillingDocument) => boolean) {
  const grouped = new Map<string, Array<string | number>>();
  for (const document of documents.filter(predicate)) grouped.set(document.currency, [...(grouped.get(document.currency) || []), selector(document)]);
  return [...grouped.entries()].map(([currency, values]) => formatBillingCurrency(addDecimalAmounts(values), currency)).join(" · ") || "—";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5 text-sm text-slate-300"><span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}

export function BillingDashboard() {
  const [organizations, setOrganizations] = useState<BillingOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [data, setData] = useState<Bootstrap | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState<"customer" | "product" | null>(null);
  const [showOrganizationForm, setShowOrganizationForm] = useState(false);

  const loadOrganizations = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/billing", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunne ikke laste fakturafirmaer.");
      setOrganizations(body.organizations || []);
      const stored = window.localStorage.getItem("realtyflow:billing:organization");
      const selected = (body.organizations || []).find((item: BillingOrganization) => item.id === stored)?.id || body.organizations?.[0]?.id || "";
      setOrganizationId(selected);
      if (!selected) setLoading(false);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Kunne ikke laste fakturering."); setLoading(false); }
  };

  const loadData = async (id = organizationId) => {
    if (!id) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/billing/data?organizationId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunne ikke laste fakturadata.");
      setData(body);
      window.localStorage.setItem("realtyflow:billing:organization", id);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Kunne ikke laste fakturadata."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadOrganizations(); }, []);
  useEffect(() => { if (organizationId) void loadData(organizationId); }, [organizationId]);

  const metrics = useMemo(() => {
    const documents = data?.documents || [];
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const issued = (document: BillingDocument) => Boolean(document.locked_at) && document.status !== "replaced";
    const invoices = (document: BillingDocument) => issued(document) && document.document_type === "invoice";
    const credits = (document: BillingDocument) => issued(document) && document.document_type === "credit_note";
    const monthly = (document: BillingDocument) => document.issue_date?.startsWith(month) || false;
    const overdue = documents.filter((document) => invoices(document) && decimalToMinorUnits(document.balance) > BigInt(0) && Boolean(document.due_date && document.due_date < today));
    return {
      invoiced: amountsByCurrency(documents, (document) => document.total, (document) => monthly(document) && invoices(document)),
      credits: amountsByCurrency(documents, (document) => document.total, (document) => monthly(document) && credits(document)),
      paid: amountsByCurrency(documents, (document) => addDecimalAmounts([document.amount_paid, `-${document.amount_refunded}`]), (document) => monthly(document) && invoices(document)),
      outstanding: amountsByCurrency(documents, (document) => document.balance, (document) => invoices(document) && decimalToMinorUnits(document.balance) > BigInt(0)),
      tax: amountsByCurrency(documents, (document) => document.tax_total, (document) => monthly(document) && invoices(document)),
      overdue,
    };
  }, [data]);

  const filteredDocuments = useMemo(() => (data?.documents || []).filter((document) => {
    const haystack = `${document.document_number || ""} ${document.billing_customers?.name || ""} ${TYPE_LABELS[document.document_type]} ${STATUS_LABELS[document.status]}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }), [data, query]);

  if (loading && !data && organizations.length === 0) return <div className="flex min-h-[55vh] items-center justify-center text-slate-400"><RefreshCw className="mr-2 animate-spin" size={18} />Laster fakturering …</div>;
  if (organizations.length === 0 && !loading) return <OrganizationOnboarding onCreated={loadOrganizations} error={error} />;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-400"><ReceiptText size={16} /> Fakturering</div>
          <h1 className="text-3xl font-bold text-white">Salg fra tilbud til betaling</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Flerfirma, låste nummerserier, MVA/IVA-regler, PDF, betalinger og revisjonsspor.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="h-10 min-w-64 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.trading_name || organization.legal_name}</option>)}
          </select>
          <Button variant="outline" size="icon" onClick={() => loadData()} title="Oppdater"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></Button>
          <Button variant="outline" onClick={() => setShowOrganizationForm((current) => !current)}><Building2 size={16} className="mr-2" />Nytt firma</Button>
          <Button asChild><Link href={`/billing/documents/new?organizationId=${organizationId}`}><FilePlus2 size={16} className="mr-2" />Nytt dokument</Link></Button>
        </div>
      </header>

      {showOrganizationForm && <OrganizationOnboarding onCreated={async () => { setShowOrganizationForm(false); await loadOrganizations(); }} error="" />}

      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={16} className="mr-2 inline" />{error}</div>}
      {data?.jobs?.length ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"><Clock3 size={16} className="mr-2 inline" />{data.jobs.length} dokumentjobb(er) venter eller krever nytt forsøk. Se Innstillinger for detaljer.</div> : null}

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-900/60 p-1.5">
        {([
          ["overview", "Oversikt", Banknote], ["documents", "Dokumenter", FileText], ["customers", "Kunder", Users],
          ["products", "Produkter", Package], ["tax", "Avgiftsregler", ReceiptText], ["settings", "Innstillinger", Settings2],
        ] as const).map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === id ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}><Icon size={15} />{label}</button>)}
      </nav>

      {tab === "overview" && data && <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {([
            ["Fakturert denne måneden", metrics.invoiced, FileText, "text-cyan-300"],
            ["Betalt denne måneden", metrics.paid, CheckCircle2, "text-emerald-300"],
            ["Utestående", metrics.outstanding, Clock3, "text-amber-300"],
            ["Forfalt", String(metrics.overdue.length), AlertTriangle, "text-red-300"],
            ["Fakturert avgift", metrics.tax, ReceiptText, "text-violet-300"],
          ] as Array<[string, string, React.ElementType, string]>).map(([label, value, Icon, color]) => <Card key={label}><CardContent className="pt-5"><Icon size={18} className={color} /><p className="mt-4 text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></CardContent></Card>)}
        </section>
        {metrics.credits !== "—" && <p className="text-xs text-slate-500">Kreditnotaer denne måneden: {metrics.credits}</p>}
        <DocumentsTable documents={data.documents.slice(0, 10)} organizationId={organizationId} title="Siste dokumenter" />
      </>}

      {tab === "documents" && data && <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1"><Search className="absolute left-3 top-3 text-slate-500" size={15} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søk nummer, kunde eller status" className="pl-9" /></div>
          <div className="flex gap-2"><Button asChild variant="outline"><Link href={`/billing/documents/new?organizationId=${organizationId}&type=quote`}>Nytt tilbud</Link></Button><Button asChild><Link href={`/billing/documents/new?organizationId=${organizationId}&type=invoice`}>Ny faktura</Link></Button></div>
        </div>
        <DocumentsTable documents={filteredDocuments} organizationId={organizationId} title={`${filteredDocuments.length} dokumenter`} />
      </div>}

      {tab === "customers" && data && <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Kunder</CardTitle><CardDescription>Fakturainformasjon, land, språk, valuta og VAT-status.</CardDescription></div><Button onClick={() => setShowForm(showForm === "customer" ? null : "customer")}><Plus size={16} className="mr-2" />Ny kunde</Button></CardHeader><CardContent>
        {showForm === "customer" && <CustomerForm organization={data.organization} onSaved={() => { setShowForm(null); void loadData(); }} />}
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Kunde</th><th>Land</th><th>VAT / org.nr.</th><th>E-post</th><th>VIES</th></tr></thead><tbody>{data.customers.map((customer) => <tr key={customer.id} className="border-t border-slate-800"><td className="px-3 py-3 font-medium text-slate-100">{customer.name}<div className="text-xs font-normal text-slate-500">{customer.customer_type}</div></td><td>{customer.country_code}</td><td>{customer.vat_number || customer.organization_number || "—"}</td><td>{customer.email || "—"}</td><td><Badge variant={customer.vies_status === "valid" ? "success" : customer.vies_status === "invalid" ? "destructive" : "secondary"}>{customer.vies_status}</Badge></td></tr>)}</tbody></table></div>
      </CardContent></Card>}

      {tab === "products" && data && <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Produkter og tjenester</CardTitle><CardDescription>Gjenbrukbare fakturalinjer med pris og standard avgiftsregel.</CardDescription></div><Button onClick={() => setShowForm(showForm === "product" ? null : "product")}><Plus size={16} className="mr-2" />Nytt produkt</Button></CardHeader><CardContent>
        {showForm === "product" && <ProductForm organization={data.organization} taxRules={data.taxRules} onSaved={() => { setShowForm(null); void loadData(); }} />}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.products.map((product) => <div key={product.id} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-4"><div className="flex justify-between gap-3"><div><p className="font-medium text-white">{product.name}</p><p className="text-xs text-slate-500">{product.sku || product.supply_type} · {product.unit}</p></div><p className="font-semibold text-emerald-300">{formatBillingCurrency(product.unit_price, product.currency)}</p></div><p className="mt-3 line-clamp-2 text-sm text-slate-400">{product.description || "Ingen beskrivelse"}</p></div>)}</div>
      </CardContent></Card>}

      {tab === "tax" && data && <Card><CardHeader><CardTitle>Avgiftsmotor</CardTitle><CardDescription>Regler velges etter selgerland, kundeland, kundetype, leveransetype og VAT-kontroll. Få regnskapsfører til å godkjenne malene før produksjonsbruk.</CardDescription></CardHeader><CardContent className="space-y-3">{data.taxRules.map((rule) => <div key={rule.id} className="grid gap-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-4 md:grid-cols-[1.5fr_0.6fr_1fr_1fr]"><div><p className="font-medium text-white">{rule.name}</p><p className="mt-1 text-xs text-slate-500">{rule.reporting_code || "Ingen rapporteringskode"}</p></div><div><p className="text-xs text-slate-500">Sats</p><p className="font-mono text-lg text-emerald-300">{rule.rate}%</p></div><div><p className="text-xs text-slate-500">Område</p><p className="text-sm text-slate-300">{rule.customer_region} · {rule.customer_type}</p></div><div className="flex flex-wrap gap-2">{rule.reverse_charge && <Badge variant="warning">Reverse charge</Badge>}{rule.exempt && <Badge variant="secondary">Fritatt</Badge>}{rule.requires_vat_validation && <Badge>VIES kreves</Badge>}</div></div>)}</CardContent></Card>}

      {tab === "settings" && data && <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>{data.organization.legal_name}</CardTitle><CardDescription>Juridiske opplysninger og bankinformasjon som fryses i øyeblikksbildet ved utstedelse.</CardDescription></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2">{[["Land", data.organization.country_code], ["Org.nr.", data.organization.registration_number], ["VAT", data.organization.vat_number], ["Valuta", data.organization.default_currency], ["IBAN", data.organization.iban], ["BIC", data.organization.bic], ["Språk", data.organization.default_language], ["Betalingsfrist", `${data.organization.payment_terms_days} dager`]].map(([label, value]) => <div key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-slate-200">{value || "Ikke registrert"}</p></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Nummerserier</CardTitle><CardDescription>Nummer tildeles atomisk først når dokumentet utstedes.</CardDescription></CardHeader><CardContent className="space-y-2">{data.series.length ? data.series.map((series) => <div key={series.id} className="flex items-center justify-between rounded-lg bg-slate-900/50 p-3 text-sm"><span className="text-slate-300">{TYPE_LABELS[series.document_type]} {series.fiscal_year}</span><span className="font-mono text-emerald-300">{series.prefix}{String(series.next_number).padStart(series.padding, "0")}</span></div>) : <p className="text-sm text-slate-500">Seriene opprettes automatisk og låses ved første utstedelse.</p>}</CardContent></Card>
        {data.jobs.length > 0 && <Card className="xl:col-span-2"><CardHeader><CardTitle>Dokumentkø</CardTitle></CardHeader><CardContent className="space-y-2">{data.jobs.map((job) => <div key={job.id} className="flex items-start justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm"><div><p className="text-amber-100">{job.job_type} · {job.status}</p><p className="mt-1 text-xs text-slate-500">{job.last_error || "Venter på behandling"}</p></div><Link href={`/billing/documents/${job.document_id}`} className="text-emerald-300">Åpne</Link></div>)}</CardContent></Card>}
      </div>}
    </div>
  );
}

function DocumentsTable({ documents, title }: { documents: BillingDocument[]; organizationId: string; title: string }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Dokument</th><th>Kunde</th><th>Dato</th><th>Forfall</th><th className="text-right">Total</th><th className="text-right">Utestående</th><th>Status</th><th /></tr></thead><tbody>{documents.map((document) => <tr key={document.id} className="border-t border-slate-800 hover:bg-slate-800/30"><td className="px-3 py-3"><p className="font-medium text-slate-100">{document.document_number || "Kladd"}</p><p className="text-xs text-slate-500">{TYPE_LABELS[document.document_type]}</p></td><td className="text-slate-300">{document.billing_customers?.name || "—"}</td><td className="text-slate-400">{document.issue_date || document.created_at.slice(0, 10)}</td><td className="text-slate-400">{document.due_date || "—"}</td><td className="text-right font-mono text-slate-200">{formatBillingCurrency(document.total, document.currency)}</td><td className="text-right font-mono text-slate-300">{formatBillingCurrency(document.balance, document.currency)}</td><td><Badge variant={badgeVariant(document.status)}>{STATUS_LABELS[document.status] || document.status}</Badge></td><td><Button asChild size="icon" variant="ghost"><Link href={`/billing/documents/${document.id}`}><ArrowUpRight size={15} /></Link></Button></td></tr>)}{documents.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-slate-500">Ingen dokumenter ennå.</td></tr>}</tbody></table></CardContent></Card>;
}

function OrganizationOnboarding({ onCreated, error }: { onCreated: () => Promise<void>; error: string }) {
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState(error);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setMessage(""); const form = new FormData(event.currentTarget);
    const country = String(form.get("countryCode") || "ES");
    const body = Object.fromEntries(form.entries());
    const response = await fetch("/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, defaultLanguage: country === "ES" ? "es" : "no", paymentTermsDays: Number(body.paymentTermsDays || 14) }) });
    const result = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(result.error || "Firmaet kunne ikke opprettes.");
    await onCreated();
  };
  return <div className="mx-auto max-w-3xl py-10"><Card><CardHeader><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300"><Building2 /></div><CardTitle>Opprett første fakturafirma</CardTitle><CardDescription>Registrer kun juridiske fakturautstedere her, for eksempel Extrade Holding AS og det kommende spanske selskapet. Soleada, Zen Eco Homes, Pinoso Eco Life og Doña Anna registreres som kunder eller merkevarer – ikke som juridiske selgere.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><Field label="Kort systemnavn"><Input name="slug" placeholder="extrade-holding" required /></Field><Field label="Juridisk navn"><Input name="legalName" placeholder="Extrade Holding AS" required /></Field><Field label="Visningsnavn"><Input name="tradingName" /></Field><Field label="Land"><select name="countryCode" className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm"><option value="ES">Spania</option><option value="NO">Norge</option></select></Field><Field label="Org.nr. / CIF / NIF"><Input name="registrationNumber" /></Field><Field label="VAT-nummer"><Input name="vatNumber" /></Field><Field label="Adresse"><Input name="addressLine1" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Postnummer"><Input name="postalCode" /></Field><Field label="By"><Input name="city" /></Field></div><Field label="Standard valuta"><select name="defaultCurrency" className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm"><option>EUR</option><option>NOK</option><option>USD</option></select></Field><Field label="Betalingsfrist"><Input name="paymentTermsDays" type="number" defaultValue="14" min="0" max="365" /></Field><Field label="E-post"><Input name="email" type="email" /></Field><Field label="Telefon"><Input name="phone" /></Field><Field label="IBAN"><Input name="iban" /></Field><Field label="BIC / SWIFT"><Input name="bic" /></Field>{message && <p className="md:col-span-2 text-sm text-red-300">{message}</p>}<div className="md:col-span-2 flex justify-end"><Button type="submit" disabled={saving}>{saving ? "Oppretter …" : "Opprett fakturafirma"}</Button></div></form></CardContent></Card></div>;
}

function CustomerForm({ organization, onSaved }: { organization: BillingOrganization; onSaved: () => void }) {
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); const form = Object.fromEntries(new FormData(event.currentTarget)); const response = await fetch("/api/billing/customers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, organizationId: organization.id, paymentTermsDays: form.paymentTermsDays ? Number(form.paymentTermsDays) : null }) }); const body = await response.json(); setSaving(false); if (!response.ok) return setError(body.error || "Kunne ikke lagre kunden."); onSaved(); };
  return <form onSubmit={submit} className="mb-6 grid gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 md:grid-cols-3"><Field label="Navn"><Input name="name" required /></Field><Field label="Kundetype"><select name="customerType" className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm"><option value="business">Firma</option><option value="private">Privat</option><option value="public">Offentlig</option></select></Field><Field label="Land"><Input name="countryCode" defaultValue={organization.country_code} maxLength={2} required /></Field><Field label="VAT-nummer"><Input name="vatNumber" /></Field><Field label="Org.nr."><Input name="organizationNumber" /></Field><Field label="E-post"><Input name="email" type="email" /></Field><Field label="Adresse"><Input name="billingAddressLine1" /></Field><Field label="Postnummer"><Input name="billingPostalCode" /></Field><Field label="By"><Input name="billingCity" /></Field><Field label="Valuta"><Input name="currency" defaultValue={organization.default_currency} maxLength={3} required /></Field><Field label="Språk"><select name="language" defaultValue={organization.default_language} className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm"><option value="no">Norsk</option><option value="en">Engelsk</option><option value="es">Spansk</option></select></Field><Field label="Betalingsfrist"><Input name="paymentTermsDays" type="number" min="0" max="365" defaultValue={organization.payment_terms_days} /></Field>{error && <p className="md:col-span-3 text-sm text-red-300">{error}</p>}<div className="md:col-span-3 flex justify-end"><Button disabled={saving}>{saving ? "Lagrer …" : "Lagre kunde"}</Button></div></form>;
}

function ProductForm({ organization, taxRules, onSaved }: { organization: BillingOrganization; taxRules: BillingTaxRule[]; onSaved: () => void }) {
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); const form = Object.fromEntries(new FormData(event.currentTarget)); const response = await fetch("/api/billing/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, organizationId: organization.id }) }); const body = await response.json(); setSaving(false); if (!response.ok) return setError(body.error || "Kunne ikke lagre produktet."); onSaved(); };
  return <form onSubmit={submit} className="mb-6 grid gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 md:grid-cols-3"><Field label="Navn"><Input name="name" required /></Field><Field label="Varenummer"><Input name="sku" /></Field><Field label="Type"><select name="supplyType" className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm"><option value="service">Tjeneste</option><option value="goods">Vare</option></select></Field><Field label="Pris"><Input name="unitPrice" inputMode="decimal" required /></Field><Field label="Valuta"><Input name="currency" defaultValue={organization.default_currency} maxLength={3} required /></Field><Field label="Enhet"><Input name="unit" defaultValue="stk" required /></Field><Field label="Standard avgiftsregel"><select name="defaultTaxRuleId" className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm"><option value="">Velg regel</option>{taxRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name} ({rule.rate}%)</option>)}</select></Field><Field label="Beskrivelse"><Input name="description" /></Field>{error && <p className="md:col-span-3 text-sm text-red-300">{error}</p>}<div className="md:col-span-3 flex justify-end"><Button disabled={saving}>{saving ? "Lagrer …" : "Lagre produkt"}</Button></div></form>;
}
