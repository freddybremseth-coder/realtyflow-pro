import assert from "node:assert/strict";
import test from "node:test";
import {
  CustomerUpdateRequestSchema,
  appendCustomerInteraction,
  buildCustomerTimelineInteraction,
  changedCustomerDetailFields,
  contactDetailPatch,
} from "./customer-updates";

test("customer details request normalizes empty values and maps CRM fields", () => {
  const parsed = CustomerUpdateRequestSchema.parse({
    action: "UPDATE_DETAILS",
    details: {
      name: " Test Buyer ",
      email: "BUYER@EXAMPLE.COM",
      phone: "",
      country: "Norway",
      language: "Norwegian",
      preferredLocation: "Albir",
      propertyInterest: "Apartment with three bedrooms",
      pipelineValue: "550000",
      pipelineStatus: "QUALIFIED",
    },
  });

  assert.equal(parsed.action, "UPDATE_DETAILS");
  if (parsed.action !== "UPDATE_DETAILS") return;
  const patch = contactDetailPatch(parsed.details);
  assert.equal(patch.name, "Test Buyer");
  assert.equal(patch.email, "buyer@example.com");
  assert.equal(patch.phone, null);
  assert.equal(patch.pipeline_value, 550000);
  assert.equal(patch.pipeline_status, "QUALIFIED");
});

test("viewing update becomes an append-only internal interaction with actor and next step", () => {
  const parsed = CustomerUpdateRequestSchema.parse({
    action: "ADD_UPDATE",
    update: {
      updateType: "viewing",
      occurredAt: "2026-07-14T10:00:00.000Z",
      title: "Viewing in Albir",
      details: "Customer liked the terrace but wants a larger kitchen.",
      propertyReference: "ALB-123",
      outcome: "second_viewing",
      nextAction: "Book a second viewing with the spouse.",
      nextFollowup: "2026-07-16T09:00:00.000Z",
      direction: "in",
    },
  });

  assert.equal(parsed.action, "ADD_UPDATE");
  if (parsed.action !== "ADD_UPDATE") return;
  const interaction = buildCustomerTimelineInteraction({
    update: parsed.update,
    actorEmail: "Agent@Example.com",
    id: "update-1",
  });

  assert.equal(interaction.type, "viewing");
  assert.equal(interaction.direction, "in");
  assert.equal(interaction.metadata.actor_email, "agent@example.com");
  assert.equal(interaction.metadata.property_reference, "ALB-123");
  assert.equal(interaction.metadata.outcome_label, "Ønsker ny visning");
  assert.equal(interaction.metadata.no_customer_contact, true);
});

test("interaction history appends and retains the newest bounded records", () => {
  const rows = Array.from({ length: 4 }, (_, index) => ({ id: `old-${index}` }));
  const interaction = {
    id: "new",
    type: "customer_note",
    date: "2026-07-14T10:00:00.000Z",
    direction: "internal",
    content: "New information",
    metadata: { source: "customer-360" },
  } as any;

  const result = appendCustomerInteraction(rows, interaction, 3);
  assert.deepEqual(result.map((row: any) => row.id), ["old-2", "old-3", "new"]);
});

test("customer detail change detection ignores unchanged values", () => {
  const fields = changedCustomerDetailFields(
    { name: "Buyer", email: "buyer@example.com", pipeline_value: 400000 },
    { name: "Buyer", email: "new@example.com", pipeline_value: 400000 },
  );
  assert.deepEqual(fields, ["email"]);
});

test("customer update validation rejects missing update details", () => {
  const parsed = CustomerUpdateRequestSchema.safeParse({
    action: "ADD_UPDATE",
    update: {
      updateType: "viewing",
      occurredAt: "2026-07-14T10:00:00.000Z",
      title: null,
      details: "",
      propertyReference: null,
      outcome: null,
      nextAction: null,
      nextFollowup: null,
      direction: "internal",
    },
  });
  assert.equal(parsed.success, false);
});
