import type { WorkspacePermission } from "./brand-policy";
import type { WorkspaceResponsibilityId } from "./responsibilities";

export type WorkspaceAttentionSignal = {
  level: "info" | "watch" | "action";
  title: string;
  detail: string;
};

export type WorkspaceTodayArea = "leads" | "growth" | "properties" | "training";

export type WorkspaceTodayAction = {
  id: string;
  title: string;
  description: string;
  reason: string;
  area: WorkspaceTodayArea;
  priority: number;
  source: "crm" | "nexus" | "role" | "fallback";
};

function hasAny(permissions: WorkspacePermission[], wanted: WorkspacePermission[]) {
  return wanted.some(permission => permissions.includes(permission));
}

export function buildWorkspaceTodayActions(input: {
  brandKey: string;
  permissions: WorkspacePermission[];
  contactCount: number;
  attention?: WorkspaceAttentionSignal[];
  responsibilities?: WorkspaceResponsibilityId[];
  primaryResponsibilities?: WorkspaceResponsibilityId[];
  limit?: number;
}): WorkspaceTodayAction[] {
  const { brandKey, permissions, contactCount, attention = [], responsibilities = [], primaryResponsibilities = [], limit = 4 } = input;
  const actions: WorkspaceTodayAction[] = [];
  const scoped = responsibilities.length > 0;
  const owns = (responsibility: WorkspaceResponsibilityId) => !scoped || responsibilities.includes(responsibility);
  const rank = (base: number, responsibility: WorkspaceResponsibilityId) =>
    base + (primaryResponsibilities.includes(responsibility) ? 100 : 0);

  const canReadCrm = hasAny(permissions, ["crm.read", "crm.joint.read"]);
  if (canReadCrm && contactCount > 0 && owns("new-leads")) {
    actions.push({
      id: "crm-follow-up",
      title: "Følg opp kunder og leads",
      description: `Du har ${contactCount} kunde${contactCount === 1 ? "" : "r"} tilgjengelig i dette arbeidsområdet. Start med neste konkrete kundesteg.`,
      reason: "Kundearbeid prioriteres foran ny aktivitet når det allerede finnes aktive relasjoner å følge opp.",
      area: "leads",
      priority: rank(100, "new-leads"),
      source: "crm",
    });
  }

  if (permissions.includes("nexus.read") && owns("nexus-review")) {
    attention.slice(0, 3).forEach((signal, index) => {
      const score = signal.level === "action" ? 96 : signal.level === "watch" ? 82 : 64;
      actions.push({
        id: `nexus-${index}-${signal.level}`,
        title: signal.title,
        description: signal.detail,
        reason: signal.level === "action"
          ? "Nexus har markert dette som et konkret oppmerksomhetspunkt for merkevaren."
          : signal.level === "watch"
            ? "Nexus følger dette fordi signalene kan påvirke vekst eller gjennomføring."
            : "Nexus viser dette som relevant kontekst for dagens arbeid.",
        area: "growth",
        priority: rank(score - index, "nexus-review"),
        source: "nexus",
      });
    });
  }

  if (brandKey === "zeneco" && permissions.includes("corporate.read") && owns("corporate")) {
    actions.push({
      id: "corporate",
      title: "Jobb med Corporate-prospekter",
      description: "Prioriter selskaper med tydelig fit, dokumentert research og et realistisk neste kontaktsteg.",
      reason: "Corporate kan skape gjentakende leads, men bare når researchen ender i en konkret menneskelig handling.",
      area: "growth",
      priority: rank(78, "corporate"),
      source: "role",
    });
  }

  if (owns("seo-content") && hasAny(permissions, [
    "visibility.read", "visibility.plan", "content.read", "content.edit", "content.publish",
    "marketing.read", "marketing.draft", "marketing.publish",
  ])) {
    actions.push({
      id: "visibility-content",
      title: "Forbedre synlighet og innhold",
      description: "Bruk søke- og læringssignalene til å forbedre en viktig side, artikkel eller publisering med tydelig neste steg.",
      reason: "Synlighet har verdi når den leder riktig målgruppe videre mot kontakt, møte eller salg.",
      area: "growth",
      priority: rank(70, "seo-content"),
      source: "role",
    });
  }

  if (owns("social-reels") && hasAny(permissions, ["reels.create", "reels.publish"])) {
    actions.push({
      id: "reels",
      title: "Lag eller ferdigstill en Reel",
      description: "Velg relevant bolig- eller områdeinnhold, forhåndsvis resultatet og publiser først når det passer merkevaren.",
      reason: "Kort video kan gi rekkevidde og leads, men prioriteres etter aktive kunder og tydelige Nexus-signaler.",
      area: "growth",
      priority: rank(62, "social-reels"),
      source: "role",
    });
  }

  if (owns("social-reels") && brandKey === "zeneco" && permissions.includes("youtube.read")) {
    actions.push({
      id: "youtube",
      title: "Gjenbruk ferdig innhold på YouTube",
      description: "Se etter en ferdig Zen Reel som kan publiseres som Short på verifisert kanal.",
      reason: "Gjenbruk av godt innhold øker distribusjonen uten å lage unødvendig merarbeid.",
      area: "growth",
      priority: rank(58, "social-reels"),
      source: "role",
    });
  }

  if (owns("property-matching") && permissions.includes("properties.catalog.read")) {
    actions.push({
      id: "properties",
      title: "Forbered boligforslag",
      description: "Søk i publiserte boliger når en kunde trenger konkrete alternativer og dokumenter hvorfor forslagene passer.",
      reason: "Eiendomssøk er mest verdifullt når det er koblet til et konkret kundebehov.",
      area: "properties",
      priority: rank(contactCount > 0 ? 74 : 52, "property-matching"),
      source: "role",
    });
  }

  if (owns("newsletter") && hasAny(permissions, ["email.draft", "email.send"])) {
    actions.push({
      id: "newsletter",
      title: "Jobb med nyhetsbrev og Reach",
      description: "Forbered neste relevante utsending, velg riktig segment og bruk tidligere klikkdata før du sender eller planlegger.",
      reason: "Nyhetsbrev er satt som ditt ansvar i denne merkevaren og bør drives av segment, samtykke og målbar respons.",
      area: "growth",
      priority: rank(72, "newsletter"),
      source: "role",
    });
  }

  if (!actions.length) {
    actions.push({
      id: "training",
      title: "Start med arbeidsmåten",
      description: "Åpne «Slik jobber vi» og se hva merkevaren, rollen og arbeidsflyten forventer av deg.",
      reason: "Opplæringen gir riktig startpunkt når det ikke finnes andre tilgjengelige handlinger.",
      area: "training",
      priority: 10,
      source: "fallback",
    });
  }

  const unique = new Map<string, WorkspaceTodayAction>();
  for (const action of actions) {
    if (!unique.has(action.id)) unique.set(action.id, action);
  }

  return [...unique.values()]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, Math.max(1, limit));
}
