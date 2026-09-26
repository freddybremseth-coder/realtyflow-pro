import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUnifiedGrowthScoreReport, unifiedScoreIndex } from "./unified-growth-score";

describe("Unified Growth Score", () => {
  it("keeps canonical brand revenue separate from channel attribution", () => {
    const report = buildUnifiedGrowthScoreReport({
      days: 30,
      since: "2026-09-01T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
      metricRows: [{
        brand_id: "zeneco",
        content_id: "content-1",
        channel: "facebook",
        metrics: { impressions: 1000, clicks: 20, shares: 4 },
      }],
      revenueRows: [
        { event_type: "lead_created", brand_id: "zeneco", contact_id: "c1" },
        { event_type: "qualified", brand_id: "zeneco", contact_id: "c1" },
        { event_type: "deal_won", brand_id: "zeneco", contact_id: "c1" },
        { event_type: "commission_paid", brand_id: "zeneco", contact_id: "c1", revenue_impact_eur: 5000 },
      ],
      touchpointRows: [{
        brand_id: "zeneco",
        content_id: "content-1",
        channel: "facebook",
        contact_id: "c1",
        touch_type: "lead_created",
      }],
    });

    assert.equal(report.brands[0].funnel.leads, 1);
    assert.equal(report.brands[0].funnel.sales, 1);
    assert.equal(report.brands[0].funnel.commissionEur, 5000);
    assert.equal(report.channels[0].funnel.leads, 1);
    assert.equal(report.channels[0].funnel.sales, 0);
    assert.equal(report.brands[0].revenueMode, "canonical_brand");
    assert.equal(report.channels[0].revenueMode, "attributed_only");
    assert.equal(report.brands[0].attributionCoveragePct, 100);
  });

  it("does not invent attribution when no touchpoint exists", () => {
    const report = buildUnifiedGrowthScoreReport({
      days: 30,
      since: "2026-09-01T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
      metricRows: [{
        brand_id: "pinosoecolife",
        content_id: "p1",
        channel: "instagram",
        metrics: { views: 2000, saves: 10 },
      }],
      revenueRows: [{ event_type: "lead_created", brand_id: "pinosoecolife", contact_id: "lead-1" }],
      touchpointRows: [],
    });
    assert.equal(report.brands[0].funnel.leads, 1);
    assert.equal(report.channels[0].funnel.leads, 0);
    assert.equal(report.diagnostics.portfolioAttributionCoveragePct, 0);
  });

  it("normalizes raw business value to a bounded 0-100 index", () => {
    assert.equal(unifiedScoreIndex(0), 0);
    assert.ok(unifiedScoreIndex(100) > unifiedScoreIndex(10));
    assert.ok(unifiedScoreIndex(1000000) <= 100);
  });
});
