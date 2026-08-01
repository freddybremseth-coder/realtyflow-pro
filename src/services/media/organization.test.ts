import assert from "node:assert/strict";
import test from "node:test";
import { getMediaAccessScope } from "./organization";
import type { RequestAccessContext } from "@/lib/api-admin";

const ACCESS_CONTEXT: RequestAccessContext = {
  email: "freddy@example.com",
  role: "OWNER",
  permissions: [],
  source: "owner-session",
};

function tenantClient(coreResult: unknown, snapshotResult: unknown = { data: null, error: null }) {
  const calls: string[] = [];
  const client = {
    calls,
    schema(schemaName: string) {
      calls.push(`schema:${schemaName}`);
      return {
        from(tableName: string) {
          calls.push(`from:${tableName}`);
          return {
            select(columns: string) {
              calls.push(`select:${columns}`);
              return {
                eq(column: string, value: string) {
                  calls.push(`eq:${column}:${value}`);
                  return {
                    maybeSingle: async () => coreResult,
                  };
                },
              };
            },
          };
        },
      };
    },
    async rpc(name: string) {
      calls.push(`rpc:${name}`);
      return snapshotResult;
    },
  };
  return client;
}

test("media access scope uses core tenant when core schema is exposed", async () => {
  const client = tenantClient({ data: { id: "tenant-core" }, error: null });

  const scope = await getMediaAccessScope(client as never, ACCESS_CONTEXT);

  assert.equal(scope.organizationId, "tenant-core");
  assert.equal(scope.actorEmail, ACCESS_CONTEXT.email);
  assert.equal(client.calls.includes("rpc:platform_snapshot"), false);
});

test("media access scope falls back to platform snapshot when core schema is not exposed", async () => {
  const client = tenantClient(
    { data: null, error: { code: "PGRST106", message: "Invalid schema: core" } },
    {
      data: {
        tenants: [
          { slug: "system", id: "tenant-system" },
          { slug: "realtyflow", id: "tenant-realtyflow" },
        ],
      },
      error: null,
    },
  );

  const scope = await getMediaAccessScope(client as never, ACCESS_CONTEXT);

  assert.equal(scope.organizationId, "tenant-realtyflow");
  assert.equal(client.calls.includes("rpc:platform_snapshot"), true);
});

test("media access scope keeps the migration message when no tenant can be resolved", async () => {
  const client = tenantClient(
    { data: null, error: { code: "PGRST106", message: "Invalid schema: core" } },
    { data: { tenants: [{ slug: "system", id: "tenant-system" }] }, error: null },
  );

  await assert.rejects(
    () => getMediaAccessScope(client as never, ACCESS_CONTEXT),
    /Media Studio mangler RealtyFlow tenant/,
  );
});
