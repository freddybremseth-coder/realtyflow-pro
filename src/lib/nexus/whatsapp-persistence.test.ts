import assert from "node:assert/strict";
import { test } from "node:test";
import { persistWhatsAppInbound } from "@/lib/nexus/whatsapp-persistence";

function createMock(options?: { duplicate?: boolean; existingContact?: any }) {
  const inserts: Array<{ table: string; payload: any }> = [];
  const updates: Array<{ table: string; payload: any }> = [];
  const existing = options?.existingContact || null;

  function query(table: string) {
    const state: any = { table, payload: null, mode: "select" };
    const chain: any = {
      select() { return chain; },
      eq() { return chain; },
      limit() { return chain; },
      maybeSingle: async () => {
        if (table === "revenue_events") return { data: options?.duplicate ? { id: "evt-1", contact_id: existing?.id || "contact-1" } : null, error: null };
        return { data: null, error: null };
      },
      update(payload: any) { state.mode = "update"; state.payload = payload; updates.push({ table, payload }); return chain; },
      insert(payload: any) { state.mode = "insert"; state.payload = payload; inserts.push({ table, payload }); return chain; },
      single: async () => ({ data: { id: existing?.id || "contact-1", name: existing?.name || "Test Lead" }, error: null }),
      then(resolve: any) {
        if (table === "contacts" && state.mode === "select") return Promise.resolve({ data: existing ? [existing] : [], error: null }).then(resolve);
        if (state.mode === "insert" || state.mode === "update") return Promise.resolve({ data: { id: existing?.id || "contact-1", name: existing?.name || "Test Lead" }, error: null }).then(resolve);
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return chain;
  }

  return { client: { from: query }, inserts, updates };
}

test("duplicate WhatsApp message suppresses repeated persistence and reply", async () => {
  const mock = createMock({ duplicate: true });
  const result = await persistWhatsAppInbound(mock.client, {
    messageId: "wamid.dup",
    from: "+34600111222",
    text: "I want a viewing in Altea",
  });
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
  assert.equal(result.autoReply.allowed, false);
  assert.equal(mock.inserts.length, 0);
  assert.equal(mock.updates.length, 0);
});

test("negative intent updates memory but creates no sales work item", async () => {
  const mock = createMock({ existingContact: { id: "c-1", name: "Maria", phone: "+34600111222", interactions: [], pipeline_status: "QUALIFIED" } });
  const result = await persistWhatsAppInbound(mock.client, {
    messageId: "wamid.stop",
    from: "+34 600 111 222",
    profileName: "Maria",
    text: "No me interesa, stop",
  });
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.autoReply.allowed, false);
  assert.equal(mock.inserts.filter((entry) => entry.table === "work_items").length, 0);
  assert.equal(mock.updates.filter((entry) => entry.table === "contacts").length, 1);
});

test("hot WhatsApp viewing creates high-priority work item and preserves buyer signals", async () => {
  const mock = createMock();
  const result = await persistWhatsAppInbound(mock.client, {
    messageId: "wamid.hot",
    from: "+34600999888",
    profileName: "John",
    brandId: "zeneco",
    text: "Can I arrange a viewing this week in Altea? Budget €650000, 3 bedrooms, ref ZEN-4421",
  });
  assert.equal(result.ok, true);
  assert.equal(result.createdContact, true);
  assert.equal(result.workItemCreated, true);
  assert.equal(result.autoReply.mode, "HANDOFF");
  const work = mock.inserts.find((entry) => entry.table === "work_items")?.payload;
  assert.equal(work.priority, "HIGH");
  assert.equal(work.source_type, "whatsapp");
  assert.equal(work.metadata.hot_signal, true);
  const contact = mock.inserts.find((entry) => entry.table === "contacts")?.payload;
  assert.equal(contact.pipeline_value, 650000);
  assert.match(String(contact.property_interest), /ZEN-4421/);
});
