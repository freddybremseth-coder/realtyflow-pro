"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardList,
  Coins,
  Factory,
  FileText,
  Landmark,
  Loader2,
  Package,
  PackageCheck,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  DonaAnnaOrder,
  DonaAnnaOrderLine,
  DonaAnnaProduct,
  DonaAnnaSnapshot,
} from "@/lib/dona-anna/types";

type Tab = "overview" | "products" | "inventory" | "orders" | "pos" | "partners" | "quality" | "companies";
type CommandName =
  | "upsert_product"
  | "upsert_price_list"
  | "set_price"
  | "upsert_party"
  | "upsert_warehouse"
  | "upsert_lot"
  | "adjust_inventory"
  | "create_order"
  | "order_action"
  | "fulfill_order"
  | "pos_action"
  | "upsert_commission_rule"
  | "create_return"
  | "create_recall"
  | "record_landed_cost"
  | "link_organization"
  | "create_invoice";

type DraftOrderLine = {
  clientId: string;
  productId: string;
  lotId: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  unitCost: string;
  discountPercent: string;
  taxRate: string;
};

const selectClass = "h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-emerald-500";
const textareaClass = "min-h-24 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500";

function numberValue(value: string | number | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: string | number | null | undefined, currency = "EUR") {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency, maximumFractionDigits: 2 }).format(numberValue(value));
}

function quantity(value: string | number | null | undefined) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 3 }).format(numberValue(value));
}

function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("nb-NO");
}

function fieldValue(form: FormData, name: string) {
  return String(form.get(name) || "").trim();
}

function nullable(value: string) {
  return value || null;
}

function makeLine(product?: DonaAnnaProduct): DraftOrderLine {
  return {
    clientId: crypto.randomUUID(),
    productId: product?.id || "",
    lotId: "",
    quantity: "1",
    unit: product?.unit || "stk",
    unitPrice: String(product?.unit_price ?? "0"),
    unitCost: "0",
    discountPercent: "0",
    taxRate: "0",
  };
}

export function DonaAnnaDashboard() {
  const [data, setData] = useState<DonaAnnaSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dona-anna", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Doña Anna kunne ikke lastes.");
      setData(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Doña Anna kunne ikke lastes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runCommand = useCallback(async (command: CommandName, payload: Record<string, unknown>, success: string) => {
    setBusy(command);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/dona-anna/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command, payload }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Handlingen mislyktes.");
      setMessage(success);
      await load();
      return body.result as Record<string, unknown> | null;
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : "Handlingen mislyktes.");
      return null;
    } finally {
      setBusy("");
    }
  }, [load]);

  if (loading && !data) {
    return <div className="flex min-h-[60vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" size={18} />Laster Doña Anna …</div>;
  }
  if (!data) {
    return <Card className="mx-auto max-w-2xl"><CardHeader><CardTitle>Doña Anna er ikke tilgjengelig</CardTitle><CardDescription>{error || "Datamodulen er ikke migrert ennå."}</CardDescription></CardHeader><CardContent><Button onClick={() => load()}><RefreshCw className="mr-2" size={16} />Prøv igjen</Button></CardContent></Card>;
  }

  const tabs: Array<[Tab, string, React.ElementType]> = [
    ["overview", "Oversikt", Store], ["products", "Produkter & priser", Package],
    ["inventory", "Lager & batch", Warehouse], ["orders", "Ordre", ClipboardList],
    ["pos", "POS & kasse", ReceiptText], ["partners", "Partnere & provisjon", Users],
    ["quality", "Retur & recall", ShieldAlert], ["companies", "Selskaper", Building2],
  ];

  return <div className="mx-auto max-w-[1600px] space-y-5">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold text-white">Doña Anna</h1>
          <Badge variant={data.workspace.status === "active" ? "success" : "secondary"}>{data.workspace.status === "planning" ? "Planlegging" : data.workspace.status}</Badge>
          <Badge variant="outline">Samme Supabase</Badge>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">Handel, innkjøp, fysisk lager, batch-/matsporing, POS, landed cost, intercompany, forhandlere, provisjon, retur og tilbakekalling.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => load()} disabled={loading}><RefreshCw size={16} className={`mr-2 ${loading ? "animate-spin" : ""}`} />Oppdater</Button>
        <Button asChild variant="secondary"><Link href="/billing"><FileText size={16} className="mr-2" />Fakturering</Link></Button>
      </div>
    </header>

    {message && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100"><CheckCircle2 className="mr-2 inline" size={16} />{message}</div>}
    {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100"><AlertTriangle className="mr-2 inline" size={16} />{error}</div>}

    <nav aria-label="Doña Anna-moduler" className="flex gap-1 overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-900/60 p-1.5">
      {tabs.map(([id, label, Icon]) => <button type="button" key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === id ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}><Icon size={15} />{label}</button>)}
    </nav>

    {tab === "overview" && <Overview data={data} />}
    {tab === "products" && <Products data={data} busy={busy} runCommand={runCommand} />}
    {tab === "inventory" && <Inventory data={data} busy={busy} runCommand={runCommand} />}
    {tab === "orders" && <div className="space-y-5"><Orders data={data} busy={busy} runCommand={runCommand} /><FulfillmentPanel data={data} busy={busy} runCommand={runCommand} /></div>}
    {tab === "pos" && <Pos data={data} busy={busy} runCommand={runCommand} />}
    {tab === "partners" && <Partners data={data} busy={busy} runCommand={runCommand} />}
    {tab === "quality" && <Quality data={data} busy={busy} runCommand={runCommand} />}
    {tab === "companies" && <Companies data={data} busy={busy} runCommand={runCommand} />}
  </div>;
}

function Overview({ data }: { data: DonaAnnaSnapshot }) {
  const cards = [
    ["Produkter", data.metrics.productCount, Package, "text-emerald-300"],
    ["Varehus", data.metrics.warehouseCount, Warehouse, "text-cyan-300"],
    ["Batcher", data.metrics.lotCount, ScanLine, "text-violet-300"],
    ["På lager", quantity(data.metrics.onHand), Boxes, "text-amber-300"],
    ["Reservert", quantity(data.metrics.reserved), PackageCheck, "text-blue-300"],
    ["Åpne ordre", data.metrics.openOrders, ShoppingCart, "text-orange-300"],
    ["Åpne recalls", data.metrics.openRecalls, ShieldAlert, "text-red-300"],
    ["Lagerverdi", money(data.metrics.inventoryValue), Coins, "text-emerald-300"],
  ] as const;
  const ready = data.brandOrganizationLinks.length > 0;
  return <div className="space-y-5">
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, Icon, color]) => <Card key={label}><CardContent className="pt-5"><Icon size={18} className={color} /><p className="mt-4 text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-white">{value}</p></CardContent></Card>)}</section>
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2"><CardHeader><CardTitle>Oppstartsstatus</CardTitle><CardDescription>Lager og produksjon starter på 0. Appen er klar for masterdata mens selskapsarbeidet pågår.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <Readiness ok={data.products.length > 0} label="Produkter og priser" detail={data.products.length ? `${data.products.length} aktive produkter` : "Opprett første produkt"} />
        <Readiness ok={data.warehouses.length > 0} label="Varehus" detail={data.warehouses.length ? `${data.warehouses.length} planlagte/aktive` : "Opprett Spania/Norge-lager"} />
        <Readiness ok={ready} label="Juridisk selger" detail={ready ? `${data.brandOrganizationLinks.length} kobling(er)` : "Venter på selskapsopplysninger"} />
        <Readiness ok={numberValue(data.metrics.onHand) === 0} label="Åpningsbalanse" detail={`${quantity(data.metrics.onHand)} registrert`} />
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Kontrollprinsipp</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-slate-400">
        <p><strong className="text-slate-200">Donaanna.com</strong> oppretter ordre via server-API.</p>
        <p><strong className="text-slate-200">Olivia OS</strong> registrerer produksjon, batch og lagerbevegelser.</p>
        <p><strong className="text-slate-200">RealtyFlow</strong> kontrollerer ordre, kostnad, provisjon og faktura.</p>
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Siste ordre</CardTitle></CardHeader><CardContent><OrderTable data={data} compact /></CardContent></Card>
  </div>;
}

