"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, CircleDollarSign, Copy, CreditCard, Eye, FileCheck2, Loader2, Mail, Plus, RotateCcw, Save, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { calculateBillingTotals, formatBillingCurrency } from "@/lib/billing/money";
import { resolveBillingTaxRule, taxRuleLegalText } from "@/lib/billing/tax-engine";
import type { BillingCreditAllocation, BillingCustomer, BillingDocument, BillingDocumentLine, BillingDocumentType, BillingLineInput, BillingOrganization, BillingProduct, BillingRefundAllocation, BillingTaxRule } from "@/lib/billing/types";

type Bootstrap = { organization: BillingOrganization; customers: BillingCustomer[]; products: BillingProduct[]; taxRules: BillingTaxRule[] };
type Bundle = { document: BillingDocument; customer: BillingCustomer; organization: BillingOrganization; lines: BillingDocumentLine[]; snapshot: Record<string, any> | null; creditAllocations: BillingCreditAllocation[]; refundAllocations: BillingRefundAllocation[] };
type EditorLine = BillingLineInput & { clientId: string };
type EditorForm = {
  documentType: BillingDocumentType;
  customerId: string;
  issueDate: string;
  deliveryDate: string;
  dueDate: string;
  validUntil: string;
  currency: string;
  accountingCurrency: string;
  exchangeRate: string;
  customerReference: string;
  projectReference: string;
  orderReference: string;
  contractReference: string;
  paymentTerms: string;
  notes: string;
  originalDocumentId: string;
  rectificationReason: string;
};

const TYPE_LABELS: Record<BillingDocumentType, string> = { quote: "Tilbud", proforma: "Proforma", invoice: "Faktura", credit_note: "Kreditnota" };
const STATUS_LABELS: Record<string, string> = { draft: "Kladd", ready: "Klar", issued: "Utstedt", sent: "Sendt", opened: "Åpnet", partially_paid: "Delvis betalt", paid: "Betalt", overdue: "Forfalt", partially_credited: "Delvis kreditert", fully_credited: "Fullt kreditert", credited: "Kreditert", replaced: "Erstattet" };

function today() { return new Date().toISOString().slice(0, 10); }
function addDays(value: string, days: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function emptyForm(type: BillingDocumentType = "invoice"): EditorForm { const date = today(); return { documentType: type, customerId: "", issueDate: date, deliveryDate: date, dueDate: addDays(date, 14), validUntil: addDays(date, 30), currency: "EUR", accountingCurrency: "EUR", exchangeRate: "1", customerReference: "", projectReference: "", orderReference: "", contractReference: "", paymentTerms: "", notes: "", originalDocumentId: "", rectificationReason: "" }; }

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`space-y-1.5 text-sm text-slate-300 ${className}`}><span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>{children}</label>; }
const selectClass = "h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none";
const textareaClass = "min-h-24 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none";

