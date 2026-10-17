import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildVisibilityProduct, VISIBILITY_DEMO } from "./visibility-product";

test("demo is explicit example data and never authorizes publication", () => {
  const product = buildVisibilityProduct(VISIBILITY_DEMO);
  assert.equal(product.sites.length, 3);
  assert.ok(product.findings.some(f => f.category === "technical"));
  assert.ok(product.findings.some(f => f.category === "publishing"));
  assert.equal(product.sites.find(s => s.id === "donaanna")?.publisher, "blocked");
  assert.ok(product.findings.every(f => f.nextStep.length > 0));
  assert.ok(product.findings.every(f => f.id.startsWith("visibility:")));
});
test("missing source data yields unknown instead of invented metrics", () => {
  const product = buildVisibilityProduct({ controlReport: null,brandPublishers: [],metrics: [] });
  assert.deepEqual(product.sites, []);
  assert.deepEqual(product.findings, []);
  assert.equal(product.readings, 0);
  assert.equal(product.measured, 0);
});
test("a brand with a publisher blocker but no audit remains visible with unknown technical status", () => {
  const product = buildVisibilityProduct({brandPublishers:[
    {brandId:"donaanna",status:"blocked",reason:"Actual publisher block",page:"/",published:0}
  ]});
  assert.equal(product.sites.length, 1);
  assert.equal(product.sites[0].technical, "unknown");
  assert.equal(product.sites[0].issues, null);
  assert.equal(product.findings[0].category, "publishing");
  assert.equal(product.findings[0].evidenceAge, "UNKNOWN");
});
test("product route is owner-only, read-only and does not create new write actions", () => {
  const route=fs.readFileSync(path.join(process.cwd(),"src/app/(business)/visibility/page.tsx"),"utf8");
  const consoleFile=fs.readFileSync(path.join(process.cwd(),"src/components/visibility/visibility-product-console.tsx"),"utf8");
  const nav=fs.readFileSync(path.join(process.cwd(),"src/lib/navigation.ts"),"utf8");
  assert.match(route,/session\?\.role !== "OWNER"/);
  assert.match(route,/verifyWorkspacePreviewSession/);
  assert.match(consoleFile,/fetch\("\/api\/agents\/seo-priorities"/);
  assert.match(consoleFile,/credentials:"same-origin"/);
  assert.match(consoleFile,/Produktdemo: alle tall og avvik/);
  assert.match(nav,/\/visibility/);
  assert.doesNotMatch(consoleFile,/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
});