function Readiness({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return <div className="flex items-start gap-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-4">{ok ? <CheckCircle2 className="mt-0.5 text-emerald-400" size={18} /> : <AlertTriangle className="mt-0.5 text-amber-400" size={18} />}<div><p className="font-medium text-white">{label}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div></div>;
}

type Runner = (command: CommandName, payload: Record<string, unknown>, success: string) => Promise<Record<string, unknown> | null>;

function Products({ data, busy, runCommand }: { data: DonaAnnaSnapshot; busy: string; runCommand: Runner }) {
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = await runCommand("upsert_product", {
      sku: fieldValue(form, "sku"), name: fieldValue(form, "name"), description: fieldValue(form, "description"),
      productType: fieldValue(form, "productType"), unit: fieldValue(form, "unit"),
      ownerOrganizationId: nullable(fieldValue(form, "ownerOrganizationId")),
      trackLots: form.get("trackLots") === "on", shelfLifeDays: nullable(fieldValue(form, "shelfLifeDays")),
      barcode: nullable(fieldValue(form, "barcode")), priceListId: fieldValue(form, "priceListId"), unitPrice: fieldValue(form, "unitPrice"),
    }, "Produkt og pris er lagret.");
    if (result) event.currentTarget.reset();
  };
  const setPrice = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = await runCommand("set_price", {
      productId: fieldValue(form, "productId"), priceListId: fieldValue(form, "priceListId"),
      unitPrice: fieldValue(form, "unitPrice"), minimumQuantity: fieldValue(form, "minimumQuantity") || "1",
    }, "Prisen er lagret i prislisten.");
    if (result) event.currentTarget.reset();
  };
  return <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
    <div className="space-y-4"><Card><CardHeader><CardTitle>Nytt produkt</CardTitle><CardDescription>Produktidentitet og salgspris lagres separat fra fysisk lager.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3"><Field label="SKU"><Input name="sku" required /></Field><Field label="Enhet"><Input name="unit" defaultValue="flaske" required /></Field></div>
      <Field label="Navn"><Input name="name" required /></Field><Field label="Beskrivelse"><textarea name="description" className={textareaClass} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Type"><select name="productType" className={selectClass}><option value="goods">Vare</option><option value="packaging">Emballasje</option><option value="service">Tjeneste</option></select></Field><Field label="Holdbarhet dager"><Input name="shelfLifeDays" type="number" min="1" /></Field></div>
      <Field label="Juridisk eier (kan vente)"><EntitySelect data={data} name="ownerOrganizationId" /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Prisliste"><select name="priceListId" className={selectClass}>{data.priceLists.map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}</select></Field><Field label="Salgspris"><Input name="unitPrice" inputMode="decimal" defaultValue="0" required /></Field></div>
      <Field label="Strekkode"><Input name="barcode" /></Field><label className="flex items-center gap-2 text-sm text-slate-300"><input name="trackLots" type="checkbox" defaultChecked /> Batch-/lot-sporing</label>
      <Button className="w-full" disabled={busy === "upsert_product"}><Plus size={16} className="mr-2" />Lagre produkt</Button>
    </form></CardContent></Card><FormCard title="Pris per kanal" description="Egne utsalgs-, B2B-, forhandler- og familiepriser." icon={Coins}><form onSubmit={setPrice} className="space-y-3"><Field label="Produkt"><ProductSelect data={data} name="productId" required /></Field><Field label="Prisliste"><select name="priceListId" className={selectClass} required><option value="">Velg prisliste</option>{data.priceLists.map((list) => <option value={list.id} key={list.id}>{list.name} · {list.currency}</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="Pris"><Input name="unitPrice" inputMode="decimal" required /></Field><Field label="Min. antall"><Input name="minimumQuantity" inputMode="decimal" defaultValue="1" required /></Field></div><Button className="w-full" disabled={busy === "set_price" || data.products.length === 0}>Lagre kanalpris</Button></form></FormCard></div>
    <Card><CardHeader><CardTitle>Produktkatalog</CardTitle><CardDescription>{data.products.length} aktive produkter.</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{data.products.map((product) => <div key={product.id} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-white">{product.name}</p><p className="font-mono text-xs text-slate-500">{product.sku} · {product.unit}</p></div><Badge variant={product.track_lots ? "default" : "secondary"}>{product.track_lots ? "Batch" : "Uten batch"}</Badge></div><p className="mt-3 line-clamp-2 text-sm text-slate-400">{product.description || "Ingen beskrivelse"}</p><p className="mt-4 font-semibold text-emerald-300">{money(product.unit_price, product.price_currency || "EUR")}</p></div>)}{data.products.length === 0 && <Empty text="Ingen produkter ennå." />}</div></CardContent></Card>
  </div>;
}

function Inventory({ data, busy, runCommand }: { data: DonaAnnaSnapshot; busy: string; runCommand: Runner }) {
  const warehouseSubmit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await runCommand("upsert_warehouse", { code: fieldValue(form, "code"), name: fieldValue(form, "name"), warehouseType: fieldValue(form, "warehouseType"), countryCode: fieldValue(form, "countryCode"), status: fieldValue(form, "status"), ownerOrganizationId: nullable(fieldValue(form, "ownerOrganizationId")) }, "Varehuset er lagret."); if (result) event.currentTarget.reset(); };
  const lotSubmit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await runCommand("upsert_lot", { productId: fieldValue(form, "productId"), ownerOrganizationId: nullable(fieldValue(form, "ownerOrganizationId")), lotNumber: fieldValue(form, "lotNumber"), status: fieldValue(form, "status"), harvestYear: nullable(fieldValue(form, "harvestYear")), productionDate: nullable(fieldValue(form, "productionDate")), bottlingDate: nullable(fieldValue(form, "bottlingDate")), bestBeforeDate: nullable(fieldValue(form, "bestBeforeDate")), originCountryCode: fieldValue(form, "originCountryCode"), oliveVariety: fieldValue(form, "oliveVariety"), organicStatus: fieldValue(form, "organicStatus") }, "Batchen er lagret."); if (result) event.currentTarget.reset(); };
  const adjustmentSubmit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await runCommand("adjust_inventory", { productId: fieldValue(form, "productId"), lotId: nullable(fieldValue(form, "lotId")), warehouseId: fieldValue(form, "warehouseId"), ownerOrganizationId: nullable(fieldValue(form, "ownerOrganizationId")), quantity: fieldValue(form, "quantity"), unitCost: fieldValue(form, "unitCost") || "0", currency: fieldValue(form, "currency"), reason: fieldValue(form, "reason"), idempotencyKey: crypto.randomUUID() }, "Lagerbevegelsen er bokført."); if (result) event.currentTarget.reset(); };
  return <div className="space-y-5">
    <div className="grid gap-4 xl:grid-cols-3">
      <FormCard title="Nytt varehus" description="Fysisk plassering og juridisk lagereier kan være forskjellig." icon={Warehouse}><form onSubmit={warehouseSubmit} className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label="Kode"><Input name="code" required /></Field><Field label="Land"><Input name="countryCode" maxLength={2} placeholder="ES" /></Field></div><Field label="Navn"><Input name="name" required /></Field><Field label="Type"><select name="warehouseType" className={selectClass}>{["farm", "production", "main", "transit", "market", "vehicle", "reseller", "consignment", "returns"].map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Eier"><EntitySelect data={data} name="ownerOrganizationId" /></Field><Field label="Status"><select name="status" className={selectClass}><option value="planned">Planlagt</option><option value="active">Aktivt</option><option value="paused">Pauset</option></select></Field><Button className="w-full" disabled={busy === "upsert_warehouse"}>Lagre varehus</Button></form></FormCard>
      <FormCard title="Ny batch / lot" description="Matsporing fra produksjon til kunde." icon={ScanLine}><form onSubmit={lotSubmit} className="space-y-3"><Field label="Produkt"><ProductSelect data={data} name="productId" required /></Field><Field label="Lotnummer"><Input name="lotNumber" required /></Field><div className="grid grid-cols-2 gap-3"><Field label="Status"><select name="status" className={selectClass}><option value="planned">Planlagt</option><option value="quarantine">Karantene</option><option value="released">Frigitt</option></select></Field><Field label="Høsteår"><Input name="harvestYear" type="number" /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Produksjon"><Input name="productionDate" type="date" /></Field><Field label="Tapping"><Input name="bottlingDate" type="date" /></Field></div><Field label="Best før"><Input name="bestBeforeDate" type="date" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Opprinnelse"><Input name="originCountryCode" maxLength={2} defaultValue="ES" /></Field><Field label="Olivenvariant"><Input name="oliveVariety" /></Field></div><Field label="Økologisk status"><Input name="organicStatus" /></Field><Field label="Juridisk eier"><EntitySelect data={data} name="ownerOrganizationId" /></Field><Button className="w-full" disabled={busy === "upsert_lot"}>Lagre batch</Button></form></FormCard>
      <FormCard title="Lagerjustering" description="Alle endringer blir append-only bevegelser med sporbar årsak." icon={Boxes}><form onSubmit={adjustmentSubmit} className="space-y-3"><Field label="Produkt"><ProductSelect data={data} name="productId" required /></Field><Field label="Batch"><LotSelect data={data} name="lotId" /></Field><Field label="Varehus"><WarehouseSelect data={data} name="warehouseId" required /></Field><div className="grid grid-cols-2 gap-3"><Field label="Antall (+/-)"><Input name="quantity" inputMode="decimal" required /></Field><Field label="Enhetskost"><Input name="unitCost" inputMode="decimal" defaultValue="0" /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Valuta"><Input name="currency" maxLength={3} defaultValue="EUR" /></Field><Field label="Eier"><EntitySelect data={data} name="ownerOrganizationId" /></Field></div><Field label="Årsak"><Input name="reason" required placeholder="Opptelling / åpningsbalanse" /></Field><Button className="w-full" disabled={busy === "adjust_inventory"}>Bokfør bevegelse</Button></form></FormCard>
    </div>
    <Card><CardHeader><CardTitle>Lagerbeholdning</CardTitle><CardDescription>Tilgjengelig = fysisk beholdning minus aktive reservasjoner. Batch i karantene eller recall er ikke tilgjengelig for salg.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="p-3">Produkt</th><th>Varehus</th><th>Batch</th><th className="text-right">På lager</th><th className="text-right">Reservert</th><th className="text-right">Tilgjengelig</th><th className="text-right">Snittkost</th><th>Best før</th></tr></thead><tbody>{data.stock.map((stock) => <tr key={`${stock.owner_organization_id || "unowned"}-${stock.warehouse_id}-${stock.product_id}-${stock.lot_id || "no-lot"}`} className="border-t border-slate-800"><td className="p-3"><p className="font-medium text-white">{stock.product_name}</p><p className="font-mono text-xs text-slate-500">{stock.sku}</p></td><td>{stock.warehouse_name}</td><td>{stock.lot_number || "—"}</td><td className="text-right font-mono">{quantity(stock.on_hand)}</td><td className="text-right font-mono text-amber-300">{quantity(stock.reserved)}</td><td className="text-right font-mono text-emerald-300">{quantity(stock.available)}</td><td className="text-right font-mono">{money(stock.average_receipt_cost)}</td><td>{shortDate(stock.best_before_date)}</td></tr>)}{data.stock.length === 0 && <tr><td colSpan={8}><Empty text="Lagerbeholdningen er 0. Det er forventet før oppstart." /></td></tr>}</tbody></table></CardContent></Card>
    <Card><CardHeader><CardTitle>Lagerjournal</CardTitle><CardDescription>Append-only historikk over mottak, leveranser, returer og justeringer.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="p-3">Tidspunkt</th><th>Transaksjon</th><th>Produkt / batch</th><th>Varehus</th><th>Ordre / referanse</th><th className="text-right">Antall</th><th className="text-right">Enhetskost</th></tr></thead><tbody>{data.stockMovements.map((movement) => <tr key={movement.id} className="border-t border-slate-800"><td className="p-3 text-slate-400">{shortDate(movement.occurred_at)}</td><td><Badge variant={numberValue(movement.quantity) >= 0 ? "success" : "warning"}>{movement.movement_type}</Badge></td><td><p className="font-medium text-white">{movement.product_name}</p><p className="font-mono text-xs text-slate-500">{movement.sku} · {movement.lot_number || "uten batch"}</p></td><td>{movement.warehouse_name}</td><td><p className="font-mono text-xs text-slate-300">{movement.order_number || movement.source_type}</p><p className="text-xs text-slate-500">{movement.external_reference || movement.reason || "—"}</p></td><td className={`text-right font-mono ${numberValue(movement.quantity) >= 0 ? "text-emerald-300" : "text-amber-300"}`}>{numberValue(movement.quantity) > 0 ? "+" : ""}{quantity(movement.quantity)}</td><td className="text-right font-mono">{money(movement.unit_cost, movement.currency)}</td></tr>)}{data.stockMovements.length === 0 && <tr><td colSpan={7}><Empty text="Ingen lagertransaksjoner ennå." /></td></tr>}</tbody></table></CardContent></Card>
  </div>;
}

function Orders({ data, busy, runCommand }: { data: DonaAnnaSnapshot; busy: string; runCommand: Runner }) {
  const [lines, setLines] = useState<DraftOrderLine[]>(() => [makeLine(data.products[0])]);
  const updateLine = (index: number, patch: Partial<DraftOrderLine>) => setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  const productChanged = (index: number, productId: string) => { const product = data.products.find((item) => item.id === productId); updateLine(index, { productId, lotId: "", unit: product?.unit || "stk", unitPrice: String(product?.unit_price ?? "0") }); };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await runCommand("create_order", { orderType: fieldValue(form, "orderType"), sellerOrganizationId: nullable(fieldValue(form, "sellerOrganizationId")), buyerOrganizationId: nullable(fieldValue(form, "buyerOrganizationId")), partyId: nullable(fieldValue(form, "partyId")), salesRepPartyId: nullable(fieldValue(form, "salesRepPartyId")), billingCustomerId: nullable(fieldValue(form, "billingCustomerId")), warehouseId: nullable(fieldValue(form, "warehouseId")), destinationWarehouseId: nullable(fieldValue(form, "destinationWarehouseId")), posSessionId: nullable(fieldValue(form, "posSessionId")), salesChannel: fieldValue(form, "salesChannel"), currency: fieldValue(form, "currency"), commissionRuleId: nullable(fieldValue(form, "commissionRuleId")), notes: fieldValue(form, "notes"), idempotencyKey: crypto.randomUUID(), lines: lines.map(({ clientId: _clientId, ...line }) => ({ ...line, lotId: nullable(line.lotId) })) }, "Ordrekladden er opprettet."); if (result) { event.currentTarget.reset(); setLines([makeLine(data.products[0])]); } };
  return <div className="space-y-5"><Card><CardHeader><CardTitle>Ny salgs- eller innkjøpsordre</CardTitle><CardDescription>Ordren blir kladd. Juridisk selskap, varehus og batch må være klare før bekreftelse og levering.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-4"><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><Field label="Ordretype"><select name="orderType" className={selectClass}><option value="sale">Salg</option><option value="purchase">Innkjøp</option><option value="intercompany_sale">Intercompany salg</option><option value="intercompany_purchase">Intercompany innkjøp</option><option value="pos">POS</option></select></Field><Field label="Selger"><EntitySelect data={data} name="sellerOrganizationId" /></Field><Field label="Kjøper"><EntitySelect data={data} name="buyerOrganizationId" /></Field><Field label="Motpart"><PartySelect data={data} name="partyId" /></Field><Field label="Fakturakunde"><BillingCustomerSelect data={data} name="billingCustomerId" /></Field><Field label="Varehus"><WarehouseSelect data={data} name="warehouseId" /></Field><Field label="Destinasjonslager"><WarehouseSelect data={data} name="destinationWarehouseId" /></Field><Field label="Salgskanal"><select name="salesChannel" className={selectClass}>{["admin", "website", "pos", "market", "b2b", "reseller", "family_reseller", "intercompany"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Selger"><PartySelect data={data} name="salesRepPartyId" role="sales_rep" /></Field><Field label="Provisjonsregel"><select name="commissionRuleId" className={selectClass}><option value="">Ingen</option>{data.commissionRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name}</option>)}</select></Field><Field label="POS-økt"><select name="posSessionId" className={selectClass}><option value="">Ingen</option>{data.posSessions.filter((session) => session.status === "open").map((session) => <option key={session.id} value={session.id}>{session.session_number}</option>)}</select></Field><Field label="Valuta"><Input name="currency" defaultValue="EUR" maxLength={3} /></Field></div><Field label="Merknad"><Input name="notes" /></Field>
      <div className="space-y-3">{lines.map((line, index) => <div key={line.clientId} className="grid gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 md:grid-cols-4 xl:grid-cols-[1.4fr_1.2fr_0.6fr_0.7fr_0.7fr_0.6fr_0.5fr_auto]"><Field label="Produkt"><select className={selectClass} value={line.productId} onChange={(event) => productChanged(index, event.target.value)} required><option value="">Velg</option>{data.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field><Field label="Batch"><select className={selectClass} value={line.lotId} onChange={(event) => updateLine(index, { lotId: event.target.value })}><option value="">Ikke valgt</option>{data.lots.filter((lot) => lot.product_id === line.productId).map((lot) => <option key={lot.id} value={lot.id}>{lot.lot_number}</option>)}</select></Field><Field label="Antall"><Input value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></Field><Field label="Pris"><Input value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} /></Field><Field label="Kost"><Input value={line.unitCost} onChange={(event) => updateLine(index, { unitCost: event.target.value })} /></Field><Field label="Avgift %"><Input value={line.taxRate} onChange={(event) => updateLine(index, { taxRate: event.target.value })} /></Field><Field label="Rabatt %"><Input value={line.discountPercent} onChange={(event) => updateLine(index, { discountPercent: event.target.value })} /></Field><div className="flex items-end"><Button type="button" size="icon" variant="ghost" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><RotateCcw size={15} /></Button></div></div>)}</div><div className="flex justify-between"><Button type="button" variant="outline" onClick={() => setLines((current) => [...current, makeLine(data.products[0])])}><Plus size={15} className="mr-2" />Ordrelinje</Button><Button disabled={busy === "create_order" || data.products.length === 0}>Opprett ordrekladd</Button></div></form></CardContent></Card><Card><CardHeader><CardTitle>Ordreoversikt</CardTitle></CardHeader><CardContent><OrderTable data={data} runCommand={runCommand} busy={busy} /></CardContent></Card></div>;
}

