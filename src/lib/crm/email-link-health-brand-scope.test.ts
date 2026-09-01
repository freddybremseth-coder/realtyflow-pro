import assert from "node:assert/strict";
import { filterEmailMessagesByBrand } from "./email-link-health-brand-scope";

const messages = [
  { id: "soleada-1", brand_id: "soleada" },
  { id: "zeneco-1", brand_id: "zeneco" },
  { id: "none-1", brand_id: null },
];

assert.deepEqual(filterEmailMessagesByBrand(messages, "soleada").map((row) => row.id), ["soleada-1"]);
assert.deepEqual(filterEmailMessagesByBrand(messages, " zeneco ").map((row) => row.id), ["zeneco-1"]);
assert.deepEqual(filterEmailMessagesByBrand(messages, "").map((row) => row.id), messages.map((row) => row.id));
assert.deepEqual(filterEmailMessagesByBrand(messages, null).map((row) => row.id), messages.map((row) => row.id));

console.log("email-link-health-brand-scope tests passed");
