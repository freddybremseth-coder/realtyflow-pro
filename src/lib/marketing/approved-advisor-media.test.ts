import assert from "node:assert/strict";
import test from "node:test";
import { advisorCompositeHasManualApproval } from "./approved-advisor-media";

type Row = Record<string, any>;
function fakeSupabase(assets: Row[], jobs: Row[]) {
  return {
    from(table: string) {
      const filters = new Map<string, unknown>();
      const rows = table === "media_assets" ? assets : table === "media_generation_jobs" ? jobs : [];
      const filtered = () => rows.filter(row =>
        [...filters].every(([key, expected]) => row[key] === expected));
      const query = {
        select(_fields: string) { return query; },
        eq(key: string, value: unknown) { filters.set(key, value); return query; },
        async limit(max: number) { return { data: filtered().slice(0, max), error: null }; },
        async maybeSingle() { return { data: filtered()[0] ?? null, error: null }; },
      };
      return query;
    },
  };
}

const imageUrl = "https://cdn.example.com/advisor-01.png";
const propertyId = "p-001";
const brandId = "zeneco";
const asset = {
  id: "a-001", brand_id: brandId, property_id: propertyId,
  job_id: "job-001", public_url: imageUrl, thumbnail_url: null,
  deleted_at: null,
  metadata_json: { advisorManualApproval: {
    approved: true, approvedAt: "2026-10-10T12:00:00Z",
    approvedBy: "approver@example.com", propertyId,
    checks: { identity: true, property: true, perspective: true },
  } },
};
const job = {
  id: "job-001", idempotency_key: "advisor-composite:abc123", status: "completed",
  brand_id: brandId, property_id: propertyId,
};

test("approved advisor asset passes review for exactly its own brand and property", async () => {
  const db = fakeSupabase([asset], [job]);
  assert.equal(await advisorCompositeHasManualApproval(db, imageUrl, brandId, propertyId), true);
  assert.equal(await advisorCompositeHasManualApproval(db, imageUrl, "pinosoecolife", propertyId), false);
  assert.equal(await advisorCompositeHasManualApproval(db, imageUrl, brandId, "other-property"), false);
});

test("revoking approval rejects previously valid or scheduled advisor imagery", async () => {
  const revoked = { ...asset, metadata_json: { advisorManualApproval: {
    approved: false, revokedAt: "2026-10-10T13:00:00Z",
    propertyId,
  } } };
  assert.equal(await advisorCompositeHasManualApproval(fakeSupabase([revoked], [job]), imageUrl, brandId), false);
});

test("soft-deleting an approved advisor asset does not allow publishing it", async () => {
  const deleted = { ...asset, deleted_at: "2026-10-10T13:00:00Z" };
  assert.equal(await advisorCompositeHasManualApproval(fakeSupabase([deleted], [job]), imageUrl, brandId), false);
});

test("incomplete or non-final advisor jobs fail closed", async () => {
  const db1 = fakeSupabase([asset], [{ ...job, status: "processing" }]);
  assert.equal(await advisorCompositeHasManualApproval(db1, imageUrl, brandId), false);
  const db2 = fakeSupabase([asset], []);
  assert.equal(await advisorCompositeHasManualApproval(db2, imageUrl, brandId), false);
});

test("ordinary listing image without an advisor media asset retains legacy publishing path", async () => {
  assert.equal(await advisorCompositeHasManualApproval(fakeSupabase([], []),
    "https://cdn.example.com/listing-original.jpg", brandId), true);
});

test("advisor provenance stays absent for removed media records", async () => {
  const db = fakeSupabase([], []);
  const { advisorCompositeApprovalStatus } = await import("./approved-advisor-media");
  assert.deepEqual(await advisorCompositeApprovalStatus(db, imageUrl, brandId), {
    allowed: true, advisorFound: false,
  });
});

test("an approved advisor provides verified provenance for publish-time tagging", async () => {
  const { advisorCompositeApprovalStatus } = await import("./approved-advisor-media");
  assert.deepEqual(await advisorCompositeApprovalStatus(fakeSupabase([asset], [job]), imageUrl, brandId), {
    allowed: true, advisorFound: true,
  });
});
