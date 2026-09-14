import assert from "node:assert/strict";
import test from "node:test";
import { decideGrowthScaling } from "./growth-scaling";

const ready = {
  active: true, connectedChannels: 2, pilotReadyChannels: 2, readySources: 60, blockedSources: 0,
  published30d: 12, eligibleObservations: 10, evaluatedRules: 2, actionableRules: 1,
  quarantined: 0, leads: 4, qualified: 1, sales: 0, attributionCoveragePercent: 80,
};

test("opens scale only with learning and canonical revenue evidence", () => {
  const result = decideGrowthScaling(ready);
  assert.equal(result.stage, "SCALE");
  assert.equal(result.canScale, true);
  assert.match(result.nextAction, /én ny kontrollert canary/i);
});

test("keeps a learning-ready brand in prove when sales throughput is not attributable", () => {
  const result = decideGrowthScaling({ ...ready, leads: 1, qualified: 0, attributionCoveragePercent: 40 });
  assert.equal(result.stage, "PROVE");
  assert.equal(result.canScale, false);
  assert.match(result.nextAction, /attribuerte leads/i);
});

test("quarantined data always forces hold and caps the score", () => {
  const result = decideGrowthScaling({ ...ready, quarantined: 2, sales: 3 });
  assert.equal(result.stage, "HOLD");
  assert.ok(result.score <= 39);
  assert.ok(result.blockers.some((value) => /karantene/i.test(value)));
});

test("a connected brand without enough verified supply remains foundation", () => {
  const result = decideGrowthScaling({ ...ready, readySources: 3, published30d: 0, eligibleObservations: 0, evaluatedRules: 0, leads: 0, qualified: 0 });
  assert.equal(result.stage, "FOUNDATION");
  assert.match(result.nextAction, /verifiserte/i);
});
