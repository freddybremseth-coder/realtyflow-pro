import { z } from "zod";

const id = z.string().uuid();
const optionalId = id.optional().nullable().or(z.literal(""));
const decimal = z.union([z.string().trim().min(1), z.number().finite()]);
const optionalDecimal = decimal.optional().nullable().or(z.literal(""));
const country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().nullable().or(z.literal(""));
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

const productPayload = z.object({
  id: optionalId,
  workspaceSlug: z.string().default("dona-anna"),
  brandId: optionalId,
  ownerOrganizationId: optionalId,
  billingProductId: optionalId,
  sku: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(240),
  description: z.string().trim().max(4000).optional().nullable(),
  productType: z.enum(["goods", "service", "packaging"]).default("goods"),
  unit: z.string().trim().min(1).max(40).default("stk"),
  trackLots: z.boolean().default(true),
  shelfLifeDays: z.coerce.number().int().positive().optional().nullable(),
  barcode: z.string().trim().max(100).optional().nullable(),
  priceListId: optionalId,
  unitPrice: optionalDecimal,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const priceListPayload = z.object({
  id: optionalId,
  workspaceSlug: z.string().default("dona-anna"),
  organizationId: optionalId,
  brandId: optionalId,
  name: z.string().trim().min(2).max(240),
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  currency: currency,
  salesChannel: z.enum(["all", "website", "pos", "market", "b2b", "reseller", "family_reseller", "intercompany"]),
  customerType: z.enum(["all", "private", "business", "reseller", "family_reseller"]),
  validFrom: z.string().date().optional().nullable().or(z.literal("")),
});

const pricePayload = z.object({
  workspaceSlug: z.string().default("dona-anna"),
  productId: id,
  priceListId: id,
  unitPrice: decimal,
  minimumQuantity: decimal.default("1"),
});

const partyPayload = z.object({
  id: optionalId,
  workspaceSlug: z.string().default("dona-anna"),
  organizationId: optionalId,
  billingCustomerId: optionalId,
  partyType: z.enum(["person", "company"]).default("company"),
  name: z.string().trim().min(1).max(240),
  roles: z.array(z.enum(["customer", "supplier", "reseller", "family_reseller", "sales_rep", "carrier"])).min(1),
  registrationNumber: z.string().trim().max(100).optional().nullable(),
  vatNumber: z.string().trim().max(100).optional().nullable(),
  countryCode: country,
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(80).optional().nullable(),
  defaultPriceListId: optionalId,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const warehousePayload = z.object({
  id: optionalId,
  workspaceSlug: z.string().default("dona-anna"),
  ownerOrganizationId: optionalId,
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(240),
  warehouseType: z.enum(["farm", "production", "main", "transit", "market", "vehicle", "reseller", "consignment", "returns"]),
  countryCode: country,
  status: z.enum(["planned", "active", "paused", "closed"]).default("planned"),
  address: z.record(z.string(), z.unknown()).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const lotPayload = z.object({
  id: optionalId,
  workspaceSlug: z.string().default("dona-anna"),
  productId: id,
  ownerOrganizationId: optionalId,
  lotNumber: z.string().trim().min(1).max(160),
  status: z.enum(["planned", "quarantine", "released", "blocked", "recalled", "depleted"]).default("planned"),
  harvestYear: z.coerce.number().int().min(1900).max(2200).optional().nullable(),
  harvestDate: z.string().date().optional().nullable().or(z.literal("")),
  productionDate: z.string().date().optional().nullable().or(z.literal("")),
  bottlingDate: z.string().date().optional().nullable().or(z.literal("")),
  bestBeforeDate: z.string().date().optional().nullable().or(z.literal("")),
  originCountryCode: country,
  oliveVariety: z.string().trim().max(200).optional().nullable(),
  organicStatus: z.string().trim().max(120).optional().nullable(),
  qualityData: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const adjustmentPayload = z.object({
  workspaceSlug: z.string().default("dona-anna"),
  productId: id,
  lotId: optionalId,
  warehouseId: id,
  ownerOrganizationId: optionalId,
  quantity: decimal,
  unitCost: optionalDecimal,
  currency: currency.default("EUR"),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().max(200).optional().nullable(),
});

const orderLinePayload = z.object({
  productId: id,
  lotId: optionalId,
  description: z.string().trim().max(1000).optional().nullable(),
  quantity: decimal,
  unit: z.string().trim().min(1).max(40),
  unitPrice: decimal,
  unitCost: optionalDecimal,
  discountPercent: optionalDecimal,
  taxRate: optionalDecimal,
});

const orderPayload = z.object({
  workspaceSlug: z.string().default("dona-anna"),
  brandId: optionalId,
  orderType: z.enum(["sale", "purchase", "intercompany_sale", "intercompany_purchase", "pos"]),
  sellerOrganizationId: optionalId,
  buyerOrganizationId: optionalId,
  partyId: optionalId,
  salesRepPartyId: optionalId,
  billingCustomerId: optionalId,
  warehouseId: optionalId,
  destinationWarehouseId: optionalId,
  posSessionId: optionalId,
  relatedOrderId: optionalId,
  intercompanyTransactionId: optionalId,
  salesChannel: z.enum(["admin", "website", "pos", "market", "b2b", "reseller", "family_reseller", "intercompany"]),
  orderedAt: z.string().datetime({ offset: true }).optional().nullable(),
  requestedDeliveryDate: z.string().date().optional().nullable().or(z.literal("")),
  currency: currency,
  commissionRuleId: optionalId,
  idempotencyKey: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  lines: z.array(orderLinePayload).min(1).max(100),
});

const orderActionPayload = z.object({
  orderId: id,
  action: z.enum(["confirm", "reserve", "fulfill", "payment", "cancel"]),
  amount: optionalDecimal,
  paymentDate: z.string().datetime({ offset: true }).optional().nullable(),
  method: z.enum(["cash", "card", "bank_transfer", "vipps", "stripe", "other"]).optional(),
  reference: z.string().trim().max(240).optional().nullable(),
  externalPaymentId: z.string().trim().max(240).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const fulfillmentLinePayload = z.object({
  orderLineId: id,
  lotId: optionalId,
  quantity: decimal,
});

const fulfillmentPayload = z.object({
  orderId: id,
  idempotencyKey: id,
  occurredAt: z.string().datetime({ offset: true }).optional().nullable(),
  reference: z.string().trim().max(240).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(fulfillmentLinePayload).min(1).max(100),
});

const posPayload = z.object({
  workspaceSlug: z.string().default("dona-anna"),
  action: z.enum(["open", "close"]),
  organizationId: optionalId,
  warehouseId: optionalId,
  sessionId: optionalId,
  openingCash: optionalDecimal,
  actualCash: optionalDecimal,
  notes: z.string().trim().max(1000).optional().nullable(),
});

const commissionRulePayload = z.object({
  id: optionalId,
  workspaceSlug: z.string().default("dona-anna"),
  organizationId: optionalId,
  name: z.string().trim().min(2).max(240),
  ruleType: z.enum(["revenue_percent", "margin_percent", "fixed"]),
  percentage: optionalDecimal,
  fixedAmount: optionalDecimal,
  currency: currency.optional().nullable().or(z.literal("")),
  payableEvent: z.enum(["fulfilled", "paid"]).default("paid"),
  appliesToChannel: z.string().trim().min(1).max(80).default("all"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const returnLinePayload = z.object({
  orderLineId: optionalId,
  productId: optionalId,
  lotId: optionalId,
  quantity: decimal,
  disposition: z.enum(["restock", "quarantine", "write_off", "supplier_return"]),
}).refine((line) => Boolean(line.orderLineId || line.productId), "Ordrelinje eller produkt mangler.");

const returnPayload = z.object({
  workspaceSlug: z.string().default("dona-anna"),
  orderId: optionalId,
  warehouseId: id,
  returnType: z.enum(["customer_return", "supplier_return"]).default("customer_return"),
  reason: z.string().trim().min(3).max(1000),
  refundAmount: optionalDecimal,
  currency: currency,
  lines: z.array(returnLinePayload).min(1).max(100),
});

const recallPayload = z.object({
  workspaceSlug: z.string().default("dona-anna"),
  lotId: id,
  status: z.enum(["draft", "open"]).default("open"),
  riskLevel: z.enum(["precautionary", "low", "medium", "high", "critical"]),
  reason: z.string().trim().min(3).max(1000),
  instructions: z.string().trim().max(4000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const landedCostPayload = z.object({
  workspaceSlug: z.string().default("dona-anna"),
  purchaseOrderId: id,
  costType: z.enum(["freight", "insurance", "customs", "brokerage", "packaging", "handling", "other"]),
  supplierPartyId: optionalId,
  amount: decimal,
  currency: currency,
  exchangeRate: optionalDecimal,
  allocationMethod: z.enum(["quantity", "value"]).default("quantity"),
  documentReference: z.string().trim().max(240).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const organizationLinkPayload = z.object({
  workspaceSlug: z.string().default("dona-anna"),
  brandId: optionalId,
  organizationId: id,
  role: z.enum(["holding", "producer", "importer", "seller", "service_provider"]),
  marketCountryCode: country,
  validFrom: z.string().date().optional().nullable().or(z.literal("")),
  validTo: z.string().date().optional().nullable().or(z.literal("")),
});

export const donaAnnaCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("upsert_product"), payload: productPayload }),
  z.object({ command: z.literal("upsert_price_list"), payload: priceListPayload }),
  z.object({ command: z.literal("set_price"), payload: pricePayload }),
  z.object({ command: z.literal("upsert_party"), payload: partyPayload }),
  z.object({ command: z.literal("upsert_warehouse"), payload: warehousePayload }),
  z.object({ command: z.literal("upsert_lot"), payload: lotPayload }),
  z.object({ command: z.literal("adjust_inventory"), payload: adjustmentPayload }),
  z.object({ command: z.literal("create_order"), payload: orderPayload }),
  z.object({ command: z.literal("order_action"), payload: orderActionPayload }),
  z.object({ command: z.literal("fulfill_order"), payload: fulfillmentPayload }),
  z.object({ command: z.literal("pos_action"), payload: posPayload }),
  z.object({ command: z.literal("upsert_commission_rule"), payload: commissionRulePayload }),
  z.object({ command: z.literal("create_return"), payload: returnPayload }),
  z.object({ command: z.literal("create_recall"), payload: recallPayload }),
  z.object({ command: z.literal("record_landed_cost"), payload: landedCostPayload }),
  z.object({ command: z.literal("link_organization"), payload: organizationLinkPayload }),
  z.object({ command: z.literal("create_invoice"), payload: z.object({ orderId: id }) }),
]);

export type DonaAnnaCommandInput = z.infer<typeof donaAnnaCommandSchema>;

export function validationMessage(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
}
