import assert from "node:assert/strict";
import { test } from "node:test";
import { HOME_ROUTE_FALLBACK, homeRouteForRole } from "@/lib/home-route";

test("owner lands in Nexus Today rather than the technical Nexus OS dashboard", () => {
  assert.equal(homeRouteForRole("OWNER"), "/nexus-os/today");
  assert.equal(homeRouteForRole("owner"), "/nexus-os/today");
});

test("operational roles keep the revenue Today workspace", () => {
  assert.equal(homeRouteForRole("SALES"), "/today");
  assert.equal(homeRouteForRole("CLOSING"), "/today");
  assert.equal(homeRouteForRole("MARKETING"), "/today");
});

test("home fallback prefers the action workspace", () => {
  assert.equal(HOME_ROUTE_FALLBACK, "/nexus-os/today");
});
