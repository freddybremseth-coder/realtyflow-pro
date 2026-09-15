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

test("navigation groups every sidebar link exactly once", () => {
  const coverage = navigationCoverage();
  assert.deepEqual(coverage.missing, []);
  assert.deepEqual(coverage.unknown, []);
  assert.deepEqual(coverage.duplicateGroupedHrefs, []);
  assert.equal(new Set(coverage.sourceHrefs).size, coverage.sourceHrefs.length);
});

test("owner navigation is organized around nine understandable work areas", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  assert.deepEqual(
    sections.map((section) => section.id),
    ["workspace", "customers", "properties", "marketing", "publishing", "care", "revenue", "business", "admin"],
  );
  const home = sections.find((section) => section.id === "workspace");
  assert.ok(home);
  assert.deepEqual(home.items.slice(0, 6).map((item) => item.href), [
    "/nexus-os/today",
    "/nexus-os/focus",
    "/personal-intelligence",
    "/nexus-os/inbox",
    "/nexus-os/communications",
    "/approvals",
  ]);
  assert.equal(home.items.some((item) => item.href === "/today"), false);
  assert.equal(sections.flatMap((section) => section.items).some((item) => item.href === "/communications"), false);
  assert.equal(sections.find((section) => section.id === "marketing")?.items.some((item) => item.href === "/nexus-os/brand-brain"), true);
  assert.equal(sections.find((section) => section.id === "admin")?.items.some((item) => item.href === "/nexus-os/runtime"), true);
  assert.equal(sections.find((section) => section.id === "admin")?.items.some((item) => item.href === "/nexus-os/autonomy"), true);
  assert.equal(sections.find((section) => section.id === "publishing")?.items.some((item) => item.href === "/book-growth"), true);
  assert.equal(sections.find((section) => section.id === "properties")?.items.some((item) => item.href === "/inventory/property-360"), true);
});

test("role navigation keeps permission boundaries", () => {
  const sales = buildVisibleNavigation("SALES", permissionsForRole("SALES"));
  const hrefs = sales.flatMap((section) => section.items.map((item) => item.href));
  assert.equal(hrefs.includes("/access-control"), false);
  assert.equal(hrefs.includes("/monthly-close"), false);
  assert.equal(hrefs.includes("/personal-intelligence"), false);
  assert.equal(hrefs.includes("/communications"), true);
  assert.equal(hrefs.includes("/customers"), true);
});

test("active section follows the simplified information architecture", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  assert.equal(activeNavigationSection("/customers/abc", sections), "customers");
  assert.equal(activeNavigationSection("/closing/deal-1", sections), "customers");
  assert.equal(activeNavigationSection("/care/reports", sections), "care");
  assert.equal(activeNavigationSection("/book-growth/economics", sections), "publishing");
  assert.equal(activeNavigationSection("/nexus-os/today", sections), "workspace");
  assert.equal(activeNavigationSection("/nexus-os/communications/social", sections), "workspace");
  assert.equal(activeNavigationSection("/nexus-os/brand-brain", sections), "marketing");
  assert.equal(activeNavigationSection("/nexus-os/runtime", sections), "admin");
  assert.equal(activeNavigationSection("/connections", sections), "admin");
  assert.equal(activeNavigationSection("/continuous-improvement", sections), "revenue");
  assert.equal(activeNavigationSection("/inventory/property-360", sections), "properties");
});

test("menu search finds renamed daily surfaces", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  const email = filterNavigationSections(sections, "E-post & kommunikasjon");
  assert.equal(email.length, 1);
  assert.deepEqual(email[0]?.items.map((item) => item.href), ["/nexus-os/communications"]);
  const advisor = filterNavigationSections(sections, "AI-rådgiver");
  assert.equal(advisor.length, 1);
  assert.deepEqual(advisor[0]?.items.map((item) => item.href), ["/personal-intelligence"]);
  const social = filterNavigationSections(sections, "Instagram");
  assert.equal(social.length, 1);
  assert.deepEqual(social[0]?.items.map((item) => item.href), ["/social-automation"]);
});

test("favorites remain limited and deduplicated", () => {
  const available = ["/today", "/customers", "/execution", "/closing", "/forecast", "/communications", "/recovery"];
  const normalized = normalizeNavigationFavorites(["/today", "/today", "/no", "/customers", "/execution", "/closing", "/forecast", "/communications", "/recovery"], available);
  assert.deepEqual(normalized, ["/today", "/customers", "/execution", "/closing", "/forecast", "/communications"]);
  assert.equal(toggleNavigationFavorite(normalized, "/today", available).includes("/today"), false);
});

test("owner quick links expose the six daily work surfaces", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  const quick = quickNavigationItems("OWNER", sections, []);
  assert.deepEqual(quick.map((item) => item.href), [
    "/nexus-os/today",
    "/customers",
    "/nexus-os/communications",
    "/inventory",
    "/social-automation",
    "/personal-intelligence",
  ]);
});

test("keyholding keeps its focused Care workspace", () => {
  const sections = buildVisibleNavigation("KEYHOLDING", permissionsForRole("KEYHOLDING"));
  const care = sections.find((section) => section.id === "care");
  assert.ok(care);
  assert.deepEqual(care.items.map((item) => item.href), ["/care", "/care/customers", "/care/reports", "/care/invoices", "/care/keys", "/service-revenue"]);
});
