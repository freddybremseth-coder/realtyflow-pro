import { sha256 } from "@/lib/agentic/ids";

export type NexusMarketingChannel = "instagram" | "facebook";

export interface NexusMarketingActionProposal {
  id: string;
  type: "prepare_marketing_campaign";
  label: string;
  description: string;
  endpoint: "/api/nexus/marketing-actions";
  method: "POST";
  brandId: string;
  brandName: string;
  focus: string;
  channels: NexusMarketingChannel[];
  requestText: string;
  requiresApproval: true;
}

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/æ/g, "ae")
  .replace(/ø/g, "o")
  .replace(/å/g, "a")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const MARKETING_BRANDS = [
  { id: "zeneco", name: "Zen Eco Homes", aliases: ["zen eco homes", "zeneco", "zen eco"] },
  { id: "pinosoecolife", name: "Pinoso EcoLife", aliases: ["pinoso ecolife", "pinoso eco life", "pinosoecolife"] },
  { id: "donaanna", name: "Doña Anna", aliases: ["dona anna", "doña anna"] },
] as const;

function isMarketingBrandLabel(value: string): boolean {
  const candidate = normalize(value);
  if (!candidate) return false;
  return MARKETING_BRANDS.some((brand) =>
    candidate === normalize(brand.name)
    || brand.aliases.some((alias) => candidate === normalize(alias)),
  );
}

export function resolveNexusMarketingBrand(message: string): { id: string; name: string } | null {
  const text = ` ${normalize(message)} `;
  for (const brand of MARKETING_BRANDS) {
    if (brand.aliases.some((alias) => text.includes(` ${normalize(alias)} `))) {
      return { id: brand.id, name: brand.name };
    }
  }
  return null;
}

function trimMarketingFocus(value: string) {
  return value
    .replace(/\s+(?:i|på)\s+(?:some|sosiale\s+medier)\b.*$/i, "")
    .replace(/\s+(?:for|med|og|som)\b.*$/i, "")
    .replace(/[,.!?:;]+.*$/, "")
    .trim();
}

export function resolveNexusMarketingFocus(message: string): string | null {
  const raw = String(message || "").trim();
  if (!raw) return null;
  const word = "[A-Za-zÀ-ÖØ-öø-ÿ0-9'’\\-]";
  const patterns = [
    new RegExp(`\\blivet\\s+i\\s+(${word}+(?:\\s+${word}+){0,2})`, "i"),
    new RegExp(`\\bmarkedsf(?:ø|o)r(?:e)?\\s+(${word}+(?:\\s+${word}+){0,2})`, "i"),
    new RegExp(`\\b(?:kampanje|innlegg)\\s+(?:for|om)\\s+(${word}+(?:\\s+${word}+){0,2})`, "i"),
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const candidate = trimMarketingFocus(match?.[1] || "");
    if (
      candidate
      && candidate.length >= 2
      && candidate.length <= 80
      && !isMarketingBrandLabel(candidate)
    ) return candidate;
  }
  return null;
}

export function resolveNexusMarketingChannels(message: string): NexusMarketingChannel[] {
  const text = normalize(message);
  const instagram = /\b(instagram|insta|ig)\b/.test(text);
  const facebook = /\b(facebook|fb)\b/.test(text);
  if (instagram || facebook) {
    return [
      ...(instagram ? ["instagram" as const] : []),
      ...(facebook ? ["facebook" as const] : []),
    ];
  }
  return ["instagram", "facebook"];
}

export function messageRequestsMarketingCampaign(message: string): boolean {
  const text = normalize(message);
  if (!text || /^(hvordan|hvor|hva er|forklar)\b/.test(text)) return false;
  const directVerb = /\b(markedsfor|markedsfore|lag|forbered|opprett|sett opp|publiser)\b/.test(text);
  const marketingTarget = /\b(some|sosiale medier|kampanje|innlegg|instagram|facebook|markedsforing)\b/.test(text);
  if (directVerb && marketingTarget) return true;

  const brand = resolveNexusMarketingBrand(message);
  const focus = resolveNexusMarketingFocus(message);
  const continuation = /\b(fokuser|livet i|sett inn bolig|kan bygges|hvem det passer|vinkling)\b/.test(text);
  return Boolean(brand && focus && continuation);
}

export function buildNexusMarketingActionProposal(requestText: string): NexusMarketingActionProposal | null {
  if (!messageRequestsMarketingCampaign(requestText)) return null;
  const brand = resolveNexusMarketingBrand(requestText);
  const focus = resolveNexusMarketingFocus(requestText);
  if (!brand || !focus) return null;
  const channels = resolveNexusMarketingChannels(requestText);
  const id = `nexus_action_${sha256(`prepare_marketing_campaign:${brand.id}:${normalize(focus)}:${channels.join(",")}:${normalize(requestText)}`).slice(0, 24)}`;
  const channelLabel = channels.length > 1 ? "Facebook + Instagram" : channels[0] === "facebook" ? "Facebook" : "Instagram";
  return {
    id,
    type: "prepare_marketing_campaign",
    label: `Forbered ${focus}-kampanje – ${brand.name}`,
    description: `Lager faktiske ${channelLabel}-utkast med styrt sluttkontroll. Ingenting publiseres ved dette klikket.`,
    endpoint: "/api/nexus/marketing-actions",
    method: "POST",
    brandId: brand.id,
    brandName: brand.name,
    focus,
    channels,
    requestText,
    requiresApproval: true,
  };
}

export function buildNexusMarketingActionProposals(args: {
  message: string;
  marketingContext?: string | null;
}): NexusMarketingActionProposal[] {
  const requestText = String(args.marketingContext || "").trim() || args.message.trim();
  const proposal = buildNexusMarketingActionProposal(requestText);
  return proposal ? [proposal] : [];
}
