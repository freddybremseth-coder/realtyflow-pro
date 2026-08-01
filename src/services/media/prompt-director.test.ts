import assert from "node:assert/strict";
import test from "node:test";
import { createMediaPromptPlan, promptPlanHash } from "./prompt-director";
import { mediaPromptPlanSchema } from "./types";

test("Prompt Director creates a validated property image plan from natural language", () => {
  const plan = createMediaPromptPlan({
    request: "Lag et eksklusivt bilde av en moderne villa i Altea Hills ved solnedgang, til LinkedIn, rettet mot skandinaviske boligkjøpere.",
    mode: "simple",
    sourceImageUrls: [],
    allowText: false,
  });

  assert.equal(plan.mediaType, "image");
  assert.equal(plan.useCase, "property_visual");
  assert.equal(plan.platform, "linkedin");
  assert.equal(plan.aspectRatio, "16:9");
  assert.equal(plan.qualityTier, "premium");
  assert.match(plan.optimizedPrompt, /SUBJECT:/);
  assert.match(plan.optimizedPrompt, /OUTPUT FORMAT: Aspect ratio 16:9/);
  assert.ok(plan.safetyNotes.some((note) => note.includes("visualisering")));
  assert.doesNotThrow(() => mediaPromptPlanSchema.parse(plan));
});

test("Prompt Director requires product preservation for product variants", () => {
  const plan = createMediaPromptPlan({
    request: "Lag et premium produktbilde med Doña Anna-flasken i et middelhavskjokken.",
    mode: "guided",
    brandId: "donaanna",
    sourceImageUrls: ["https://example.com/product.png"],
    allowText: false,
  });

  assert.equal(plan.operation, "image_to_image");
  assert.equal(plan.brandId, "donaanna");
  assert.match(plan.optimizedPrompt, /Preserve the real product identity/);
  assert.equal(plan.referenceRequirements.some((item) => item.type === "product"), true);
});

test("promptPlanHash is stable for idempotent plan caching", () => {
  const plan = createMediaPromptPlan({
    request: "Lag et LinkedIn-portrett av Freddy.",
    mode: "simple",
    sourceImageUrls: [],
    allowText: false,
  });
  assert.equal(promptPlanHash(plan), promptPlanHash({ ...plan }));
});
