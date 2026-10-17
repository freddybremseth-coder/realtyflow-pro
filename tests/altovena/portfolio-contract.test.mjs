import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const page = read("src/app/(realty)/altovena/page.tsx");
const register = read("src/lib/altovena/product-register.ts");
const nav = read("src/lib/navigation.ts");
const constants = read("src/lib/constants.ts");

test("portfolio page is owner-only and excluded from search indexes", () => {
  assert.match(page, /verifyAdminSession\(/);
  assert.match(page, /session\?\.role !== "OWNER"/);
  assert.match(page, /verifyWorkspacePreviewSession\(/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
});
test("owner navigation gives one product overview without replacing Command", () => {
  assert.match(constants, /href: "\/altovena"/);
  assert.match(constants, /href: "\/altovena\/command"/);
  assert.match(nav, /"\/platform","\/altovena","\/altovena\/command"/);
  assert.match(nav, /filter\(item=>canSeeItem\(role,permissions,item\.href\)\)/);
});
test("all four product paths are grounded in existing routes and no standalone app is invented", () => {
  for (const [id, route] of [
    ["command", "/altovena/command"], ["visibility", "/visibility"],
    ["intelligence", "/sales/corporate-homes"],
  ]) {
    assert.match(register, new RegExp('id: "' + id + '"[\\s\\S]*?primaryHref: "' + route + '"'));
  }
  assert.match(register, /id: "olivia"[\s\S]*?primaryHref: null/);
});
test("product register never misrepresents development as external SaaS live or actions enabled", () => {
  const entries = register.match(/externallySellable: false,/g) || [];
  assert.equal(entries.length, 4);
  const actions = register.match(/hasLiveAutonomousActions: false,/g) || [];
  assert.equal(actions.length, 4);
  assert.doesNotMatch(register, /externallySellable: true|hasLiveAutonomousActions: true/);
  assert.match(page, /ikke live deploy-overvåking/);
  assert.match(page, /Ingen av produktene nedenfor er godkjent for ekstern SaaS-lansering/);
});
test("portfolio is read-only and never bypasses product-specific authorization", () => {
  assert.doesNotMatch(page, /fetch\(|\.rpc\(|createClient\(|service_role|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(page, /ALTOVENA_PRODUCT_REGISTER\.map/);
  assert.match(page, /href=\{product\.primaryHref\}/);
});
