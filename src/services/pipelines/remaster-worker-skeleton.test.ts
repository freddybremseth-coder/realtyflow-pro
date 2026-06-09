import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadRemasterWorkerConfig,
  runRemasterWorkerSkeleton,
  sanitizeWorkerDiagnostics,
} from "./remaster-worker-skeleton";

test("worker skeleton is disabled by default and does not require secrets", async () => {
  const loaded = loadRemasterWorkerConfig({});
  const result = await runRemasterWorkerSkeleton(loaded);

  assert.equal(loaded.config.enabled, false);
  assert.equal(result.status, "disabled");
  assert.deepEqual(result.errors, []);
});

test("enabled worker fails closed when required server config is missing", async () => {
  const loaded = loadRemasterWorkerConfig({
    REMASTER_WORKER_ENABLED: "true",
    REMASTER_WORKER_ID: "remaster-worker-test",
  });
  const result = await runRemasterWorkerSkeleton(loaded);

  assert.equal(result.status, "invalid_config");
  assert.match(result.errors.join("\n"), /REALTYFLOW_API_URL/);
  assert.match(result.errors.join("\n"), /REALTYFLOW_MIGRATION_SECRET/);
});

test("enabled worker remains claim-disabled in the skeleton phase", async () => {
  const loaded = loadRemasterWorkerConfig({
    REMASTER_WORKER_ENABLED: "true",
    REMASTER_WORKER_ID: "remaster-worker-test",
    REALTYFLOW_API_URL: "https://realtyflow.example",
    REALTYFLOW_MIGRATION_SECRET: "server-secret",
    REMASTER_WORKER_TEST_SONG_PREFIX: "REMASTER-WORKER-TEST-",
  });
  const result = await runRemasterWorkerSkeleton(loaded);

  assert.deepEqual(loaded.errors, []);
  assert.equal(result.status, "claim_disabled");
  assert.match(result.message, /claiming is disabled/);
});

test("invalid concurrency and heartbeat settings fail closed", () => {
  const loaded = loadRemasterWorkerConfig({
    REMASTER_WORKER_ENABLED: "true",
    REALTYFLOW_API_URL: "https://realtyflow.example",
    REALTYFLOW_MIGRATION_SECRET: "server-secret",
    REMASTER_WORKER_MAX_CONCURRENCY: "2",
    REMASTER_WORKER_LEASE_SECONDS: "20",
    REMASTER_WORKER_HEARTBEAT_INTERVAL_MS: "20000",
  });

  assert.match(loaded.errors.join("\n"), /MAX_CONCURRENCY/);
  assert.match(loaded.errors.join("\n"), /HEARTBEAT_INTERVAL_MS/);
});

test("diagnostics redact secrets and lease tokens", () => {
  const sanitized = sanitizeWorkerDiagnostics({
    jobId: "9d4feb61-fdcd-4492-857b-64c5d88ab919",
    lease_token: "secret-lease-token",
    nested: {
      authorization: "Bearer secret-token",
      message: "postgres://user:password@example/db",
    },
  });

  const serialized = JSON.stringify(sanitized);
  assert.match(serialized, /9d4feb61/);
  assert.doesNotMatch(serialized, /secret-lease-token|secret-token|postgres:\/\//);
  assert.match(serialized, /\[REDACTED\]/);
  assert.match(serialized, /\[REDACTED_CONNECTION_STRING\]/);
});
