import type { WorkspacePermission } from "./brand-policy";

export type WorkspaceProgramId =
  | "crm"
  | "properties"
  | "jointTasks"
  | "marketing"
  | "corporate"
  | "visibility"
  | "ads"
  | "events"
  | "socialPublish"
  | "reels"
  | "seo"
  | "youtube"
  | "content"
  | "email"
  | "nexus";

export type WorkspaceProgramDefinition = {
  id: WorkspaceProgramId;
  label: string;
  description: string;
  status: "ready" | "planned";
  brandScope: "all" | "zeneco-only";
  readPermissions: WorkspacePermission[];
  writePermissions: WorkspacePermission[];
};

export const WORKSPACE_PROGRAM_CATALOG: WorkspaceProgramDefinition[] = [
  {
    id: "crm",
    label: "Leads & CRM",
    description: "Se og følge opp leads/kunder for valgt merkevare. Zen er fortsatt begrenset til godkjente nye fellesleads.",
    status: "ready",
    brandScope: "all",
    readPermissions: ["crm.read"],
    writePermissions: ["crm.write"],
  },
  {
    id: "properties",
    label: "Eiendommer",
    description: "Søk i publisert eiendomskatalog uten interne feed-, provisjons- eller eierfelt.",
    status: "ready",
    brandScope: "all",
    readPermissions: ["properties.catalog.read"],
    writePermissions: [],
  },
  {
    id: "jointTasks",
    label: "Felles oppgaver",
    description: "Nye oppgaver for individuelt godkjente Zen-felleskunder. Ingen gamle CRM-oppgaver.",
    status: "ready",
    brandScope: "zeneco-only",
    readPermissions: ["tasks.joint.read"],
    writePermissions: ["tasks.joint.write"],
  },
  {
    id: "marketing",
    label: "Markedsføring & innholdsutkast",
    description: "Se kanalstatus og brand-avgrenset innhold, og lagre nye utkast uten å publisere.",
    status: "ready",
    brandScope: "all",
    readPermissions: ["marketing.read"],
    writePermissions: ["marketing.draft"],
  },
  {
    id: "corporate",
    label: "Corporate Homes",
    description: "Bedrifts- og partnerprospekter, research og planlagte neste steg for Zen Eco Homes.",
    status: "ready",
    brandScope: "zeneco-only",
    readPermissions: ["corporate.read"],
    writePermissions: ["corporate.plan"],
  },
  {
    id: "visibility",
    label: "SEO · GEO · AEO · søkeord",
    description: "Brand-avgrenset søkesynlighet, SEO-oppgaver, søkeord og tekstforbedringer uten global agenttilgang.",
    status: "ready",
    brandScope: "all",
    readPermissions: ["visibility.read"],
    writePermissions: ["visibility.plan"],
  },
  {
    id: "ads",
    label: "Annonser",
    description: "Se brandets annonsekampanjer og forberede annonsebrief/utkast uten budsjettbruk eller publisering.",
    status: "ready",
    brandScope: "all",
    readPermissions: ["ads.read"],
    writePermissions: ["ads.draft"],
  },
  {
    id: "events",
    label: "Video & informasjonsmøter",
    description: "Planlegg videoer, webinarer og informasjonsmøter som arbeidsoppgaver. Ingen automatisk invitasjon eller utsending.",
    status: "ready",
    brandScope: "all",
    readPermissions: [],
    writePermissions: ["events.plan"],
  },
  {
    id: "socialPublish",
    label: "Publisere til sosiale medier",
    description: "Egen høyere rettighet. Åpnes først når konto-, kanal- og publiseringssperrer er verifisert for medarbeidere.",
    status: "planned",
    brandScope: "all",
    readPermissions: [],
    writePermissions: ["marketing.publish"],
  },
  {
    id: "reels",
    label: "Reels Studio",
    description: "RealtyFlow/Re-Master produksjon for valgt merkevare. Krever egen kanal- og publiseringsavgrensning.",
    status: "planned",
    brandScope: "all",
    readPermissions: [],
    writePermissions: [],
  },
  {
    id: "youtube",
    label: "YouTube Studio",
    description: "Kanalstyring per merkevare. Krever eksplisitt kanalbinding og publiseringssperrer.",
    status: "planned",
    brandScope: "all",
    readPermissions: [],
    writePermissions: [],
  },
  {
    id: "content",
    label: "Nettside & innhold",
    description: "Lag, rediger og publiser brand-avgrensede artikler/guider med versjonshistorikk og rollback.",
    status: "ready",
    brandScope: "all",
    readPermissions: ["content.read"],
    writePermissions: ["content.edit", "content.publish"],
  },
  {
    id: "email",
    label: "E-post / Reach",
    description: "Utgående kommunikasjon krever egne kundescope- og kanalrettigheter.",
    status: "planned",
    brandScope: "all",
    readPermissions: [],
    writePermissions: [],
  },
  {
    id: "nexus",
    label: "Nexus OS",
    description: "Automasjon og runtime-kontroller er eierstyrt inntil egne begrensede medarbeiderruter finnes.",
    status: "planned",
    brandScope: "all",
    readPermissions: [],
    writePermissions: [],
  },
];

/**
 * Convert owner UI program choices to the exact database permissions.
 * Zen CRM is intentionally replaced by the reviewed joint-contact scope.
 */
export function programPermissions(params: {
  brandKey: string;
  crmRead: boolean;
  crmWrite: boolean;
  properties: boolean;
  jointTasksRead: boolean;
  jointTasksWrite: boolean;
  marketingRead: boolean;
  marketingDraft: boolean;
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
}): WorkspacePermission[] {
  const result = new Set<WorkspacePermission>();
  if (params.brandKey === "zeneco") {
    if (params.crmRead || params.crmWrite || params.jointTasksRead || params.jointTasksWrite) {
      result.add("crm.joint.read");
    }
    if (params.crmWrite) result.add("crm.joint.write");
    if (params.jointTasksRead || params.jointTasksWrite) result.add("tasks.joint.read");
    if (params.jointTasksWrite) result.add("tasks.joint.write");
  } else {
    if (params.crmRead || params.crmWrite) result.add("crm.read");
    if (params.crmWrite) result.add("crm.write");
  }
  if (params.properties) result.add("properties.catalog.read");
  if (params.marketingRead || params.marketingDraft) result.add("marketing.read");
  if (params.marketingDraft) result.add("marketing.draft");
  if (params.brandKey === "zeneco" && (params.corporateRead || params.corporatePlan)) result.add("corporate.read");
  if (params.brandKey === "zeneco" && params.corporatePlan) result.add("corporate.plan");
  if (params.visibilityRead || params.visibilityPlan) result.add("visibility.read");
  if (params.visibilityPlan) result.add("visibility.plan");
  if (params.adsRead || params.adsDraft) result.add("ads.read");
  if (params.adsDraft) result.add("ads.draft");
  if (params.eventsPlan) result.add("events.plan");
  if (params.contentRead || params.contentEdit || params.contentPublish) result.add("content.read");
  if (params.contentEdit || params.contentPublish) result.add("content.edit");
  if (params.contentPublish) result.add("content.publish");
  return Array.from(result);
}
