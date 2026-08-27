export type BookGrowthApplyRoute = {
  kind: "internal_workflow" | "manual_external" | "review_required";
  href: string;
  label: string;
  description: string;
  canAutoApply: boolean;
};

const DEFAULT_ROUTE: BookGrowthApplyRoute = {
  kind: "review_required",
  href: "/book-growth",
  label: "Åpne for manuell vurdering",
  description: "Forslaget er godkjent, men har ikke en sikker automatisk Apply-flyt ennå.",
  canAutoApply: false,
};

const ROUTES: Record<string, BookGrowthApplyRoute> = {
  asin_linkage: {
    kind: "internal_workflow",
    href: "/book-growth/asins",
    label: "Gå til ASIN-verifisering",
    description: "ASIN må identifiseres og verifiseres før kanalmetadata kan oppdateres.",
    canAutoApply: false,
  },
  cover_asset: {
    kind: "internal_workflow",
    href: "/book-growth/catalog-quality",
    label: "Gå til Catalog Quality",
    description: "Legg inn eller verifiser cover-asset i RealtyFlow før status kan regnes som applied.",
    canAutoApply: false,
  },
  sample_asset: {
    kind: "internal_workflow",
    href: "/book-growth/catalog-quality",
    label: "Gå til Catalog Quality",
    description: "Legg inn eller verifiser sample-asset i RealtyFlow før status kan regnes som applied.",
    canAutoApply: false,
  },
  data_quality: {
    kind: "review_required",
    href: "/book-growth/edition-language",
    label: "Gå til Edition & Language",
    description: "Språk- og edition-endringer krever eksplisitt verifisering før de skrives.",
    canAutoApply: false,
  },
  series_number: {
    kind: "review_required",
    href: "/book-growth/series",
    label: "Gå til Series",
    description: "Serierekkefølge må vurderes mot eksisterende canon før endring.",
    canAutoApply: false,
  },
  conversion_gap: {
    kind: "manual_external",
    href: "/book-growth/economics",
    label: "Åpne Economics-review",
    description: "Amazon-konvertering må undersøkes før eventuell ekstern KDP/Amazon-endring.",
    canAutoApply: false,
  },
  ad_efficiency: {
    kind: "manual_external",
    href: "/book-growth/economics",
    label: "Åpne Ads-review",
    description: "Ads-endringer er eksterne og skal ikke markeres applied før de faktisk er utført.",
    canAutoApply: false,
  },
  series_readthrough: {
    kind: "internal_workflow",
    href: "/book-growth/series",
    label: "Gå til Series-analyse",
    description: "Bruk Series-modulen til å måle og forbedre read-through.",
    canAutoApply: false,
  },
  channel_metadata: {
    kind: "internal_workflow",
    href: "/book-growth/channel-metadata",
    label: "Apply verifisert metadata",
    description: "Channel Metadata har en eksisterende auditerbar approve → apply-flyt.",
    canAutoApply: true,
  },
};

export function getBookGrowthApplyRoute(recommendationType: string | null | undefined): BookGrowthApplyRoute {
  if (!recommendationType) return DEFAULT_ROUTE;
  return ROUTES[recommendationType] ?? DEFAULT_ROUTE;
}
