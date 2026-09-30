import type { WorkspacePermission } from "./brand-policy";

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
  limit?: number;
}): WorkspaceTodayAction[] {
  const { brandKey, permissions, contactCount, attention = [], limit = 4 } = input;
  const actions: WorkspaceTodayAction[] = [];

  const canReadCrm = hasAny(permissions, ["crm.read", "crm.joint.read"]);
  if (canReadCrm && contactCount > 0) {
    actions.push({
      id: "crm-follow-up",
      title: "Følg opp kunder og leads",
      description: `Du har ${contactCount} kunde${contactCount === 1 ? "" : "r"} tilgjengelig i dette arbeidsområdet. Start med neste konkrete kundesteg.`,
      reason: "Kundearbeid prioriteres foran ny aktivitet når det allerede finnes aktive relasjoner å følge opp.",
      area: "leads",
      priority: 100,
      source: "crm",
    });
  }

  if (permissions.includes("nexus.read")) {
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
        priority: score - index,
        source: "nexus",
      });
    });
  }

  if (brandKey === "zeneco" && permissions.includes("corporate.read")) {
    actions.push({
      id: "corporate",
      title: "Jobb med Corporate-prospekter",
      description: "Prioriter selskaper med tydelig fit, dokumentert research og et realistisk neste kontaktsteg.",
      reason: "Corporate kan skape gjentakende leads, men bare når researchen ender i en konkret menneskelig handling.",
      area: "growth",
      priority: 78,
      source: "role",
    });
  }

  if (hasAny(permissions, [
    "visibility.read", "visibility.plan", "content.read", "content.edit", "content.publish",
    "marketing.read", "marketing.draft", "marketing.publish",
  ])) {
    actions.push({
      id: "visibility-content",
      title: "Forbedre synlighet og innhold",
      description: "Bruk søke- og læringssignalene til å forbedre en viktig side, artikkel eller publisering med tydelig neste steg.",
      reason: "Synlighet har verdi når den leder riktig målgruppe videre mot kontakt, møte eller salg.",
      area: "growth",
      priority: 70,
      source: "role",
    });
  }

  if (hasAny(permissions, ["reels.create", "reels.publish"])) {
    actions.push({
      id: "reels",
      title: "Lag eller ferdigstill en Reel",
      description: "Velg relevant bolig- eller områdeinnhold, forhåndsvis resultatet og publiser først når det passer merkevaren.",
      reason: "Kort video kan gi rekkevidde og leads, men prioriteres etter aktive kunder og tydelige Nexus-signaler.",
      area: "growth",
      priority: 62,
      source: "role",
    });
  }

  if (brandKey === "zeneco" && permissions.includes("youtube.read")) {
    actions.push({
      id: "youtube",
      title: "Gjenbruk ferdig innhold på YouTube",
      description: "Se etter en ferdig Zen Reel som kan publiseres som Short på verifisert kanal.",
      reason: "Gjenbruk av godt innhold øker distribusjonen uten å lage unødvendig merarbeid.",
      area: "growth",
      priority: 58,
      source: "role",
    });
  }

  if (permissions.includes("properties.catalog.read")) {
    actions.push({
      id: "properties",
      title: "Forbered boligforslag",
      description: "Søk i publiserte boliger når en kunde trenger konkrete alternativer og dokumenter hvorfor forslagene passer.",
      reason: "Eiendomssøk er mest verdifullt når det er koblet til et konkret kundebehov.",
      area: "properties",
      priority: contactCount > 0 ? 74 : 52,
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