function FulfillmentPanel({ data, busy, runCommand }: { data: DonaAnnaSnapshot; busy: string; runCommand: Runner }) {
  const eligibleOrders = useMemo(() => data.orders.filter((order) => {
    if (order.order_type.includes("purchase")) return ["confirmed", "partially_fulfilled"].includes(order.status);
    if (order.order_type === "pos") return ["confirmed", "reserved", "partially_fulfilled"].includes(order.status);
    return ["reserved", "partially_fulfilled"].includes(order.status);
  }), [data.orders]);
  const [orderId, setOrderId] = useState(eligibleOrders[0]?.id || "");
  const order = eligibleOrders.find((item) => item.id === orderId) || null;
  const orderLines = useMemo(() => data.orderLines.filter((line) => (
    line.order_id === orderId && numberValue(line.fulfilled_quantity) < numberValue(line.quantity)
  )), [data.orderLines, orderId]);
  const [drafts, setDrafts] = useState<Record<string, { quantity: string; lotId: string }>>({});

  useEffect(() => {
    if (!eligibleOrders.some((item) => item.id === orderId)) {
      setOrderId(eligibleOrders[0]?.id || "");
    }
  }, [eligibleOrders, orderId]);

  useEffect(() => {
    setDrafts(Object.fromEntries(orderLines.map((line) => [line.id, {
      quantity: String(numberValue(line.quantity) - numberValue(line.fulfilled_quantity)),
      lotId: line.lot_id || "",
    }])));
  }, [orderLines]);

  const updateDraft = (lineId: string, patch: Partial<{ quantity: string; lotId: string }>) => {
    setDrafts((current) => ({
      ...current,
      [lineId]: { quantity: current[lineId]?.quantity || "0", lotId: current[lineId]?.lotId || "", ...patch },
    }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order) return;
    const form = new FormData(event.currentTarget);
    const lines = orderLines.flatMap((line) => {
      const draft = drafts[line.id];
      if (!draft || numberValue(draft.quantity) <= 0) return [];
      return [{ orderLineId: line.id, lotId: nullable(draft.lotId), quantity: draft.quantity }];
    });
    if (lines.length === 0) return;
    await runCommand("fulfill_order", {
      orderId: order.id,
      idempotencyKey: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      reference: fieldValue(form, "reference"),
      notes: fieldValue(form, "notes"),
      lines,
    }, `${order.order_type.includes("purchase") ? "Varemottaket" : "Leveringen"} er bokført på ${order.order_number}.`);
  };

  return <Card><CardHeader><CardTitle>Varemottak og levering</CardTitle><CardDescription>Registrer hele eller deler av en ordre. Hver innsending blir én idempotent, sporbar lagerhendelse.</CardDescription></CardHeader><CardContent>{eligibleOrders.length === 0 ? <Empty text="Ingen bekreftede ordre er klare for mottak eller levering." /> : <form onSubmit={submit} className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><Field label="Ordre"><select value={orderId} onChange={(event) => setOrderId(event.target.value)} className={selectClass}>{eligibleOrders.map((item) => <option key={item.id} value={item.id}>{item.order_number} · {item.order_type} · {item.status}</option>)}</select></Field><Field label="Ekstern referanse"><Input name="reference" placeholder="Pakkseddel / fraktbrev" /></Field><Field label="Notat"><Input name="notes" placeholder="Valgfritt operatørnotat" /></Field></div><div className="space-y-3">{orderLines.map((line) => { const product = data.products.find((item) => item.id === line.product_id); const draft = drafts[line.id] || { quantity: "0", lotId: line.lot_id || "" }; const remaining = numberValue(line.quantity) - numberValue(line.fulfilled_quantity); const lots = data.lots.filter((lot) => lot.product_id === line.product_id && (order?.order_type.includes("purchase") ? ["planned", "quarantine", "released"].includes(lot.status) : lot.status === "released")); return <div key={line.id} className="grid gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 md:grid-cols-[1.4fr_1fr_0.7fr_0.7fr]"><div><p className="font-medium text-white">{line.product_name}</p><p className="font-mono text-xs text-slate-500">{line.sku} · bestilt {quantity(line.quantity)} · tidligere {quantity(line.fulfilled_quantity)}</p></div><Field label={product?.track_lots ? "Batch (påkrevd)" : "Batch"}><select className={selectClass} value={draft.lotId} onChange={(event) => updateDraft(line.id, { lotId: event.target.value })} required={Boolean(product?.track_lots)}><option value="">Uten batch</option>{lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.lot_number} · {lot.status}</option>)}</select></Field><Field label="Antall nå"><Input type="number" min="0" max={remaining} step="0.0001" value={draft.quantity} onChange={(event) => updateDraft(line.id, { quantity: event.target.value })} /></Field><div className="flex items-end justify-end pb-2 text-xs text-slate-500">Gjenstår {quantity(remaining)}</div></div>; })}</div><div className="flex justify-end"><Button disabled={busy === "fulfill_order" || orderLines.length === 0}>{order?.order_type.includes("purchase") ? "Bokfør varemottak" : "Bokfør levering"}</Button></div></form>}</CardContent></Card>;
}

