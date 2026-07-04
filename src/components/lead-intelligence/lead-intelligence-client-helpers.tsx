"use client";

import type React from "react";
import { Input } from "@/components/ui/input";
import { LEAD_INTELLIGENCE_LIMITS, type ExtractedLead, type PhoneLookupNormalization } from "@/services/lead-intelligence/contracts";
import { criterionReviewFingerprint } from "@/services/lead-intelligence/review-shared";

export type CriterionType = "hard_requirement" | "preference" | "exclusion" | "missing_information";

export interface ReviewCriterionRow {
  id: string;
  fingerprint: string;
  criterionType: CriterionType;
  index: number;
  key: string;
  label: string;
  detail: string;
}

export function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function formatDateTime(value: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function generateClientCorrelationId() {
  const bytes = new Uint8Array(12);
  globalThis.crypto?.getRandomValues(bytes);
  const random = bytes.some(Boolean)
    ? Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
    : Math.random().toString(16).slice(2).padEnd(24, "0").slice(0, 24);
  return `rf_${Date.now().toString(36)}_${random}`;
}

export function listToText(values: string[]) {
  return values.join(", ");
}

export function textToList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,;]+/)
        .map((item) => normalizeKnownLocationAlias(item.trim()))
        .filter(Boolean),
    ),
  ).slice(0, LEAD_INTELLIGENCE_LIMITS.locations);
}

function normalizeKnownLocationAlias(value: string) {
  const folded = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (folded === "moreira") return "Moraira";
  if (folded === "moraira") return "Moraira";
  return value;
}

export function parseJsonEditor(value: string) {
  try {
    return { parsed: JSON.parse(value) as ExtractedLead, error: null };
  } catch (error) {
    return { parsed: null, error: error instanceof Error ? error.message : "Ugyldig JSON" };
  }
}

export function flattenReviewCriteria(lead: ExtractedLead | null): ReviewCriterionRow[] {
  if (!lead) return [];

  return [
    ...lead.hardRequirements.map((item, index) => {
      const fingerprint = criterionReviewFingerprint({
        criterionType: "hard_requirement",
        index,
        item,
      });
      return {
        id: fingerprint,
        fingerprint,
        criterionType: "hard_requirement" as const,
        index,
        key: item.key,
        label: "Absolutt krav",
        detail: item.sourceText,
      };
    }),
    ...lead.preferences.map((item, index) => {
      const fingerprint = criterionReviewFingerprint({
        criterionType: "preference",
        index,
        item,
      });
      return {
        id: fingerprint,
        fingerprint,
        criterionType: "preference" as const,
        index,
        key: item.key,
        label: "Sterkt ønske",
        detail: item.sourceText,
      };
    }),
    ...lead.exclusions.map((item, index) => {
      const fingerprint = criterionReviewFingerprint({
        criterionType: "exclusion",
        index,
        item,
      });
      return {
        id: fingerprint,
        fingerprint,
        criterionType: "exclusion" as const,
        index,
        key: item.key,
        label: "Avvisningskriterium",
        detail: item.sourceText,
      };
    }),
    ...lead.missingInformation.map((item, index) => {
      const fingerprint = criterionReviewFingerprint({
        criterionType: "missing_information",
        index,
        item,
      });
      return {
        id: fingerprint,
        fingerprint,
        criterionType: "missing_information" as const,
        index,
        key: item.key,
        label: "Manglende informasjon",
        detail: item.question,
      };
    }),
  ];
}

export function badgeForPhone(status: PhoneLookupNormalization["status"]) {
  switch (status) {
    case "verified_e164":
      return { label: "Verifisert E.164", variant: "success" as const };
    case "national":
      return { label: "Nasjonalt format", variant: "warning" as const };
    case "invalid":
      return { label: "Ugyldig telefon", variant: "destructive" as const };
    default:
      return { label: "Ingen telefon", variant: "secondary" as const };
  }
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium uppercase tracking-wide text-slate-500">{children}</label>;
}

export function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function JsonSection({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">{title}</h3>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-300">
        {prettyJson(value)}
      </pre>
    </div>
  );
}

const propertyReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export function parsePropertyReferences(value: string) {
  const references = value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = Array.from(new Map(references.map((reference) => [reference.toLowerCase(), reference])).values());

  if (references.length !== unique.length) {
    return { references: unique, error: "Eiendomsreferanser må være unike." };
  }

  if (unique.length > 20) {
    return { references: unique.slice(0, 20), error: "Maks 20 eiendomsreferanser kan forhåndsvises samtidig." };
  }

  const invalid = unique.find((reference) => !propertyReferencePattern.test(reference));
  if (invalid) {
    return { references: unique, error: `Ugyldig eiendomsreferanse: ${invalid}` };
  }

  return { references: unique, error: null };
}
