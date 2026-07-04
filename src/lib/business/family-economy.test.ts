import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeFamilyEconomyRows } from "@/lib/business/family-economy";

test("Family economy summary groups months and ignores future rows", () => {
  const summary = summarizeFamilyEconomyRows([
    { month: "2026-01-01", olivia_net_nok: -10, realtyflow_net_nok: 110, mondeo_interest_nok: 0 },
    { month: "2026-01-01", olivia_net_nok: -5, realtyflow_net_nok: 55, mondeo_interest_nok: 0 },
    { month: "2026-07-01", olivia_net_nok: 0, realtyflow_net_nok: 0, mondeo_interest_nok: 12_500 },
    { month: "2026-08-01", olivia_net_nok: 0, realtyflow_net_nok: 531_300, mondeo_interest_nok: 0 },
    { month: "2027-06-01", olivia_net_nok: 0, realtyflow_net_nok: 369_600, mondeo_interest_nok: 0 },
  ], new Date(Date.UTC(2026, 6, 4)));

  assert.equal(summary.currentMonth, "2026-07");
  assert.equal(summary.metrics.months, 2);
  assert.equal(summary.latestDate, "2026-07-01");
  assert.equal(summary.ignoredFutureRows, 2);
  assert.equal(summary.metrics.lastMonthTotal, 12_500);
  assert.equal(summary.metrics.ytdTotal, 12_650);
  assert.equal(summary.metrics.oliviaNet, -15);
  assert.equal(summary.metrics.realtyflowNet, 165);
  assert.equal(summary.metrics.mondeoInterest, 12_500);
});