function OrderTable({ data, compact = false, runCommand, busy = "" }: { data: DonaAnnaSnapshot; compact?: boolean; runCommand?: Runner; busy?: string }) {
  const orders = compact ? data.orders.slice(0, 8) : data.orders;
  const action = async (order: DonaAnnaOrder, name: "confirm" | "reserve" | "fulfill" | "cancel") => {
    if (!runCommand) return;
    if (name === "fulfill") {
      const lines = data.orderLines
        .filter((line) => line.order_id === order.id && numberValue(line.fulfilled_quantity) < numberValue(line.quantity))
        .map((line) => ({
          orderLineId: line.id,
          lotId: line.lot_id,
          quantity: String(numberValue(line.quantity) - numberValue(line.fulfilled_quantity)),
        }));
      if (lines.length === 0) return;
      await runCommand("fulfill_order", {
        orderId: order.id,
        idempotencyKey: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        lines,
      }, `${order.order_type.includes("purchase") ? "Varemottaket" : "Leveringen"} er bokført på ${order.order_number}.`);
      return;
    }
    await runCommand("order_action", { orderId: order.id, action: name }, `Ordre ${order.order_number} er oppdatert.`);
  };
  const payment = async (order: DonaAnnaOrder) => { if (!runCommand) return; const amount = window.prompt("Betalt beløp", String(Math.max(numberValue(order.total) - numberValue(order.paid_amount), 0))); if (!amount) return; const method = window.prompt("Metode: cash, card, bank_transfer, vipps, stripe eller other", order.order_type === "pos" ? "cash" : "bank_transfer") || "bank_transfer"; await runCommand("order_action", { orderId: order.id, action: "payment", amount, method, paymentDate: new Date().toISOString() }, `Betaling er registrert på ${order.order_number}.`); };
  const invoice = async (order: DonaAnnaOrder) => { if (!runCommand) return; const result = await runCommand("create_invoice", { orderId: order.id }, `Fakturakladd er opprettet fra ${order.order_number}.`); const documentId = result?.documentId; if (typeof documentId === "string") window.location.assign(`/billing/documents/${documentId}`); };
  return <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="p-3">Ordre</th><th>Type/kanal</th><th>Motpart</th><th>Varehus</th><th className="text-right">Total</th><th>Betaling</th><th>Status</th>{!compact && <th className="text-right">Handling</th>}</tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-slate-800 align-top"><td className="p-3"><p className="font-mono font-medium text-white">{order.order_number}</p><p className="text-xs text-slate-500">{shortDate(order.ordered_at)}</p></td><td>{order.order_type}<p className="text-xs text-slate-500">{order.sales_channel}</p></td><td>{order.party_name || "—"}{order.sales_rep_name && <p className="text-xs text-slate-500">Selger: {order.sales_rep_name}</p>}</td><td>{order.warehouse_name || "—"}</td><td className="text-right font-mono text-slate-200">{money(order.total, order.currency)}</td><td><Badge variant={order.payment_status === "paid" ? "success" : "secondary"}>{order.payment_status}</Badge></td><td><Badge variant={order.status === "fulfilled" ? "success" : order.status === "cancelled" ? "destructive" : "warning"}>{order.status}</Badge></td>{!compact && <td><div className="flex justify-end gap-1">{order.status === "draft" && <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => action(order, "confirm")}>Bekreft</Button>}{order.status === "confirmed" && ["sale", "intercompany_sale"].includes(order.order_type) && <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => action(order, "reserve")}>Reserver</Button>}{((order.status === "confirmed" && ["purchase", "intercompany_purchase", "pos"].includes(order.order_type)) || order.status === "reserved") && <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => action(order, "fulfill")}>{order.order_type.includes("purchase") ? "Motta" : "Lever"}</Button>}{order.status !== "draft" && order.payment_status !== "paid" && <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => payment(order)}>Betaling</Button>}{["sale", "intercompany_sale"].includes(order.order_type) && order.status !== "draft" && !order.billing_document_id && <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => invoice(order)}>Faktura</Button>}{order.billing_document_id && <Button asChild size="icon" variant="ghost"><Link href={`/billing/documents/${order.billing_document_id}`}><ArrowUpRight size={15} /></Link></Button>}{!["fulfilled", "cancelled", "returned"].includes(order.status) && <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => action(order, "cancel")}>Avbryt</Button>}</div></td>}</tr>)}{orders.length === 0 && <tr><td colSpan={8}><Empty text="Ingen ordre ennå." /></td></tr>}</tbody></table></div>;
}

