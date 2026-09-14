import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/victoria/route.ts"),
  "utf8",
);
const widgetSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/chatbot/chat-widget.tsx"),
  "utf8",
);
const layoutSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/layout.tsx"),
  "utf8",
);

test("Nexus AI uses live page context and current customer context", () => {
  assert.match(routeSource, /body\?\.visitorInfo\?\.page/);
  assert.match(routeSource, /current_customer: currentContact/);
  assert.match(routeSource, /\/customers\/\$\{encodeURIComponent/);
});

test("Nexus AI reuses existing pipeline movement and deterministic navigation", () => {
  assert.match(routeSource, /assessPipelineMovement/);
  assert.match(routeSource, /filterNexusCommands/);
  assert.match(routeSource, /top_actions: topActions/);
  assert.match(routeSource, /actions: navigationCandidates/);
});

test("Nexus AI remains read-only in v1", () => {
  assert.match(routeSource, /Denne chatten er read-only i v1/);
  assert.match(routeSource, /skal ikke påstå at den har sendt e-post/);
});

test("chat persists recent history and renders navigation shortcuts", () => {
  assert.match(widgetSource, /window\.localStorage\.getItem/);
  assert.match(widgetSource, /window\.localStorage\.setItem/);
  assert.match(widgetSource, /msg\.actions/);
  assert.match(widgetSource, /href=\{action\.href\}/);
});

test("global shell presents Nexus AI as the cross-system advisor", () => {
  assert.match(layoutSource, /title="Nexus AI"/);
  assert.match(layoutSource, /Din rådgiver på tvers av RealtyFlow/);
});
