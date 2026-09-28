export const WORKSPACE_ACCESS_PRESETS = [
  { id: "seo-content", label: "SEO & Content", description: "SEO/GEO/AEO og nettsideinnhold. Ingen CRM, e-post eller publisering til sosiale medier." },
  { id: "sales-crm", label: "Salg / CRM", description: "Kunder, boligkatalog, oppgaver og brand-godkjent én-til-én e-post." },
  { id: "marketing", label: "Marketing", description: "Innhold, Reels, sosiale medier, SEO, annonser og events med publiseringsrettighet." },
  { id: "read-only", label: "Read only", description: "Bred lesetilgang i valgt brand, uten å kunne endre eller publisere." },
  { id: "external-agency", label: "Eksternt byrå", description: "Lage utkast, Reels og SEO-arbeid, men ingen CRM, e-post eller publisering." },
] as const;

export type WorkspaceAccessPresetId = (typeof WORKSPACE_ACCESS_PRESETS)[number]["id"];

export type WorkspaceAccessPresetChoice = {
  crmRead: boolean;
  crmWrite: boolean;
  properties: boolean;
  tasksRead: boolean;
  tasksWrite: boolean;
  marketingRead: boolean;
  marketingDraft: boolean;
  marketingPublish: boolean;
  reelsRead: boolean;
  reelsCreate: boolean;
  reelsPublish: boolean;
  corporateRead: boolean;
  corporatePlan: boolean;
  visibilityRead: boolean;
  visibilityPlan: boolean;
  adsRead: boolean;
  adsDraft: boolean;
  eventsPlan: boolean;
  contentRead: boolean;
  contentEdit: boolean;
  contentPublish: boolean;
  emailRead: boolean;
  emailDraft: boolean;
  emailSend: boolean;
};

function blank(): WorkspaceAccessPresetChoice {
  return {
    crmRead: false, crmWrite: false, properties: false, tasksRead: false, tasksWrite: false,
    marketingRead: false, marketingDraft: false, marketingPublish: false,
    reelsRead: false, reelsCreate: false, reelsPublish: false,
    corporateRead: false, corporatePlan: false,
    visibilityRead: false, visibilityPlan: false,
    adsRead: false, adsDraft: false, eventsPlan: false,
    contentRead: false, contentEdit: false, contentPublish: false,
    emailRead: false, emailDraft: false, emailSend: false,
  };
}

export function workspaceAccessPresetChoice(
  brandKey: string,
  presetId: WorkspaceAccessPresetId,
): WorkspaceAccessPresetChoice {
  const choice = blank();
  const isZen = brandKey === "zeneco";
  const supportsReels = ["zeneco", "pinosoecolife"].includes(brandKey);

  if (presetId === "seo-content") {
    return {
      ...choice,
      marketingRead: true,
      marketingDraft: true,
      visibilityRead: true,
      visibilityPlan: true,
      contentRead: true,
      contentEdit: true,
      contentPublish: true,
    };
  }

  if (presetId === "sales-crm") {
    return {
      ...choice,
      crmRead: true,
      crmWrite: true,
      properties: true,
      tasksRead: isZen,
      tasksWrite: isZen,
      emailRead: true,
      emailDraft: true,
      emailSend: true,
    };
  }

  if (presetId === "marketing") {
    return {
      ...choice,
      marketingRead: true,
      marketingDraft: true,
      marketingPublish: true,
      reelsRead: supportsReels,
      reelsCreate: supportsReels,
      reelsPublish: supportsReels,
      visibilityRead: true,
      visibilityPlan: true,
      adsRead: true,
      adsDraft: true,
      eventsPlan: true,
      contentRead: true,
      contentEdit: true,
      contentPublish: true,
    };
  }

  if (presetId === "read-only") {
    return {
      ...choice,
      crmRead: true,
      properties: true,
      tasksRead: isZen,
      marketingRead: true,
      reelsRead: supportsReels,
      corporateRead: isZen,
      visibilityRead: true,
      adsRead: true,
      contentRead: true,
      emailRead: true,
    };
  }

  return {
    ...choice,
    marketingRead: true,
    marketingDraft: true,
    reelsRead: supportsReels,
    reelsCreate: supportsReels,
    visibilityRead: true,
    visibilityPlan: true,
    adsRead: true,
    adsDraft: true,
    eventsPlan: true,
    contentRead: true,
    contentEdit: true,
  };
}