function Pos({ data, busy, runCommand }: { data: DonaAnnaSnapshot; busy: string; runCommand: Runner }) {
  const open = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await runCommand("pos_action", { action: "open", organizationId: fieldValue(form, "organizationId"), warehouseId: fieldValue(form, "warehouseId"), openingCash: fieldValue(form, "openingCash"), notes: fieldValue(form, "notes") }, "Kasseøkten er åpnet."); if (result) event.currentTarget.reset(); };
  const close = async (id: string) => { const actualCash = window.prompt("Faktisk kontantbeholdning ved stenging"); if (actualCash === null) return; await runCommand("pos_action", { action: "close", sessionId: id, actualCash }, "Kasseoppgjøret er lukket."); };
  return <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]"><FormCard title="Åpne kasse" description="Kontantsalg knyttes til juridisk selger, varehus og kasseøkt." icon={Store}><form onSubmit={open} className="space-y-3"><Field label="Juridisk selger"><EntitySelect data={data} name="organizationId" required /></Field><Field label="Varehus / marked"><WarehouseSelect data={data} name="warehouseId" required /></Field><Field label="Åpningskasse"><Input name="openingCash" inputMode="decimal" defaultValue="0" /></Field><Field label="Notat"><Input name="notes" /></Field><Button className="w-full" disabled={busy === "pos_action" || data.legalEntities.length === 0 || data.warehouses.length === 0}>Åpne POS-økt</Button>{data.legalEntities.length === 0 && <p className="text-xs text-amber-300">POS aktiveres når juridisk selger er registrert.</p>}</form></FormCard><Card><CardHeader><CardTitle>Kasseøkter</CardTitle><CardDescription>Forventet kasse beregnes fra kontantbetalinger i økten.</CardDescription></CardHeader><CardContent className="space-y-3">{data.posSessions.map((session) => <div key={session.id} className="flex flex-col gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-mono text-white">{session.session_number}</p><Badge variant={session.status === "open" ? "success" : "secondary"}>{session.status}</Badge></div><p className="mt-1 text-sm text-slate-400">{session.warehouse_name} · åpnet {shortDate(session.opened_at)}</p><p className="mt-1 text-xs text-slate-500">Åpning {money(session.opening_cash)}{session.status === "closed" ? ` · forventet ${money(session.expected_cash)} · avvik ${money(session.difference)}` : ""}</p></div>{session.status === "open" && <Button variant="outline" onClick={() => close(session.id)}>Lukk og tell</Button>}</div>)}{data.posSessions.length === 0 && <Empty text="Ingen kasseøkter ennå." />}</CardContent></Card></div>;
}

