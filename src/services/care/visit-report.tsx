import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { careCategoryLabel, careItemLabel } from "@/lib/care/visit-workflow";

type JsonRecord = Record<string, any>;

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 9, color: "#1f2937" },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 5 },
  sub: { fontSize: 10, color: "#64748b", marginBottom: 16 },
  section: { marginBottom: 14 },
  heading: { fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#0f766e" },
  row: { display: "flex", flexDirection: "row", borderBottom: "1 solid #e2e8f0", paddingVertical: 4 },
  label: { width: "48%" },
  status: { width: "18%", fontWeight: 700 },
  value: { width: "16%" },
  note: { width: "18%", color: "#64748b" },
  issue: { padding: 7, marginBottom: 5, backgroundColor: "#fff7ed", borderRadius: 3 },
  footer: { marginTop: 16, color: "#64748b", fontSize: 8 },
});

function textFromJson(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const row = value as JsonRecord;
    return String(row.nb || row.no || row.en || row.text || row.note || "");
  }
  return String(value);
}

export async function renderCareVisitReport(input: {
  reference: string;
  property: JsonRecord;
  inspection: JsonRecord;
  items: JsonRecord[];
  issues: JsonRecord[];
  photoCount: number;
}) {
  const grouped = new Map<string, JsonRecord[]>();
  for (const item of input.items) {
    const category = String(item.category || "other");
    grouped.set(category, [...(grouped.get(category) || []), item]);
  }

  const doc = (
    <Document title={input.reference}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Zen Eco Homes Care</Text>
        <Text style={styles.sub}>Tilsynsrapport · {input.reference}</Text>
        <View style={styles.section}>
          <Text style={styles.heading}>{String(input.property.name || input.property.reference || "Care-eiendom")}</Text>
          <Text>{String(input.property.address_line || "")}{input.property.municipality ? ` · ${input.property.municipality}` : ""}</Text>
          <Text>Startet: {new Date(String(input.inspection.started_at)).toLocaleString("nb-NO")}</Text>
          <Text>Fullført: {new Date(String(input.inspection.completed_at)).toLocaleString("nb-NO")}</Text>
          <Text>Bilder: {input.photoCount} · Avvik: {input.issues.length}</Text>
        </View>

        {[...grouped.entries()].map(([category, items]) => (
          <View key={category} style={styles.section} wrap={false}>
            <Text style={styles.heading}>{careCategoryLabel(category)}</Text>
            {items.map((item) => (
              <View key={String(item.item_code)} style={styles.row}>
                <Text style={styles.label}>{careItemLabel(String(item.item_code))}</Text>
                <Text style={styles.status}>{String(item.status || "").toUpperCase()}</Text>
                <Text style={styles.value}>{item.value_numeric == null ? "" : `${item.value_numeric} ${item.value_unit || ""}`}</Text>
                <Text style={styles.note}>{textFromJson(item.note)}</Text>
              </View>
            ))}
          </View>
        ))}

        {input.issues.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.heading}>Avvik og oppfølging</Text>
            {input.issues.map((issue) => (
              <View key={String(issue.id)} style={styles.issue}>
                <Text>{textFromJson(issue.title) || careItemLabel(String(issue.item_code || ""))}</Text>
                <Text>{String(issue.severity || "").toUpperCase()} · {textFromJson(issue.description)}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer}>Rapporten er generert fra registrerte Care-data. Rapporten sendes ikke automatisk før den er godkjent.</Text>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
