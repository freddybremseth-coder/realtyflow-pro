/**
 * Internal Altovena product NAVIGATION register, not an entitlement list,
 * billing system or authoritative deployment monitor.
 *
 * Real source-of-truth remains each module's authorization and data model.
 * This owner-only catalog makes the two development streams visible together.
 */
export type ProductStage =
  | "internal_drafts"
  | "internal_prototype"
  | "internal_advisory"
  | "standalone_integration_pending";

export type AltovenaProductEntry = Readonly<{
  id: "command" | "visibility" | "intelligence" | "olivia";
  name: string;
  summary: string;
  stage: ProductStage;
  stageLabel: string;
  ownerSystem: string;
  primaryHref: string | null;
  nextRequirement: string;
  externallySellable: false;
  hasLiveAutonomousActions: false;
}>;

export const ALTOVENA_PRODUCT_REGISTER: readonly AltovenaProductEntry[] = Object.freeze([
  {
    id: "command",
    name: "Command",
    summary: "Oppdrag, agentplanlegging og etter hvert kontrollert gjennomføring via Nexus.",
    stage: "internal_drafts",
    stageLabel: "Intern oppdragsutkast",
    ownerSystem: "RealtyFlow / Nexus + Altovena",
    primaryHref: "/altovena/command",
    nextRequirement: "Agent- og kildetilganger, budsjett og uavhengig godkjenning må verifiseres samlet før AI-kjøring.",
    externallySellable: false,
    hasLiveAutonomousActions: false,
  },
  {
    id: "visibility",
    name: "Visibility",
    summary: "SEO, AEO og GEO: funn, anbefalte forbedringer og kontrollert oppfølging.",
    stage: "internal_prototype",
    stageLabel: "Intern produktvisning",
    ownerSystem: "RealtyFlow / Sam",
    primaryHref: "/visibility",
    nextRequirement: "Undersøkelser, godkjenning og publisering krever verifisert data- og rettighetsflyt.",
    externallySellable: false,
    hasLiveAutonomousActions: false,
  },
  {
    id: "intelligence",
    name: "Intelligence",
    summary: "Kommersiell analyse, selskapsinnsikt og beslutningsstøtte.",
    stage: "internal_advisory",
    stageLabel: "Intern rådgivning",
    ownerSystem: "RealtyFlow / Corporate",
    primaryHref: "/sales/corporate-homes",
    nextRequirement: "Skill datakvalitet fra kjøpsinteresse og fullfør en selvstendig SaaS- og tilgangsmodell.",
    externallySellable: false,
    hasLiveAutonomousActions: false,
  },
  {
    id: "olivia",
    name: "Olivia OS",
    summary: "Gårdsdrift som eget SaaS-produkt, adskilt fra Doña Anna B2B.",
    stage: "standalone_integration_pending",
    stageLabel: "Eget produktløp",
    ownerSystem: "Olivia OS",
    primaryHref: null,
    nextRequirement: "Egen kunde-/gårdisolasjon og et godkjent API før eventuell felles Nexus-integrasjon.",
    externallySellable: false,
    hasLiveAutonomousActions: false,
  },
]);

export const ALTOVENA_HOSTING_MODEL = Object.freeze({
  development: "RealtyflowPRO – separat, privat altovena-schema",
  customerInstallation: "Egen database/prosjekt per kunde ved separat SaaS-installasjon",
  sharedNexus: "Felles kontrakter og kapasitet, ikke kopierte kundeopplysninger",
  websiteIntake: "Altovena-nettstedets CRM-mottak er ikke aktivert for publikum",
});

export function getAltovenaProduct(id: AltovenaProductEntry["id"]) {
  return ALTOVENA_PRODUCT_REGISTER.find(product => product.id === id) ?? null;
}
