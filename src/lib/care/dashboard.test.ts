import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCareDashboard } from "./dashboard";

test("Care dashboard summarizes contracts, reports, photos and invoices", () => {
  const dashboard = buildCareDashboard({
    generatedAt: new Date("2026-07-29T10:00:00.000Z"),
    orgs: [{ id: "org-1" }],
    orgMembers: [{ id: "member-1", org_id: "org-1" }],
    plans: [{
      id: "plan-standard",
      code: "STANDARD",
      name: "Standard",
      visits_per_month: 2,
      price_cents: 8900,
      currency: "EUR",
      included_services: ["inspection", "keyholding"],
      is_active: true,
    }],
    checklistItems: [{ id: "item-1", org_id: "org-1" }, { id: "item-2", org_id: "org-1" }],
    properties: [{
      id: "property-1",
      owner_id: "contact-1",
      reference: "KH-001",
      name: "Casa Test",
      property_type: "villa",
      address_line: "Calle Test 1",
      municipality: "Altea",
      has_pool: true,
      status: "active",
    }],
    ownerContacts: [{ id: "contact-1", name: "Test Owner", email: "owner@example.com" }],
    contracts: [{
      id: "contract-1",
      property_id: "property-1",
      plan_id: "plan-standard",
      status: "active",
      starts_on: "2026-07-01",
      plan_snapshot: { code: "STANDARD", name: "Standard", price_cents: 8900 },
    }],
    inspections: [{
      id: "inspection-1",
      property_id: "property-1",
      kind: "scheduled",
      status: "completed",
      started_at: "2026-07-28T09:00:00.000Z",
      completed_at: "2026-07-28T10:00:00.000Z",
      photo_count: 1,
    }],
    reports: [{
      id: "report-1",
      inspection_id: "inspection-1",
      property_id: "property-1",
      reference: "R-001",
      locale: "no",
      status: "sent",
      storage_path: "reports/r-001.pdf",
      sent_at: "2026-07-28T11:00:00.000Z",
      view_count: 2,
    }],
    reportDeliveries: [{ id: "delivery-1", report_id: "report-1" }],
    photos: [{
      id: "photo-1",
      inspection_id: "inspection-1",
      storage_path: "photos/front.jpg",
      caption: { no: "Fasade" },
      taken_at: "2026-07-28T09:30:00.000Z",
    }],
    invoices: [{
      id: "invoice-1",
      property_id: "property-1",
      reference: "INV-001",
      status: "draft",
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      total_cents: 10769,
      currency: "EUR",
    }],
    invoiceLines: [{ id: "line-1", invoice_id: "invoice-1" }],
    charges: [{
      id: "charge-1",
      property_id: "property-1",
      description: "Ekstra tilsyn",
      status: "open",
      amount_cents: 3500,
      currency: "EUR",
    }],
    keys: [{
      id: "key-1",
      property_id: "property-1",
      label: "Hovednøkkel",
      status: "in_office",
      storage_location: "Safe A",
    }],
    keyEvents: [{
      id: "key-event-1",
      key_id: "key-1",
      property_id: "property-1",
      holder_name: "Freddy",
      at: "2026-07-28T12:00:00.000Z",
    }],
    calendarEvents: [{
      id: "event-1",
      property_id: "property-1",
      event_type: "inspection",
      title: "Månedlig tilsyn",
      starts_at: "2026-08-05T09:00:00.000Z",
      ends_at: "2026-08-05T10:00:00.000Z",
      status: "planned",
      is_billable: true,
    }],
  });

  assert.equal(dashboard.summary.properties, 1);
  assert.equal(dashboard.summary.customers, 1);
  assert.equal(dashboard.summary.activeContracts, 1);
  assert.equal(dashboard.summary.monthlyRecurringRevenueCents, 8900);
  assert.equal(dashboard.summary.photos, 1);
  assert.equal(dashboard.summary.draftInvoices, 1);
  assert.equal(dashboard.summary.upcomingEvents, 1);
  assert.equal(dashboard.properties[0]?.ownerName, "Test Owner");
  assert.equal(dashboard.properties[0]?.planName, "Standard");
  assert.equal(dashboard.reports[0]?.deliveryCount, 1);
  assert.equal(dashboard.photos[0]?.caption, "Fasade");
  assert.equal(dashboard.keys[0]?.lastHolder, "Freddy");
});

test("Care dashboard marks empty customer setup without failing the ready schema", () => {
  const dashboard = buildCareDashboard({
    generatedAt: new Date("2026-07-29T10:00:00.000Z"),
    orgs: [{ id: "org-1" }],
    plans: [{ id: "plan-basic", code: "BASIC", price_cents: 5500, visits_per_month: 1, is_active: true }],
    checklistItems: [{ id: "item-1" }],
  });

  assert.equal(dashboard.summary.properties, 0);
  assert.equal(dashboard.readiness.find((item) => item.id === "schema")?.status, "ok");
  assert.equal(dashboard.readiness.find((item) => item.id === "properties")?.status, "empty");
  assert.equal(dashboard.workflows.find((item) => item.id === "customers")?.href, "/care/customers");
});
