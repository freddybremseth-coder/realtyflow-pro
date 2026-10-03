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
    careLeadWorkItems: [{
      id: "lead-work-1",
      source_id: "lead-contact-1",
      status: "TO_DO",
      priority: "MEDIUM",
      next_action: "Zen Eco Homes Care: svar personlig.",
      created_at: "2026-07-29T09:30:00.000Z",
      metadata: {
        segment: "care",
        service_intent: "boligtilsyn",
        request_type: "care-boligtilsyn",
        source: "zeneco-care-boligtilsyn",
        page_url: "https://care.zenecohomes.com/boligtilsyn-costa-blanca/",
        preferred_area: "Altea",
        property_type: "villa",
        utm_source: "google_search",
        is_existing_contact: false,
        email: "lead@example.com",
      },
    }],
    careLeadContacts: [{
      id: "lead-contact-1",
      name: "Ny Care Lead",
      email: "lead@example.com",
      phone: "+47 900 00 000",
      pipeline_status: "NEW",
      source: "zeneco-care-boligtilsyn",
    }],
  });

  assert.equal(dashboard.summary.properties, 1);
  assert.equal(dashboard.summary.customers, 1);
  assert.equal(dashboard.summary.activeContracts, 1);
  assert.equal(dashboard.summary.monthlyRecurringRevenueCents, 8900);
  assert.equal(dashboard.summary.photos, 1);
  assert.equal(dashboard.summary.draftInvoices, 1);
  assert.equal(dashboard.summary.upcomingEvents, 1);
  assert.equal(dashboard.summary.upcomingEvents7d, 1);
  assert.equal(dashboard.summary.staleOpenLeads, 0);
  assert.equal(dashboard.serviceDemand.length, 1);
  assert.equal(dashboard.serviceDemand[0]?.serviceIntent, "boligtilsyn");
  assert.equal(dashboard.serviceDemand[0]?.trackedLeads, 1);
  assert.equal(dashboard.serviceDemand[0]?.openLeads, 1);
  assert.equal(dashboard.serviceDemand[0]?.contractedLeads, 0);
  assert.equal(dashboard.properties[0]?.ownerName, "Test Owner");
  assert.equal(dashboard.properties[0]?.planName, "Standard");
  assert.equal(dashboard.reports[0]?.deliveryCount, 1);
  assert.equal(dashboard.photos[0]?.caption, "Fasade");
  assert.equal(dashboard.keys[0]?.lastHolder, "Freddy");
  assert.equal(dashboard.leads.length, 1);
  assert.equal(dashboard.leads[0]?.contactName, "Ny Care Lead");
  assert.equal(dashboard.leads[0]?.serviceIntent, "boligtilsyn");
  assert.equal(dashboard.leads[0]?.source, "zeneco-care-boligtilsyn");
  assert.equal(dashboard.leads[0]?.pageUrl, "https://care.zenecohomes.com/boligtilsyn-costa-blanca/");
  assert.equal(dashboard.leads[0]?.pipelineStatus, "NEW");
  assert.equal(dashboard.leads[0]?.preferredArea, "Altea");
  assert.equal(dashboard.leads[0]?.propertyType, "villa");
  assert.equal(dashboard.leads[0]?.carePropertyId, null);
  assert.equal(dashboard.leads[0]?.careContractId, null);
  assert.equal(dashboard.leads[0]?.customerHref, "/customers/lead-contact-1");
  assert.equal(dashboard.lifecycle.trackedLeads, 1);
  assert.equal(dashboard.lifecycle.openLeads, 1);
  assert.equal(dashboard.lifecycle.awaitingProperty, 1);
  assert.equal(dashboard.lifecycle.awaitingContract, 0);
  assert.equal(dashboard.lifecycle.contractedLeads, 0);
  assert.equal(dashboard.lifecycle.leadToContractPercent, 0);
  assert.equal(dashboard.lifecycle.propertiesWithoutNextVisit, 0);
  assert.equal(dashboard.lifecycle.propertiesWithoutKey, 0);
  assert.equal(dashboard.lifecycle.openOperationalIssues, 0);
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


test("Care lead reuses an already onboarded Care property for later agreement activation", () => {
  const dashboard = buildCareDashboard({
    generatedAt: new Date("2026-10-02T12:00:00.000Z"),
    properties: [{
      id: "care-property-1",
      owner_id: "lead-contact-2",
      reference: "CARE-2026-ABC12345",
      name: "Casa Albir",
      property_type: "villa",
      address_line: "Calle Mar 10",
      municipality: "Albir",
      postcode: "03581",
      has_pool: true,
      has_garden: false,
      status: "active",
    }],
    ownerContacts: [{ id: "lead-contact-2", name: "Care Owner", email: "owner2@example.com" }],
    careLeadWorkItems: [{
      id: "lead-work-2",
      source_id: "lead-contact-2",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      created_at: "2026-10-02T11:00:00.000Z",
      metadata: {
        segment: "care",
        service_intent: "keyholding",
        request_type: "care-keyholding",
        care_property_id: "care-property-1",
        care_reference: "CARE-2026-ABC12345",
      },
    }],
    careLeadContacts: [{
      id: "lead-contact-2",
      name: "Care Owner",
      email: "owner2@example.com",
      pipeline_status: "NEW",
    }],
  });

  const lead = dashboard.leads[0];
  assert.equal(lead?.carePropertyId, "care-property-1");
  assert.equal(lead?.careContractId, null);
  assert.equal(lead?.carePropertyName, "Casa Albir");
  assert.equal(lead?.carePropertyType, "villa");
  assert.equal(lead?.carePropertyAddress, "Calle Mar 10");
  assert.equal(lead?.careMunicipality, "Albir");
  assert.equal(lead?.carePostcode, "03581");
  assert.equal(lead?.careHasPool, true);
  assert.equal(lead?.careHasGarden, false);
  assert.equal(dashboard.lifecycle.awaitingProperty, 0);
  assert.equal(dashboard.lifecycle.awaitingContract, 1);
  assert.equal(dashboard.lifecycle.contractedLeads, 0);
});


