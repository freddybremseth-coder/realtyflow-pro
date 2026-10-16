/**
 * Runs only on a disposable PostgreSQL 16 GitHub Actions service, not Supabase.
 * Exercise the real node-postgres client with the same typed board query code.
 * Local TCP here is deliberately non-TLS; real staging must separately test
 * a trusted TLS certificate/hostname using withNexusBoardReader().
 */
import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { assertNexusBoardReadOnlyRole } from "../src/lib/nexus/task-board-connection";
import { hasNexusTaskBoardViewGrant, loadNexusTaskBoard } from "../src/lib/nexus/task-board-read";

const brandA = "11111111-1111-4111-8111-111111111111";
const brandB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userA = "44444444-4444-4444-8444-444444444444";
const userB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("real restricted Postgres login exercises board projection and tenant checks", async () => {
  assert.equal(process.env.NEXUS_BOARD_CI_ONLY, "true", "Must be disposable CI only");
  assert.equal(process.env.GITHUB_ACTIONS, "true", "Must be a GitHub Actions runner");
  const password = process.env.NEXUS_BOARD_CI_PASSWORD;
  assert.ok(password && password.length >= 24, "Missing temporary CI password");
  const client = new pg.Client({
    host: "127.0.0.1", port: 5432, database: "postgres",
    user: "nexus_board_ci_login", password, ssl: false,
    connectionTimeoutMillis: 4000,
    statement_timeout: 4000,
  });
  try {
    await client.connect();
    const current = await client.query("select current_user as role_name");
    assert.equal(current.rows[0].role_name, "nexus_board_ci_login");
    await assertNexusBoardReadOnlyRole(client);

    // Membership A is active and has a dedicated view grant. B's
    // workspace membership lost nexus.read in the preceding SQL fixture.
    assert.equal(await hasNexusTaskBoardViewGrant(client, brandA, userA), true);
    assert.equal(await hasNexusTaskBoardViewGrant(client, brandB, userB), false);
    assert.equal(await hasNexusTaskBoardViewGrant(client, brandB, userA), false);
    assert.equal(await hasNexusTaskBoardViewGrant(client, brandA, userB), false);

    const own = await loadNexusTaskBoard(client, brandA, userA);
    assert.ok(own.length >= 1, "Authorized brand has actual fixture tasks");
    assert.ok(own.every(row => row.brandId === brandA));
    assert.ok(own.every(row => row.brandKey === "altovena"));
    assert.deepEqual(await loadNexusTaskBoard(client, brandB, userA), []);
    assert.deepEqual(await loadNexusTaskBoard(client, brandA, userB), []);
    assert.deepEqual(await loadNexusTaskBoard(client, brandB, userB), []);

    const owner = await loadNexusTaskBoard(client);
    assert.ok(owner.some(row => row.brandId === brandA));
    assert.ok(owner.some(row => row.brandId === brandB));
    assert.ok(owner.every(row => !("evidenceRefs" in row) && !("actionDigest" in row)));

    await assert.rejects(
      client.query("select * from core.nexus_execution_tasks limit 1"),
      (error: unknown) => typeof error === "object" && error !== null
        && "code" in error && error.code === "42501",
      "Base task table must be inaccessible through the real login",
    );
    await assert.rejects(
      client.query("update core.nexus_execution_tasks set status='completed' where false"),
      (error: unknown) => typeof error === "object" && error !== null
        && "code" in error && error.code === "42501",
      "No task updates even with a no-op predicate",
    );
  } finally {
    await client.end().catch(() => undefined);
  }
});