function Partners({ data, busy, runCommand }: { data: DonaAnnaSnapshot; busy: string; runCommand: Runner }) {
  const party = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await runCommand("upsert_party", { partyType: fieldValue(form, "partyType"), name: fieldValue(form, "name"), roles: [fieldValue(form, "role")], countryCode: fieldValue(form, "countryCode"), email: fieldValue(form, "email"), phone: fieldValue(form, "phone"), billingCustomerId: nullable(fieldValue(form, "billingCustomerId")), defaultPriceListId: nullable(fieldValue(form, "defaultPriceListId")) }, "Parten er lagret."); if (result) event.currentTarget.reset(); };
  const commission = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await runCommand("upsert_commission_rule", { name: fieldValue(form, "name"), ruleType: fieldValue(form, "ruleType"), percentage: nullable(fieldValue(form, "percentage")), fixedAmount: nullable(fieldValue(form, "fixedAmount")), currency: fieldValue(form, "currency"), payableEvent: fieldValue(form, "payableEvent"), appliesToChannel: fieldValue(form, "appliesToChannel") }, "Provisjonsregelen er lagret."); if (result) event.currentTarget.reset(); };
  const priceList = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await runCommand("upsert_price_list", { name: fieldValue(form, "name"), code: fieldValue(form, "code"), currency: fieldValue(form, "currency"), salesChannel: fieldValue(form, "salesChannel"), customerType: fieldValue(form, "customerType"), organizationId: nullable(fieldValue(form, "organizationId")) }, "Prislisten er opprettet."); if (result) event.currentTarget.reset(); };
  return <div className="space-y-5"><div className="grid gap-4 xl:grid-cols-3"><FormCard title="Ny kunde, leverandør eller forhandler" description="Familieforhandler registreres som forhandler med egen prisliste." icon={Users}><form onSubmit={party} className="grid gap-3 md:grid-cols-2"><Field label="Navn"><Input name="name" required /></Field><Field label="Type"><select name="partyType" className={selectClass}><option value="company">Firma</option><option value="person">Person</option></select></Field><Field label="Rolle"><select name="role" className={selectClass}><option value="customer">Kunde</option><option value="supplier">Leverandør</option><option value="reseller">Forhandler</option><option value="family_reseller">Familieforhandler</option><option value="sales_rep">Selger</option><option value="carrier">Transportør</option></select></Field><Field label="Land"><Input name="countryCode" maxLength={2} /></Field><Field label="E-post"><Input name="email" type="email" /></Field><Field label="Telefon"><Input name="phone" /></Field><Field label="Fakturakunde"><BillingCustomerSelect data={data} name="billingCustomerId" /></Field><Field label="Prisliste"><select name="defaultPriceListId" className={selectClass}><option value="">Ingen</option>{data.priceLists.map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}</select></Field><div className="md:col-span-2"><Button className="w-full" disabled={busy === "upsert_party"}>Lagre part</Button></div></form></FormCard><FormCard title="Ny prisliste" description="Prisnivå per kanal og forhandlertype." icon={ReceiptText}><form onSubmit={priceList} className="space-y-3"><Field label="Navn"><Input name="name" required placeholder="Familieforhandler EUR" /></Field><Field label="Kode"><Input name="code" required placeholder="family-eur" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Kanal"><select name="salesChannel" className={selectClass}><option value="family_reseller">Familie</option><option value="reseller">Forhandler</option><option value="b2b">B2B</option><option value="market">Marked</option><option value="website">Nettbutikk</option><option value="all">Alle</option></select></Field><Field label="Kundetype"><select name="customerType" className={selectClass}><option value="family_reseller">Familie</option><option value="reseller">Forhandler</option><option value="business">Bedrift</option><option value="private">Privat</option><option value="all">Alle</option></select></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Valuta"><Input name="currency" defaultValue="EUR" maxLength={3} /></Field><Field label="Juridisk selger"><EntitySelect data={data} name="organizationId" /></Field></div><Button className="w-full" disabled={busy === "upsert_price_list"}>Opprett prisliste</Button></form></FormCard><FormCard title="Provisjonsregel" description="Beregnes ved levering og opptjenes ved levering eller betaling." icon={Coins}><form onSubmit={commission} className="grid gap-3 md:grid-cols-2"><Field label="Navn"><Input name="name" required placeholder="Selger 50 % av margin" /></Field><Field label="Regel"><select name="ruleType" className={selectClass}><option value="margin_percent">Prosent av margin</option><option value="revenue_percent">Prosent av omsetning</option><option value="fixed">Fast beløp</option></select></Field><Field label="Prosent"><Input name="percentage" inputMode="decimal" /></Field><Field label="Fast beløp"><Input name="fixedAmount" inputMode="decimal" /></Field><Field label="Opptjenes ved"><select name="payableEvent" className={selectClass}><option value="paid">Betalt</option><option value="fulfilled">Levert</option></select></Field><Field label="Kanal"><select name="appliesToChannel" className={selectClass}><option value="all">Alle</option><option value="market">Marked</option><option value="b2b">B2B</option><option value="reseller">Forhandler</option><option value="family_reseller">Familie</option></select></Field><Field label="Valuta"><Input name="currency" defaultValue="EUR" maxLength={3} /></Field><div className="md:col-span-2"><Button className="w-full" disabled={busy === "upsert_commission_rule"}>Lagre regel</Button></div></form></FormCard></div><div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Partregister</CardTitle></CardHeader><CardContent className="space-y-2">{data.parties.map((party) => <div key={party.id} className="flex items-center justify-between rounded-lg bg-slate-900/50 p-3"><div><p className="font-medium text-white">{party.name}</p><p className="text-xs text-slate-500">{party.country_code || "—"} · {party.email || "ingen e-post"}</p></div><div className="flex flex-wrap justify-end gap-1">{party.roles.map((role) => <Badge key={role} variant="secondary">{role}</Badge>)}</div></div>)}{data.parties.length === 0 && <Empty text="Ingen parter ennå." />}</CardContent></Card><Card><CardHeader><CardTitle>Provisjonsspor</CardTitle></CardHeader><CardContent className="space-y-2">{data.commissionEntries.map((entry) => <div key={entry.id} className="flex items-center justify-between rounded-lg bg-slate-900/50 p-3"><div><p className="font-medium text-white">{entry.beneficiary_name}</p><p className="font-mono text-xs text-slate-500">{entry.order_number} · grunnlag {money(entry.basis_amount, entry.currency)}</p></div><div className="text-right"><p className="font-mono text-emerald-300">{money(entry.amount, entry.currency)}</p><Badge variant={entry.status === "earned" || entry.status === "paid" ? "success" : "secondary"}>{entry.status}</Badge></div></div>)}{data.commissionEntries.length === 0 && <Empty text="Ingen provisjoner opptjent ennå." />}</CardContent></Card></div></div>;
}

