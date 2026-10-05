import assert from "node:assert/strict";
import test from "node:test";
import {
  detectCorporateCompanySignals,
  signalEvidencePatch,
} from "@/lib/corporate-company-signals";

test("Corporate company signals detect strong Norwegian B2B signals", () => {
  const signals = detectCorporateCompanySignals(
    "Vi tilbyr ansattgoder, hybridarbeid, årlig kickoff og tilgang til firmahytte for våre ansatte.",
    "https://example.no/karriere",
    "2026-09-27T08:00:00.000Z",
  );

  assert.ok(signals.employee_benefit_signal);
  assert.ok(signals.remote_workforce_signal);
  assert.ok(signals.retreat_signal);
  assert.ok(signals.existing_cabin_signal);
  assert.equal(signals.employee_benefit_signal?.source_url, "https://example.no/karriere");
});

test("Corporate company signals detect English workforce signals", () => {
  const signals = detectCorporateCompanySignals(
    "Our employee benefits include flexible hybrid work and an annual company retreat.",
    "https://example.com/careers",
  );

  assert.ok(signals.employee_benefit_signal);
  assert.ok(signals.remote_workforce_signal);
  assert.ok(signals.retreat_signal);
});

test("Generic company marketing copy does not become a buying signal", () => {
  const signals = detectCorporateCompanySignals(
    "We deliver professional consulting services to customers across Norway and Europe.",
    "https://example.no",
  );
  assert.deepEqual(signals, {});
});

test("Signal evidence patch stores company-level evidence only", () => {
  const research = {
    website_url: "https://example.no/",
    checked_at: "2026-09-27T08:00:00.000Z",
    pages_checked: ["https://example.no/"],
    signals: detectCorporateCompanySignals("Vi tilbyr ansattgoder og hybridarbeid.", "https://example.no/"),
    warnings: [],
    personal_data_collected: false as const,
  };
  const patch = signalEvidencePatch(research);
  assert.equal(patch.employee_benefit_signal, "https://example.no/");
  assert.equal(patch.remote_workforce_signal, "https://example.no/");
  assert.equal((patch.company_signal_research as any).personal_data_collected, false);
  assert.equal("email" in patch, false);
  assert.equal("phone" in patch, false);
});


test("Corporate company signals detect growth, financial and negative timing signals", () => {
  const signals = detectCorporateCompanySignals(
    "Vi vokser og rekrutterer. Selskapet åpner nytt kontor etter rekordomsetning. Samtidig varsles kostnadskutt og omorganisering.",
    "https://example.no/nyheter",
  );
  assert.ok(signals.hiring_growth_signal);
  assert.ok(signals.new_office_signal);
  assert.ok(signals.financial_strength_signal);
  assert.ok(signals.cost_cutting_signal);
  assert.ok(signals.restructuring_signal);
});

test("PDF evidence keeps its source kind", () => {
  const signals = detectCorporateCompanySignals(
    "Annual report: record revenue and international expansion.",
    "https://example.no/annual-report.pdf",
    "2026-10-05T20:00:00.000Z",
    "company_pdf",
  );
  assert.equal(signals.financial_strength_signal?.source_kind, "company_pdf");
  assert.equal(signals.international_growth_signal?.source_kind, "company_pdf");
});
