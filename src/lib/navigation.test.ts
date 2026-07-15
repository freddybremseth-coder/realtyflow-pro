import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeNavigationSection,
  buildVisibleNavigation,
  filterNavigationSections,
  navigationCoverage,
  normalizeNavigationFavorites,
  quickNavigationItems,
  toggleNavigationFavorite,
} from "@/lib/navigation";
import { permissionsForRole } from "@/lib/access-control";

test("navigation groups every existing sidebar link exactly once", () => {
  const coverage = navigationCoverage();
  assert.deepEqual(coverage.missing, []);
  assert.deepEqual(coverage.unknown, []);
  assert.deepEqual(coverage.duplicateGroupedHrefs, []);
  assert.equal(new Set(coverage.sourceHrefs).size, coverage.sourceHrefs.length);
});

test("owner navigation is split into focused work areas", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  assert.deepEqual(
    sections.map((section) => section.id),
    ["workspace", "customers", "revenue", "reports", "properties", "content", "marketing", "business", "system"],
  );
  assert.deepEqual(
    sections.find((section) => section.id === "workspace")?.items.map((item) => item.href),
    ["/", "/today", "/internal-alerts", "/approvals", "/communications"],
  );
  // Daily money tools stay in "Økonomi"; rarely-used routines live in
  // their own "Rapporter & rutiner" group so they never drown the daily.
  assert.equal(sections.find((section) => section.id === "revenue")?.items.some((item) => item.href === "/closing"), true);
  assert.equal(sections.find((section) => section.id === "reports")?.items.some((item) => item.href === "/continuous-improvement"), true);
  assert.equal(sections.find((section) => section.id === "business")?.items.some((item) => item.href === "/demosites"), true);
  assert.equal(sections.find((section) => section.id === "marketing")?.items.some((item) => item.href === "/reach"), true);
  for (const section of sections) {
    assert.ok(section.items.length <= 10, `${section.id} has ${section.items.length} items`);
  }
});

test("role navigation excludes inaccessible owner and finance tools", () => {
  const sales = buildVisibleNavigation("SALES", permissionsForRole("SALES"));
  const hrefs = sales.flatMap((section) => section.items.map((item) => item.href));
  assert.equal(hrefs.includes("/access-control"), false);
  assert.equal(hrefs.includes("/monthly-close"), false);
  assert.equal(hrefs.includes("/today"), true);
  assert.equal(hrefs.includes("/executive-briefing"), true);
});

test("active section follows nested routes", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  assert.equal(activeNavigationSection("/customers/abc-123", sections), "customers");
  assert.equal(activeNavigationSection("/closing-pack/deal-1", sections), "revenue");
  assert.equal(activeNavigationSection("/continuous-improvement", sections), "reports");
});

test("menu search filters labels and routes without changing access", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  const filtered = filterNavigationSections(sections, "provisjon");
  assert.equal(filtered.length, 0);

  const closing = filterNavigationSections(sections, "commission");
  assert.equal(closing.length, 1);
  assert.equal(closing[0]?.id, "revenue");
  assert.deepEqual(closing[0]?.items.map((item) => item.href), ["/commissions"]);
});

test("favorites are limited, deduplicated and restricted to visible links", () => {
  const available = ["/today", "/customers", "/execution", "/closing", "/forecast", "/communications", "/recovery"];
  const normalized = normalizeNavigationFavorites([
    "/today",
    "/today",
    "/not-visible",
    "/customers",
    "/execution",
    "/closing",
    "/forecast",
    "/communications",
    "/recovery",
  ], available);
  assert.deepEqual(normalized, ["/today", "/customers", "/execution", "/closing", "/forecast", "/communications"]);

  const removed = toggleNavigationFavorite(normalized, "/today", available);
  assert.equal(removed.includes("/today"), false);
  const added = toggleNavigationFavorite(removed, "/recovery", available);
  assert.equal(added[0], "/recovery");
});

test("quick links prefer favorites and fall back to role defaults", () => {
  const sections = buildVisibleNavigation("SALES", permissionsForRole("SALES"));
  const quick = quickNavigationItems("SALES", sections, ["/communications", "/customers"]);
  assert.deepEqual(quick.slice(0, 2).map((item) => item.href), ["/communications", "/customers"]);
  assert.equal(quick.length, 6);
  assert.equal(new Set(quick.map((item) => item.href)).size, quick.length);
});
