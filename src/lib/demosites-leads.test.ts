import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecommendedDemoSiteLeadPlay,
  buildDemoSiteAuditIssues,
  scoreDemoSiteLead,
  shouldQualifyLead,
} from "./demosites-leads";

test("DemoSites audit scoring qualifies weak local websites", () => {
  const issues = buildDemoSiteAuditIssues({
    isMobileFriendly: false,
    hasClearContact: false,
    hasCallToAction: false,
  });
  const score = scoreDemoSiteLead(issues);

  assert.equal(issues.length, 3);
  assert.ok(score <= 78);
  assert.equal(shouldQualifyLead(score, issues), true);
});

test("recommended DemoSites play prioritizes replied leads for session booking", () => {
  const play = buildRecommendedDemoSiteLeadPlay([
    {
      id: "queued-1",
      company_name: "Queued Firma",
      website_url: "https://queued.example",
      lead_status: "queued",
    },
    {
      id: "reply-1",
      company_name: "Svarte Rørlegger AS",
      lead_status: "responded",
      outreach_status: "replied",
      demo_preview_url: "https://realtyflow.test/demosites/preview/token",
      metadata: { last_audit_score: 64, issue_count: 4 },
    },
  ]);

  assert.ok(play);
  assert.equal(play.leadId, "reply-1");
  assert.equal(play.href, "/revenue-engine?lead=reply-1");
  assert.equal(play.priority, "CRITICAL");
  assert.match(play.primaryAction, /book/i);
  assert.match(play.reason, /replied|responded|demo/i);
});

test("recommended DemoSites play turns qualified audit findings into demo creation", () => {
  const play = buildRecommendedDemoSiteLeadPlay([
    {
      id: "qualified-1",
      company_name: "Gammel Nettside AS",
      website_url: "https://gammel.example",
      industry: "elektriker",
      lead_status: "qualified",
      outreach_status: "not_prepared",
      metadata: { last_audit_score: 58, issue_count: 5 },
    },
  ]);

  assert.ok(play);
  assert.equal(play.leadId, "qualified-1");
  assert.match(play.primaryAction, /DemoSite-preview/i);
  assert.match(play.reason, /audit-score 58/i);
});

test("recommended DemoSites play ignores closed or opted-out leads", () => {
  const play = buildRecommendedDemoSiteLeadPlay([
    {
      id: "closed-1",
      company_name: "Ferdig AS",
      lead_status: "converted",
    },
    {
      id: "opted-out-1",
      company_name: "Nei takk AS",
      lead_status: "queued",
      outreach_status: "opted_out",
    },
  ]);

  assert.equal(play, null);
});