test("Care lead queue keeps open enquiries ahead of newer completed items", () => {
  const dashboard = buildCareDashboard({
    generatedAt: new Date("2026-10-03T00:00:00.000Z"),
    careLeadWorkItems: [
      {
        id: "lead-done",
        source_id: "contact-done",
        status: "DONE",
        priority: "MEDIUM",
        created_at: "2026-10-02T23:30:00.000Z",
        metadata: { segment: "care", service_intent: "keyholding" },
      },
      {
        id: "lead-open",
        source_id: "contact-open",
        status: "TO_DO",
        priority: "MEDIUM",
        created_at: "2026-10-02T22:00:00.000Z",
        metadata: { segment: "care", service_intent: "boligtilsyn" },
      },
    ],
    careLeadContacts: [
      { id: "contact-done", name: "Ferdig Care Lead" },
      { id: "contact-open", name: "Åpen Care Lead" },
    ],
  });

  assert.equal(dashboard.leads[0]?.id, "lead-open");
  assert.equal(dashboard.leads[1]?.id, "lead-done");
});


test("Care lifecycle flags active contracts without visit or key and calculates lead conversion", () => {
  const dashboard = buildCareDashboard({
    generatedAt: new Date("2026-10-03T08:00:00.000Z"),
    plans: [{ id: "plan-1", code: "STANDARD", name: "Standard", price_cents: 8900, visits_per_month: 2, is_active: true }],
    properties: [{
      id: "property-1",
      owner_id: "contact-1",
      reference: "CARE-1",
      name: "Casa Care",
      property_type: "villa",
      address_line: "Calle Uno 1",
      municipality: "Altea",
      status: "active",
    }],
    ownerContacts: [{ id: "contact-1", name: "Care Owner" }],
    contracts: [{
      id: "contract-1",
      property_id: "property-1",
      plan_id: "plan-1",
      status: "active",
      plan_snapshot: { name: "Standard", price_cents: 8900 },
    }],
    careLeadWorkItems: [{
      id: "lead-1",
      source_id: "contact-1",
      status: "DONE",
      metadata: {
        segment: "care",
        care_property_id: "property-1",
        care_contract_id: "contract-1",
        service_intent: "keyholding",
      },
    }],
    careLeadContacts: [{ id: "contact-1", name: "Care Owner" }],
    issues: [{ id: "issue-1", property_id: "property-1", status: "open", title: "Fukt" }],
    workOrders: [{ id: "work-1", property_id: "property-1", status: "open", description: "Sjekk lekkasje" }],
  });

  assert.equal(dashboard.lifecycle.trackedLeads, 1);
  assert.equal(dashboard.lifecycle.contractedLeads, 1);
  assert.equal(dashboard.lifecycle.leadToContractPercent, 100);
  assert.equal(dashboard.lifecycle.propertiesWithoutNextVisit, 1);
  assert.equal(dashboard.lifecycle.propertiesWithoutKey, 1);
  assert.equal(dashboard.lifecycle.openOperationalIssues, 2);
  assert.equal(dashboard.summary.monthlyRecurringRevenueCents, 8900);
});


test("Care service demand separates intents and flags stale open leads", () => {
  const dashboard = buildCareDashboard({
    generatedAt: new Date("2026-10-03T12:00:00.000Z"),
    careLeadWorkItems: [
      {
        id: "lead-old-open",
        source_id: "contact-1",
        status: "TO_DO",
        created_at: "2026-10-01T08:00:00.000Z",
        metadata: { segment: "care", service_intent: "boligtilsyn", request_type: "care-boligtilsyn" },
      },
      {
        id: "lead-new-open",
        source_id: "contact-2",
        status: "TO_DO",
        created_at: "2026-10-03T11:00:00.000Z",
        metadata: { segment: "care", service_intent: "klargjoring", request_type: "care-klargjoring" },
      },
      {
        id: "lead-contracted",
        source_id: "contact-3",
        status: "DONE",
        created_at: "2026-10-02T10:00:00.000Z",
        metadata: {
          segment: "care",
          service_intent: "boligtilsyn",
          request_type: "care-boligtilsyn",
          care_property_id: "property-3",
          care_contract_id: "contract-3",
        },
      },
    ],
    careLeadContacts: [
      { id: "contact-1", name: "Old lead" },
      { id: "contact-2", name: "New lead" },
      { id: "contact-3", name: "Contracted lead" },
    ],
  });

  assert.equal(dashboard.summary.staleOpenLeads, 1);
  assert.equal(dashboard.lifecycle.openLeads, 2);
  assert.equal(dashboard.serviceDemand.length, 2);
  const boligtilsyn = dashboard.serviceDemand.find((item) => item.serviceIntent === "boligtilsyn");
  const klargjoring = dashboard.serviceDemand.find((item) => item.serviceIntent === "klargjoring");
  assert.equal(boligtilsyn?.trackedLeads, 2);
  assert.equal(boligtilsyn?.openLeads, 1);
  assert.equal(boligtilsyn?.contractedLeads, 1);
  assert.equal(boligtilsyn?.leadToContractPercent, 50);
  assert.equal(klargjoring?.trackedLeads, 1);
  assert.equal(klargjoring?.openLeads, 1);
  assert.equal(klargjoring?.contractedLeads, 0);
});
