import assert from "node:assert/strict";
import test from "node:test";
import { buildCorporateAccountAdvice } from "./corporate-account-advisor";
import { evaluateCorporateStageGate } from "./corporate-sales-stage-gate";

test("ENGAGED cannot advance until problem acceptance is explicitly confirmed with evidence", () => {
  const advisor = buildCorporateAccountAdvice({
    prospect: { id: "p1", company_name: "Example AS", fit_score: 82, evidence: {} },
    strategy: { stage: "ENGAGED", primary_model: "Ansattfordel", problem_hypothesis: "Behov" },
  });

  const blocked = evaluateCorporateStageGate({
    advisor,
    strategy: { stage: "ENGAGED", problem_acceptance_status: "UNKNOWN" },
  });
  assert.equal(blocked.readyToAdvance, false);

  const ready = evaluateCorporateStageGate({
    advisor,
    strategy: {
      stage: "ENGAGED",
      problem_acceptance_status: "CONFIRMED",
      problem_acceptance_evidence: "HR bekreftet konsekvens og behov i møtet.",
    },
  });
  assert.equal(ready.readyToAdvance, true);
  assert.equal(ready.nextStage, "MEETING");
});

test("OUTREACH requires completed human contact and a logged outcome", () => {
  const advisor = buildCorporateAccountAdvice({
    prospect: { id: "p2", company_name: "Example AS", fit_score: 70, evidence: {} },
    strategy: { stage: "OUTREACH" },
  });

  const gate = evaluateCorporateStageGate({
    advisor,
    strategy: { stage: "OUTREACH" },
    touchpoints: [{ status: "COMPLETED", channel: "EMAIL", summary: "Svar mottatt og loggført." }],
  });

  assert.equal(gate.readyToAdvance, true);
  assert.equal(gate.completionPercent, 100);
});
