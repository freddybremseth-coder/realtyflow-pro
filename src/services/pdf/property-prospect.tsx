/**
 * Property prospect PDF generator.
 *
 * Renders a multi-page A4 prospect for a property with:
 *   1. Cover page  — hero image, title, price, brand logo
 *   2. Key facts   — bedrooms / bathrooms / area / year / energy
 *   3. Description + area info
 *   4. Gallery     — up to 8 images in a 2-column grid
 *   5. Floor plans — full-width images, one per page if many
 *   6. Agent card  — Freddy's photo + contact details
 *
 * Public usage:
 *   const buffer = await renderPropertyProspect({ property, brand, agent });
 *   // returns a Node Buffer with PDF bytes
 *
 * Inputs are deliberately loose objects so the API endpoint can pass
 * snake_case Supabase rows or camelCase frontend objects without an
 * adapter layer — the helpers below normalize.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Types — accept loose inputs so callers don't have to remap snake_case
// ---------------------------------------------------------------------------

export interface PdfPropertyInput {
  id?: string;
  title?: string;
  description?: string;
  location?: string;
  price?: number;
  // type is camelCase in the UI, property_type in DB
  type?: string;
  property_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  // area is built_area in DB
  area?: number;
  built_area?: number;
  plotArea?: number;
  plot_size?: number;
  yearBuilt?: number;
  year_built?: number;
  energyRating?: string;
  energy_rating?: string;
  imageUrl?: string;
  primary_image?: string;
  gallery?: string[];
  floorplans?: string[];
  pool?: boolean;
  garage?: boolean;
  ref?: string;
}

export interface PdfBrandInput {
  brand_id?: string;
  custom_name?: string;
  display_name?: string;
  logo_url?: string;
  primary_color?: string;
  website?: string;
  contact_email?: string;
  contact_phone?: string;
  area_blurb?: string; // optional area description from settings
}

export interface PdfAgentInput {
  agent_name?: string;
  agent_title?: string;
  agent_photo_url?: string;
  agent_email?: string;
  agent_phone?: string;
  agent_bio?: string;
}

interface RenderInput {
  property: PdfPropertyInput;
  brand?: PdfBrandInput;
  agent?: PdfAgentInput;
  /** Optional URL to a brand logo PNG (transparent). */
  brandLogoUrl?: string;
  /** Locale for price formatting. Default "nb-NO". */
  locale?: string;
}

// ---------------------------------------------------------------------------
// Style sheet — Zen-ish neutral palette, headline serif feel via weight 700
// ---------------------------------------------------------------------------

