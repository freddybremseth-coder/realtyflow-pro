import type { WorkspacePermission } from "./brand-policy";

export type WorkspaceResponsibility = {
  id: "customers" | "properties" | "growth" | "social" | "email" | "corporate" | "nexus";
  label: string;
};

function hasAny(permissions: WorkspacePermission[], wanted: WorkspacePermission[]) {
  return wanted.some(permission => permissions.includes(permission));
}

export function workspaceResponsibilities(
  brandKey: string,
  permissions: WorkspacePermission[],
): WorkspaceResponsibility[] {
  const result: WorkspaceResponsibility[] = [];

  if (hasAny(permissions, ["crm.read", "crm.write", "crm.joint.read", "crm.joint.write", "tasks.joint.read", "tasks.joint.write"])) {
    result.push({ id: "customers", label: "Kunder & oppfølging" });
  }
  if (permissions.includes("properties.catalog.read")) {
    result.push({ id: "properties", label: "Eiendommer" });
  }
  if (hasAny(permissions, [
    "visibility.read", "visibility.plan",
    "content.read", "content.edit", "content.publish",
    "ads.read", "ads.draft", "events.plan",
  ])) {
    result.push({ id: "growth", label: "SEO · innhold · vekst" });
  }
  if (hasAny(permissions, [
    "marketing.read", "marketing.draft", "marketing.publish",
    "reels.read", "reels.create", "reels.publish",
    "youtube.read", "youtube.publish",
  ])) {
    result.push({ id: "social", label: "SoMe · Reels · video" });
  }
  if (hasAny(permissions, ["email.read", "email.draft", "email.send"])) {
    result.push({ id: "email", label: "E-post & Reach" });
  }
  if (brandKey === "zeneco" && hasAny(permissions, ["corporate.read", "corporate.plan"])) {
    result.push({ id: "corporate", label: "Corporate Homes" });
  }
  if (permissions.includes("nexus.read")) {
    result.push({ id: "nexus", label: "Nexus innsikt" });
  }

  return result;
}
