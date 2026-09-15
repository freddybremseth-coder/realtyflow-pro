export type CommissionTruthSource = "explicit_amount" | "explicit_rate" | "unknown";

export type CommissionTruthInput = {
  pipeline_value?: number | string | null;
  sale_price?: number | string | null;
  commission_amount?: number | string | null;
  commission_percent?: number | string | null;
};

export type CommissionTruth = {
  transactionValue: number;
  commissionRevenue: number | null;
  commissionPercent: number | null;
  commissionKnown: boolean;
  source: CommissionTruthSource;
};

function numeric(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function deriveCommissionTruth(input: CommissionTruthInput): CommissionTruth {
  const transactionValue = Math.max(0, numeric(input.pipeline_value) || numeric(input.sale_price));
  const explicitAmount = Math.max(0, numeric(input.commission_amount));
  const suppliedPercent = numeric(input.commission_percent);
  const validPercent = suppliedPercent > 0 && suppliedPercent <= 100;

  if (explicitAmount > 0) {
    return {
      transactionValue,
      commissionRevenue: explicitAmount,
      commissionPercent: validPercent ? suppliedPercent : null,
      commissionKnown: true,
      source: "explicit_amount",
    };
  }

  if (validPercent && transactionValue > 0) {
    return {
      transactionValue,
      commissionRevenue: transactionValue * (suppliedPercent / 100),
      commissionPercent: suppliedPercent,
      commissionKnown: true,
      source: "explicit_rate",
    };
  }

  return {
    transactionValue,
    commissionRevenue: null,
    commissionPercent: validPercent ? suppliedPercent : null,
    commissionKnown: false,
    source: "unknown",
  };
}

export function commissionPriorityBonus(truth: CommissionTruth) {
  const revenue = truth.commissionRevenue || 0;
  if (revenue >= 50_000) return 18;
  if (revenue >= 30_000) return 14;
  if (revenue >= 15_000) return 10;
  if (revenue > 0) return 5;
  return 0;
}

export function commissionTruthReason(truth: CommissionTruth) {
  if (truth.source === "explicit_amount" && truth.commissionRevenue) {
    return `bekreftet provisjon €${Math.round(truth.commissionRevenue).toLocaleString("en-US")}`;
  }
  if (truth.source === "explicit_rate" && truth.commissionRevenue && truth.commissionPercent) {
    return `provisjon ${truth.commissionPercent}% = €${Math.round(truth.commissionRevenue).toLocaleString("en-US")}`;
  }
  return "provisjon ikke registrert";
}