const COLORS = {
  ink: "#1a1a1a",
  muted: "#6b7280",
  faint: "#e5e7eb",
  accent: "#2d6a4f", // Zen Eco green
  paper: "#ffffff",
  cream: "#faf7f2",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.paper,
    padding: 40,
    fontSize: 11,
    color: COLORS.ink,
    fontFamily: "Helvetica",
  },
  // Cover
  coverHero: {
    width: "100%",
    height: 320,
    objectFit: "cover",
    marginBottom: 24,
    backgroundColor: COLORS.faint,
  },
  coverTitle: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 6,
    color: COLORS.ink,
  },
  coverLocation: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 20,
  },
  coverPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTop: `1pt solid ${COLORS.faint}`,
    borderBottom: `1pt solid ${COLORS.faint}`,
    paddingVertical: 14,
    marginBottom: 24,
  },
  coverPrice: {
    fontSize: 22,
    fontWeight: 700,
    color: COLORS.accent,
  },
  coverRef: {
    fontSize: 10,
    color: COLORS.muted,
  },
  // Headers / sections
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 10,
    color: COLORS.ink,
  },
  sectionDivider: {
    height: 2,
    width: 40,
    backgroundColor: COLORS.accent,
    marginBottom: 14,
  },
  // Key-fact grid
  factGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 20,
  },
  factCell: {
    width: "33.33%",
    paddingVertical: 10,
    paddingRight: 10,
  },
  factLabel: {
    fontSize: 9,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  factValue: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.ink,
  },
  // Body text
  body: {
    fontSize: 11,
    lineHeight: 1.6,
    color: "#333333",
    marginBottom: 16,
  },
  // Gallery
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  galleryCell: {
    width: "50%",
    padding: 4,
  },
  galleryImg: {
    width: "100%",
    height: 160,
    objectFit: "cover",
    backgroundColor: COLORS.faint,
  },
  // Floor plans
  floorplanImg: {
    width: "100%",
    height: 380,
    objectFit: "contain",
    backgroundColor: COLORS.cream,
    marginBottom: 16,
  },
  // Agent card
  agentCard: {
    flexDirection: "row",
    backgroundColor: COLORS.cream,
    padding: 20,
    borderRadius: 6,
    marginTop: 16,
  },
  agentPhoto: {
    width: 110,
    height: 110,
    borderRadius: 55,
    objectFit: "cover",
    marginRight: 20,
    backgroundColor: COLORS.faint,
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    fontSize: 16,
    fontWeight: 700,
    color: COLORS.ink,
    marginBottom: 2,
  },
  agentTitle: {
    fontSize: 11,
    color: COLORS.accent,
    marginBottom: 10,
  },
  agentBio: {
    fontSize: 10,
    lineHeight: 1.5,
    color: "#444",
    marginBottom: 10,
  },
  agentContact: {
    fontSize: 10,
    color: COLORS.ink,
    marginBottom: 2,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    color: COLORS.muted,
    borderTop: `1pt solid ${COLORS.faint}`,
    paddingTop: 10,
  },
  brandLogoFooter: {
    width: 70,
    height: 24,
    objectFit: "contain",
  },
  brandLogoCover: {
    position: "absolute",
    top: 24,
    right: 40,
    width: 90,
    height: 32,
    objectFit: "contain",
  },
  pageNumber: {
    fontSize: 9,
    color: COLORS.muted,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickField<T>(...candidates: (T | undefined | null)[]): T | undefined {
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== "") return c as T;
  }
  return undefined;
}

