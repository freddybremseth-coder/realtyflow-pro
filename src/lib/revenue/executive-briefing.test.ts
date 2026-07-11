import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutiveBriefing, type ExecutiveBriefingInput } from "./executive-briefing";

function baseInput(overrides: Partial<ExecutiveBriefingInput> = {}): ExecutiveBriefingInput {
  const now = new Date("2026-07-12T07:00:00.000Z");
  return {
    role: "OWNER",
    userEmail: "owner@example.com",
    now,
    command: {
      generatedAt: now.toISOString(),
      headline: "Test",
      summary: {
        criticalActions: 0, highActions: 0, activeDeals: 2, forecast30Commission: 0,
        forecast90Commission: 0, overdueCommission: 12000, readyToInvoiceCommission: 3000,
        monthlyRecurringRevenue: 500, annualRecurringRevenue: 6000,
        potentialAnnualRecurringRevenue: 12000, recoverNow: 0, recoveryValue: 0,
        approvalReady: 0, closingHighRisk: 1, afterSalesDue: 0, dataQualityScore: 90,
      },
      workstreams: [],
      topActions: [],
      warnings: [],
      safety: { readOnly: true, automaticSending: false, automaticApproval: false, automaticPipelineChanges: false },
    },
    goals: {
      generatedAt: now.toISOString(),
      configured: true,
      config: {
        scope: "all", periodStart: "2026-07-01", commissionTargetEur: 20000,
        closedDealsTarget: 4, keyholdingMrrTargetEur: 1000, keyholdingContractsTarget: 4,
        recoveredLeadsTarget: 3, notes: null, updatedAt: now.toISOString(),
      },
      period: { start: "2026-07-01", end: "2026-08-01", elapsedPercent: 38, daysRemaining: 19, weeksRemaining: 3 },
      headline: "Test",
      summary: {
        earnedCommission: 5000, collectedCommission: 3000, forecast30Commission: 8000,
        wonDeals: 1, currentKeyholdingMrr: 500, currentKeyholdingArr: 6000,
        newKeyholdingContracts: 1, recoveredLeads: 0, overdueCommission: 12000,
        highRiskClosings: 1, approvalReady: 0, dataQualityScore: 90,
      },
      metrics: [
        { id: "commission", label: "Opptjent provisjon", unit: "EUR", target: 20000, actual: 5000, projected: 12000, progressPercent: 25, expectedPace: 7600, gap: 15000, status: "BEHIND", detail: "Bak plan" },
        { id: "deals", label: "Vunne salg", unit: "COUNT", target: 4, actual: 1, projected: 3, progressPercent: 25, expectedPace: 1.52, gap: 3, status: "AT_RISK", detail: "Krever oppmerksomhet" },
        { id: "keyholding-mrr", label: "Keyholding MRR", unit: "EUR", target: 1000, actual: 500, projected: 700, progressPercent: 50, expectedPace: 380, gap: 500, status: "ON_TRACK", detail: "På plan" },
      ],
      weeklyPlan: [], warnings: [], assumptions: [],
      safety: { goalsAreUserDefined: true, automaticActions: false, automaticSending: false },
    },
    alerts: {
      generatedAt: now.toISOString(),
      alerts: [], active: [], acknowledged: [],
      summary: { total: 0, active: 0, acknowledged: 0, critical: 0, high: 0, immediate: 0, unassigned: 0, overdue: 0, byCategory: { TEAM: 0, CLOSING: 0, FINANCE: 0, KEYHOLDING: 0, EXECUTION: 0 } },
      warnings: [],
    },
    execution: {
      generatedAt: now.toISOString(),
      summary: { total: 0, overdue: 0, today: 0, thisWeek: 0, unscheduled: 0, critical: 0, contacts: 0, workItems: 0 },
      days: [], items: [], warnings: [],
      safety: { automaticTaskCreation: false, automaticCalendarCreation: false, automaticCustomerContact: false, explicitConfirmationRequired: true },
    },
    team: {
      generatedAt: now.toISOString(), members: [], items: [], unassigned: [],
      summary: { members: 2, assignedContacts: 0, assignedTasks: 0, unassignedContacts: 0, unassignedTasks: 0, overdue: 0, critical: 0 },
      warnings: [],
    },
    calendarEvents: [], calendarConfigured: false, calendarWarning: "Google Calendar er ikke konfigurert.",
    warnings: [],
    ...overrides,
  } as ExecutiveBriefingInput;
}

