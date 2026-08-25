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

test("owner navigation promotes RealtyFlow Attention Center and Nexus OS as the master automation work area", () => {
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
    sections.find((section) => section.id === "os")?.items.slice(0, 5).map((item) => item.href),
    ["/os", "/nexus-os", "/nexus-os/focus", "/nexus-os/communications", "/nexus-os/runtime"],
  );
  assert.equal(sections.find((section) => section.id === "os")?.items.some((item) => item.href === "/nexus-os/autonomy"), true);
  assert.equal(sections.find((section) => section.id === "os")?.items.some((item) => item.href === "/connections"), true);
  assert.equal(sections.find((section) => section.id === "os")?.items.some((item) => item.href === "/book-growth"), true);
  assert.equal(sections.find((section) => section.id === "customers")?.items.some((item) => item.href === "/automation/nurture"), true);
  assert.equal(sections.find((section) => section.id === "business")?.items.some((item) => item.href === "/nexus-os/account-launch"), true);
  assert.equal(sections.find((section) => section.id === "reports")?.items.some((item) => item.href === "/os"), false);
  assert.equal(sections.find((section) => section.id === "customers")?.items.some((item) => item.href === "/nexus"), false);
  assert.equal(sections.find((section) => section.id === "marketing")?.items.some((item) => item.href === "/social-automation"), true);
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
  assert.equal(activeNavigationSection("/os", sections), "os");
  assert.equal(activeNavigationSection("/nexus-os/director", sections), "os");
  assert.equal(activeNavigationSection("/nexus-os/communications/social", sections), "os");
  assert.equal(activeNavigationSection("/connections", sections), "os");
  assert.equal(activeNavigationSection("/automation/nurture", sections), "customers");
  assert.equal(activeNavigationSection("/nexus-os/account-launch", sections), "business");
  assert.equal(activeNavigationSection("/continuous-improvement", sections), "reports");
});

test("menu search finds OS and growth surfaces by label", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  const social = filterNavigationSections(sections, "Instagram");
  assert.equal(social.length, 1);
  assert.equal(social[0]?.id, "marketing");
  assert.deepEqual(social[0]?.items.map((item) => item.href), ["/social-automation"]);

  const realtyflow = filterNavigationSections(sections, "RealtyFlow OS");
  assert.equal(realtyflow.length, 1);
  assert.deepEqual(realtyflow[0]?.items.map((item) => item.href), ["/os"]);

  const nexus = filterNavigationSections(sections, "Nexus OS");
  assert.equal(nexus.length, 1);
  assert.deepEqual(nexus[0]?.items.map((item) => item.href), ["/nexus-os"]);

  const autonomy = filterNavigationSections(sections, "24/7 Autonomy");
  assert.equal(autonomy.length, 1);
  assert.deepEqual(autonomy[0]?.items.map((item) => item.href), ["/nexus-os/autonomy"]);

  const connections = filterNavigationSections(sections, "Connections");
  assert.equal(connections.length, 1);
  assert.deepEqual(connections[0]?.items.map((item) => item.href), ["/connections"]);
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

test("owner quick links prioritize Attention Center and Nexus control surfaces", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  const quick = quickNavigationItems("OWNER", sections, []);
  assert.deepEqual(quick.map((item) => item.href), ["/os", "/nexus-os", "/nexus-os/focus", "/nexus-os/runtime", "/connections", "/approvals"]);
});

test("keyholding role gets the Care workspace as its main menu area", () => {
  const sections = buildVisibleNavigation("KEYHOLDING", permissionsForRole("KEYHOLDING"));
  const care = sections.find((section) => section.id === "care");
  assert.ok(care);
  assert.deepEqual(care.items.map((item) => item.href), ["/care", "/care/customers", "/care/reports", "/care/invoices", "/care/keys", "/service-revenue"]);
  const quick = quickNavigationItems("KEYHOLDING", sections, []);
  assert.deepEqual(quick.map((item) => item.href), ["/care", "/care/customers", "/care/reports", "/care/invoices", "/care/keys", "/communications"]);
});
