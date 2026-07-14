/**
 * DemoSites design system — separates LAYOUT (page structure) from STYLE
 * (typography/mood) so a handful of each multiplies into many visibly
 * different demos:
 *
 *   layouts:  split (classic two-column hero) · fullbleed (image-first hero)
 *             · editorial (magazine typography hero)
 *   styles:   modern · elegant · warm · tech  (font pair + mood)
 *
 * Resolution order: explicit override (URL params / seller switcher) →
 * saved editable_fields → industry defaults. The industry defaults make
 * every template slug land on a combination that fits the trade without
 * anyone touching settings.
 */

export type DemoSiteLayout = "split" | "fullbleed" | "editorial";
export type DemoSiteStyleId = "modern" | "elegant" | "warm" | "tech";

export type DemoSiteDesign = {
  layout: DemoSiteLayout;
  style: DemoSiteStyleId;
};

export const DEMO_SITE_LAYOUTS: Array<{ id: DemoSiteLayout; label: string }> = [
  { id: "split", label: "Klassisk" },
  { id: "fullbleed", label: "Fullskjerm bilde" },
  { id: "editorial", label: "Magasin" },
];

export const DEMO_SITE_STYLES: Array<{ id: DemoSiteStyleId; label: string }> = [
  { id: "modern", label: "Moderne" },
  { id: "elegant", label: "Elegant" },
  { id: "warm", label: "Varm" },
  { id: "tech", label: "Tech" },
];

const LAYOUT_IDS = DEMO_SITE_LAYOUTS.map((l) => l.id);
const STYLE_IDS = DEMO_SITE_STYLES.map((s) => s.id);

export function isDemoSiteLayout(value: unknown): value is DemoSiteLayout {
  return typeof value === "string" && (LAYOUT_IDS as string[]).includes(value);
}

export function isDemoSiteStyle(value: unknown): value is DemoSiteStyleId {
  return typeof value === "string" && (STYLE_IDS as string[]).includes(value);
}

/** Industry-informed defaults so untouched demos already look intentional. */
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
 * Curated cycle for the "Prøv en annen stil"-switcher — hand-picked
 * combinations that all look good, instead of the full cartesian product.
 */
export const DEMO_SITE_DESIGN_CYCLE: DemoSiteDesign[] = [
  { layout: "split", style: "modern" },
  { layout: "fullbleed", style: "warm" },
  { layout: "editorial", style: "elegant" },
  { layout: "fullbleed", style: "elegant" },
  { layout: "split", style: "tech" },
  { layout: "editorial", style: "modern" },
];

export function nextDemoSiteDesign(current: DemoSiteDesign): DemoSiteDesign {
  const index = DEMO_SITE_DESIGN_CYCLE.findIndex(
    (d) => d.layout === current.layout && d.style === current.style,
  );
  return DEMO_SITE_DESIGN_CYCLE[(index + 1) % DEMO_SITE_DESIGN_CYCLE.length];
}
