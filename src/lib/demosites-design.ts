/**
 * DemoSites design system.
 *
 * LAYOUT controls the page composition. STYLE controls typography and mood.
 * Existing layouts stay available, while five Signature 2026 concepts add
 * deliberately different art direction for customers who want something rare.
 */
export type DemoSiteLegacyLayout = "split" | "fullbleed" | "editorial";
export type SignatureDemoSiteLayout = "cinematic" | "bento" | "atelier" | "kinetic" | "panorama";
export type DemoSiteLayout = DemoSiteLegacyLayout | SignatureDemoSiteLayout;
export type DemoSiteStyleId = "modern" | "elegant" | "warm" | "tech";

export type DemoSiteDesign = {
  layout: DemoSiteLayout;
  style: DemoSiteStyleId;
};

export type DemoSiteLayoutOption = {
  id: DemoSiteLayout;
  label: string;
  description: string;
  group: "classic" | "signature";
};

export const DEMO_SITE_LAYOUTS: DemoSiteLayoutOption[] = [
  {
    id: "split",
    label: "Klassisk",
    description: "Tydelig todelt hero med tekst og hovedbilde.",
    group: "classic",
  },
  {
    id: "fullbleed",
    label: "Fullskjerm bilde",
    description: "Bilde først, med salgsbudskap lagt direkte over motivet.",
    group: "classic",
  },
  {
    id: "editorial",
    label: "Magasin",
    description: "Stor typografi og en rolig, redaksjonell komposisjon.",
    group: "classic",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    description: "Filmisk fullskjerm-opplevelse med dybde, glass og dramatisk fokus.",
    group: "signature",
  },
  {
    id: "bento",
    label: "Bento",
    description: "Modulær 2026-layout med asymmetriske kort, bilder og raske valg.",
    group: "signature",
  },
  {
    id: "atelier",
    label: "Atelier",
    description: "Eksklusivt studio-/fashion-uttrykk med kunstnerisk collage.",
    group: "signature",
  },
  {
    id: "kinetic",
    label: "Kinetic",
    description: "Energisk, teknologisk og typografidrevet med levende flater.",
    group: "signature",
  },
  {
    id: "panorama",
    label: "Panorama",
    description: "Bred, arkitektonisk visning med lagdelte tjenester og stor romfølelse.",
    group: "signature",
  },
];

export const DEMO_SITE_STYLES: Array<{ id: DemoSiteStyleId; label: string }> = [
  { id: "modern", label: "Moderne" },
  { id: "elegant", label: "Elegant" },
  { id: "warm", label: "Varm" },
  { id: "tech", label: "Tech" },
];

export const DEMO_SITE_SIGNATURE_LAYOUTS = DEMO_SITE_LAYOUTS.filter(
  (layout): layout is DemoSiteLayoutOption & { id: SignatureDemoSiteLayout } => layout.group === "signature",
);

const LAYOUT_IDS = DEMO_SITE_LAYOUTS.map((layout) => layout.id);
const STYLE_IDS = DEMO_SITE_STYLES.map((style) => style.id);

export function isDemoSiteLayout(value: unknown): value is DemoSiteLayout {
  return typeof value === "string" && (LAYOUT_IDS as string[]).includes(value);
}

export function isSignatureDemoSiteLayout(value: unknown): value is SignatureDemoSiteLayout {
  return typeof value === "string" && DEMO_SITE_SIGNATURE_LAYOUTS.some((layout) => layout.id === value);
}

export function isDemoSiteStyle(value: unknown): value is DemoSiteStyleId {
  return typeof value === "string" && (STYLE_IDS as string[]).includes(value);
}

/** Industry-informed defaults preserve the existing behaviour. */
function defaultDesignForTemplate(templateSlug: string): DemoSiteDesign {
  const slug = templateSlug.toLowerCase();

  if (/hotell|overnatting|restaurant|kafe|cafe/.test(slug)) return { layout: "fullbleed", style: "warm" };
  if (/advokat|eiendomsmegler|klinikk|tannlege/.test(slug)) return { layout: "editorial", style: "elegant" };
  if (/ai|tech|software|saas|automasjon|teknologi/.test(slug)) return { layout: "split", style: "tech" };
  if (/frisor|skjonnhet|fysioterapi/.test(slug)) return { layout: "fullbleed", style: "elegant" };
  return { layout: "split", style: "modern" };
}

export function resolveDemoSiteDesign(input: {
  templateSlug: string;
  editableFields?: Record<string, unknown> | null;
  layoutOverride?: string | null;
  styleOverride?: string | null;
}): DemoSiteDesign {
  const fields = input.editableFields || {};
  const fallback = defaultDesignForTemplate(input.templateSlug);

  const layout = isDemoSiteLayout(input.layoutOverride)
    ? input.layoutOverride
    : isDemoSiteLayout(fields.layout_variant)
      ? fields.layout_variant
      : fallback.layout;

  const style = isDemoSiteStyle(input.styleOverride)
    ? input.styleOverride
    : isDemoSiteStyle(fields.style_preset)
      ? fields.style_preset
      : fallback.style;

  return { layout, style };
}

/**
 * Curated sequence for "Prøv en annen stil". Existing looks come first, then
 * every Signature 2026 concept appears with the typography that suits it best.
 */
export const DEMO_SITE_DESIGN_CYCLE: DemoSiteDesign[] = [
  { layout: "split", style: "modern" },
  { layout: "fullbleed", style: "warm" },
  { layout: "editorial", style: "elegant" },
  { layout: "cinematic", style: "modern" },
  { layout: "bento", style: "modern" },
  { layout: "atelier", style: "elegant" },
  { layout: "kinetic", style: "tech" },
  { layout: "panorama", style: "warm" },
  { layout: "fullbleed", style: "elegant" },
  { layout: "split", style: "tech" },
  { layout: "editorial", style: "modern" },
];

export function nextDemoSiteDesign(current: DemoSiteDesign): DemoSiteDesign {
  const index = DEMO_SITE_DESIGN_CYCLE.findIndex(
    (design) => design.layout === current.layout && design.style === current.style,
  );
  return DEMO_SITE_DESIGN_CYCLE[(index + 1) % DEMO_SITE_DESIGN_CYCLE.length];
}