function Quality({ data, busy, runCommand }: { data: DonaAnnaSnapshot; busy: string; runCommand: Runner }) {
  const [returnOrderId, setReturnOrderId] = useState(data.orders[0]?.id || "");
  const returnLines = data.orderLines.filter((line) => line.order_id === returnOrderId);
  const createReturn = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const orderLineId = fieldValue(form, "orderLineId"); const line = data.orderLines.find((item) => item.id === orderLineId); const result = await runCommand("create_return", { orderId: nullable(returnOrderId), warehouseId: fieldValue(form, "warehouseId"), returnType: fieldValue(form, "returnType"), reason: fieldValue(form, "reason"), refundAmount: fieldValue(form, "refundAmount") || "0", currency: fieldValue(form, "currency"), lines: [{ orderLineId, productId: line?.product_id, lotId: line?.lot_id, quantity: fieldValue(form, "quantity"), disposition: fieldValue(form, "disposition") }] }, "Returen er registrert og lageret er oppdatert."); if (result) event.currentTarget.reset(); };
  const recall = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await runCommand("create_recall", { lotId: fieldValue(form, "lotId"), riskLevel: fieldValue(form, "riskLevel"), status: "open", reason: fieldValue(form, "reason"), instructions: fieldValue(form, "instructions") }, "Tilbakekallingen er åpnet og batchen er blokkert."); if (result) event.currentTarget.reset(); };
  const landed = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await runCommand("record_landed_cost", { purchaseOrderId: fieldValue(form, "purchaseOrderId"), costType: fieldValue(form, "costType"), supplierPartyId: nullable(fieldValue(form, "supplierPartyId")), amount: fieldValue(form, "amount"), currency: fieldValue(form, "currency"), exchangeRate: fieldValue(form, "exchangeRate") || "1", allocationMethod: fieldValue(form, "allocationMethod"), documentReference: fieldValue(form, "documentReference"), notes: fieldValue(form, "notes") }, "Landed cost er fordelt på ordrelinjene."); if (result) event.currentTarget.reset(); };
  return <div className="space-y-5"><div className="grid gap-4 xl:grid-cols-3"><FormCard title="Retur" description="Retur oppretter en motsatt lagerbevegelse og kan sette batch i karantene." icon={RotateCcw}><form onSubmit={createReturn} className="space-y-3"><Field label="Ordre"><select className={selectClass} value={returnOrderId} onChange={(event) => setReturnOrderId(event.target.value)}><option value="">Velg ordre</option>{data.orders.filter((order) => order.status === "fulfilled").map((order) => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select></Field><Field label="Ordrelinje"><select name="orderLineId" className={selectClass} required>{returnLines.map((line) => <option key={line.id} value={line.id}>{line.product_name} · {line.lot_number || "uten batch"}</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="Antall"><Input name="quantity" defaultValue="1" required /></Field><Field label="Disposisjon"><select name="disposition" className={selectClass}><option value="quarantine">Karantene</option><option value="restock">Tilbake på lager</option><option value="write_off">Kasseres</option><option value="supplier_return">Til leverandør</option></select></Field></div><Field label="Returlager"><WarehouseSelect data={data} name="warehouseId" required /></Field><Field label="Type"><select name="returnType" className={selectClass}><option value="customer_return">Kunderetur</option><option value="supplier_return">Leverandørretur</option></select></Field><Field label="Årsak"><Input name="reason" required /></Field><div className="grid grid-cols-2 gap-3"><Field label="Refusjon"><Input name="refundAmount" defaultValue="0" /></Field><Field label="Valuta"><Input name="currency" defaultValue="EUR" /></Field></div><Button className="w-full" disabled={busy === "create_return" || returnLines.length === 0}>Registrer retur</Button></form></FormCard><FormCard title="Tilbakekalling" description="Blokkerer batchen og legger en recall-hendelse i integrasjonskøen." icon={ShieldAlert}><form onSubmit={recall} className="space-y-3"><Field label="Batch"><LotSelect data={data} name="lotId" required /></Field><Field label="Risiko"><select name="riskLevel" className={selectClass}><option value="precautionary">Føre var</option><option value="low">Lav</option><option value="medium">Middels</option><option value="high">Høy</option><option value="critical">Kritisk</option></select></Field><Field label="Årsak"><Input name="reason" required /></Field><Field label="Instruksjoner"><textarea name="instructions" className={textareaClass} /></Field><Button className="w-full" variant="destructive" disabled={busy === "create_recall" || data.lots.length === 0}>Åpne recall</Button></form></FormCard><FormCard title="Landed cost" description="Frakt, forsikring og importkost fordeles på innkjøpsordre." icon={Truck}><form onSubmit={landed} className="space-y-3"><Field label="Innkjøpsordre"><select name="purchaseOrderId" className={selectClass} required><option value="">Velg ordre</option>{data.orders.filter((order) => order.order_type.includes("purchase")).map((order) => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select></Field><Field label="Kostnadstype"><select name="costType" className={selectClass}>{["freight", "insurance", "customs", "brokerage", "packaging", "handling", "other"].map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Leverandør"><PartySelect data={data} name="supplierPartyId" role="supplier" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Beløp"><Input name="amount" required /></Field><Field label="Valuta"><Input name="currency" defaultValue="EUR" /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Valutakurs"><Input name="exchangeRate" defaultValue="1" /></Field><Field label="Fordeling"><select name="allocationMethod" className={selectClass}><option value="quantity">Antall</option><option value="value">Verdi</option></select></Field></div><Field label="Dokumentreferanse"><Input name="documentReference" /></Field><Field label="Notat"><Input name="notes" /></Field><Button className="w-full" disabled={busy === "record_landed_cost"}>Fordel kostnad</Button></form></FormCard></div><div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Returhistorikk</CardTitle></CardHeader><CardContent className="space-y-2">{data.returns.map((item) => <div key={item.id} className="rounded-lg bg-slate-900/50 p-3"><div className="flex justify-between"><p className="font-mono text-white">{item.return_number}</p><Badge>{item.status}</Badge></div><p className="mt-1 text-sm text-slate-400">{item.reason}</p></div>)}{data.returns.length === 0 && <Empty text="Ingen returer." />}</CardContent></Card><Card><CardHeader><CardTitle>Recall-register</CardTitle></CardHeader><CardContent className="space-y-2">{data.recalls.map((item) => <div key={item.id} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3"><div className="flex justify-between"><p className="font-mono text-white">{item.recall_number}</p><Badge variant="destructive">{item.risk_level}</Badge></div><p className="mt-1 text-sm text-slate-300">{item.product_name} · {item.lot_number}</p><p className="mt-1 text-xs text-slate-500">{item.reason}</p></div>)}{data.recalls.length === 0 && <Empty text="Ingen tilbakekallinger." />}</CardContent></Card></div></div>;
}

function Companies({ data, busy, runCommand }: { data: DonaAnnaSnapshot; busy: string; runCommand: Runner }) {
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await runCommand("link_organization", { organizationId: fieldValue(form, "organizationId"), role: fieldValue(form, "role"), marketCountryCode: fieldValue(form, "marketCountryCode"), validFrom: fieldValue(form, "validFrom") || new Date().toISOString().slice(0, 10) }, "Selskapet er koblet til Doña Anna."); if (result) event.currentTarget.reset(); };
  return <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]"><FormCard title="Koble juridisk selskap" description="Doña Anna-merket kan ha spansk produsent/selger og norsk importør/selger." icon={Landmark}><form onSubmit={submit} className="space-y-3"><Field label="Selskap"><EntitySelect data={data} name="organizationId" required /></Field><Field label="Rolle"><select name="role" className={selectClass}><option value="producer">Produsent</option><option value="importer">Importør</option><option value="seller">Selger</option><option value="holding">Holding</option><option value="service_provider">Tjenesteleverandør</option></select></Field><Field label="Marked"><Input name="marketCountryCode" maxLength={2} placeholder="ES / NO" /></Field><Field label="Gyldig fra"><Input name="validFrom" type="date" /></Field><Button className="w-full" disabled={busy === "link_organization" || data.legalEntities.length === 0}>Koble selskap</Button>{data.legalEntities.length === 0 && <p className="text-xs text-amber-300">Opprett juridisk selskap i Fakturering når registreringsopplysningene er klare.</p>}</form></FormCard><div className="space-y-4"><Card><CardHeader><CardTitle>Registrerte juridiske selskaper</CardTitle><CardDescription>Dette er fakturautstedere i RealtyFlow. Soleada skal registreres som kunde, ikke her.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{data.legalEntities.map((entity) => <div key={entity.id} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4"><div className="flex items-start justify-between"><div><p className="font-medium text-white">{entity.trading_name || entity.legal_name}</p><p className="mt-1 text-xs text-slate-500">{entity.legal_name} · {entity.country_code}</p></div><Badge variant={entity.registration_number ? "success" : "warning"}>{entity.registration_number ? "Registrert" : "Under etablering"}</Badge></div><p className="mt-3 font-mono text-xs text-slate-500">{entity.registration_number || "Org.nr./NIF mangler"}</p></div>)}{data.legalEntities.length === 0 && <Empty text="Ingen juridiske selskaper er opprettet i faktureringskjernen ennå." />}</CardContent></Card><Card><CardHeader><CardTitle>Doña Anna-roller</CardTitle></CardHeader><CardContent className="space-y-2">{data.brandOrganizationLinks.map((link) => { const organization = data.legalEntities.find((item) => item.id === link.organization_id); return <div key={String(link.id)} className="flex items-center justify-between rounded-lg bg-slate-900/50 p-3"><div><p className="font-medium text-white">{organization?.legal_name || String(link.organization_id)}</p><p className="text-xs text-slate-500">Marked {String(link.market_country_code || "alle")} · fra {String(link.valid_from)}</p></div><Badge>{String(link.role)}</Badge></div>; })}{data.brandOrganizationLinks.length === 0 && <Empty text="Ingen selskapsroller koblet ennå." />}</CardContent></Card><Button asChild><Link href="/billing"><Plus size={16} className="mr-2" />Opprett juridisk fakturafirma</Link></Button></div></div>;
}

