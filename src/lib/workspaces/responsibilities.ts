import type { WorkspacePermission } from "./brand-policy";

export const WORKSPACE_RESPONSIBILITIES = [
  { id: "new-leads", label: "Nye leads", description: "Følge opp nye kunder og sikre neste konkrete steg." },
  { id: "property-matching", label: "Boligforslag", description: "Finne og forberede relevante boligforslag til aktive kunder." },
  { id: "seo-content", label: "SEO · GEO · AEO & innhold", description: "Forbedre søkesynlighet, artikler, guider og viktige landingssider." },
  { id: "social-reels", label: "SoMe · Reels · video", description: "Lage og ferdigstille innhold for sosiale medier og video." },
  { id: "newsletter", label: "Nyhetsbrev & Reach", description: "Planlegge, skrive og følge opp nyhetsbrev og e-postkampanjer." },
  { id: "corporate", label: "Corporate Homes", description: "Research og oppfølging av selskaper og partnerprospekter." },
  { id: "nexus-review", label: "Nexus-innsikt", description: "Følge brand-signaler og omsette konkrete Nexus-action-signaler til arbeid." },
] as const;

export type WorkspaceResponsibilityId = (typeof WORKSPACE_RESPONSIBILITIES)[number]["id"];

export function responsibilityAllowed(
  brandKey: string,
  responsibility: WorkspaceResponsibilityId,
  permissions: WorkspacePermission[],
) {
  const hasAny = (wanted: WorkspacePermission[]) => wanted.some(permission => permissions.includes(permission));
  if (responsibility === "new-leads") return hasAny(["crm.read", "crm.write", "crm.joint.read", "crm.joint.write", "tasks.joint.read", "tasks.joint.write"]);
  if (responsibility === "property-matching") return permissions.includes("properties.catalog.read");
  if (responsibility === "seo-content") return hasAny(["visibility.plan", "content.edit", "content.publish"]);
  if (responsibility === "social-reels") return hasAny(["marketing.draft", "marketing.publish", "reels.create", "reels.publish", "youtube.publish"]);
  if (responsibility === "newsletter") return hasAny(["email.draft", "email.send"]);
  if (responsibility === "corporate") return brandKey === "zeneco" && hasAny(["corporate.read", "corporate.plan"]);
  if (responsibility === "nexus-review") return permissions.includes("nexus.read");
  return false;
}

export function filterAllowedResponsibilities(
  brandKey: string,
  value: unknown,
  permissions: WorkspacePermission[],
): WorkspaceResponsibilityId[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(WORKSPACE_RESPONSIBILITIES.map(item => item.id));
  const result: WorkspaceResponsibilityId[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !known.has(item as WorkspaceResponsibilityId)) continue;
    const typed = item as WorkspaceResponsibilityId;
    if (!result.includes(typed) && responsibilityAllowed(brandKey, typed, permissions)) result.push(typed);
  }
  return result;
}

export function normalizeResponsibilities(
  brandKey: string,
  value: unknown,
  permissions: WorkspacePermission[],
): WorkspaceResponsibilityId[] | null {
  if (!Array.isArray(value) || value.length > WORKSPACE_RESPONSIBILITIES.length) return null;
  const known = new Set(WORKSPACE_RESPONSIBILITIES.map(item => item.id));
  const result: WorkspaceResponsibilityId[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !known.has(item as WorkspaceResponsibilityId)) return null;
    const typed = item as WorkspaceResponsibilityId;
    if (result.includes(typed) || !responsibilityAllowed(brandKey, typed, permissions)) return null;
    result.push(typed);
  }
  return result;
}


export function suggestedResponsibilitiesForPreset(
  brandKey: string,
  presetId: "seo-content" | "sales-crm" | "marketing" | "partner" | "read-only" | "external-agency",
  permissions: WorkspacePermission[],
): WorkspaceResponsibilityId[] {
  const requested: WorkspaceResponsibilityId[] =
    presetId === "sales-crm" ? ["new-leads", "property-matching"] :
    presetId === "seo-content" ? ["seo-content", "nexus-review"] :
    presetId === "marketing" ? ["seo-content", "social-reels", "nexus-review"] :
    presetId === "partner" ? ["new-leads", "property-matching", "seo-content", "social-reels", "newsletter", "corporate", "nexus-review"] :
    presetId === "external-agency" ? ["seo-content", "social-reels", "nexus-review"] :
    ["nexus-review"];

  return requested.filter(item => responsibilityAllowed(brandKey, item, permissions));
}