function formatPrice(price: number | undefined, locale = "nb-NO"): string {
  if (!price || price <= 0) return "Pris på forespørsel";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `€${Math.round(price).toLocaleString("en-US")}`;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ProspectDocument({
  property,
  brand,
  agent,
  brandLogoUrl,
  locale,
}: RenderInput) {
  const title = property.title || "Eiendom uten tittel";
  const location = property.location || "";
  const price = formatPrice(property.price, locale);
  const type = pickField(property.type, property.property_type) || "Eiendom";
  const area = pickField(property.area, property.built_area);
  const plotArea = pickField(property.plotArea, property.plot_size);
  const yearBuilt = pickField(property.yearBuilt, property.year_built);
  const energyRating = pickField(property.energyRating, property.energy_rating);
  const heroImage = pickField(property.imageUrl, property.primary_image);
  const gallery = (property.gallery || []).filter((u) => u && u !== heroImage).slice(0, 8);
  const floorplans = (property.floorplans || []).filter(Boolean);

  const brandName = pickField(brand?.custom_name, brand?.display_name, brand?.brand_id) || "";
  const brandWebsite = brand?.website || "";

  const agentName = agent?.agent_name || "";
  const agentTitle = agent?.agent_title || "";
  const agentBio = agent?.agent_bio || "";
  const agentPhone = agent?.agent_phone || "";
  const agentEmail = agent?.agent_email || "";
  const agentPhoto = agent?.agent_photo_url;

  const Footer = () => (
    <View style={styles.footer} fixed>
      <Text>
        {brandName}
        {brandWebsite ? `  ·  ${brandWebsite}` : ""}
      </Text>
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );

  return (
    <Document title={title} author={brandName} subject="Eiendomsprospekt">
      {/* ============================================================== */}
      {/* Cover                                                          */}
      {/* ============================================================== */}
      <Page size="A4" style={styles.page}>
        {brandLogoUrl ? <Image src={brandLogoUrl} style={styles.brandLogoCover} /> : null}
        {heroImage ? (
          <Image src={heroImage} style={styles.coverHero} />
        ) : (
          <View style={[styles.coverHero, { justifyContent: "center", alignItems: "center" }]}>
            <Text style={{ color: COLORS.muted }}>Ingen bilder</Text>
          </View>
        )}
        <Text style={styles.coverTitle}>{title}</Text>
        <Text style={styles.coverLocation}>{location}</Text>

        <View style={styles.coverPriceRow}>
          <Text style={styles.coverPrice}>{price}</Text>
          {property.ref ? <Text style={styles.coverRef}>Ref. {property.ref}</Text> : null}
        </View>

        {/* Key facts grid */}
        <Text style={styles.sectionTitle}>Nøkkelinfo</Text>
        <View style={styles.sectionDivider} />
        <View style={styles.factGrid}>
          <View style={styles.factCell}>
            <Text style={styles.factLabel}>Type</Text>
            <Text style={styles.factValue}>{type}</Text>
          </View>
          {property.bedrooms ? (
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Soverom</Text>
              <Text style={styles.factValue}>{property.bedrooms}</Text>
            </View>
          ) : null}
          {property.bathrooms ? (
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Bad</Text>
              <Text style={styles.factValue}>{property.bathrooms}</Text>
            </View>
          ) : null}
          {area ? (
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Boligareal</Text>
              <Text style={styles.factValue}>{area} m²</Text>
            </View>
          ) : null}
          {plotArea ? (
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Tomt</Text>
              <Text style={styles.factValue}>{plotArea} m²</Text>
            </View>
          ) : null}
          {yearBuilt ? (
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Byggeår</Text>
              <Text style={styles.factValue}>{yearBuilt}</Text>
            </View>
          ) : null}
          {energyRating ? (
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Energi</Text>
              <Text style={styles.factValue}>{energyRating}</Text>
            </View>
          ) : null}
          {property.pool ? (
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Basseng</Text>
              <Text style={styles.factValue}>Ja</Text>
            </View>
          ) : null}
          {property.garage ? (
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Garasje</Text>
              <Text style={styles.factValue}>Ja</Text>
            </View>
          ) : null}
        </View>

        <Footer />
      </Page>

      {/* ============================================================== */}
      {/* Description + area                                             */}
      {/* ============================================================== */}
      {(property.description || brand?.area_blurb) ? (
        <Page size="A4" style={styles.page}>
          {property.description ? (
            <>
              <Text style={styles.sectionTitle}>Om eiendommen</Text>
              <View style={styles.sectionDivider} />
              <Text style={styles.body}>{property.description}</Text>
            </>
          ) : null}
          {brand?.area_blurb ? (
            <>
              <Text style={styles.sectionTitle}>Om området</Text>
              <View style={styles.sectionDivider} />
              <Text style={styles.body}>{brand.area_blurb}</Text>
            </>
          ) : null}
          <Footer />
        </Page>
      ) : null}

      {/* ============================================================== */}
      {/* Gallery                                                        */}
      {/* ============================================================== */}
      {gallery.length > 0 ? (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Galleri</Text>
          <View style={styles.sectionDivider} />
          <View style={styles.galleryGrid}>
            {gallery.map((url, i) => (
              <View key={`${url}-${i}`} style={styles.galleryCell} wrap={false}>
                <Image src={url} style={styles.galleryImg} />
              </View>
            ))}
          </View>
          <Footer />
        </Page>
      ) : null}

      {/* ============================================================== */}
      {/* Floor plans                                                    */}
      {/* ============================================================== */}
      {floorplans.length > 0 ? (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Plantegninger</Text>
          <View style={styles.sectionDivider} />
          {floorplans.map((url, i) => (
            <View key={`${url}-${i}`} wrap={false}>
              <Image src={url} style={styles.floorplanImg} />
            </View>
          ))}
          <Footer />
        </Page>
      ) : null}

      {/* ============================================================== */}
      {/* Agent contact                                                  */}
      {/* ============================================================== */}
      {(agentName || agentEmail || agentPhone) ? (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Kontakt megler</Text>
          <View style={styles.sectionDivider} />
          <View style={styles.agentCard}>
            {agentPhoto ? <Image src={agentPhoto} style={styles.agentPhoto} /> : null}
            <View style={styles.agentInfo}>
              {agentName ? <Text style={styles.agentName}>{agentName}</Text> : null}
              {agentTitle ? <Text style={styles.agentTitle}>{agentTitle}</Text> : null}
              {agentBio ? <Text style={styles.agentBio}>{agentBio}</Text> : null}
              {agentPhone ? <Text style={styles.agentContact}>Telefon: {agentPhone}</Text> : null}
              {agentEmail ? <Text style={styles.agentContact}>E-post: {agentEmail}</Text> : null}
            </View>
          </View>
          <Footer />
        </Page>
      ) : null}
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the prospect to a Node Buffer of PDF bytes.
 *
 * Designed for use in Next.js API routes (Node runtime). For browser
 * preview, use `pdf(...).toBlob()` directly with the JSX element.
 */
export async function renderPropertyProspect(input: RenderInput): Promise<Buffer> {
  const instance = pdf(<ProspectDocument {...input} />);
  const blob = await instance.toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export { ProspectDocument };

// ===========================================================================
// Multi-property prospect — used by the Content Hub to send a curated
// shortlist to a buyer. Structure:
//   1. Cover page                — brand logo, intro, count
//   2. Overview list             — one row per property with thumbnail
//                                  and key facts; ref + page number for
//                                  jumping into the detailed section
//   3. Per-property detail pages — cover (image + facts), description,
//                                  gallery (all on one page so the file
//                                  doesn't balloon for 10+ properties)
//   4. Agent contact card        — common to all properties
// ===========================================================================

interface MultiRenderInput {
  properties: PdfPropertyInput[];
  brand?: PdfBrandInput;
  agent?: PdfAgentInput;
  brandLogoUrl?: string;
  locale?: string;
  /** Optional headline / customer name shown on the cover. */
  headline?: string;
  /** Optional intro paragraph beneath the headline. */
  intro?: string;
}

const multiStyles = StyleSheet.create({
  // Cover
  coverHeadline: {
    fontSize: 32,
    fontWeight: 700,
    marginTop: 80,
    marginBottom: 8,
    color: COLORS.ink,
  },
  coverSubhead: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 30,
  },
  coverIntro: {
    fontSize: 12,
    lineHeight: 1.6,
    color: "#333",
    marginBottom: 20,
  },
  coverCount: {
    marginTop: 32,
    fontSize: 11,
    color: COLORS.accent,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  // Overview row
  overviewRow: {
    flexDirection: "row",
    borderBottom: `1pt solid ${COLORS.faint}`,
    paddingVertical: 12,
  },
  overviewThumb: {
    width: 110,
    height: 80,
    objectFit: "cover",
    backgroundColor: COLORS.faint,
    marginRight: 14,
    borderRadius: 4,
  },
  overviewBody: {
    flex: 1,
    justifyContent: "center",
  },
  overviewTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.ink,
    marginBottom: 2,
  },
  overviewMeta: {
    fontSize: 10,
    color: COLORS.muted,
    marginBottom: 4,
  },
  overviewFacts: {
    fontSize: 9,
    color: "#444",
  },
  overviewPriceCol: {
    width: 110,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  overviewPrice: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.accent,
  },
  overviewRef: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 2,
  },
  // Per-property condensed cover
  detailHero: {
    width: "100%",
    height: 240,
    objectFit: "cover",
    marginBottom: 16,
    backgroundColor: COLORS.faint,
  },
});

function MultiProspectDocument({
  properties,
  brand,
  agent,
  brandLogoUrl,
  locale,
  headline,
  intro,
}: MultiRenderInput) {
  const brandName = pickField(brand?.custom_name, brand?.display_name, brand?.brand_id) || "";
  const brandWebsite = brand?.website || "";

  const Footer = () => (
    <View style={styles.footer} fixed>
      <Text>
        {brandName}
        {brandWebsite ? `  ·  ${brandWebsite}` : ""}
      </Text>
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );

  const propsList = properties.filter(Boolean);
  const docTitle = headline || `Eiendomsutvalg (${propsList.length})`;

  return (
    <Document title={docTitle} author={brandName} subject="Eiendomsutvalg">
      {/* ============================================================== */}
      {/* Cover                                                          */}
      {/* ============================================================== */}
      <Page size="A4" style={styles.page}>
        {brandLogoUrl ? <Image src={brandLogoUrl} style={styles.brandLogoCover} /> : null}
        <Text style={multiStyles.coverHeadline}>{headline || "Eiendomsutvalg"}</Text>
        <Text style={multiStyles.coverSubhead}>
          {brandName ? `Kuratert av ${brandName}` : "Personlig kuratert utvalg"}
        </Text>
        {intro ? <Text style={multiStyles.coverIntro}>{intro}</Text> : null}
        <Text style={multiStyles.coverCount}>
          {propsList.length} {propsList.length === 1 ? "eiendom" : "eiendommer"}
        </Text>
        <Footer />
      </Page>

      {/* ============================================================== */}
      {/* Overview list                                                  */}
      {/* ============================================================== */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Oversikt</Text>
        <View style={styles.sectionDivider} />
        {propsList.map((p, i) => {
          const heroImage = pickField(p.imageUrl, p.primary_image);
          const type = pickField(p.type, p.property_type) || "Eiendom";
          const area = pickField(p.area, p.built_area);
          const facts: string[] = [type];
          if (p.bedrooms) facts.push(`${p.bedrooms} sov`);
          if (p.bathrooms) facts.push(`${p.bathrooms} bad`);
          if (area) facts.push(`${area} m²`);
          return (
            <View key={`${p.id || i}-row`} style={multiStyles.overviewRow} wrap={false}>
              {heroImage ? (
                <Image src={heroImage} style={multiStyles.overviewThumb} />
              ) : (
                <View style={multiStyles.overviewThumb} />
              )}
              <View style={multiStyles.overviewBody}>
                <Text style={multiStyles.overviewTitle}>
                  {p.title || "Uten tittel"}
                </Text>
                <Text style={multiStyles.overviewMeta}>{p.location || ""}</Text>
                <Text style={multiStyles.overviewFacts}>{facts.join(" · ")}</Text>
              </View>
              <View style={multiStyles.overviewPriceCol}>
                <Text style={multiStyles.overviewPrice}>
                  {formatPrice(p.price, locale)}
                </Text>
                {p.ref ? (
                  <Text style={multiStyles.overviewRef}>Ref. {p.ref}</Text>
                ) : null}
              </View>
            </View>
          );
        })}
        <Footer />
      </Page>

      {/* ============================================================== */}
      {/* Per-property detail pages                                      */}
      {/* ============================================================== */}
      {propsList.map((p, i) => {
        const title = p.title || "Eiendom uten tittel";
        const location = p.location || "";
        const price = formatPrice(p.price, locale);
        const type = pickField(p.type, p.property_type) || "Eiendom";
        const area = pickField(p.area, p.built_area);
        const plotArea = pickField(p.plotArea, p.plot_size);
        const yearBuilt = pickField(p.yearBuilt, p.year_built);
        const energyRating = pickField(p.energyRating, p.energy_rating);
        const heroImage = pickField(p.imageUrl, p.primary_image);
        const gallery = (p.gallery || [])
          .filter((u) => u && u !== heroImage)
          .slice(0, 4);

        return (
          <Page size="A4" style={styles.page} key={`${p.id || i}-detail`}>
            {brandLogoUrl ? <Image src={brandLogoUrl} style={styles.brandLogoCover} /> : null}

            {heroImage ? (
              <Image src={heroImage} style={multiStyles.detailHero} />
            ) : (
              <View style={multiStyles.detailHero} />
            )}

            <Text style={styles.coverTitle}>{title}</Text>
            <Text style={styles.coverLocation}>{location}</Text>

            <View style={styles.coverPriceRow}>
              <Text style={styles.coverPrice}>{price}</Text>
              {p.ref ? <Text style={styles.coverRef}>Ref. {p.ref}</Text> : null}
            </View>

            {/* Compact key-fact strip */}
            <View style={styles.factGrid}>
              <View style={styles.factCell}>
                <Text style={styles.factLabel}>Type</Text>
                <Text style={styles.factValue}>{type}</Text>
              </View>
              {p.bedrooms ? (
                <View style={styles.factCell}>
                  <Text style={styles.factLabel}>Soverom</Text>
                  <Text style={styles.factValue}>{p.bedrooms}</Text>
                </View>
              ) : null}
              {p.bathrooms ? (
                <View style={styles.factCell}>
                  <Text style={styles.factLabel}>Bad</Text>
                  <Text style={styles.factValue}>{p.bathrooms}</Text>
                </View>
              ) : null}
              {area ? (
                <View style={styles.factCell}>
                  <Text style={styles.factLabel}>Boligareal</Text>
                  <Text style={styles.factValue}>{area} m²</Text>
                </View>
              ) : null}
              {plotArea ? (
                <View style={styles.factCell}>
                  <Text style={styles.factLabel}>Tomt</Text>
                  <Text style={styles.factValue}>{plotArea} m²</Text>
                </View>
              ) : null}
              {yearBuilt ? (
                <View style={styles.factCell}>
                  <Text style={styles.factLabel}>Byggeår</Text>
                  <Text style={styles.factValue}>{yearBuilt}</Text>
                </View>
              ) : null}
              {energyRating ? (
                <View style={styles.factCell}>
                  <Text style={styles.factLabel}>Energi</Text>
                  <Text style={styles.factValue}>{energyRating}</Text>
                </View>
              ) : null}
            </View>

            {/* Compact description */}
            {p.description ? (
              <Text style={[styles.body, { marginTop: 4 }]}>
                {p.description.length > 700
                  ? `${p.description.slice(0, 700)}…`
                  : p.description}
              </Text>
            ) : null}

            {/* Mini gallery — 4 thumbnails to keep one page per property */}
            {gallery.length > 0 ? (
              <View style={styles.galleryGrid}>
                {gallery.map((url, gi) => (
                  <View
                    key={`${url}-${gi}`}
                    style={[styles.galleryCell, { width: "25%" }]}
                    wrap={false}
                  >
                    <Image src={url} style={[styles.galleryImg, { height: 90 }]} />
                  </View>
                ))}
              </View>
            ) : null}

            <Footer />
          </Page>
        );
      })}

      {/* ============================================================== */}
      {/* Agent contact (shared)                                         */}
      {/* ============================================================== */}
      {(agent?.agent_name || agent?.agent_email || agent?.agent_phone) ? (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Kontakt megler</Text>
          <View style={styles.sectionDivider} />
          <View style={styles.agentCard}>
            {agent.agent_photo_url ? (
              <Image src={agent.agent_photo_url} style={styles.agentPhoto} />
            ) : null}
            <View style={styles.agentInfo}>
              {agent.agent_name ? (
                <Text style={styles.agentName}>{agent.agent_name}</Text>
              ) : null}
              {agent.agent_title ? (
                <Text style={styles.agentTitle}>{agent.agent_title}</Text>
              ) : null}
              {agent.agent_bio ? (
                <Text style={styles.agentBio}>{agent.agent_bio}</Text>
              ) : null}
              {agent.agent_phone ? (
                <Text style={styles.agentContact}>Telefon: {agent.agent_phone}</Text>
              ) : null}
              {agent.agent_email ? (
                <Text style={styles.agentContact}>E-post: {agent.agent_email}</Text>
              ) : null}
            </View>
          </View>
          <Footer />
        </Page>
      ) : null}
    </Document>
  );
}

/**
 * Render a multi-property prospect (a curated shortlist of properties)
 * to a Node Buffer of PDF bytes.
 */
export async function renderMultiPropertyProspect(input: MultiRenderInput): Promise<Buffer> {
  const instance = pdf(<MultiProspectDocument {...input} />);
  const blob = await instance.toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export { MultiProspectDocument };
export type { MultiRenderInput };
