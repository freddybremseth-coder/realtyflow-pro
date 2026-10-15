import test from "node:test";
import assert from "node:assert/strict";
import { boundedElenaEmailText, prepareElenaMatchContext } from "./elena-prompt-budget";

test("Elena context stays bounded and does not ship galleries into matching prompt", () => {
  const properties = Array.from({ length: 200 }, (_, i) => ({
    id: "id-" + i, ref: "N" + String(i).padStart(4, "0"), title: "Large listing " + "x".repeat(2000),
    gallery: Array.from({ length: 30 }, () => "https://images.test/" + "a".repeat(2000)),
    location: "Altea", price: 300000 + i, bedrooms: 3,
  }));
  const leads = Array.from({ length: 120 }, (_, i) => ({
    id: "lead-" + i, email: i === 117 ? "buyer@example.com" : "other" + i + "@test.com",
    name: "Buyer " + i, notes: "a".repeat(9000),
  }));
  const matched = prepareElenaMatchContext({
    emailContent: "Do you still have property N0199 available? " + "x".repeat(100000),
    fromAddress: "buyer@example.com", leads, customers: [], properties, plots: [],
  });
  assert.equal(matched.properties[0].ref, "N0199");
  assert.equal(matched.leads[0].id, "lead-117");
  assert.equal(matched.properties.length, 40);
  assert.equal(matched.leads.length, 60);
  assert.equal(matched.emailContent.length, 12000);
  assert.ok(JSON.stringify(matched).length < 48000);
  assert.ok(!JSON.stringify(matched).includes("gallery"));
});
test("Text is clipped and HTML tags removed before Elena's model call", () => {
  const text = boundedElenaEmailText("<p>Hello</p><script>secret()</script>" + "x".repeat(100000));
  assert.ok(text.startsWith("Hello"));
  assert.ok(!text.includes("secret()"));
  assert.equal(text.length, 16000);
});
