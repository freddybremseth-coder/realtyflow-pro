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

test("owner navigation is organized around four work apps plus home and platform", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  assert.deepEqual(
    sections.map((section) => section.id),
    ["workspace", "sales", "marketing", "content", "finance", "platform"],
  );

  const home = sections.find((section) => section.id === "workspace");
  assert.ok(home);
  assert.deepEqual(home.items.slice(0, 6).map((item) => item.href), [
    "/workspaces",
    "/nexus-os/today",
    "/nexus-os/focus",
    "/personal-intelligence",
    "/nexus-os/inbox",
    "/nexus-os/communications",
  ]);
  assert.equal(home.items.some((item) => item.href === "/today"), false);

  assert.equal(sections.find((section) => section.id === "sales")?.items[0]?.href, "/sales");
  assert.equal(sections.find((section) => section.id === "marketing")?.items[0]?.href, "/marketing");
  assert.equal(sections.find((section) => section.id === "content")?.items[0]?.href, "/content");
  assert.equal(sections.find((section) => section.id === "finance")?.items[0]?.href, "/finance");
  assert.equal(sections.find((section) => section.id === "platform")?.items[0]?.href, "/operations");

  assert.equal(sections.find((section) => section.id === "sales")?.items.some((item) => item.href === "/inventory/property-360"), true);
  assert.equal(sections.find((section) => section.id === "sales")?.items.some((item) => item.href === "/sales/corporate-homes"), true);
  assert.equal(sections.find((section) => section.id === "marketing")?.items.some((item) => item.href === "/nexus-os/brand-brain"), true);
  assert.equal(sections.find((section) => section.id === "content")?.items.some((item) => item.href === "/book-growth"), true);
  assert.equal(sections.find((section) => section.id === "finance")?.items.some((item) => item.href === "/care/invoices"), true);
  assert.equal(sections.find((section) => section.id === "platform")?.items.some((item) => item.href === "/nexus-os/runtime"), true);
});

test("role navigation keeps permission boundaries while exposing the right app", () => {
  const sales = buildVisibleNavigation("SALES", permissionsForRole("SALES"));
  const salesHrefs = sales.flatMap((section) => section.items.map((item) => item.href));
  assert.equal(salesHrefs.includes("/sales"), true);
  assert.equal(salesHrefs.includes("/finance"), false);
  assert.equal(salesHrefs.includes("/operations"), false);
  assert.equal(salesHrefs.includes("/access-control"), false);
  assert.equal(salesHrefs.includes("/monthly-close"), false);
  assert.equal(salesHrefs.includes("/personal-intelligence"), false);
  assert.equal(salesHrefs.includes("/communications"), true);
  assert.equal(salesHrefs.includes("/customers"), true);
  assert.equal(salesHrefs.includes("/sales/corporate-homes"), true);

  const marketing = buildVisibleNavigation("MARKETING", permissionsForRole("MARKETING"))
    .flatMap((section) => section.items.map((item) => item.href));
  assert.equal(marketing.includes("/marketing"), true);
  assert.equal(marketing.includes("/content"), true);
  assert.equal(marketing.includes("/corporate-homes"), true);
  assert.equal(marketing.includes("/operations"), false);

  const finance = buildVisibleNavigation("FINANCE", permissionsForRole("FINANCE"))
    .flatMap((section) => section.items.map((item) => item.href));
  assert.equal(finance.includes("/finance"), true);
  assert.equal(finance.includes("/operations"), false);
});

test("active section follows the four-app information architecture", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  assert.equal(activeNavigationSection("/customers/abc", sections), "sales");
  assert.equal(activeNavigationSection("/sales/corporate-homes", sections), "sales");
  assert.equal(activeNavigationSection("/corporate-homes", sections), "marketing");
  assert.equal(activeNavigationSection("/closing/deal-1", sections), "sales");
  assert.equal(activeNavigationSection("/care/reports", sections), "sales");
  assert.equal(activeNavigationSection("/inventory/property-360", sections), "sales");
  assert.equal(activeNavigationSection("/nexus-os/brand-brain", sections), "marketing");
  assert.equal(activeNavigationSection("/book-growth/economics", sections), "content");
  assert.equal(activeNavigationSection("/care/invoices", sections), "finance");
  assert.equal(activeNavigationSection("/continuous-improvement", sections), "finance");
  assert.equal(activeNavigationSection("/nexus-os/runtime", sections), "platform");
  assert.equal(activeNavigationSection("/connections", sections), "platform");
  assert.equal(activeNavigationSection("/nexus-os/today", sections), "workspace");
  assert.equal(activeNavigationSection("/nexus-os/communications/social", sections), "workspace");
});

test("menu search still finds canonical daily surfaces", () => {
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
  const available = ["/sales", "/customers", "/execution", "/closing", "/forecast", "/communications", "/recovery"];
  const normalized = normalizeNavigationFavorites(
    ["/sales", "/sales", "/no", "/customers", "/execution", "/closing", "/forecast", "/communications", "/recovery"],
    available,
  );
  assert.deepEqual(normalized, ["/sales", "/customers", "/execution", "/closing", "/forecast", "/communications"]);
  assert.equal(toggleNavigationFavorite(normalized, "/sales", available).includes("/sales"), false);
});

test("owner quick links expose the platform model directly", () => {
  const sections = buildVisibleNavigation("OWNER", permissionsForRole("OWNER"));
  const quick = quickNavigationItems("OWNER", sections, []);
  assert.deepEqual(quick.map((item) => item.href), [
    "/workspaces",
    "/sales",
    "/marketing",
    "/content",
    "/finance",
    "/operations",
  ]);
});

test("keyholding work is split between Sales operations and Finance invoicing", () => {
  const sections = buildVisibleNavigation("KEYHOLDING", permissionsForRole("KEYHOLDING"));
  const sales = sections.find((section) => section.id === "sales");
  assert.ok(sales);
  assert.equal(sales.items.some((item) => item.href === "/care"), true);
  assert.equal(sales.items.some((item) => item.href === "/care/customers"), true);
  assert.equal(sales.items.some((item) => item.href === "/care/reports"), true);
  assert.equal(sales.items.some((item) => item.href === "/care/keys"), true);
  assert.equal(sales.items.some((item) => item.href === "/service-revenue"), true);

  const finance = sections.find((section) => section.id === "finance");
  assert.ok(finance);
  assert.equal(finance.items.some((item) => item.href === "/care/invoices"), true);
});
