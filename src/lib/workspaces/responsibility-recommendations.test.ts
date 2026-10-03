import assert from "node:assert/strict";
import test from "node:test";
import { recommendWorkspaceResponsibilityOwners } from "./responsibility-recommendations";
import type { WorkspaceTeamUser } from "./team-responsibility-overview";

function user(params: {
  id: string;
  name: string;
  email: string;
  permissions: WorkspaceTeamUser["memberships"][number]["permissions"];
  responsibilities?: WorkspaceTeamUser["memberships"][number]["responsibilities"];
}): WorkspaceTeamUser {
  return {
    userId: params.id,
    displayName: params.name,
    email: params.email,
    status: "active",
    expired: false,
    accountKind: "staff",
    memberships: [{
      brandKey: "pinosoecolife",
      status: "active",
      permissions: params.permissions,
      responsibilities: params.responsibilities || [],
    }],
  };
}

test("lighter workload outranks equally qualified overloaded candidate", () => {
  const users = [
    user({
      id: "a",
      name: "Andrea",
      email: "andrea@example.test",
      permissions: ["crm.read","crm.write","properties.catalog.read"],
    }),
    user({
      id: "b",
      name: "Beate",
      email: "beate@example.test",
      permissions: ["crm.read","crm.write","properties.catalog.read"],
    }),
  ];
  const result = recommendWorkspaceResponsibilityOwners({
    brandKey: "pinosoecolife",
    responsibility: "new-leads",
    users,
    workloads: [
      { email: "andrea@example.test", totalScore: 40, load: "LIGHT", contacts: 1, tasks: 0, overdue: 0, critical: 0 },
      { email: "beate@example.test", totalScore: 480, load: "HIGH", contacts: 7, tasks: 4, overdue: 2, critical: 1 },
    ],
  });
  assert.equal(result[0]?.userId, "a");
  assert.match(result[0]?.reasons.join(" "), /Lav arbeidsbelastning/);
  assert.equal((result[0]?.score || 0) > (result[1]?.score || 0), true);
});

test("role profile fit improves recommendation when workload is equal", () => {
  const users = [
    user({
      id: "seo",
      name: "SEO Specialist",
      email: "seo@example.test",
      permissions: [
        "marketing.read","marketing.draft","visibility.read","visibility.plan",
        "content.read","content.edit","content.publish","nexus.read",
      ],
    }),
    user({
      id: "minimal",
      name: "Minimal Editor",
      email: "minimal@example.test",
      permissions: ["content.read","content.edit"],
    }),
  ];
  const result = recommendWorkspaceResponsibilityOwners({
    brandKey: "pinosoecolife",
    responsibility: "seo-content",
    users,
    workloads: [
      { email: "seo@example.test", totalScore: 120, load: "BALANCED", contacts: 1, tasks: 2, overdue: 0, critical: 0 },
      { email: "minimal@example.test", totalScore: 120, load: "BALANCED", contacts: 1, tasks: 2, overdue: 0, critical: 0 },
    ],
  });
  assert.equal(result[0]?.userId, "seo");
  assert.equal(result[0]?.bestPresetLabel, "SEO & Content");
});

test("existing personal responsibility load reduces recommendation score", () => {
  const users = [
    user({
      id: "free",
      name: "Free",
      email: "free@example.test",
      permissions: ["email.read","email.draft","email.send"],
    }),
    user({
      id: "busy",
      name: "Busy",
      email: "busy@example.test",
      permissions: ["email.read","email.draft","email.send"],
      responsibilities: ["new-leads","property-matching","seo-content","social-reels"],
    }),
  ];
  const result = recommendWorkspaceResponsibilityOwners({
    brandKey: "pinosoecolife",
    responsibility: "newsletter",
    users,
  });
  assert.equal(result[0]?.userId, "free");
  assert.equal((result[0]?.score || 0) > (result[1]?.score || 0), true);
});

test("recommendations exclude disabled, expired and permission-ineligible users", () => {
  const eligible = user({
    id: "ok",
    name: "Eligible",
    email: "ok@example.test",
    permissions: ["properties.catalog.read"],
  });
  const disabled = { ...eligible, userId: "disabled", status: "disabled" as const };
  const expired = { ...eligible, userId: "expired", expired: true };
  const ineligible = user({
    id: "no",
    name: "No access",
    email: "no@example.test",
    permissions: ["email.read"],
  });
  const result = recommendWorkspaceResponsibilityOwners({
    brandKey: "pinosoecolife",
    responsibility: "property-matching",
    users: [disabled, expired, ineligible, eligible],
  });
  assert.deepEqual(result.map(item => item.userId), ["ok"]);
});
