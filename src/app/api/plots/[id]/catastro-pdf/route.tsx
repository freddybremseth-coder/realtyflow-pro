import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { requireAdminApi } from "@/lib/api-admin";

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

type DistanceItem = {
  label: string;
  km: number;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

function formatArea(value?: string | number | null) {
  const numeric = Number(value || 0);
  if (!numeric || numeric <= 0 || Number.isNaN(numeric)) return "Ikke oppgitt";
  return `${numeric.toLocaleString("nb-NO")} m²`;
}

function formatKm(value: number) {
  return `${value.toFixed(value < 10 ? 1 : 0).replace(".", ",")} km`;
}

function catastroUrl(refcat?: string) {
  const url = new URL(CATASTRO_MAP_URL);
  if (refcat) url.searchParams.set("refcat", refcat);
  return url.toString();
}

function googleMapsUrl(lat?: number, lng?: number) {
  if (!lat || !lng) return "";
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const referencePoints = [
  { label: "Alicante flyplass", lat: 38.2822, lng: -0.5582, type: "airport" },
  { label: "Murcia flyplass", lat: 37.8030, lng: -1.1250, type: "airport" },
  { label: "Valencia flyplass", lat: 39.4893, lng: -0.4816, type: "airport" },
  { label: "Alicante sentrum", lat: 38.3452, lng: -0.4810, type: "city" },
  { label: "Elche sentrum", lat: 38.2699, lng: -0.7126, type: "city" },
  { label: "Benidorm sentrum", lat: 38.5411, lng: -0.1225, type: "city" },
  { label: "Torrevieja sentrum", lat: 37.9847, lng: -0.6822, type: "city" },
  { label: "Playa del Postiguet", lat: 38.3456, lng: -0.4760, type: "beach" },
  { label: "Playa de Arenales del Sol", lat: 38.2479, lng: -0.5184, type: "beach" },
  { label: "Playa de San Juan", lat: 38.3688, lng: -0.4105, type: "beach" },
  { label: "Playa de Levante, Benidorm", lat: 38.5369, lng: -0.1114, type: "beach" },
];

function getDistanceItems(lat?: number, lng?: number): DistanceItem[] {
  if (!lat || !lng) return [];
  const grouped = ["airport", "city", "beach"].map((type) => {
    return referencePoints
      .filter((point) => point.type === type)
      .map((point) => ({ label: point.label, km: haversineKm(lat, lng, point.lat, point.lng) }))
      .sort((a, b) => a.km - b.km)[0];
  });
  return grouped.filter(Boolean).slice(0, 3) as DistanceItem[];
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

async function imageUrlToDataUri(url: string) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "RealtyFlow-Catastro-PDF/1.0" } });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "image/png";
    if (!contentType.startsWith("image/")) return "";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return "";
  }
}

async function getCatastroMapImageDataUri(lat?: number, lng?: number) {
  if (!lat || !lng) return "";
  const delta = 0.0012;
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

  return imageUrlToDataUri(url.toString());
}

async function getGoogleStaticMapImageDataUri(lat?: number, lng?: number) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!lat || !lng || !key) return "";
  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  url.searchParams.set("center", `${lat},${lng}`);
  url.searchParams.set("zoom", "12");
  url.searchParams.set("size", "900x520");
  url.searchParams.set("scale", "2");
  url.searchParams.set("maptype", "roadmap");
  url.searchParams.set("markers", `color:red|label:T|${lat},${lng}`);
  url.searchParams.set("key", key);
  return imageUrlToDataUri(url.toString());
}

async function getOpenStreetMapStaticImageDataUri(lat?: number, lng?: number) {
  if (!lat || !lng) return "";
  const url = new URL("https://staticmap.openstreetmap.de/staticmap.php");
  url.searchParams.set("center", `${lat},${lng}`);
  url.searchParams.set("zoom", "11");
  url.searchParams.set("size", "900x520");
  url.searchParams.set("maptype", "mapnik");
  url.searchParams.set("markers", `${lat},${lng},red-pushpin`);
  return imageUrlToDataUri(url.toString());
}

async function getOverviewMapImageDataUri(lat?: number, lng?: number) {
  return (await getGoogleStaticMapImageDataUri(lat, lng)) || (await getOpenStreetMapStaticImageDataUri(lat, lng));
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
  grid: { flexDirection: "row" },
  card: { flex: 1, backgroundColor: "#f7f8f9", padding: 12, borderRadius: 8, marginRight: 8 },
  cardLast: { flex: 1, backgroundColor: "#f7f8f9", padding: 12, borderRadius: 8 },
  cardLabel: { fontSize: 8, color: "#667085", textTransform: "uppercase", marginBottom: 5 },
  cardValue: { fontSize: 13, color: "#101828", fontWeight: 700 },
  notes: { fontSize: 10, lineHeight: 1.45, color: "#344054" },
  map: { width: "100%", height: 230, objectFit: "cover", borderRadius: 8, border: "1px solid #d0d5dd" },
  overviewMap: { width: "100%", height: 245, objectFit: "cover", borderRadius: 8, border: "1px solid #d0d5dd" },
  mapPlaceholder: { height: 118, padding: 16, borderRadius: 8, border: "1px solid #d0d5dd", backgroundColor: "#f7f8f9" },
  placeholderTitle: { fontSize: 12, fontWeight: 700, color: "#101828", marginBottom: 5 },
  placeholderText: { fontSize: 9.5, color: "#667085", lineHeight: 1.45 },
  smallText: { fontSize: 9, lineHeight: 1.35, color: "#667085", marginTop: 8 },
  footer: { marginTop: 12, paddingTop: 10, borderTop: "1px solid #eaecf0", color: "#667085", fontSize: 8.5, lineHeight: 1.4 },
  link: { color: "#175cd3", fontSize: 9.5, lineHeight: 1.4 },
});

function DataRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || "Ikke oppgitt"}</Text>
    </View>
  );
}

function DistanceCards({ items }: { items: DistanceItem[] }) {
  if (!items.length) return null;
  return (
    <View style={[styles.grid, { marginTop: 10 }]}>
      {items.map((item, index) => (
        <View key={item.label} style={index === items.length - 1 ? styles.cardLast : styles.card}>
          <Text style={styles.cardLabel}>{item.label}</Text>
          <Text style={styles.cardValue}>{formatKm(item.km)}</Text>
        </View>
      ))}
    </View>
  );
}

function PlotPdf({
  plot,
  details,
  catastroMapImage,
  overviewMapImage,
  distances,
}: {
  plot: PlotRecord;
  details: CatastroDetails;
  catastroMapImage?: string;
  overviewMapImage?: string;
  distances: DistanceItem[];
}) {
  const refcat = details.refcat || extractRef(plot);
  const generatedAt = new Date().toLocaleDateString("nb-NO");
  const lat = Number(plot.lat || 0);
  const lng = Number(plot.lng || 0);
  const mapsUrl = googleMapsUrl(lat, lng);

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
          <Text style={styles.sectionTitle}>Nøkkelinformasjon</Text>
          <View style={styles.body}>
            <View style={styles.grid}>
              <View style={styles.card}><Text style={styles.cardLabel}>Pris</Text><Text style={styles.cardValue}>{formatEuro(plot.price)}</Text></View>
              <View style={styles.card}><Text style={styles.cardLabel}>Areal RealtyFlow</Text><Text style={styles.cardValue}>{formatArea(plot.area)}</Text></View>
              <View style={styles.cardLast}><Text style={styles.cardLabel}>Areal Catastro</Text><Text style={styles.cardValue}>{formatArea(details.area)}</Text></View>
            </View>
            <DataRow label="Beliggenhet" value={plot.location || details.location} />
            <DataRow label="Municipio" value={details.municipality || plot.municipality} />
            <DataRow label="Regulering" value={plot.zoning} />
            <DataRow label="GPS" value={lat && lng ? `${lat}, ${lng}` : "Ikke oppgitt"} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Område og beliggenhet</Text>
          <View style={styles.body}>
            {overviewMapImage ? (
              <Image src={overviewMapImage} style={styles.overviewMap} />
            ) : (
              <View style={styles.mapPlaceholder}>
                <Text style={styles.placeholderTitle}>Områdekart kunne ikke hentes automatisk</Text>
                <Text style={styles.placeholderText}>
                  Bruk Google Maps-lenken under for å åpne tomten direkte i kart. Dersom du legger inn GOOGLE_MAPS_API_KEY i Vercel, kan rapporten generere et Google Static Maps-bilde her.
                </Text>
              </View>
            )}
            <DistanceCards items={distances} />
            {mapsUrl && <Text style={styles.link}>Google Maps: {mapsUrl}</Text>}
            <Text style={styles.smallText}>Avstander er estimert i luftlinje og brukes kun som rask orientering for kunde.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos descriptivos del inmueble</Text>
          <View style={styles.body}>
            <DataRow label="Referencia catastral" value={refcat} />
            <DataRow label="Localización" value={details.location || plot.location} />
            <DataRow label="Provincia" value={details.province} />
            <DataRow label="Polígono" value={details.polygon || polygonFromRef(refcat || "")} />
            <DataRow label="Parcela" value={details.parcel || parcelFromRef(refcat || "")} />
            <DataRow label="Uso principal" value={details.use} />
            <DataRow label="Vann" value={plot.water ? "Ja" : "Ikke oppgitt"} />
            <DataRow label="Strøm" value={plot.electricity ? "Ja" : "Ikke oppgitt"} />
            <DataRow label="Veiadgang" value={plot.road_access || plot.roadAccess ? "Ja" : "Ikke oppgitt"} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Catastro og parcelutsnitt</Text>
          <View style={styles.body}>
            {catastroMapImage ? <Image src={catastroMapImage} style={styles.map} /> : <Text style={styles.notes}>Catastro-kartutsnitt kunne ikke hentes automatisk.</Text>}
            <Text style={styles.link}>Catastro: {catastroUrl(refcat)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notater</Text>
          <View style={styles.body}>
            <Text style={styles.notes}>{plot.notes || "Ingen notater registrert."}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Generert {generatedAt}. Dette dokumentet er en informativ oversikt og erstatter ikke juridisk kontroll. Alle data må kontrolleres mot Catastro, Nota Simple, Registro de la Propiedad, kommune/arkitekt og advokat før kjøp eller reservasjon.
        </Text>
      </Page>
    </Document>
  );
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const { data: plot, error } = await supabase.from("land_plots").select("*").eq("id", params.id).single();
  if (error || !plot) return NextResponse.json({ error: error?.message || "Plot not found" }, { status: 404 });

  const lat = Number(plot.lat || 0);
  const lng = Number(plot.lng || 0);
  let refcat = extractRef(plot);
  if (!refcat) refcat = await discoverRefFromCoordinates(lat, lng);

  const details = await fetchCatastroDetails(refcat);
  const [catastroMapImage, overviewMapImage] = await Promise.all([
    getCatastroMapImageDataUri(lat, lng),
    getOverviewMapImageDataUri(lat, lng),
  ]);
  const distances = getDistanceItems(lat, lng);

  const pdfBlob = await pdf(
    <PlotPdf
      plot={plot}
      details={{ ...details, refcat: details.refcat || refcat }}
      catastroMapImage={catastroMapImage}
      overviewMapImage={overviewMapImage}
      distances={distances}
    />,
  ).toBlob();
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
