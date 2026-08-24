import assert from "node:assert/strict";
import test from "node:test";
import { contentNoveltyScore } from "./novelty";
import type { ContentGenome } from "../genome";

const genome = (over: Partial<ContentGenome> = {}): ContentGenome => ({
  brandId: "zeneco",
  channel: "instagram",
  format: "image",
  propertyId: "property-1",
  area: "finestrat",
  propertyType: "villa",
  hookType: "price_first",
  ctaType: "book_call",
  ...over,
});

test("same property + hook + CTA + near-identical angle inside 14 days regenerates", () => {
  const result = contentNoveltyScore(
    {
      genome: genome(),
      angle: "Villa in Finestrat for €790,000 — book a free property call",
      campaignId: "campaign-new",
    },
    [{
      genome: genome(),
      angle: "Villa in Finestrat for €790,000. Book a free property call",
      usedAt: "2026-08-20T10:00:00Z",
      campaignId: "campaign-old",
    }],
    { now: "2026-08-25T10:00:00Z" },
  );

  assert.equal(result.decision, "regenerate");
  assert.ok(result.lastUsedDays != null && result.lastUsedDays <= 14);
});

test("same area but genuinely different hook/CTA/angle can pass novelty gate", () => {
  const result = contentNoveltyScore(
    {
      genome: genome({ propertyId: "property-2", hookType: "question", ctaType: "request_details" }),
      angle: "What does everyday life near the mountains look like in Finestrat?",
    },
    [{
      genome: genome(),
      angle: "Villa in Finestrat for €790,000. Book a free property call",
      usedAt: "2026-08-20T10:00:00Z",
    }],
    { now: "2026-08-25T10:00:00Z" },
  );

  assert.equal(result.decision, "ok");
});
