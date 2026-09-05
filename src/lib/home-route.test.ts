import assert from "node:assert/strict";
import { test } from "node:test";
import { HOME_ROUTE_FALLBACK, homeRouteForRole } from "@/lib/home-route";

test("owner lands in Unified Attention Morning Brief", () => {
  assert.equal(homeRouteForRole("OWNER"), "/nexus-os/morning-brief");
  assert.equal(homeRouteForRole("owner"), "/nexus-os/morning-brief");
});

test("operational roles keep the revenue Today workspace", () => {
  assert.equal(homeRouteForRole("SALES"), "/today");
  assert.equal(homeRouteForRole("CLOSING"), "/today");
  assert.equal(homeRouteForRole("MARKETING"), "/today");
});

test("home fallback prefers the owner Morning Brief", () => {
  assert.equal(HOME_ROUTE_FALLBACK, "/nexus-os/morning-brief");
});
