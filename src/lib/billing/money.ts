import type { BillingLineInput, BillingTotals } from "@/lib/billing/types";

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const ONE_MILLION = BigInt(1_000_000);
const POWERS_OF_TEN = Array.from({ length: 19 }, (_, index) => BigInt(10) ** BigInt(index));

export function parseDecimal(value: string | number, scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale >= POWERS_OF_TEN.length) {
    throw new Error("Unsupported decimal scale");
  }
  const input = String(value).trim().replace(",", ".");
  const match = input.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`Ugyldig desimaltall: ${input || "tom verdi"}`);
  const sign = match[1] === "-" ? -ONE : ONE;
  const whole = BigInt(match[2]);
  const fractionSource = match[3] || "";
  const kept = fractionSource.slice(0, scale).padEnd(scale, "0");
  let result = whole * POWERS_OF_TEN[scale] + BigInt(kept || "0");
  const discarded = fractionSource.slice(scale);
  if (discarded && discarded[0] >= "5") result += ONE;
  return result * sign;
}

export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= ZERO) throw new Error("Denominator must be positive");
  if (numerator < ZERO) return -roundHalfUp(-numerator, denominator);
  return (numerator + denominator / TWO) / denominator;
}

export function minorUnitsToDecimal(value: bigint, decimals = 2): string {
  const sign = value < ZERO ? "-" : "";
  const absolute = value < ZERO ? -value : value;
  const factor = POWERS_OF_TEN[decimals];
  const whole = absolute / factor;
  const fraction = (absolute % factor).toString().padStart(decimals, "0");
  return decimals ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

export function decimalToMinorUnits(value: string | number) {
  return parseDecimal(value, 2);
}

export function calculateBillingTotals(lines: BillingLineInput[]): BillingTotals {
  let subtotal = ZERO;
  let discounts = ZERO;
  let net = ZERO;
  let tax = ZERO;
  let total = ZERO;
  const calculatedLines = lines.map((line) => {
    const quantity = parseDecimal(line.quantity, 4);
    const unitPrice = parseDecimal(line.unitPrice, 4);
    const discountPercent = parseDecimal(line.discountPercent || "0", 4);
    const taxRate = parseDecimal(line.taxRate || "0", 4);
    if (quantity <= ZERO) throw new Error("Antall må være større enn 0");
    if (unitPrice < ZERO) throw new Error("Enhetspris kan ikke være negativ");
    if (discountPercent < ZERO || discountPercent > ONE_MILLION) throw new Error("Rabatt må være mellom 0 og 100 %");
    if (taxRate < ZERO || taxRate > ONE_MILLION) throw new Error("Avgift må være mellom 0 og 100 %");

    // quantity(4) * unit price(4) -> cents (2)
    const lineSubtotal = roundHalfUp(quantity * unitPrice, ONE_MILLION);
    const lineDiscount = roundHalfUp(lineSubtotal * discountPercent, ONE_MILLION);
    const lineNet = lineSubtotal - lineDiscount;
    const lineTax = roundHalfUp(lineNet * taxRate, ONE_MILLION);
    const lineTotal = lineNet + lineTax;

    subtotal += lineSubtotal;
    discounts += lineDiscount;
    net += lineNet;
    tax += lineTax;
    total += lineTotal;
    return {
      subtotal: minorUnitsToDecimal(lineSubtotal),
      discount: minorUnitsToDecimal(lineDiscount),
      net: minorUnitsToDecimal(lineNet),
      tax: minorUnitsToDecimal(lineTax),
      total: minorUnitsToDecimal(lineTotal),
    };
  });

  return {
    subtotal: minorUnitsToDecimal(subtotal),
    discountTotal: minorUnitsToDecimal(discounts),
    netTotal: minorUnitsToDecimal(net),
    taxTotal: minorUnitsToDecimal(tax),
    total: minorUnitsToDecimal(total),
    lines: calculatedLines,
  };
}

export function addDecimalAmounts(values: Array<string | number>) {
  return minorUnitsToDecimal(values.reduce((sum, value) => sum + decimalToMinorUnits(value), ZERO));
}

export function formatBillingCurrency(value: string | number, currency: string, locale = "nb-NO") {
  const amount = Number(String(value).replace(",", "."));
  if (!Number.isFinite(amount)) return `— ${currency}`;
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}
