import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

export const runtime = "nodejs";

const CATASTRO_REF_PATTERN = /\b\d{5}[A-Z]\d{7}[A-Z0-9]{7}\b/i;
const CATASTRO_MAP_URL = "https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx";
const CATASTRO_WMS_URL = "https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx";
const CATASTRO_COORDINATE_SERVICE =
  "https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR";
const CATASTRO_DNPRC_SERVICE =
  "https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC";

type PlotRecord = Record<string, any>;

type CatastroDetails = {
  refcat?: string;
  municipality?: string;
  province?: string;
  location?: string;
  polygon?: string;
  parcel?: string;
  use?: string;
  className?: string;
  area?: string;
  rawError?: string;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function cleanRef(value?: string | number | null) {
  const normalized = String(value || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  const direct = normalized.match(CATASTRO_REF_PATTERN)?.[0];
  if (direct) return direct;
  return String(value || "").toUpperCase().match(CATASTRO_REF_PATTERN)?.[0] || "";
}

function extractRef(plot: PlotRecord) {
  return (
    cleanRef(plot.cadastral_reference) ||
    cleanRef(plot.cadastralReference) ||
    cleanRef(plot.referencia_catastral) ||
    cleanRef(plot.referenciaCatastral) ||
    cleanRef(plot.catastro_ref) ||
    cleanRef(plot.catastroRef) ||
    cleanRef([plot.notes, plot.location, plot.municipality, plot.plot_number, plot.plotNumber].filter(Boolean).join(" "))
  );
}

function normalizeNumber(value?: string | number | null) {
  return String(value || "").replace(/[^0-9]/g, "").replace(/^0+/, "");
}

function polygonFromRef(ref: string) {
  const match = ref.match(/^\d{5}[A-Z](\d{3})/i);
  return normalizeNumber(match?.[1]);
}

function parcelFromRef(ref: string) {
  const match = ref.match(/^\d{5}[A-Z]\d{3}(\d{5})/i);
  return normalizeNumber(match?.[1]);
}

function textBetween(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}>([^<]+)<\\/${tag}>`, "i"))?.[1]?.trim() || "";
}

function formatEuro(value?: number) {
  if (!value) return "Pris på forespørsel";
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function catastroUrl(refcat?: string) {
  const url = new URL(CATASTRO_MAP_URL);
  if (refcat) url.searchParams.set("refcat", refcat);
  return url.toString();
}

function coordinateLookupUrl(lat: number, lng: number) {
  const url = new URL(CATASTRO_COORDINATE_SERVICE);
  url.searchParams.set("SRS", "EPSG:4326");
  url.searchParams.set("Coordenada_X", String(lng));
  url.searchParams.set("Coordenada_Y", String(lat));
  return url.toString();
}

function detailsLookupUrl(refcat: string) {
  const url = new URL(CATASTRO_DNPRC_SERVICE);
  url.searchParams.set("Provincia", "");
  url.searchParams.set("Municipio", "");
  url.searchParams.set("RC", refcat);
  return url.toString();
}

async function discoverRefFromCoordinates(lat?: number, lng?: number) {
  if (!lat || !lng) return "";
  try {
    const response = await fetch(coordinateLookupUrl(lat, lng), { headers: { Accept: "application/xml,text/xml,*/*" } });
    const xml = await response.text();
    const pc1 = textBetween(xml, "pc1");
    const pc2 = textBetween(xml, "pc2");
    return cleanRef(pc1 && pc2 ? `${pc1}${pc2}` : textBetween(xml, "refcat"));
  } catch {
    return "";
  }
}

async function fetchCatastroDetails(refcat?: string): Promise<CatastroDetails> {
  if (!refcat) return {};
  try {
    const response = await fetch(detailsLookupUrl(refcat), { headers: { Accept: "application/xml,text/xml,*/*" } });
    const xml = await response.text();

    const pc1 = textBetween(xml, "pc1");
    const pc2 = textBetween(xml, "pc2");
    const resolvedRef = cleanRef(pc1 && pc2 ? `${pc1}${pc2}` : refcat);
    const np = textBetween(xml, "np");
    const nm = textBetween(xml, "nm");
    const loine = textBetween(xml, "loine");
    const ldt = textBetween(xml, "ldt");
    const uso = textBetween(xml, "luso");
    const area = textBetween(xml, "sfc") || textBetween(xml, "ssp");

    return {
      refcat: resolvedRef || refcat,
      province: np,
      municipality: nm,
      location: ldt || loine,
      polygon: polygonFromRef(resolvedRef || refcat),
      parcel: parcelFromRef(resolvedRef || refcat),
      use: uso,
      className: "Rústico / Urbano må bekreftes i Catastro",
      area,
    };
  } catch (error) {
    return { refcat, rawError: error instanceof Error ? error.message : "Kunne ikke hente Catastro-detaljer" };
  }
}

async function getMapImageDataUri(lat?: number, lng?: number) {
  if (!lat || !lng) return "";
  const delta = 0.004;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(",");
  const url = new URL(CATASTRO_WMS_URL);
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.1.1");
  url.searchParams.set("REQUEST", "GetMap");
  url.searchParams.set("LAYERS", "Catastro");
  url.searchParams.set("STYLES", "");
  url.searchParams.set("SRS", "EPSG:4326");
  url.searchParams.set("BBOX", bbox);
  url.searchParams.set("WIDTH", "900");
  url.searchParams.set("HEIGHT", "520");
  url.searchParams.set("FORMAT", "image/png");
  url.searchParams.set("TRANSPARENT", "FALSE");

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return "";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch {
    return "";
  }
}

const styles = StyleSheet.create({
  page: { padding: 34, fontFamily: "Helvetica", color: "#172033", backgroundColor: "#ffffff" },
  header: { backgroundColor: "#172033", color: "#ffffff", padding: 18, borderRadius: 10, marginBottom: 18 },
  brand: { fontSize: 11, color: "#d6b374", textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 8 },
  title: { fontSize: 23, fontWeight: 700, marginBottom: 6 },
  subtitle: { fontSize: 10, color: "#d8deea", lineHeight: 1.45 },
  section: { border: "1px solid #dfe4ea", borderRadius: 10, marginBottom: 14, overflow: "hidden" },
  sectionTitle: { backgroundColor: "#f59f00", color: "#ffffff", fontSize: 13, fontWeight: 700, padding: 11, textTransform: "uppercase" },
  body: { padding: 14 },
  row: { flexDirection: "row", borderBottom: "1px solid #edf0f3", paddingVertical: 7 },
  label: { width: "35%", color: "#667085", fontSize: 10 },
  value: { width: "65%", color: "#101828", fontSize: 10.5, fontWeight: 600, lineHeight: 1.35 },
  grid: { flexDirection: "row", gap: 10 },
  card: { flex: 1, backgroundColor: "#f7f8f9", padding: 12, borderRadius: 8 },
  cardLabel: { fontSize: 8, color: "#667085", textTransform: "uppercase", marginBottom: 5 },
  cardValue: { fontSize: 13, color: "#101828", fontWeight: 700 },
  notes: { fontSize: 10, lineHeight: 1.45, color: "#344054" },
  map: { width: "100%", height: 230, objectFit: "cover", borderRadius: 8, border: "1px solid #d0d5dd" },
  footer: { marginTop: 12, paddingTop: 10, borderTop: "1px solid #eaecf0", color: "#667085", fontSize: 8.5, lineHeight: 1.4 },
  link: { color: "#175cd3", fontSize: 9.5 },
});

function DataRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || "Ikke oppgitt"}</Text>
    </View>
  );
}

function PlotPdf({ plot, details, mapImage }: { plot: PlotRecord; details: CatastroDetails; mapImage?: string }) {
  const refcat = details.refcat || extractRef(plot);
  const generatedAt = new Date().toLocaleDateString("nb-NO");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>RealtyFlow · Catastro rapport</Text>
          <Text style={styles.title}>{plot.plot_number || plot.plotNumber || "Tomt"}</Text>
          <Text style={styles.subtitle}>
            Profesjonell tomteoversikt generert for kunde. Informasjonen er hentet fra RealtyFlow og offentlige Catastro-kilder der tilgjengelig.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos descriptivos del inmueble</Text>
          <View style={styles.body}>
            <DataRow label="Referencia catastral" value={refcat} />
            <DataRow label="Localización" value={details.location || plot.location} />
            <DataRow label="Municipio" value={details.municipality || plot.municipality} />
            <DataRow label="Provincia" value={details.province} />
            <DataRow label="Polígono" value={details.polygon || polygonFromRef(refcat || "")} />
            <DataRow label="Parcela" value={details.parcel || parcelFromRef(refcat || "")} />
            <DataRow label="Uso principal" value={details.use} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información comercial</Text>
          <View style={styles.body}>
            <View style={styles.grid}>
              <View style={styles.card}><Text style={styles.cardLabel}>Pris</Text><Text style={styles.cardValue}>{formatEuro(plot.price)}</Text></View>
              <View style={styles.card}><Text style={styles.cardLabel}>Areal RealtyFlow</Text><Text style={styles.cardValue}>{Number(plot.area || 0).toLocaleString("nb-NO")} m²</Text></View>
              <View style={styles.card}><Text style={styles.cardLabel}>Areal Catastro</Text><Text style={styles.cardValue}>{details.area ? `${Number(details.area).toLocaleString("nb-NO")} m²` : "Ikke oppgitt"}</Text></View>
            </View>
            <DataRow label="Regulering" value={plot.zoning} />
            <DataRow label="Vann" value={plot.water ? "Ja" : "Ikke oppgitt"} />
            <DataRow label="Strøm" value={plot.electricity ? "Ja" : "Ikke oppgitt"} />
            <DataRow label="Veiadgang" value={plot.road_access || plot.roadAccess ? "Ja" : "Ikke oppgitt"} />
            <DataRow label="GPS" value={plot.lat && plot.lng ? `${plot.lat}, ${plot.lng}` : "Ikke oppgitt"} />
          </View>
        </View>

        {mapImage && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Parcela catastral / kartutsnitt</Text>
            <View style={styles.body}>
              <Image src={mapImage} style={styles.map} />
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notater</Text>
          <View style={styles.body}>
            <Text style={styles.notes}>{plot.notes || "Ingen notater registrert."}</Text>
            <Text style={styles.link}>{catastroUrl(refcat)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Generert {generatedAt}. Dette dokumentet er en informativ oversikt og erstatter ikke juridisk kontroll. Alle data må kontrolleres mot Catastro, Nota Simple, Registro de la Propiedad, kommune/arkitekt og advokat før kjøp eller reservasjon.
        </Text>
      </Page>
    </Document>
  );
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const { data: plot, error } = await supabase.from("land_plots").select("*").eq("id", params.id).single();
  if (error || !plot) return NextResponse.json({ error: error?.message || "Plot not found" }, { status: 404 });

  let refcat = extractRef(plot);
  if (!refcat) refcat = await discoverRefFromCoordinates(Number(plot.lat), Number(plot.lng));

  const details = await fetchCatastroDetails(refcat);
  const mapImage = await getMapImageDataUri(Number(plot.lat), Number(plot.lng));
  const pdfBlob = await pdf(<PlotPdf plot={plot} details={{ ...details, refcat: details.refcat || refcat }} mapImage={mapImage} />).toBlob();
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const filename = `${String(plot.plot_number || "tomt").replace(/[^a-z0-9-_]+/gi, "-")}-catastro.pdf`;

  return new NextResponse(Buffer.from(arrayBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
