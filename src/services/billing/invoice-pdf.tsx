import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

type JsonRecord = Record<string, any>;

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", fontSize: 9, color: "#172033", backgroundColor: "#ffffff" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  brand: { fontSize: 18, fontWeight: 700, color: "#0f766e", marginBottom: 5 },
  title: { fontSize: 24, fontWeight: 700, textAlign: "right", color: "#0f172a" },
  number: { fontSize: 10, textAlign: "right", color: "#475569", marginTop: 5 },
  columns: { flexDirection: "row", gap: 28, marginBottom: 24 },
  column: { flex: 1 },
  eyebrow: { fontSize: 7, textTransform: "uppercase", letterSpacing: 1.2, color: "#64748b", marginBottom: 5 },
  strong: { fontSize: 10, fontWeight: 700, marginBottom: 2 },
  muted: { color: "#64748b", lineHeight: 1.45 },
  metadata: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#e2e8f0", paddingVertical: 10, flexDirection: "row", marginBottom: 22 },
  metadataCell: { flex: 1 },
  metadataLabel: { fontSize: 7, color: "#64748b", textTransform: "uppercase", marginBottom: 3 },
  metadataValue: { fontSize: 9, fontWeight: 700 },
  tableHeader: { flexDirection: "row", backgroundColor: "#0f766e", color: "white", paddingVertical: 7, paddingHorizontal: 6 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#e2e8f0", paddingVertical: 8, paddingHorizontal: 6 },
  description: { width: "42%" },
  quantity: { width: "11%", textAlign: "right" },
  price: { width: "16%", textAlign: "right" },
  tax: { width: "12%", textAlign: "right" },
  amount: { width: "19%", textAlign: "right" },
  totals: { marginTop: 16, marginLeft: "55%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grandTotal: { borderTopWidth: 1, borderColor: "#0f172a", marginTop: 4, paddingTop: 7, fontSize: 12, fontWeight: 700 },
  legal: { marginTop: 24, padding: 12, backgroundColor: "#f8fafc", color: "#475569", lineHeight: 1.5 },
  footer: { position: "absolute", left: 42, right: 42, bottom: 28, flexDirection: "row", justifyContent: "space-between", color: "#94a3b8", fontSize: 7 },
  hash: { fontFamily: "Courier", fontSize: 6, color: "#94a3b8", marginTop: 8 },
});

const LABELS = {
  no: { quote: "TILBUD", proforma: "PROFORMA", invoice: "FAKTURA", credit_note: "KREDITNOTA", seller: "Fra", customer: "Til", issue: "Fakturadato", due: "Forfallsdato", delivery: "Leveringsdato", reference: "Referanse", description: "Beskrivelse", quantity: "Antall", price: "Pris", tax: "Avgift", amount: "Beløp", subtotal: "Netto", discount: "Rabatt", taxTotal: "Avgift", total: "Å betale", payment: "Betaling", page: "Side" },
  en: { quote: "QUOTE", proforma: "PROFORMA", invoice: "INVOICE", credit_note: "CREDIT NOTE", seller: "From", customer: "Bill to", issue: "Issue date", due: "Due date", delivery: "Delivery date", reference: "Reference", description: "Description", quantity: "Qty", price: "Price", tax: "Tax", amount: "Amount", subtotal: "Net", discount: "Discount", taxTotal: "Tax", total: "Amount due", payment: "Payment", page: "Page" },
  es: { quote: "PRESUPUESTO", proforma: "PROFORMA", invoice: "FACTURA", credit_note: "FACTURA RECTIFICATIVA", seller: "Emisor", customer: "Cliente", issue: "Fecha", due: "Vencimiento", delivery: "Entrega", reference: "Referencia", description: "Descripción", quantity: "Cant.", price: "Precio", tax: "IVA", amount: "Importe", subtotal: "Base", discount: "Descuento", taxTotal: "IVA", total: "Total", payment: "Pago", page: "Página" },
} as const;

function value(record: JsonRecord, key: string, fallback = "—") {
  const item = record?.[key];
  return item === null || item === undefined || item === "" ? fallback : String(item);
}

function currency(amount: unknown, code: string, language: keyof typeof LABELS) {
  const numeric = Number(amount || 0);
  return new Intl.NumberFormat(language === "no" ? "nb-NO" : language === "es" ? "es-ES" : "en-GB", { style: "currency", currency: code }).format(numeric);
}

function address(record: JsonRecord, prefix = "") {
  const get = (key: string) => record?.[`${prefix}${key}`];
  return [get("address_line_1"), get("address_line_2"), [get("postal_code"), get("city")].filter(Boolean).join(" "), get("country_code")].filter(Boolean).join("\n");
}

