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
