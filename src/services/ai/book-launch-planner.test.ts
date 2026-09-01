import assert from "node:assert/strict";
import test from "node:test";
import { BOOK_LAUNCH_FREQUENCY_POLICY, buildBookLaunchPrompt, validateBookLaunchPlan, type BookLaunchItem } from "./book-launch-planner";

const items: BookLaunchItem[] = Array.from({ length: 12 }, (_, index) => ({
  offsetDay: [0, 1, 3, 5, 7, 8, 10, 12, 14, 16, 21, 24][index],
  channel: (["facebook", "instagram", "email", "website"] as const)[index % 4],
  contentType: "idea", purpose: "Explain the reader value", headline: `Headline ${index}`, body: `Body ${index}`,
  cta: "view_book", sourceClaim: "Approved description",
}));

test("launch proposal is bounded by the locked frequency policy", () => {
  assert.equal(validateBookLaunchPlan({ campaignName: "Launch", objective: "Sales", audiencePromise: "Clarity", positioning: "Evidence-led", items }).items.length, 12);
  assert.deepEqual(BOOK_LAUNCH_FREQUENCY_POLICY, { durationDays: 30, maxTotalPerWeek: 4, maxPerChannelPerWeek: 2, minHoursBetweenSameChannel: 24 });
});

test("rejects channel collisions and unsupported launch claims", () => {
  assert.throws(() => validateBookLaunchPlan({ campaignName: "Launch", objective: "Sales", audiencePromise: "Clarity", positioning: "Evidence-led", items: items.map((item, index) => index === 1 ? { ...item, channel: "facebook", offsetDay: 0 } : item) }), /For kort avstand/);
  const prompt = buildBookLaunchPrompt({ title: "Book", author: "Author", language: "en", description: "Description", audiences: ["Readers"], themes: ["Power"], keywords: ["money and power"] });
  assert.match(prompt, /Never invent reviews, rankings, sales, awards, availability, price/);
  assert.match(prompt, /proposal only/);
});
