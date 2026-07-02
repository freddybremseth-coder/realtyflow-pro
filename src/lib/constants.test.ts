import assert from "node:assert/strict";
import { test } from "node:test";
import { SIDEBAR_NAV } from "@/lib/constants";

type SidebarSection = keyof typeof SIDEBAR_NAV;

function navItems() {
  return Object.entries(SIDEBAR_NAV).flatMap(([section, items]) =>
    items.map((item) => ({ ...item, section: section as SidebarSection })),
  );
}

test("RealtyFlow sidebar does not duplicate links", () => {
  const hrefs = navItems().map((item) => item.href);

  assert.equal(new Set(hrefs).size, hrefs.length);
});

test("RealtyFlow sidebar keeps Mondeo as a single admin item", () => {
  const mondeoItems = navItems().filter((item) => item.href === "/mondeo" || item.label.includes("Mondeo"));

  assert.equal(mondeoItems.length, 1);
  assert.equal(mondeoItems[0]?.section, "admin");
  assert.equal(mondeoItems[0]?.label, "Mondeo Eiendom");
});

test("RealtyFlow sidebar groups SaaS and DemoSites outside the main overview", () => {
  assert.equal(SIDEBAR_NAV.saas.some((item) => item.href === "/saas"), true);
  assert.equal(SIDEBAR_NAV.saas.some((item) => item.href === "/demosites"), true);
  assert.equal(SIDEBAR_NAV.overview.some((item) => item.href === "/saas" || item.href === "/demosites"), false);
});

test("RealtyFlow sidebar keeps property scanner with property tools", () => {
  assert.equal(SIDEBAR_NAV.properties.some((item) => item.href === "/scanner"), true);
  assert.equal(SIDEBAR_NAV.admin.some((item) => item.href === "/scanner"), false);
});
