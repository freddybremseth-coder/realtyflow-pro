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

test("owner navigation promotes Nexus OS as the master automation work area", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  assert.deepEqual(
    sections.map((section) => section.id),
    ["workspace", "os", "customers", "care", "revenue", "properties", "marketing", "content", "publishing", "reports", "business", "admin"],
  );
  assert.deepEqual(
    sections.find((section) => section.id === "workspace")?.items.map((item) => item.href),
    ["/", "/today", "/internal-alerts", "/approvals", "/communications"],
  );
  assert.deepEqual(
    sections.find((section) => section.id === "os")?.items.slice(0, 4).map((item) => item.href),
    ["/nexus-os", "/social-automation", "/book-growth", "/automation"],
  );
  assert.equal(sections.find((section) => section.id === "os")?.items.some((item) => item.href === "/nexus"), true);
  assert.equal(sections.find((section) => section.id === "marketing")?.items.some((item) => item.href === "/marketing-readiness"), true);
  assert.equal(sections.find((section) => section.id === "content")?.items.some((item) => item.href === "/posts"), true);
  assert.equal(sections.find((section) => section.id === "publishing")?.items.some((item) => item.href === "/publishing"), true);
  for (const section of sections) assert.ok(section.items.length <= 8, `${section.id} has ${section.items.length} items`);
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
  assert.equal(activeNavigationSection("/care/reports", sections), "care");
  assert.equal(activeNavigationSection("/closing-pack/deal-1", sections), "revenue");
  assert.equal(activeNavigationSection("/book-growth/economics", sections), "os");
  assert.equal(activeNavigationSection("/nexus-os", sections), "os");
  assert.equal(activeNavigationSection("/continuous-improvement", sections), "reports");
});

test("menu search finds OS surfaces by label", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  const social = filterNavigationSections(sections, "Instagram");
  assert.equal(social.length, 1);
  assert.equal(social[0]?.id, "os");
  assert.deepEqual(social[0]?.items.map((item) => item.href), ["/social-automation"]);

  const nexus = filterNavigationSections(sections, "Nexus");
  assert.equal(nexus.length, 1);
  assert.deepEqual(nexus[0]?.items.map((item) => item.href), ["/nexus-os"]);
});

test("favorites are limited, deduplicated and restricted to visible links", () => {
  const available = ["/today", "/customers", "/execution", "/closing", "/forecast", "/communications", "/recovery"];
  const normalized = normalizeNavigationFavorites(["/today", "/today", "/not-visible", "/customers", "/execution", "/closing", "/forecast", "/communications", "/recovery"], available);
  assert.deepEqual(normalized, ["/today", "/customers", "/execution", "/closing", "/forecast", "/communications"]);
  const removed = toggleNavigationFavorite(normalized, "/today", available);
  assert.equal(removed.includes("/today"), false);
  const added = toggleNavigationFavorite(removed, "/recovery", available);
  assert.equal(added[0], "/recovery");
});

test("owner quick links start with Nexus and growth OS surfaces", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  const quick = quickNavigationItems("OWNER", sections, []);
  assert.deepEqual(quick.map((item) => item.href), ["/nexus-os", "/social-automation", "/book-growth", "/today", "/customers", "/approvals"]);
});

test("keyholding role gets the Care workspace as its main menu area", () => {
  const sections = buildVisibleNavigation("KEYHOLDING", permissionsForRole("KEYHOLDING"));
  const care = sections.find((section) => section.id === "care");
  assert.ok(care);
  assert.deepEqual(care.items.map((item) => item.href), ["/care", "/care/customers", "/care/reports", "/care/invoices", "/care/keys", "/service-revenue"]);
  const quick = quickNavigationItems("KEYHOLDING", sections, []);
  assert.deepEqual(quick.map((item) => item.href), ["/care", "/care/customers", "/care/reports", "/care/invoices", "/care/keys", "/communications"]);
});
