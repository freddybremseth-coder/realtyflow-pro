/**
 * Tool: find_properties (read-only).
 *
 * Prinsipp 7: hard filters (budsjett, område, type, soverom, eksklusjoner,
 * datakvalitet) håndheves DETERMINISTISK i kode — AI får kun rangere de
 * gjenværende kandidatene, aldri omgå filtrene. €450 000 maks betyr ikke
 * €595 000.
 */

import { z } from "zod";
import { defineTool, type ToolContext } from "@/lib/agentic/tool-registry";

export interface PropertyCandidate {
  id: string;
  title?: string | null;
  priceEur: number | null;
  area?: string | null;
  propertyType?: string | null;
  bedrooms?: number | null;
  raw?: Record<string, unknown>;
}

export interface RankedProperty extends PropertyCandidate {
  rank: number;
  rankReason?: string;
}

export interface FindPropertiesResult {
  total: number;
  eligible: number;
  returned: RankedProperty[];
  /** Trinnvise tellinger for Action Trace (23 → 6 → 4). */
  funnel: { stage: string; count: number }[];
}

export const findPropertiesInput = z.object({
  budgetMaxEur: z.number().positive().optional(),
  budgetMinEur: z.number().nonnegative().optional(),
  areas: z.array(z.string()).default([]),
  propertyType: z.string().optional(),
  bedroomsMin: z.number().int().nonnegative().optional(),
  exclusions: z.array(z.string()).default([]),
  limit: z.number().int().positive().max(10).default(5),
});
export type FindPropertiesInput = z.infer<typeof findPropertiesInput>;

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Deterministiske hard filters + datakvalitetssjekk. Ingen AI her. */
export function applyHardFilters(candidates: PropertyCandidate[], f: FindPropertiesInput): PropertyCandidate[] {
  const areas = f.areas.map(norm).filter(Boolean);
  const exclusions = f.exclusions.map(norm).filter(Boolean);
  const type = f.propertyType ? norm(f.propertyType) : null;

  return candidates.filter((c) => {
    // Datakvalitet: må ha pris og område.
    if (c.priceEur == null || !c.area) return false;
    // Budsjett — hardt tak (og evt. gulv).
    if (f.budgetMaxEur != null && c.priceEur > f.budgetMaxEur) return false;
    if (f.budgetMinEur != null && c.priceEur < f.budgetMinEur) return false;
    // Område — må matche minst ett ønsket område.
    if (areas.length > 0) {
      const a = norm(c.area);
      if (!areas.some((want) => a.includes(want) || want.includes(a))) return false;
    }
    // Boligtype.
    if (type && c.propertyType && norm(c.propertyType) !== type) return false;
    // Soverom.
    if (f.bedroomsMin != null && (c.bedrooms ?? 0) < f.bedroomsMin) return false;
    // Eksplisitte eksklusjoner (område/type/tittel-nøkkelord).
    const haystack = `${norm(c.area)} ${norm(c.propertyType)} ${norm(c.title)}`;
    if (exclusions.some((ex) => haystack.includes(ex))) return false;
    return true;
  });
}

export interface FindPropertiesDeps {
  /** Read-only inventory-spørring. Bør pushe grovfiltre til DB. */
  queryInventory: (input: FindPropertiesInput, ctx: ToolContext) => Promise<PropertyCandidate[]>;
  /** Valgfri AI semantisk rangering av ALLEREDE hard-filtrerte kandidater. */
  rank?: (eligible: PropertyCandidate[], input: FindPropertiesInput, ctx: ToolContext) => Promise<RankedProperty[]>;
}

export function buildFindPropertiesTool(deps: FindPropertiesDeps) {
  return defineTool<FindPropertiesInput, FindPropertiesResult>({
    name: "find_properties",
    description: "Read-only søk: deterministiske hard filters, deretter valgfri AI-rangering av gjenværende kandidater.",
    input: findPropertiesInput,
    permission: "AUTHENTICATED",
    actionClass: "match",
    risk: { reversibility: "reversible", channel: "internal" },
    handler: async (input, ctx) => {
      const all = await deps.queryInventory(input, ctx);
      const eligible = applyHardFilters(all, input);

      let ranked: RankedProperty[];
      if (deps.rank && eligible.length > 0) {
        const r = await deps.rank(eligible, input, ctx);
        // Sikkerhet: AI kan ikke introdusere kandidater utenfor eligible-settet.
        const eligibleIds = new Set(eligible.map((c) => c.id));
        ranked = r.filter((c) => eligibleIds.has(c.id)).slice(0, input.limit);
      } else {
        ranked = eligible
          .slice()
          .sort((a, b) => (a.priceEur ?? 0) - (b.priceEur ?? 0))
          .slice(0, input.limit)
          .map((c, i) => ({ ...c, rank: i + 1 }));
      }

      return {
        total: all.length,
        eligible: eligible.length,
        returned: ranked,
        funnel: [
          { stage: "inventory", count: all.length },
          { stage: "hard_filters", count: eligible.length },
          { stage: "ranked", count: ranked.length },
        ],
      };
    },
  });
}
