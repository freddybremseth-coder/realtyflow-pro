import assert from "node:assert/strict";
import test from "node:test";
import { loadLegacyPublicationCandidate, removeLegacyScheduledRow } from "@/services/marketing/legacy-content-adapter";

/** Fake som håndhever content_publications.status CHECK (draft/processing/published/scheduled/failed). */
function checkDb(seed: any[]) {
  const rows = seed.map((r) => ({ ...r }));
  const ALLOWED = ["draft", "processing", "published", "scheduled", "failed"];
  function from() {
    const filters: Array<[string, any]> = [];
    let payload: any = null;
    const match = (r: any) => filters.every(([c, v]) => r[c] === v);
    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      update: (p: any) => { payload = p; return api; },
      maybeSingle: () => Promise.resolve({ data: rows.find(match) ?? null, error: null }),
      then: (res: any, rej: any) => {
        if (payload?.status && !ALLOWED.includes(payload.status)) {
          return Promise.resolve({ data: null, error: { message: `new row violates check constraint "content_publications_status_check" (status=${payload.status})`, code: "23514" } }).then(res, rej);
        }
        const hit: any[] = [];
        for (const r of rows) if (match(r)) { Object.assign(r, payload); hit.push(r); }
        return Promise.resolve({ data: hit, error: null }).then(res, rej);
      },
    };
    return api;
  }
  return { from, rows } as any;
}

test("removeLegacyScheduledRow bruker gyldig CHECK-status 'failed' (ikke 'archived')", async () => {
  const db = checkDb([{ id: "pub1", status: "scheduled", scheduled_at: "2026-09-02T00:00:00Z" }]);
  const r = await removeLegacyScheduledRow(db, "pub1");
  assert.equal(r.removed, true);
  assert.equal(db.rows[0].status, "failed"); // gyldig CHECK-verdi
  assert.equal(db.rows[0].scheduled_at, null);
});

test("ugyldig status ('archived') avvises av CHECK-constraint (bevis på at faken håndhever den)", async () => {
  const db = checkDb([{ id: "pub1", status: "scheduled" }]);
  const { error } = await db.from().update({ status: "archived" }).eq("id", "pub1").select("id");
  assert.ok(error);
  assert.match(error.message, /check constraint/i);
  assert.equal(db.rows[0].status, "scheduled"); // uendret — ble aldri satt til ugyldig verdi
});

test("removeLegacyScheduledRow: 0 rader (ikke scheduled) → fail-closed", async () => {
  const db = checkDb([{ id: "pub1", status: "draft" }]);
  await assert.rejects(() => removeLegacyScheduledRow(db, "pub1"), /LEGACY_ROW_NOT_SCHEDULED/);
});

function db(row: any) {
  const api: any = {
    select: () => api, eq: () => api,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  };
  return { from: () => api } as any;
}

const base = {
  id: "pub1", brand_id: "zeneco", status: "published",
  description: "Eksklusiv nybygd villa i Calpe med havutsikt. Book en visning i dag.",
  ai_image_url: "https://cdn/zen/calpe.jpg", scheduled_platforms: ["instagram"],
  created_at: "2026-07-28T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
};

test("happy path: legacy content_publication → kandidat (source legacy_content_publication)", async () => {
  const c = await loadLegacyPublicationCandidate(db(base), { publicationId: "pub1", brandId: "zeneco", channel: "instagram" });
  assert.equal(c.source, "legacy_content_publication");
  assert.equal(c.contentId, "content_publication:pub1");
  assert.equal(c.brandId, "zeneco");
  assert.equal(c.media?.imageUrl, "https://cdn/zen/calpe.jpg");
  assert.match(c.text ?? "", /Calpe/);
  assert.equal(c.humanApproved, true);
});

test("BRAND_MISMATCH: rad tilhører annet brand", async () => {
  await assert.rejects(() => loadLegacyPublicationCandidate(db({ ...base, brand_id: "soleada" }), { publicationId: "pub1", brandId: "zeneco", channel: "instagram" }), /BRAND_MISMATCH/);
});

test("PLATFORM_MISMATCH: planlagt for annen kanal", async () => {
  await assert.rejects(() => loadLegacyPublicationCandidate(db({ ...base, scheduled_platforms: ["linkedin"] }), { publicationId: "pub1", brandId: "zeneco", channel: "instagram" }), /PLATFORM_MISMATCH/);
});

test("UNTRUSTED_STATUS: draft/failed kan ikke gjenbrukes", async () => {
  await assert.rejects(() => loadLegacyPublicationCandidate(db({ ...base, status: "draft" }), { publicationId: "pub1", brandId: "zeneco", channel: "instagram" }), /UNTRUSTED_STATUS/);
  await assert.rejects(() => loadLegacyPublicationCandidate(db({ ...base, status: "failed" }), { publicationId: "pub1", brandId: "zeneco", channel: "instagram" }), /UNTRUSTED_STATUS/);
});

test("NOT_PUBLISHABLE: intern/meta-tekst blokkeres (selv om status=published)", async () => {
  const bad = { ...base, description: "Jeg setter opp Marketing Agent til å generere denne posten." };
  await assert.rejects(() => loadLegacyPublicationCandidate(db(bad), { publicationId: "pub1", brandId: "zeneco", channel: "instagram" }), /NOT_PUBLISHABLE/);
});

test("MEDIA_ASSET_MISSING: Instagram uten media-URL", async () => {
  await assert.rejects(() => loadLegacyPublicationCandidate(db({ ...base, ai_image_url: null, image_url: null, media_urls: [] }), { publicationId: "pub1", brandId: "zeneco", channel: "instagram" }), /MEDIA_ASSET_MISSING/);
});

test("mediaUrl-override brukes når raden mangler bilde", async () => {
  const c = await loadLegacyPublicationCandidate(db({ ...base, ai_image_url: null }), { publicationId: "pub1", brandId: "zeneco", channel: "instagram", mediaUrl: "https://cdn/override.jpg" });
  assert.equal(c.media?.imageUrl, "https://cdn/override.jpg");
});

test("LEGACY_PUBLICATION_NOT_FOUND: ukjent id", async () => {
  await assert.rejects(() => loadLegacyPublicationCandidate(db(null), { publicationId: "nope", brandId: "zeneco", channel: "instagram" }), /LEGACY_PUBLICATION_NOT_FOUND/);
});
