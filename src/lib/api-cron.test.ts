import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { requireCronApi } from "./api-cron";

function request(headers?: Record<string, string>, path = "/api/cron/example") {
  return new NextRequest(`https://realtyflow.test${path}`, { headers });
}

test.beforeEach(() => {
  delete process.env.CRON_SECRET;
});

test.afterEach(() => {
  delete process.env.CRON_SECRET;
});

test("requireCronApi fails closed when CRON_SECRET is missing", async () => {
  const response = requireCronApi(request());
  assert.ok(response);

  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(body.error, "Cron secret required");
});

test("requireCronApi rejects invalid cron credentials", async () => {
  process.env.CRON_SECRET = "cron-secret";

  const response = requireCronApi(request({ authorization: "Bearer wrong" }));
  assert.ok(response);

  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error, "Unauthorized");
});

test("requireCronApi accepts bearer, header, and query credentials", () => {
  process.env.CRON_SECRET = "cron-secret";

  assert.equal(requireCronApi(request({ authorization: "Bearer cron-secret" })), null);
  assert.equal(requireCronApi(request({ "x-cron-secret": "cron-secret" })), null);
  assert.equal(requireCronApi(request(undefined, "/api/cron/example?key=cron-secret")), null);
});