export function BillingInvoicePdf({ snapshot, contentHash }: { snapshot: JsonRecord; contentHash?: string | null }) {
  const document = snapshot.document || {};
  const seller = snapshot.seller || {};
  const customer = snapshot.customer || {};
  const settings = snapshot.settings || {};
  const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
  const language = (["no", "en", "es"].includes(customer.language) ? customer.language : seller.default_language || "no") as keyof typeof LABELS;
  const labels = LABELS[language];
  const documentType = value(document, "document_type", "invoice") as keyof typeof labels;
  const legalTexts = Array.from(new Set(lines.map((line: JsonRecord) => line.legal_text).filter(Boolean))) as string[];
  const currencyCode = value(document, "currency", "EUR");
  const bank = [seller.iban && `IBAN ${seller.iban}`, seller.bic && `BIC ${seller.bic}`].filter(Boolean).join(" · ");

  return (
    <Document title={`${labels[documentType] || labels.invoice} ${value(document, "document_number", "UTKAST")}`} author={value(seller, "legal_name", "RealtyFlow Pro")}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{value(seller, "trading_name", value(seller, "legal_name", ""))}</Text>
            <Text style={styles.muted}>{value(seller, "legal_name", "")}</Text>
          </View>
          <View>
            <Text style={styles.title}>{labels[documentType] || labels.invoice}</Text>
            <Text style={styles.number}>{value(document, "document_number", "UTKAST")}</Text>
          </View>
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.eyebrow}>{labels.seller}</Text>
            <Text style={styles.strong}>{value(seller, "legal_name", "")}</Text>
            <Text style={styles.muted}>{address(seller)}</Text>
            <Text style={styles.muted}>{[seller.registration_number, seller.vat_number].filter(Boolean).join(" · ")}</Text>
            <Text style={styles.muted}>{[seller.email, seller.phone].filter(Boolean).join(" · ")}</Text>
          </View>
          <View style={styles.column}>
            <Text style={styles.eyebrow}>{labels.customer}</Text>
            <Text style={styles.strong}>{value(customer, "name", "")}</Text>
            <Text style={styles.muted}>{address(customer, "billing_")}</Text>
            <Text style={styles.muted}>{[customer.organization_number, customer.vat_number].filter(Boolean).join(" · ")}</Text>
            <Text style={styles.muted}>{[customer.email, customer.phone].filter(Boolean).join(" · ")}</Text>
          </View>
        </View>

        <View style={styles.metadata}>
          {[
            [labels.issue, value(document, "issue_date")],
            [documentType === "quote" ? "Gyldig til" : labels.due, value(document, documentType === "quote" ? "valid_until" : "due_date")],
            [labels.delivery, value(document, "delivery_date")],
            [labels.reference, value(document, "customer_reference", value(document, "project_reference"))],
          ].map(([label, item]) => (
            <View style={styles.metadataCell} key={label}>
              <Text style={styles.metadataLabel}>{label}</Text>
              <Text style={styles.metadataValue}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.description}>{labels.description}</Text><Text style={styles.quantity}>{labels.quantity}</Text>
          <Text style={styles.price}>{labels.price}</Text><Text style={styles.tax}>{labels.tax}</Text><Text style={styles.amount}>{labels.amount}</Text>
        </View>
        {lines.map((line: JsonRecord, index: number) => (
          <View style={styles.row} key={line.id || index} wrap={false}>
            <Text style={styles.description}>{value(line, "description", "")}</Text>
            <Text style={styles.quantity}>{value(line, "quantity", "0")} {value(line, "unit", "")}</Text>
            <Text style={styles.price}>{currency(line.unit_price, currencyCode, language)}</Text>
            <Text style={styles.tax}>{value(line, "tax_rate", "0")}%</Text>
            <Text style={styles.amount}>{currency(line.line_total, currencyCode, language)}</Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalRow}><Text>{labels.subtotal}</Text><Text>{currency(document.subtotal, currencyCode, language)}</Text></View>
          {Number(document.discount_total || 0) > 0 && <View style={styles.totalRow}><Text>{labels.discount}</Text><Text>-{currency(document.discount_total, currencyCode, language)}</Text></View>}
          <View style={styles.totalRow}><Text>{labels.taxTotal}</Text><Text>{currency(document.tax_total, currencyCode, language)}</Text></View>
          <View style={[styles.totalRow, styles.grandTotal]}><Text>{labels.total}</Text><Text>{currency(document.total, currencyCode, language)}</Text></View>
        </View>

        {(bank || document.payment_terms || document.notes || legalTexts.length > 0) && (
          <View style={styles.legal}>
            {bank && <Text>{labels.payment}: {bank}</Text>}
            {document.payment_terms && <Text>{document.payment_terms}</Text>}
            {legalTexts.map((text) => <Text key={text}>{text}</Text>)}
            {document.notes && <Text>{document.notes}</Text>}
            {settings.default_terms && <Text>{settings.default_terms}</Text>}
          </View>
        )}
        {contentHash && <Text style={styles.hash}>SHA-256 {contentHash}</Text>}
        <View style={styles.footer} fixed>
          <Text>{seller.invoice_footer || "RealtyFlow Pro · låst dokumentkopi"}</Text>
          <Text render={({ pageNumber, totalPages }) => `${labels.page} ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderBillingInvoicePdf(snapshot: JsonRecord, contentHash?: string | null) {
  return renderToBuffer(<BillingInvoicePdf snapshot={snapshot} contentHash={contentHash} />);
}
