import type { WorkspacePermission } from "./brand-policy";
import {
  WORKSPACE_RESPONSIBILITIES,
  responsibilityAllowed,
  type WorkspaceResponsibilityId,
} from "./responsibilities";

export type WorkspaceTeamBrand = {
  brandKey: string;
  name: string;
};

export type WorkspaceTeamMembership = {
  brandKey: string;
  status: "active" | "revoked" | "disabled";
  permissions: WorkspacePermission[];
  responsibilities: WorkspaceResponsibilityId[];
};

export type WorkspaceTeamUser = {
  userId: string;
  displayName: string;
  status: "active" | "disabled";
  expired: boolean;
  accountKind: "staff" | "external";
  memberships: WorkspaceTeamMembership[];
};

export type WorkspaceResponsibilityCoverageStatus =
  | "owned"
  | "shared"
  | "unassigned"
  | "no-capability";

export type WorkspaceResponsibilityOwner = {
  userId: string;
  displayName: string;
  accountKind: "staff" | "external";
};

export type WorkspaceResponsibilityCoverage = {
  id: WorkspaceResponsibilityId;
  label: string;
  description: string;
  status: WorkspaceResponsibilityCoverageStatus;
  owners: WorkspaceResponsibilityOwner[];
  eligibleUsers: WorkspaceResponsibilityOwner[];
};

export type WorkspaceBrandResponsibilityOverview = {
  brandKey: string;
  brandName: string;
  activeMemberCount: number;
  coverage: WorkspaceResponsibilityCoverage[];
  ownedCount: number;
  sharedCount: number;
  unassignedCount: number;
  noCapabilityCount: number;
};

function responsibilityAppliesToBrand(brandKey: string, responsibility: WorkspaceResponsibilityId) {
  if (responsibility === "corporate") return brandKey === "zeneco";
  return true;
}

export function buildWorkspaceTeamResponsibilityOverview(input: {
  brands: WorkspaceTeamBrand[];
  users: WorkspaceTeamUser[];
}): WorkspaceBrandResponsibilityOverview[] {
  const activeUsers = input.users.filter(user => user.status === "active" && !user.expired);

  return input.brands.map(brand => {
    const members = activeUsers.flatMap(user => {
      const membership = user.memberships.find(item =>
        item.brandKey === brand.brandKey && item.status === "active");
      if (!membership) return [];
      return [{ user, membership }];
    });

    const coverage = WORKSPACE_RESPONSIBILITIES
      .filter(item => responsibilityAppliesToBrand(brand.brandKey, item.id))
      .map(item => {
        const eligible = members.filter(({ membership }) =>
          responsibilityAllowed(brand.brandKey, item.id, membership.permissions));

        const eligibleUsers: WorkspaceResponsibilityOwner[] = eligible.map(({ user }) => ({
          userId: user.userId,
          displayName: user.displayName,
          accountKind: user.accountKind,
        }));

        const owners: WorkspaceResponsibilityOwner[] = eligible
          .filter(({ membership }) => membership.responsibilities.includes(item.id))
          .map(({ user }) => ({
            userId: user.userId,
            displayName: user.displayName,
            accountKind: user.accountKind,
          }));

        const status: WorkspaceResponsibilityCoverageStatus =
          owners.length === 1 ? "owned" :
          owners.length > 1 ? "shared" :
          eligibleUsers.length > 0 ? "unassigned" :
          "no-capability";

        return {
          id: item.id,
          label: item.label,
          description: item.description,
          status,
          owners,
          eligibleUsers,
        };
      });

    return {
      brandKey: brand.brandKey,
      brandName: brand.name,
      activeMemberCount: members.length,
      coverage,
      ownedCount: coverage.filter(item => item.status === "owned").length,
      sharedCount: coverage.filter(item => item.status === "shared").length,
      unassignedCount: coverage.filter(item => item.status === "unassigned").length,
      noCapabilityCount: coverage.filter(item => item.status === "no-capability").length,
    };
  });
}

export function summarizeWorkspaceTeamResponsibilityOverview(
  overview: WorkspaceBrandResponsibilityOverview[],
) {
  return overview.reduce((summary, brand) => ({
    activeBrands: summary.activeBrands + (brand.activeMemberCount > 0 ? 1 : 0),
    owned: summary.owned + brand.ownedCount,
    shared: summary.shared + brand.sharedCount,
    unassigned: summary.unassigned + brand.unassignedCount,
    noCapability: summary.noCapability + brand.noCapabilityCount,
  }), {
    activeBrands: 0,
    owned: 0,
    shared: 0,
    unassigned: 0,
    noCapability: 0,
  });
}


export type WorkspaceBrandResponsibilityAttention = {
  brandKey: string;
  brandName: string;
  unassignedLabels: string[];
  sharedLabels: string[];
};

export function buildWorkspaceResponsibilityAttention(
  overview: WorkspaceBrandResponsibilityOverview[],
): WorkspaceBrandResponsibilityAttention[] {
  return overview
    .filter(brand => brand.activeMemberCount > 0)
    .map(brand => ({
      brandKey: brand.brandKey,
      brandName: brand.brandName,
      unassignedLabels: brand.coverage
        .filter(item => item.status === "unassigned")
        .map(item => item.label),
      sharedLabels: brand.coverage
        .filter(item => item.status === "shared")
        .map(item => item.label),
    }))
    .filter(brand => brand.unassignedLabels.length > 0 || brand.sharedLabels.length > 0);
}
