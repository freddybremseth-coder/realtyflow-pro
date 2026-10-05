import assert from "node:assert/strict";
import test from "node:test";
import { buildCorporateAccountAdvice, rankCorporateAccountAdvice } from "./corporate-account-advisor";

test("advisor prioritizes a documented account with strategy, decision maker and overdue action", () => {
  const advice = buildCorporateAccountAdvice({
    now: new Date("2026-10-04T20:00:00Z"),
    prospect: {
      id: "p1",
      company_name: "Nordic Growth AS",
      organization_type: "company",
      industry: "Technology",
      employee_count: 120,
      fit_score: 86,
      fit_tier: "A",
      evidence: {
        company_signal_research: { signals: { employee_benefits: true } },
        generic_company_contact: { generic_email: "company@example.test" },
      },
    },
    strategy: {
      stage: "OUTREACH",
      priority: "P1",
      objective: "Få discovery-møte",
      entry_angle: "Ansattfordel",
      account_models: ["Ansattfordel"],
    },
    contacts: [{
      id: "c1",
      name: "Test Person",
      title: "HR Director",
      buying_role: "HR",
      status: "VERIFIED",
      is_primary: true,
      influence_level: "DECISION_MAKER",
      relationship_status: "CONNECTED",
    }],
    touchpoints: [{
      id: "t1",
      channel: "EMAIL",
      activity_type: "EMAIL_INTRO",
      status: "PLANNED",
      due_at: "2026-10-03T10:00:00Z",
    }],
  });

  assert.equal(advice.priority, "P1");
  assert.ok(advice.score >= 70);
  assert.match(advice.nextAction, /forfalt/i);
  assert.equal(advice.recommendedEntryRole, "HR / People");
  assert.equal(advice.channelSequence[0].channel, "LINKEDIN");
});

test("advisor tells a member organization to use a member/partner model before outreach", () => {
  const advice = buildCorporateAccountAdvice({
    prospect: {
      id: "p2",
      company_name: "Norsk Forening",
      organization_type: "member_organization",
      member_count: 5000,
      fit_score: 70,
      fit_tier: "B",
      evidence: {},
    },
    contacts: [],
    touchpoints: [],
  });

  assert.ok(advice.recommendedModels.includes("Medlemsfordel"));
  assert.equal(advice.recommendedEntryRole, "Partnerskap / medlemsansvarlig");
  assert.match(advice.nextAction, /Definer mål og inngang/i);
  assert.ok(advice.missing.includes("Beslutningstaker"));
});

test("ranking puts P1 ahead of P2 and P3", () => {
  const base = (id: string, company_name: string, priority: "P1"|"P2"|"P3") =>
    buildCorporateAccountAdvice({
      prospect: { id, company_name, fit_score: 60, evidence: {} },
      strategy: { priority },
    });
  const ranked = rankCorporateAccountAdvice([
    base("3","C","P3"), base("1","A","P1"), base("2","B","P2"),
  ]);
  assert.deepEqual(ranked.map(item => item.priority), ["P1","P2","P3"]);
});


test("documented inbound Corporate replies increase observed intent and timing without moving stage", () => {
  const advice = buildCorporateAccountAdvice({
    now: new Date("2026-10-05T19:00:00Z"),
    prospect: {
      id: "p-reply",
      company_name: "Reply AS",
      fit_score: 70,
      evidence: {},
      status: "RESEARCHED",
    },
    strategy: {
      stage: "OUTREACH",
      objective: "Avklare relevans",
      entry_angle: "HR",
    },
    emails: [
      { direction: "outbound", received_at: "2026-10-04T10:00:00Z" },
      { direction: "inbound", received_at: "2026-10-05T10:00:00Z", ai_intent: "interested" },
    ],
  });

  assert.equal(advice.stage, "OUTREACH");
  assert.ok(advice.scores.intent > 10);
  assert.ok(advice.scores.timing > 20);
  assert.ok(advice.whyNow.some(item => /innkommende e-postsvar/i.test(item)));
});
