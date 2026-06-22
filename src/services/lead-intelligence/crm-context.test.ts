import assert from "node:assert/strict";
import test from "node:test";
import {
  loadLeadIntelligenceCrmContext,
  type LeadIntelligenceCrmContextItem,
} from "./crm-context";
import type { LeadContactCandidatePreview, QueryClient } from "./persistence";

const contactId = "33333333-3333-4333-8333-333333333333";
const otherContactId = "44444444-4444-4444-8444-444444444444";

class CrmContextDb implements QueryClient {
  queries: Array<{ sql: string; values: readonly unknown[] | undefined }> = [];

  async query<T>(sql: string, values?: readonly unknown[]) {
    this.queries.push({ sql, values });
    return {
      rows: [
        {
          contact_id: contactId,
          name: "Emmadale",
          phone: "+4790174714",
          email: "emmadale@example.test",
          pipeline_status: "qualified",
          pipeline_value: "440000",
          property_interest: "Penthouse eller enderekkehus",
          source: "phone_call",
          sentiment: "positive",
          notes_excerpt: "Kjøpeklar dersom riktig bolig dukker opp.",
          interaction_count: 3,
          last_contact: "2026-06-21T10:00:00.000Z",
          next_followup: null,
          created_at: "2026-06-20T10:00:00.000Z",
          updated_at: "2026-06-21T11:00:00.000Z",
        },
      ] as T[],
    };
  }
}

function candidate(overrides: Partial<LeadContactCandidatePreview> = {}): LeadContactCandidatePreview {
  return {
    contactId,
    name: "Emmadale",
    maskedPhone: "+47******14",
    maskedEmail: "e******e@example.test",
    matchType: "exact_phone",
    confidence: 0.98,
    reasons: ["Eksakt telefonoppslag i normalisert lookup-format"],
    matchValueHash: "hmac-sha256:v1:server-only",
    ...overrides,
  };
}

test("CRM context loads through the restricted lookup view and masks contact fields", async () => {
  const db = new CrmContextDb();
  const result = await loadLeadIntelligenceCrmContext({
    db,
    candidates: [candidate()],
  });

  assert.equal(result.length, 1);
  const item = result[0] as LeadIntelligenceCrmContextItem;
  assert.equal(item.contactId, contactId);
  assert.equal(item.name, "Emmadale");
  assert.equal(item.maskedPhone?.includes("90174714"), false);
  assert.equal(item.maskedEmail?.includes("emmadale"), false);
  assert.equal(item.pipelineStatus, "qualified");
  assert.equal(item.pipelineValue, 440000);
  assert.equal(item.propertyInterest, "Penthouse eller enderekkehus");
  assert.equal(item.notesExcerpt, "Kjøpeklar dersom riktig bolig dukker opp.");
  assert.equal(item.interactionCount, 3);
  assert.equal(JSON.stringify(result).includes("hmac-sha256"), false);

  assert.equal(db.queries.length, 1);
  assert.equal(db.queries[0].sql.includes("public.lead_intelligence_crm_context_lookup"), true);
  assert.equal(db.queries[0].sql.includes("public.contacts"), false);
  assert.equal(/\b(insert|update|delete)\b/i.test(db.queries[0].sql), false);
});

test("CRM context only returns rows for server-confirmed candidate ids", async () => {
  const db = new CrmContextDb();
  const result = await loadLeadIntelligenceCrmContext({
    db,
    candidates: [candidate()],
    contactIds: [otherContactId],
  });

  assert.deepEqual(result, []);
  assert.equal(db.queries.length, 0);
});

test("CRM context can be limited to requested candidate ids without trusting client-only ids", async () => {
  const db = new CrmContextDb();
  await loadLeadIntelligenceCrmContext({
    db,
    candidates: [candidate(), candidate({ contactId: otherContactId, matchType: "exact_email" })],
    contactIds: [contactId],
  });

  assert.deepEqual(db.queries[0].values, [[contactId]]);
});
