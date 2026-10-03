import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkspaceResponsibilityAttention,
  buildWorkspaceTeamResponsibilityOverview,
  summarizeWorkspaceTeamResponsibilityOverview,
  type WorkspaceTeamUser,
} from "./team-responsibility-overview";

const brands = [
  { brandKey: "pinosoecolife", name: "Pinoso EcoLife" },
  { brandKey: "zeneco", name: "Zen Eco Homes" },
];

function user(overrides: Partial<WorkspaceTeamUser> & Pick<WorkspaceTeamUser, "userId" | "displayName">): WorkspaceTeamUser {
  return {
    userId: overrides.userId,
    displayName: overrides.displayName,
    status: overrides.status ?? "active",
    expired: overrides.expired ?? false,
    accountKind: overrides.accountKind ?? "staff",
    memberships: overrides.memberships ?? [],
  };
}

test("marks one assigned eligible owner as clear responsibility coverage", () => {
  const overview = buildWorkspaceTeamResponsibilityOverview({
    brands: [brands[0]],
    users: [user({
      userId: "1",
      displayName: "Andrea",
      memberships: [{
        brandKey: "pinosoecolife",
        status: "active",
        permissions: ["crm.read","crm.write"],
        responsibilities: ["new-leads"],
      }],
    })],
  });
  const leads = overview[0].coverage.find(item => item.id === "new-leads");
  assert.equal(leads?.status, "owned");
  assert.deepEqual(leads?.owners.map(owner => owner.displayName), ["Andrea"]);
});

test("distinguishes shared ownership, unassigned eligible work and missing capability", () => {
  const overview = buildWorkspaceTeamResponsibilityOverview({
    brands: [brands[0]],
    users: [
      user({
        userId: "1",
        displayName: "Andrea",
        memberships: [{
          brandKey: "pinosoecolife",
          status: "active",
          permissions: ["crm.read","crm.write","properties.catalog.read","email.read","email.draft"],
          responsibilities: ["new-leads","property-matching"],
        }],
      }),
      user({
        userId: "2",
        displayName: "Erlend",
        accountKind: "external",
        memberships: [{
          brandKey: "pinosoecolife",
          status: "active",
          permissions: ["properties.catalog.read","email.read","email.draft"],
          responsibilities: ["property-matching"],
        }],
      }),
    ],
  });
  const brand = overview[0];
  assert.equal(brand.coverage.find(item => item.id === "property-matching")?.status, "shared");
  assert.equal(brand.coverage.find(item => item.id === "newsletter")?.status, "unassigned");
  assert.equal(brand.coverage.find(item => item.id === "seo-content")?.status, "no-capability");
});

test("disabled, expired and revoked users never count as active owners", () => {
  const overview = buildWorkspaceTeamResponsibilityOverview({
    brands: [brands[0]],
    users: [
      user({
        userId: "1",
        displayName: "Disabled",
        status: "disabled",
        memberships: [{
          brandKey: "pinosoecolife",
          status: "active",
          permissions: ["crm.read","crm.write"],
          responsibilities: ["new-leads"],
        }],
      }),
      user({
        userId: "2",
        displayName: "Expired",
        expired: true,
        memberships: [{
          brandKey: "pinosoecolife",
          status: "active",
          permissions: ["crm.read","crm.write"],
          responsibilities: ["new-leads"],
        }],
      }),
      user({
        userId: "3",
        displayName: "Revoked",
        memberships: [{
          brandKey: "pinosoecolife",
          status: "revoked",
          permissions: ["crm.read","crm.write"],
          responsibilities: ["new-leads"],
        }],
      }),
    ],
  });
  assert.equal(overview[0].activeMemberCount, 0);
  assert.equal(overview[0].coverage.find(item => item.id === "new-leads")?.status, "no-capability");
});

test("Corporate coverage is only evaluated for Zen", () => {
  const overview = buildWorkspaceTeamResponsibilityOverview({ brands, users: [] });
  assert.equal(overview.find(brand => brand.brandKey === "pinosoecolife")?.coverage.some(item => item.id === "corporate"), false);
  assert.equal(overview.find(brand => brand.brandKey === "zeneco")?.coverage.some(item => item.id === "corporate"), true);
});

test("summary counts brand coverage states without treating empty brands as active", () => {
  const overview = buildWorkspaceTeamResponsibilityOverview({
    brands: [brands[0]],
    users: [user({
      userId: "1",
      displayName: "Andrea",
      memberships: [{
        brandKey: "pinosoecolife",
        status: "active",
        permissions: ["crm.read","crm.write"],
        responsibilities: ["new-leads"],
      }],
    })],
  });
  const summary = summarizeWorkspaceTeamResponsibilityOverview(overview);
  assert.equal(summary.activeBrands, 1);
  assert.equal(summary.owned >= 1, true);
  assert.equal(summary.noCapability >= 1, true);
});


test("attention groups missing and shared responsibility by active brand", () => {
  const overview = buildWorkspaceTeamResponsibilityOverview({
    brands: [brands[0]],
    users: [
      user({
        userId: "1",
        displayName: "Andrea",
        memberships: [{
          brandKey: "pinosoecolife",
          status: "active",
          permissions: ["crm.read","crm.write","properties.catalog.read","email.read","email.draft"],
          responsibilities: ["property-matching"],
        }],
      }),
      user({
        userId: "2",
        displayName: "Erlend",
        memberships: [{
          brandKey: "pinosoecolife",
          status: "active",
          permissions: ["properties.catalog.read"],
          responsibilities: ["property-matching"],
        }],
      }),
    ],
  });
  const attention = buildWorkspaceResponsibilityAttention(overview);
  assert.equal(attention.length, 1);
  assert.equal(attention[0].brandKey, "pinosoecolife");
  assert.deepEqual(attention[0].sharedLabels, ["Boligforslag"]);
  assert.equal(attention[0].unassignedLabels.includes("Nye leads"), true);
  assert.equal(attention[0].unassignedLabels.includes("Nyhetsbrev & Reach"), true);
});

test("attention ignores inactive brands without active workspace members", () => {
  const overview = buildWorkspaceTeamResponsibilityOverview({ brands, users: [] });
  assert.deepEqual(buildWorkspaceResponsibilityAttention(overview), []);
});