export function BillingDocumentEditor({ initialDocumentId = null }: { initialDocumentId?: string | null }) {
  const router = useRouter(); const searchParams = useSearchParams();
  const [documentId, setDocumentId] = useState<string | null>(initialDocumentId);
  const [organizations, setOrganizations] = useState<BillingOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState(searchParams.get("organizationId") || "");
  const [data, setData] = useState<Bootstrap | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const requestedType = searchParams.get("type") as BillingDocumentType | null;
  const [form, setForm] = useState<EditorForm>(() => emptyForm(requestedType && TYPE_LABELS[requestedType] ? requestedType : "invoice"));
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [acting, setActing] = useState(false);
  const [dirty, setDirty] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [payment, setPayment] = useState({ amount: "", paymentDate: today(), method: "bank_transfer", reference: "" });
  const [refund, setRefund] = useState({ amount: "", refundDate: today(), method: "bank_transfer", reference: "" });
  const saveRef = useRef<(silent?: boolean) => Promise<string | null>>(async () => null);

  const locked = Boolean(bundle?.document.locked_at);
  const totalsResult = useMemo(() => { try { return { totals: calculateBillingTotals(lines), error: "" }; } catch (calculationError) { return { totals: null, error: calculationError instanceof Error ? calculationError.message : "Ugyldig beløp" }; } }, [lines]);

  const suggestedRule = (customerId: string, productId?: string | null, source = data) => {
    if (!source) return null;
    const customer = source.customers.find((item) => item.id === customerId); if (!customer) return null;
    const product = source.products.find((item) => item.id === productId);
    if (product?.default_tax_rule_id) {
      const preferred = source.taxRules.find((item) => item.id === product.default_tax_rule_id);
      if (preferred && resolveBillingTaxRule({ sellerCountry: source.organization.country_code, customer, supplyType: product.supply_type, rules: [preferred] })) return preferred;
    }
    return resolveBillingTaxRule({ sellerCountry: source.organization.country_code, customer, supplyType: product?.supply_type || "service", rules: source.taxRules });
  };

  const lineFromRule = (line: EditorLine, rule: BillingTaxRule | null, customer?: BillingCustomer): EditorLine => ({ ...line, taxRuleId: rule?.id || null, taxRate: String(rule?.rate || "0"), taxLabel: rule?.name || null, legalText: rule && customer ? taxRuleLegalText(rule, customer.language) : null });
  const makeLine = (source = data, customerId = form.customerId): EditorLine => { const customer = source?.customers.find((item) => item.id === customerId); const rule = suggestedRule(customerId, null, source); return lineFromRule({ clientId: crypto.randomUUID(), description: "", quantity: "1", unit: "stk", unitPrice: "0", discountPercent: "0", taxRate: "0" }, rule, customer); };

  const load = async () => {
    setLoading(true); setError("");
    try {
      const orgResponse = await fetch("/api/billing", { cache: "no-store" }); const orgBody = await orgResponse.json(); if (!orgResponse.ok) throw new Error(orgBody.error);
      setOrganizations(orgBody.organizations || []);
      let existing: Bundle | null = null; let targetOrg = organizationId;
      if (initialDocumentId) { const docResponse = await fetch(`/api/billing/documents/${initialDocumentId}`, { cache: "no-store" }); const docBody = await docResponse.json(); if (!docResponse.ok) throw new Error(docBody.error); existing = docBody; targetOrg = docBody.document.organization_id; setOrganizationId(targetOrg); }
      if (!targetOrg) targetOrg = orgBody.organizations?.[0]?.id || "";
      if (!targetOrg) throw new Error("Opprett et fakturafirma før du lager dokumenter.");
      const dataResponse = await fetch(`/api/billing/data?organizationId=${targetOrg}`, { cache: "no-store" }); const dataBody = await dataResponse.json(); if (!dataResponse.ok) throw new Error(dataBody.error);
      setData(dataBody); setOrganizationId(targetOrg);
      if (existing) {
        setBundle(existing); const document = existing.document;
        setForm({ documentType: document.document_type, customerId: document.customer_id, issueDate: document.issue_date || today(), deliveryDate: document.delivery_date || "", dueDate: document.due_date || "", validUntil: document.valid_until || "", currency: document.currency, accountingCurrency: document.accounting_currency, exchangeRate: String(document.exchange_rate || "1"), customerReference: document.customer_reference || "", projectReference: document.project_reference || "", orderReference: document.order_reference || "", contractReference: document.contract_reference || "", paymentTerms: document.payment_terms || "", notes: document.notes || "", originalDocumentId: document.original_document_id || "", rectificationReason: document.rectification_reason || "" });
        setLines(existing.lines.map((line) => ({ clientId: line.id, productId: line.product_id, description: line.description, quantity: String(line.quantity), unit: line.unit, unitPrice: String(line.unit_price), discountPercent: String(line.discount_percent), taxRuleId: line.tax_rule_id, taxRate: String(line.tax_rate), taxLabel: line.tax_label, legalText: line.legal_text })));
        setPayment((current) => ({ ...current, amount: String(document.balance), paymentDate: today() }));
        setRefund((current) => ({ ...current, amount: String(document.refund_due || "0"), refundDate: today() }));
      } else {
        const selectedCustomer = dataBody.customers?.[0]; const type = form.documentType; const date = today();
        const nextForm = { ...emptyForm(type), customerId: selectedCustomer?.id || "", currency: selectedCustomer?.currency || dataBody.organization.default_currency, accountingCurrency: dataBody.organization.default_currency, dueDate: addDays(date, selectedCustomer?.payment_terms_days ?? dataBody.organization.payment_terms_days), validUntil: addDays(date, dataBody.settings?.quote_validity_days || 30) };
        setForm(nextForm); setLines([makeLine(dataBody, nextForm.customerId)]);
      }
      setDirty(false);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Dokumentet kunne ikke lastes."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [initialDocumentId]);

  const updateForm = (patch: Partial<EditorForm>) => { setForm((current) => ({ ...current, ...patch })); setDirty(true); setMessage(""); };
  const updateLine = (index: number, patch: Partial<BillingLineInput>) => {
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line; let next = { ...line, ...patch };
      const customer = data?.customers.find((item) => item.id === form.customerId);
      if ("productId" in patch) { const product = data?.products.find((item) => item.id === patch.productId); if (product) { const rule = suggestedRule(form.customerId, product.id); next = lineFromRule({ ...next, productId: product.id, description: product.description || product.name, unit: product.unit, unitPrice: String(product.unit_price) }, rule, customer); } }
      if ("taxRuleId" in patch) { const rule = data?.taxRules.find((item) => item.id === patch.taxRuleId) || null; next = lineFromRule(next, rule, customer); }
      return next;
    })); setDirty(true); setMessage("");
  };
  const changeCustomer = (customerId: string) => { const customer = data?.customers.find((item) => item.id === customerId); updateForm({ customerId, currency: customer?.currency || form.currency, dueDate: addDays(form.issueDate || today(), customer?.payment_terms_days ?? data?.organization.payment_terms_days ?? 14) }); setLines((current) => current.map((line) => lineFromRule(line, suggestedRule(customerId, line.productId), customer))); };

  const persistDraft = async (silent = false) => {
    if (locked) return documentId; if (!form.customerId || lines.length === 0 || lines.some((line) => !line.description.trim())) { if (!silent) setError("Velg kunde og fyll ut alle fakturalinjer."); return null; }
    setSaving(true); if (!silent) { setError(""); setMessage(""); }
    try {
      const response = await fetch("/api/billing/documents", { method: documentId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, documentId, documentType: form.documentType, customerId: form.customerId, payload: { originalDocumentId: form.originalDocumentId, issueDate: form.issueDate, deliveryDate: form.deliveryDate, dueDate: form.dueDate, validUntil: form.validUntil, currency: form.currency, accountingCurrency: form.accountingCurrency, exchangeRate: form.exchangeRate, exchangeRateDate: form.currency === form.accountingCurrency ? "" : form.issueDate, exchangeRateSource: form.currency === form.accountingCurrency ? "" : "Manuell kurs", customerReference: form.customerReference, projectReference: form.projectReference, orderReference: form.orderReference, contractReference: form.contractReference, paymentTerms: form.paymentTerms, notes: form.notes, rectificationReason: form.rectificationReason }, lines }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Dokumentet kunne ikke lagres.");
      const savedId = body.documentId as string; setDirty(false); setMessage(silent ? `Automatisk lagret ${new Date().toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}` : "Kladden er lagret.");
      if (!documentId) { setDocumentId(savedId); router.replace(`/billing/documents/${savedId}`); }
      return savedId;
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Dokumentet kunne ikke lagres."); return null; }
    finally { setSaving(false); }
  };
  saveRef.current = persistDraft;
  useEffect(() => { if (!dirty || loading || locked || saving || !form.customerId || !lines.length) return; const timer = window.setTimeout(() => { void saveRef.current(true); }, 1400); return () => window.clearTimeout(timer); }, [dirty, form, lines, loading, locked, saving]);

  const runAction = async (body: Record<string, unknown>, success: string) => {
    let id = documentId; if (!locked && body.action !== "payment" && body.action !== "refund" && body.action !== "send") id = await persistDraft(); if (!id) return null;
    setActing(true); setError(""); setMessage("");
    try { const response = await fetch(`/api/billing/documents/${id}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Handlingen mislyktes."); setMessage(result.pdfWarning ? `${success} PDF-kø: ${result.pdfWarning}` : success); if (result.documentId) { router.push(`/billing/documents/${result.documentId}`); return result.documentId as string; } await reloadBundle(id); return id; } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Handlingen mislyktes."); return null; } finally { setActing(false); }
  };
  const reloadBundle = async (id = documentId) => { if (!id) return; const response = await fetch(`/api/billing/documents/${id}`, { cache: "no-store" }); if (response.ok) { const next = await response.json(); setBundle(next); setPayment((current) => ({ ...current, amount: String(next.document.balance) })); setRefund((current) => ({ ...current, amount: String(next.document.refund_due || "0") })); } };

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center text-slate-400"><Loader2 size={18} className="mr-2 animate-spin" />Laster dokument …</div>;
  if (error && !data) return <div className="mx-auto max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-200"><AlertTriangle className="mr-2 inline" size={18} />{error}<div className="mt-4"><Button asChild variant="outline"><Link href="/billing">Tilbake</Link></Button></div></div>;
  if (!data) return null;

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-start gap-3"><Button asChild size="icon" variant="ghost"><Link href="/billing" aria-label="Tilbake til fakturaoversikten"><ArrowLeft /></Link></Button><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold text-white">{bundle?.document.document_number || `Ny ${TYPE_LABELS[form.documentType].toLowerCase()}`}</h1><Badge variant={locked ? "default" : "secondary"}>{STATUS_LABELS[bundle?.document.status || "draft"]}</Badge>{locked && <Badge variant="success"><FileCheck2 size={12} className="mr-1" />Låst</Badge>}</div><p className="mt-1 text-sm text-slate-400">{data.organization.trading_name || data.organization.legal_name} · {saving ? "Lagrer …" : message || (dirty ? "Ulagrede endringer" : "Oppdatert")}</p></div></div>
      <div className="flex flex-wrap gap-2">{documentId && <Button asChild variant="outline"><a href={`/api/billing/documents/${documentId}/pdf`} target="_blank" rel="noreferrer"><Eye size={16} className="mr-2" />Forhåndsvis PDF</a></Button>}{!locked && <Button variant="outline" onClick={() => persistDraft()} disabled={saving || acting}><Save size={16} className="mr-2" />Lagre</Button>}{!locked && <Button onClick={() => { if (window.confirm("Utstede og låse dokumentet? Innholdet kan ikke redigeres etterpå.")) void runAction({ action: "issue", issueDate: form.issueDate }, "Dokumentet er utstedt og låst."); }} disabled={saving || acting}><Send size={16} className="mr-2" />Utsted</Button>}{locked && <Button onClick={() => { if (window.confirm(`Sende PDF til ${bundle?.customer.email || "kundens e-post"}?`)) void runAction({ action: "send" }, "Dokumentet er sendt."); }} disabled={acting || !bundle?.customer.email}><Mail size={16} className="mr-2" />Send e-post</Button>}</div>
    </header>
    {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={16} className="mr-2 inline" />{error}</div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5"><Card><CardHeader><CardTitle>Dokumentinformasjon</CardTitle><CardDescription>Selger, kunde, datoer, valuta og referanser.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Fakturerende firma"><select className={selectClass} value={organizationId} disabled={Boolean(documentId)} onChange={(event) => window.location.assign(`/billing/documents/new?organizationId=${event.target.value}&type=${form.documentType}`)}>{organizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.trading_name || organization.legal_name}</option>)}</select></Field>
        <Field label="Dokumenttype"><select className={selectClass} value={form.documentType} disabled={locked || form.documentType === "credit_note"} onChange={(event) => updateForm({ documentType: event.target.value as BillingDocumentType })}>{Object.entries(TYPE_LABELS).filter(([type]) => type !== "credit_note").map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></Field>
        <Field label="Kunde"><select className={selectClass} value={form.customerId} disabled={locked} onChange={(event) => changeCustomer(event.target.value)}><option value="">Velg kunde</option>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.country_code}</option>)}</select>{data.customers.length === 0 && <span className="text-xs text-amber-300">Opprett kunden fra fakturaoversikten først.</span>}</Field>
        <Field label={form.documentType === "quote" ? "Tilbudsdato" : "Fakturadato"}><Input type="date" value={form.issueDate} disabled={locked} onChange={(event) => updateForm({ issueDate: event.target.value })} /></Field>
        <Field label="Leveringsdato"><Input type="date" value={form.deliveryDate} disabled={locked} onChange={(event) => updateForm({ deliveryDate: event.target.value })} /></Field>
        <Field label={form.documentType === "quote" ? "Gyldig til" : "Forfallsdato"}><Input type="date" value={form.documentType === "quote" ? form.validUntil : form.dueDate} disabled={locked} onChange={(event) => updateForm(form.documentType === "quote" ? { validUntil: event.target.value } : { dueDate: event.target.value })} /></Field>
        <Field label="Fakturavaluta"><Input value={form.currency} maxLength={3} disabled={locked} onChange={(event) => updateForm({ currency: event.target.value.toUpperCase() })} /></Field>
        <Field label="Regnskapsvaluta"><Input value={form.accountingCurrency} maxLength={3} disabled={locked} onChange={(event) => updateForm({ accountingCurrency: event.target.value.toUpperCase() })} /></Field>
        <Field label="Valutakurs"><Input value={form.exchangeRate} inputMode="decimal" disabled={locked || form.currency === form.accountingCurrency} onChange={(event) => updateForm({ exchangeRate: event.target.value })} /></Field>
        <Field label="Kundereferanse"><Input value={form.customerReference} disabled={locked} onChange={(event) => updateForm({ customerReference: event.target.value })} /></Field>
        <Field label="Prosjekt / eiendom"><Input value={form.projectReference} disabled={locked} onChange={(event) => updateForm({ projectReference: event.target.value })} /></Field>
        <Field label="Ordre / kontrakt"><Input value={form.orderReference} disabled={locked} onChange={(event) => updateForm({ orderReference: event.target.value })} /></Field>
        {form.documentType === "credit_note" && <Field label="Korrigeringsårsak" className="md:col-span-2 xl:col-span-3"><textarea className={textareaClass} value={form.rectificationReason} disabled={locked} onChange={(event) => updateForm({ rectificationReason: event.target.value })} /></Field>}
      </CardContent></Card>

      <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Fakturalinjer</CardTitle><CardDescription>Alle beregninger gjentas autoritativt med Postgres numeric ved lagring.</CardDescription></div>{!locked && <Button variant="outline" size="sm" onClick={() => { setLines((current) => [...current, makeLine()]); setDirty(true); }}><Plus size={15} className="mr-1" />Linje</Button>}</CardHeader><CardContent className="space-y-3">{lines.map((line, index) => <div key={line.clientId} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4"><div className="grid gap-3 lg:grid-cols-[1.2fr_2fr_0.55fr_0.75fr_0.6fr_1.1fr_44px]">
        <Field label="Produkt"><select className={selectClass} value={line.productId || ""} disabled={locked} onChange={(event) => updateLine(index, { productId: event.target.value || null })}><option value="">Egen linje</option>{data.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
        <Field label="Beskrivelse"><Input value={line.description} disabled={locked} onChange={(event) => updateLine(index, { description: event.target.value })} /></Field>
        <Field label="Antall"><Input value={line.quantity} inputMode="decimal" disabled={locked} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></Field>
        <Field label="Enhetspris"><Input value={line.unitPrice} inputMode="decimal" disabled={locked} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} /></Field>
        <Field label="Rabatt %"><Input value={line.discountPercent} inputMode="decimal" disabled={locked} onChange={(event) => updateLine(index, { discountPercent: event.target.value })} /></Field>
        <Field label="Avgiftsregel"><select className={selectClass} value={line.taxRuleId || ""} disabled={locked} onChange={(event) => updateLine(index, { taxRuleId: event.target.value || null })}><option value="">Velg regel</option>{data.taxRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name} ({rule.rate}%)</option>)}</select></Field>
        <div className="flex items-end">{!locked && <Button variant="ghost" size="icon" aria-label={`Fjern linje ${index + 1}`} disabled={lines.length === 1} onClick={() => { setLines((current) => current.filter((_, itemIndex) => itemIndex !== index)); setDirty(true); }}><Trash2 size={16} /></Button>}</div>
      </div>{line.legalText && <p className="mt-3 text-xs text-amber-200/80">{line.legalText}</p>}<div className="mt-3 text-right font-mono text-sm text-slate-300">{totalsResult.totals ? formatBillingCurrency(totalsResult.totals.lines[index]?.total || "0", form.currency) : "—"}</div></div>)}{totalsResult.error && <p className="text-sm text-red-300">{totalsResult.error}</p>}</CardContent></Card>

      <Card><CardHeader><CardTitle>Vilkår og merknader</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field label="Betalingsvilkår"><textarea className={textareaClass} value={form.paymentTerms} disabled={locked} onChange={(event) => updateForm({ paymentTerms: event.target.value })} /></Field><Field label="Merknad på dokumentet"><textarea className={textareaClass} value={form.notes} disabled={locked} onChange={(event) => updateForm({ notes: event.target.value })} /></Field></CardContent></Card></div>

      <aside className="space-y-5"><Card className="sticky top-6"><CardHeader><CardTitle>Summer</CardTitle><CardDescription>{form.currency}{form.currency !== form.accountingCurrency ? ` · regnskap i ${form.accountingCurrency}` : ""}</CardDescription></CardHeader><CardContent className="space-y-3">{[["Før rabatt", totalsResult.totals?.subtotal], ["Rabatt", totalsResult.totals?.discountTotal], ["Netto", totalsResult.totals?.netTotal], ["Avgift", totalsResult.totals?.taxTotal]].map(([label, amount]) => <div key={label} className="flex justify-between text-sm"><span className="text-slate-400">{label}</span><span className="font-mono text-slate-200">{formatBillingCurrency(amount || "0", form.currency)}</span></div>)}<div className="flex justify-between border-t border-slate-700 pt-4 text-lg font-semibold"><span className="text-white">Total</span><span className="font-mono text-emerald-300">{formatBillingCurrency(totalsResult.totals?.total || bundle?.document.total || "0", form.currency)}</span></div>{locked && bundle?.document.document_type === "invoice" && <div className="space-y-2 border-t border-slate-800 pt-3">{[["Betalt", bundle.document.amount_paid], ["Kreditert", bundle.document.amount_credited], ["Refundert", bundle.document.amount_refunded], ["Utestående", bundle.document.balance], ["Til refusjon", bundle.document.refund_due]].map(([label, amount]) => <div key={label} className="flex justify-between text-xs"><span className="text-slate-500">{label}</span><span className="font-mono text-slate-300">{formatBillingCurrency(amount || "0", bundle.document.currency)}</span></div>)}</div>}{bundle?.document.snapshot_hash && <div className="border-t border-slate-800 pt-3"><p className="text-xs text-slate-500">Låst SHA-256</p><p className="mt-1 break-all font-mono text-[10px] text-slate-600">{bundle.document.snapshot_hash}</p></div>}</CardContent></Card>

      {locked && bundle?.document.document_type === "invoice" && Number(bundle.document.balance) > 0 && <Card><CardHeader><CardTitle>Betaling</CardTitle><CardDescription>Utestående: {formatBillingCurrency(bundle.document.balance, bundle.document.currency)}</CardDescription></CardHeader><CardContent className="space-y-3"><Field label="Beløp"><Input value={payment.amount} inputMode="decimal" onChange={(event) => setPayment({ ...payment, amount: event.target.value })} /></Field><Field label="Betalingsdato"><Input type="date" value={payment.paymentDate} onChange={(event) => setPayment({ ...payment, paymentDate: event.target.value })} /></Field><Field label="Metode"><select className={selectClass} value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })}><option value="bank_transfer">Bankoverføring</option><option value="card">Kort</option><option value="cash">Kontant</option><option value="other">Annet</option></select></Field><Field label="Referanse"><Input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} /></Field><Button className="w-full" variant="secondary" disabled={acting || Number(bundle.document.balance) <= 0} onClick={() => runAction({ action: "payment", payment: { amount: payment.amount, paymentDate: payment.paymentDate, currency: bundle.document.currency, method: payment.method, reference: payment.reference, notes: "" } }, "Betalingen er registrert.")}><CircleDollarSign size={16} className="mr-2" />Registrer betaling</Button></CardContent></Card>}

      {locked && bundle?.document.document_type === "invoice" && Number(bundle.document.refund_due) > 0 && <Card><CardHeader><CardTitle>Refusjon</CardTitle><CardDescription>Kan refunderes: {formatBillingCurrency(bundle.document.refund_due, bundle.document.currency)}</CardDescription></CardHeader><CardContent className="space-y-3"><Field label="Beløp"><Input value={refund.amount} inputMode="decimal" onChange={(event) => setRefund({ ...refund, amount: event.target.value })} /></Field><Field label="Refusjonsdato"><Input type="date" value={refund.refundDate} onChange={(event) => setRefund({ ...refund, refundDate: event.target.value })} /></Field><Field label="Metode"><select className={selectClass} value={refund.method} onChange={(event) => setRefund({ ...refund, method: event.target.value })}><option value="bank_transfer">Bankoverføring</option><option value="card">Kort</option><option value="cash">Kontant</option><option value="other">Annet</option></select></Field><Field label="Referanse"><Input value={refund.reference} onChange={(event) => setRefund({ ...refund, reference: event.target.value })} /></Field><Button className="w-full" variant="secondary" disabled={acting || Number(refund.amount) <= 0} onClick={() => { if (window.confirm(`Registrere refusjon på ${formatBillingCurrency(refund.amount || "0", bundle.document.currency)}?`)) void runAction({ action: "refund", refund: { amount: refund.amount, refundDate: refund.refundDate, currency: bundle.document.currency, method: refund.method, reference: refund.reference, notes: "" } }, "Refusjonen er registrert."); }}><RotateCcw size={16} className="mr-2" />Registrer refusjon</Button></CardContent></Card>}

      {locked && bundle?.document.document_type === "invoice" && (bundle.creditAllocations.length > 0 || bundle.refundAllocations.length > 0) && <Card><CardHeader><CardTitle>Oppgjørshistorikk</CardTitle><CardDescription>Uforanderlige krediteringer og refusjoner.</CardDescription></CardHeader><CardContent className="space-y-2 text-sm">{bundle.creditAllocations.map((allocation) => <div key={allocation.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-900/50 p-3"><div><p className="text-slate-200">Kreditert</p><Link className="text-xs text-emerald-300 hover:underline" href={`/billing/documents/${allocation.credit_note_id}`}>{allocation.credit_note?.document_number || "Kreditnota"}</Link></div><span className="font-mono text-slate-300">{formatBillingCurrency(allocation.amount, bundle.document.currency)}</span></div>)}{bundle.refundAllocations.map((allocation) => <div key={allocation.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-900/50 p-3"><div><p className="text-slate-200">Refundert {allocation.billing_refunds?.refund_date || ""}</p><p className="text-xs text-slate-500">{allocation.billing_refunds?.reference || allocation.refund_id}</p></div><span className="font-mono text-slate-300">{formatBillingCurrency(allocation.amount, bundle.document.currency)}</span></div>)}</CardContent></Card>}

      {locked && <Card><CardHeader><CardTitle>Videre handlinger</CardTitle></CardHeader><CardContent className="space-y-2">{bundle?.document.document_type === "quote" && <Button className="w-full" variant="outline" onClick={() => runAction({ action: "convert_to_invoice" }, "Fakturakladd er opprettet.")}><Copy size={16} className="mr-2" />Konverter til faktura</Button>}{bundle?.document.document_type === "invoice" && Number(bundle.document.amount_credited) < Number(bundle.document.total) && <Button className="w-full" variant="outline" onClick={() => { const reason = window.prompt("Hvorfor skal fakturaen korrigeres?"); if (reason) void runAction({ action: "create_credit_note", reason }, "Kreditnotakladd er opprettet. Tilpass linjene før utstedelse ved delkreditering."); }}><CreditCard size={16} className="mr-2" />Opprett kreditnota</Button>}<p className="pt-2 text-xs leading-relaxed text-slate-500"><Check size={12} className="mr-1 inline text-emerald-400" />Utstedte dokumenter slettes eller redigeres aldri. Korrigering skjer med nytt dokument.</p></CardContent></Card>}
      </aside>
    </div>
  </div>;
}
