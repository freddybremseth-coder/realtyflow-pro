import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/explore/route.ts"), "utf8");
const service = fs.readFileSync(path.join(process.cwd(), "src/lib/personal-intelligence/explore-service.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/explore/page.tsx"), "utf8");

test("explore is owner-only and read-only", () => {
  assert.match(route, /access\.role !== "OWNER"/);
  assert.match(route, /writesPerformed: 0/);
  assert.match(route, /persistAsPersonalMemory: false/);
  assert.match(route, /outboundActions: false/);
});

test("explore uses the privacy-aware context router without sensitive permission", () => {
  assert.match(route, /buildPersonalContextPack/);
  assert.match(route, /sessionScope: "internal"/);
  assert.match(route, /explicitSensitivePermission: false/);
});

test("empty evidence does not produce fake personalization", () => {
  assert.match(service, /insufficientEvidence: true/);
  assert.match(page, /will not pretend generic ideas are personalized/i);
});

test("curiosity taxonomy is adjacent stretch and wild card", () => {
  for (const kind of ["adjacent", "stretch", "wild_card"]) assert.match(service, new RegExp(kind));
  assert.match(page, /Adjacent/);
  assert.match(page, /Stretch/);
  assert.match(page, /Wild Card/);
});

test("explore prompt forbids personality inference and gamification", () => {
  assert.match(service, /Do not infer personality/);
  assert.match(service, /Avoid clickbait, productivity pressure, streaks, gamification/);
});