function FormCard({ title, description, icon: Icon, children }: { title: string; description: string; icon: React.ElementType; children: React.ReactNode }) { return <Card><CardHeader><div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><Icon size={20} /></div><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5 text-xs font-medium text-slate-400"><span>{label}</span>{children}</label>; }
function Empty({ text }: { text: string }) { return <div className="col-span-full py-8 text-center text-sm text-slate-500">{text}</div>; }
function EntitySelect({ data, name, required = false }: { data: DonaAnnaSnapshot; name: string; required?: boolean }) { return <select name={name} className={selectClass} required={required}><option value="">Ikke valgt</option>{data.legalEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.trading_name || entity.legal_name} · {entity.country_code}</option>)}</select>; }
function BillingCustomerSelect({ data, name }: { data: DonaAnnaSnapshot; name: string }) { return <select name={name} className={selectClass}><option value="">Ikke valgt</option>{data.billingCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.country_code}</option>)}</select>; }
function ProductSelect({ data, name, required = false }: { data: DonaAnnaSnapshot; name: string; required?: boolean }) { return <select name={name} className={selectClass} required={required}><option value="">Velg produkt</option>{data.products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select>; }
function WarehouseSelect({ data, name, required = false }: { data: DonaAnnaSnapshot; name: string; required?: boolean }) { return <select name={name} className={selectClass} required={required}><option value="">Velg varehus</option>{data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.status}</option>)}</select>; }
function LotSelect({ data, name, required = false }: { data: DonaAnnaSnapshot; name: string; required?: boolean }) { return <select name={name} className={selectClass} required={required}><option value="">Velg batch</option>{data.lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.product_name} · {lot.lot_number} · {lot.status}</option>)}</select>; }
function PartySelect({ data, name, role }: { data: DonaAnnaSnapshot; name: string; role?: string }) { const parties = role ? data.parties.filter((party) => party.roles.includes(role)) : data.parties; return <select name={name} className={selectClass}><option value="">Ikke valgt</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select>; }
