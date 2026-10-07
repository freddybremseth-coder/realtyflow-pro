import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCorporateDecisionCalculator,
  buildCorporateDecisionNoteReport,
  corporateDecisionStopReason,
} from "@/lib/corporate-decision-note";

test("Corporate decision calculator recalculates trusted server totals", () => {
  const result = buildCorporateDecisionCalculator({
    propertyPrice: 450000,
    users: 50,
    employeeWeeks: 30,
    annualOperating: 12000,
    acquisitionPct: 12,
    capitalPct: 4,
    valuePct: 3,
    holdingYears: 10,
    // Client-derived values must never be trusted.
    annualCostBeforeValue: 1,
    hotelAlternativeAnnual: 1,
    estimatedFutureValue: 1,
    stays: [
      { name: "Ledersamling", eventsPerYear: 2, people: 8, nights: 3, pricePerPersonNight: 180 },
      { name: "Avdelingsreise", eventsPerYear: 3, people: 10, nights: 4, pricePerPersonNight: 160 },
      { name: "Styresamling", eventsPerYear: 2, people: 6, nights: 3, pricePerPersonNight: 180 },
    ],
  });

  assert.ok(result);
  assert.equal(result.acquisition_cost_eur, 54000);
  assert.equal(result.capital_base_eur, 504000);
  assert.equal(result.annual_capital_cost_eur, 20160);
  assert.equal(result.annualized_acquisition_cost_eur, 5400);
  assert.equal(result.annual_cost_before_value_eur, 37560);
  assert.equal(result.business_stay_count, 7);
  assert.equal(result.participant_nights, 204);
  assert.equal(result.hotel_alternative_annual_eur, 34320);
  assert.equal(result.cost_per_employee_week_eur, 1252);
  assert.ok(Math.abs(result.estimated_future_value_eur - 604762.37) < 1);
});

test("Decision report keeps scenario and hotel alternative framed as assumptions", () => {
  const report = buildCorporateDecisionNoteReport({
    companyName: "Eksempel AS",
    contactName: "Kari Nordmann",
    model: "Ansattbolig / bedriftshytte",
    budgetLabel: "€300 000–€500 000",
    timeline: "3–12 måneder",
    calculatorContext: {
      propertyPrice: 450000,
      users: 50,
      employeeWeeks: 30,
      annualOperating: 12000,
      acquisitionPct: 12,
      capitalPct: 4,
      valuePct: 5,
      holdingYears: 10,
      stays: [],
    },
    now: new Date("2026-10-07T09:00:00.000Z"),
  });

  assert.match(report.executive_summary, /ikke behandlet som en automatisk besparelse/i);
  assert.match(report.executive_summary, /scenario/i);
  assert.match(report.disclaimer, /ikke investerings-/i);
  assert.equal(report.company_name, "Eksempel AS");
  assert.equal(report.calculator?.value_pct, 5);
});

test("Decision-note follow-up stops on reply, booking, suppression or sales progression", () => {
  const reportSentAt = "2026-10-07T09:00:00.000Z";

  assert.equal(corporateDecisionStopReason({
    reportSentAt,
    lastInboundReplyAt: "2026-10-08T08:00:00.000Z",
  }), "customer_replied");

  assert.equal(corporateDecisionStopReason({
    reportSentAt,
    interactions: [{ type: "meeting", date: "2026-10-09T08:00:00.000Z" }],
  }), "meeting_booked");

  assert.equal(corporateDecisionStopReason({
    reportSentAt,
    emailSuppressed: true,
  }), "email_suppressed");

  assert.equal(corporateDecisionStopReason({
    reportSentAt,
    pipelineStatus: "MATCHING",
  }), "pipeline_matching");

  assert.equal(corporateDecisionStopReason({
    reportSentAt,
    pipelineStatus: "NEW",
    interactions: [],
  }), null);
});
