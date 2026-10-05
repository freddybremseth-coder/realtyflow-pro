import assert from "node:assert/strict";
import test from "node:test";
import { buildCorporateAccountAdvice } from "./corporate-account-advisor";
import { buildSalesCoachFallback } from "./corporate-sales-coach";

test("strategy engine separates fit, timing, access and intent and exposes stage exit criteria", () => {
  const advice = buildCorporateAccountAdvice({
    now: new Date("2026-10-05T12:00:00Z"),
    prospect: {
      id: "p1",
      company_name: "Example AS",
      employee_count: 120,
      fit_score: 84,
      evidence: { company_signal_research: { signals: { employee_benefits: true } } },
    },
    strategy: {
      stage: "MEETING",
      priority: "P2",
      objective: "Avklare behov og business case",
      entry_angle: "HR / People",
      primary_model: "Ansattfordel",
      problem_hypothesis: "Dagens ansattgoder skiller seg lite ut.",
      solution_hypothesis: "Corporate Home kan være en konkret fordel.",
      business_case: { users: 80, employeeWeeks: 30 },
    },
    contacts: [{
      id: "c1",
      title: "HR Director",
      buying_role: "HR",
      status: "VERIFIED",
      influence_level: "DECISION_MAKER",
      relationship_status: "ENGAGED",
      is_primary: true,
    }],
    touchpoints: [],
  });

  assert.equal(advice.primaryModel, "Ansattfordel");
  assert.equal(advice.stageGuidance.current, "MEETING");
  assert.equal(advice.stageGuidance.next, "BUSINESS_CASE");
  assert.ok(advice.stageGuidance.exitCriteria.length >= 2);
  assert.ok(advice.scores.fit >= 80);
  assert.ok(advice.scores.access > 50);
  assert.ok(advice.scores.intent > 10);
  assert.ok(advice.businessCaseCompleteness > 50);
});

test("sales coach fallback follows problem acceptance before solution acceptance", () => {
  const advisor = buildCorporateAccountAdvice({
    prospect: {
      id: "p2",
      company_name: "Example Partner",
      fit_score: 72,
      evidence: {},
    },
    strategy: {
      stage: "ENGAGED",
      primary_model: "Ansattfordel",
      problem_hypothesis: "Kunden trenger et mer synlig ansattgode.",
    },
  });

  const result = buildSalesCoachFallback({
    mode: "EMAIL",
    companyName: "Example Partner",
    companyContext: {},
    strategy: {
      primary_model: "Ansattfordel",
      problem_hypothesis: "Kunden trenger et mer synlig ansattgode.",
    },
    contacts: [],
    touchpoints: [],
    advisor,
    sourceText: "Dette er interessant, men vi er usikre på kostnad og om ansatte faktisk vil bruke det.",
  });

  assert.equal(result.currentPhase, "CONFIRM_PROBLEM");
  assert.ok(result.problem.questions.length >= 3);
  assert.ok(result.problem.acceptanceSignals.length >= 2);
  assert.ok(result.solution.acceptanceQuestions.length >= 2);
  assert.match(result.emailDraft.body, /Hei/);
  assert.ok(result.sellerCoach.avoid.some(item => /ikke/i.test(item)));
});