function alert(category: "FINANCE" | "CLOSING" | "TEAM" = "FINANCE") {
  return {
    id: `alert-${category}`, ruleId: category === "FINANCE" ? "COMMISSION_OVERDUE" : "CLOSING_HIGH_RISK",
    fingerprint: "abc", category, severity: "CRITICAL", escalation: "IMMEDIATE", score: 98,
    title: category === "FINANCE" ? "Forfalt provisjon" : "Closing-risiko", detail: "Krever handling",
    reason: "Fristen er passert", recommendedAction: "Gjennomgå saken i dag.", brandId: "soleada",
    resourceType: "contact", resourceId: "contact-1", contactId: "contact-1", ownerEmail: null,
    ownerName: null, dueAt: "2026-07-11T10:00:00.000Z", amountEur: 12000,
    href: category === "FINANCE" ? "/commissions" : "/closing", acknowledged: false,
    acknowledgedAt: null, acknowledgedBy: null, acknowledgementNote: null,
  } as const;
}

test("finance role sees finance decisions while sales role does not", () => {
  const financeAlert = alert("FINANCE");
  const finance = buildExecutiveBriefing(baseInput({
    role: "FINANCE",
    alerts: { ...baseInput().alerts, alerts: [financeAlert], active: [financeAlert], summary: { ...baseInput().alerts.summary, total: 1, active: 1, critical: 1 } },
  }));
  assert.equal(finance.summary.overdueCommission, 12000);
  assert.ok(finance.decisions.some((item) => item.source === "FINANCE"));

  const sales = buildExecutiveBriefing(baseInput({
    role: "SALES",
    alerts: { ...baseInput().alerts, alerts: [financeAlert], active: [financeAlert], summary: { ...baseInput().alerts.summary, total: 1, active: 1, critical: 1 } },
  }));
  assert.equal(sales.summary.overdueCommission, null);
  assert.ok(!sales.decisions.some((item) => item.source === "FINANCE"));
  assert.ok(!sales.goals.some((item) => item.id === "commission"));
});

test("critical alert controls state and is preferred over duplicate command action", () => {
  const financeAlert = alert("FINANCE");
  const input = baseInput({
    alerts: { ...baseInput().alerts, alerts: [financeAlert], active: [financeAlert], summary: { ...baseInput().alerts.summary, total: 1, active: 1, critical: 1 } },
    command: {
      ...baseInput().command,
      topActions: [{
        id: "commission-contact-1", source: "commissions", priority: "HIGH", score: 80,
        title: "Provisjon krever handling", subject: "Kunde 1", description: "Følg opp",
        value: 12000, href: "/commissions", contactId: "contact-1",
      }],
    },
  });
  const result = buildExecutiveBriefing(input);
  assert.equal(result.state, "CRITICAL");
  assert.equal(result.decisions.filter((item) => item.contactId === "contact-1" && item.source === "FINANCE").length, 1);
  assert.match(result.headline, /Start med/);
});

test("calendar includes only events on the current Madrid date", () => {
  const result = buildExecutiveBriefing(baseInput({
    role: "OWNER",
    calendarConfigured: true,
    calendarWarning: null,
    calendarEvents: [
      { id: "today", title: "Visning", start: "2026-07-12T10:00:00+02:00", end: "2026-07-12T11:00:00+02:00", allDay: false, location: "Albir", href: null },
      { id: "tomorrow", title: "Closing", start: "2026-07-13T10:00:00+02:00", end: null, allDay: false, location: null, href: null },
    ],
  }));
  assert.equal(result.agenda.length, 1);
  assert.equal(result.agenda[0].id, "today");
  assert.equal(result.summary.calendarToday, 1);
});

test("overdue execution becomes a high-priority decision", () => {
  const input = baseInput();
  input.execution = {
    ...input.execution,
    summary: { ...input.execution.summary, total: 1, overdue: 1, critical: 1 },
    items: [{
      id: "task:1", kind: "WORK_ITEM", sourceId: "1", contactId: null, workItemId: "1",
      brandId: "soleada", title: "Ring advokat", detail: "Frist passert", dueDate: "2026-07-11",
      urgency: "OVERDUE", priority: "CRITICAL", score: 95, status: "TO_DO", customerHref: null,
      workspaceHref: "/execution", canCreateTask: false, canScheduleFollowup: false, canCompleteTask: true,
      calendar: { title: "Ring advokat", description: "Test", durationMinutes: 30 },
    }],
  };
  const result = buildExecutiveBriefing(input);
  assert.equal(result.summary.overdueExecution, 1);
  assert.ok(result.decisions.some((item) => item.source === "EXECUTION" && item.severity === "CRITICAL"));
});

test("calendar failure is a warning and does not block the briefing", () => {
  const result = buildExecutiveBriefing(baseInput());
  assert.equal(result.dataSources.find((source) => source.id === "calendar")?.available, false);
  assert.ok(result.warnings.some((warning) => warning.includes("Calendar")));
  assert.ok(result.decisions.some((item) => item.source === "GOALS"));
});
