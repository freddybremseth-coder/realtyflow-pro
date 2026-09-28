import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNexusTodayTopActions } from "@/lib/nexus-today-priority";

test("critical system work outranks ordinary sales work without inventing marketing quarantine tasks", () => {
  const rows = buildNexusTodayTopActions({
    revenue: { title: "Follow up lead", primaryAction: "Ring kunden", reason: "Hot lead", href: "/today", priority: "HIGH", score: 91 },
    attention: [{ id: "db", severity: "high", score: 95, title: "Datakilde feiler", detail: "CRM-kilde er nede", href: "/os" }],
    marketingHumanActions: [],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.priority, "CRITICAL");
  assert.equal(rows.some((row) => row.source === "sales"), true);
  assert.equal(rows.some((row) => row.id === "marketing:quarantine"), false);
});

test("sales becomes first action when there are no critical blockers", () => {
  const rows = buildNexusTodayTopActions({
    revenue: { title: "Forhandling", primaryAction: "Følg opp tilbud", reason: "Kunden er i closing", href: "/closing", priority: "HIGH", score: 96 },
    attention: [{ id: "minor", severity: "low", score: 20, title: "Liten driftssak", detail: "Kan vente", href: "/os" }],
    marketingHumanActions: [],
  });
  assert.equal(rows[0]?.source, "sales");
  assert.equal(rows[0]?.href, "/closing");
});

test("explicit HUMAN_REQUIRED marketing action can enter top actions", () => {
  const rows = buildNexusTodayTopActions({
    revenue: null,
    attention: [],
    marketingHumanActions: [{
      id: "brand-brain:zeneco:facebook",
      title: "Zen Eco Homes · Brand Brain må ferdigstilles",
      reason: "Eierbeslutning kreves.",
      href: "/nexus-os/brand-brain",
      priority: "HIGH",
    }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.source, "marketing");
  assert.equal(rows[0]?.action, "Ta menneskelig beslutning");
});

test("result is capped at three actions by default", () => {
  const rows = buildNexusTodayTopActions({
    revenue: null,
    attention: Array.from({ length: 5 }, (_, index) => ({ id: String(index), severity: "medium" as const, score: 50 - index, title: `A${index}`, detail: "x", href: "/os" })),
    marketingHumanActions: [],
  });
  assert.equal(rows.length, 3);
});
