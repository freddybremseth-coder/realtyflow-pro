import { z } from "zod";
import { BILLING_DOCUMENT_TYPES } from "@/lib/billing/types";

const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);
const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const decimal = z.union([z.string(), z.number()]).transform((value) => String(value).trim().replace(",", "."));

export const organizationInputSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  legalName: z.string().trim().min(2).max(200),
  tradingName: optionalText(200),
  countryCode,
  registrationNumber: optionalText(80),
  vatNumber: optionalText(80),
  addressLine1: optionalText(240),
  addressLine2: optionalText(240),
  postalCode: optionalText(40),
  city: optionalText(120),
  region: optionalText(120),
  defaultCurrency: currencyCode,
  defaultLanguage: z.enum(["no", "en", "es"]).default("no"),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: optionalText(60),
  website: optionalText(240),
  iban: optionalText(80),
  bic: optionalText(40),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(14),
  invoiceFooter: optionalText(2000),
});

export const customerInputSchema = z.object({
  organizationId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(200),
  customerType: z.enum(["private", "business", "public"]).default("business"),
  organizationNumber: optionalText(80),
  vatNumber: optionalText(80),
  billingAddressLine1: optionalText(240),
  billingAddressLine2: optionalText(240),
  billingPostalCode: optionalText(40),
  billingCity: optionalText(120),
  billingRegion: optionalText(120),
  countryCode,
  language: z.enum(["no", "en", "es"]).default("no"),
  currency: currencyCode,
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: optionalText(60),
  contactPerson: optionalText(160),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
  notes: optionalText(4000),
});

export const productInputSchema = z.object({
  organizationId: z.string().uuid(),
  id: z.string().uuid().optional(),
  sku: optionalText(80),
  name: z.string().trim().min(2).max(200),
  description: optionalText(2000),
  supplyType: z.enum(["goods", "service"]).default("service"),
  unit: z.string().trim().min(1).max(30).default("stk"),
  unitPrice: decimal,
  currency: currencyCode,
  defaultTaxRuleId: z.string().uuid().optional().nullable().or(z.literal("")),
});

export const billingLineInputSchema = z.object({
  productId: z.string().uuid().optional().nullable().or(z.literal("")),
  description: z.string().trim().min(1).max(2000),
  quantity: decimal,
  unit: z.string().trim().min(1).max(30),
  unitPrice: decimal,
  discountPercent: decimal.default("0"),
  taxRuleId: z.string().uuid().optional().nullable().or(z.literal("")),
  taxRate: decimal.default("0"),
  taxLabel: optionalText(120),
  legalText: optionalText(1000),
});

export const saveDocumentSchema = z.object({
  organizationId: z.string().uuid(),
  documentId: z.string().uuid().optional().nullable(),
  documentType: z.enum(BILLING_DOCUMENT_TYPES),
  customerId: z.string().uuid(),
  payload: z.object({
    originalDocumentId: z.string().uuid().optional().nullable().or(z.literal("")),
    issueDate: optionalText(10),
    deliveryDate: optionalText(10),
    dueDate: optionalText(10),
    validUntil: optionalText(10),
    currency: currencyCode,
    accountingCurrency: currencyCode,
    exchangeRate: decimal.default("1"),
    exchangeRateDate: optionalText(10),
    exchangeRateSource: optionalText(120),
    customerReference: optionalText(240),
    projectReference: optionalText(240),
    orderReference: optionalText(240),
    contractReference: optionalText(240),
    paymentTerms: optionalText(2000),
    notes: optionalText(4000),
    rectificationReason: optionalText(2000),
  }),
  lines: z.array(billingLineInputSchema).min(1).max(250),
});

export const paymentInputSchema = z.object({
  amount: decimal,
  paymentDate: z.string().date(),
  currency: currencyCode,
  method: z.enum(["bank_transfer", "card", "cash", "other"]),
  reference: optionalText(240),
  notes: optionalText(2000),
});

export function validationMessage(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".") || "data"}: ${issue.message}`).join(" · ");
}
