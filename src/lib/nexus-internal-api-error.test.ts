import assert from "node:assert/strict";
import test from "node:test";
import { nexusInternalApiErrorMessage } from "@/lib/nexus-internal-api-error";

test("keeps string API errors readable", () => {
  assert.equal(
    nexusInternalApiErrorMessage("/api/example", 401, { error: "Admin session required" }),
    "/api/example failed (401): Admin session required",
  );
});

test("extracts nested structured API errors instead of object Object", () => {
  const message = nexusInternalApiErrorMessage("/api/example", 500, {
    error: { message: "column missing", code: "42703", details: "bad select" },
  });
  assert.match(message, /column missing/);
  assert.doesNotMatch(message, /\[object Object\]/);
});

test("serializes otherwise unknown object errors", () => {
  const message = nexusInternalApiErrorMessage("/api/example", 502, { error: { reason: "upstream" } });
  assert.match(message, /upstream/);
  assert.doesNotMatch(message, /\[object Object\]/);
});

test("falls back to path and status when body has no useful error", () => {
  assert.equal(nexusInternalApiErrorMessage("/api/example", 503, {}), "/api/example failed (503)");
});
