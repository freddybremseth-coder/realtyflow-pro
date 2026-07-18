import assert from "node:assert/strict";
import test from "node:test";
import {
  accessRequirementForApi,
  buildAuditTrail,
  canSeeNavHref,
  hasPermission,
  permissionsForRole,
  type AccessAuditEvent,
} from "@/lib/access-control";

test("owner receives every permission while viewer remains read-only", () => {
  assert.equal(permissionsForRole("OWNER").length >= 15, true);
  assert.equal(hasPermission("OWNER", "access.manage"), true);
  assert.equal(hasPermission("VIEWER", "finance.read"), true);
  assert.equal(hasPermission("VIEWER", "finance.write"), false);
  assert.equal(hasPermission("SALES", "customers.write"), true);
  assert.equal(hasPermission("SALES", "finance.write"), false);
  assert.equal(hasPermission("CLOSING", "documents.write"), true);
  assert.equal(hasPermission("KEYHOLDING", "keyholding.write"), true);
});

test("known API routes map to explicit permissions and unknown routes stay owner-only", () => {
  assert.equal(accessRequirementForApi("/api/revenue/commissions", "GET"), "finance.read");
  assert.equal(accessRequirementForApi("/api/revenue/commissions", "POST"), "finance.write");
  assert.equal(accessRequirementForApi("/api/revenue/closing-pack", "POST"), "documents.write");
  assert.equal(accessRequirementForApi("/api/revenue/service-revenue", "PATCH"), "keyholding.write");
  assert.equal(accessRequirementForApi("/api/contacts/abc", "GET"), "customers.read");
  assert.equal(accessRequirementForApi("/api/team-workload", "GET"), "revenue.read");
  assert.equal(accessRequirementForApi("/api/team-workload", "POST"), "access.manage");
  assert.equal(accessRequirementForApi("/api/dona-anna", "GET"), "finance.read");
  assert.equal(accessRequirementForApi("/api/dona-anna/commands", "POST"), "finance.write");
  assert.equal(accessRequirementForApi("/api/unknown/system", "GET"), "OWNER_ONLY");
  assert.equal(accessRequirementForApi("/api/access-control", "GET"), "OWNER_ONLY");
});

test("navigation is reduced by role", () => {
  assert.equal(canSeeNavHref("OWNER", "/access-control"), true);
  assert.equal(canSeeNavHref("FINANCE", "/monthly-close"), true);
  assert.equal(canSeeNavHref("FINANCE", "/dona-anna"), true);
  assert.equal(canSeeNavHref("FINANCE", "/service-revenue"), false);
  assert.equal(canSeeNavHref("KEYHOLDING", "/service-revenue"), true);
  assert.equal(canSeeNavHref("VIEWER", "/audit-log"), true);
  assert.equal(canSeeNavHref("VIEWER", "/team-workload"), true);
  assert.equal(canSeeNavHref("VIEWER", "/settings"), false);
});

test("audit trail merges access changes and contact interactions", () => {
  const access: AccessAuditEvent = {
    id: "access-1",
    at: "2026-07-10T10:00:00.000Z",
    actorEmail: "owner@example.com",
    action: "PROFILE_CREATED",
    targetEmail: "sales@example.com",
    before: null,
    after: { email: "sales@example.com", role: "SALES", active: true },
  };
  const trail = buildAuditTrail({
    now: new Date("2026-07-11T12:00:00.000Z"),
    accessAudit: [access],
    contacts: [{
      id: "contact-1",
      name: "Test Kunde",
      interactions: [{
        id: "interaction-1",
        action: "commission_payment_received",
        date: "2026-07-11T09:00:00.000Z",
        metadata: {
          performed_by: "finance@example.com",
          source: "commission-workspace",
          field: "commission_status",
          old_value: "INVOICED",
          new_value: "PAID",
          token: "must-not-leak",
        },
      }],
    }],
  });
  assert.equal(trail.events.length, 2);
  assert.equal(trail.events[0].category, "FINANCE");
  assert.equal(trail.events[0].actor, "finance@example.com");
  assert.equal(trail.events[0].details.token, "[REDACTED]");
  assert.equal(trail.events[0].before, "INVOICED");
  assert.equal(trail.events[0].after, "PAID");
  assert.equal(trail.summary.accessChanges, 1);
  assert.equal(trail.summary.actorCoveragePercent, 100);
});

test("legacy audit entries without actor are marked rather than invented", () => {
  const trail = buildAuditTrail({
    contacts: [{ id: "c1", interactions: [{ action: "note_added", date: "2026-07-01T10:00:00.000Z", metadata: { source: "legacy" } }] }],
  });
  assert.equal(trail.events[0].actorKnown, false);
  assert.match(trail.events[0].actor, /Ukjent/);
  assert.equal(trail.summary.unknownActor, 1);
  assert.equal(trail.warnings.length > 0, true);
});
