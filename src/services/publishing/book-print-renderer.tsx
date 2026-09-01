import React from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { getDocumentProxy } from "unpdf";
import { DEFAULT_KDP_PRINT_PROFILE, inchesToPoints, kdpFullCoverDimensionsIn } from "@/lib/publishing/book-print-production";

type JsonRecord = Record<string, any>;

type CoverImage = {
  buffer: Buffer;
  type: "jpg" | "png";
};

function clean(value: unknown) { return String(value || "").trim(); }

function manuscriptText(raw: unknown) {
  const text = clean(raw);
  if (!text) return "";
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i)?.[1];
  const candidate = fenced || text;
  if (candidate.startsWith("{") && candidate.endsWith("}")) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed?.draft === "string") return parsed.draft.trim();
    } catch { /* preserve source text */ }
  }
  return text.replace(/```json[\s\S]*?```/gi, "").replace(/```[\s\S]*?```/g, "").trim();
}

function paragraphs(raw: unknown) {
  return manuscriptText(raw).split(/\n{2,}/).map((row) => row.trim()).filter(Boolean);
}

const interiorStyles = StyleSheet.create({
  page: {
    paddingTop: 54,
    paddingBottom: 54,
    paddingLeft: 50,
    paddingRight: 50,
    fontFamily: "Times-Roman",
    fontSize: 10.5,
    lineHeight: 1.45,
    color: "#111111",
  },
  titlePage: { padding: 62, justifyContent: "center", alignItems: "center", textAlign: "center" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 25, marginBottom: 14 },
  subtitle: { fontFamily: "Helvetica", fontSize: 13, lineHeight: 1.35, marginBottom: 24 },
  author: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  copyright: { padding: 62, justifyContent: "center", fontFamily: "Times-Roman", fontSize: 9.5, lineHeight: 1.5 },
  chapter: { marginBottom: 14 },
  chapterTitle: { fontFamily: "Helvetica-Bold", fontSize: 17, lineHeight: 1.2, marginBottom: 18 },
  paragraph: { marginBottom: 9, textAlign: "justify", orphans: 2, widows: 2 },
  footer: { position: "absolute", bottom: 28, left: 0, right: 0, textAlign: "center", fontSize: 8, color: "#666666" },
  blank: { flex: 1 },
});

function InteriorDocument({ project, addBlankPage = false }: { project: JsonRecord; addBlankPage?: boolean }) {
  const chapters = Array.isArray(project.chapter_drafts) ? project.chapter_drafts : [];
  const metadata = project.metadata_plan && typeof project.metadata_plan === "object" ? project.metadata_plan : {};
  const author = clean(metadata.author) || "Freddy Bremseth";
  const year = new Date().getUTCFullYear();
  return <Document title={clean(project.title)} author={author} subject="Book OS print interior">
    <Page size={[432, 648]} style={interiorStyles.titlePage}>
      <Text style={interiorStyles.title}>{clean(project.title) || "Untitled"}</Text>
      {clean(project.subtitle) ? <Text style={interiorStyles.subtitle}>{clean(project.subtitle)}</Text> : null}
      <Text style={interiorStyles.author}>{author}</Text>
    </Page>
    <Page size={[432, 648]} style={interiorStyles.copyright}>
      <Text>Copyright © {year} {author}. All rights reserved.</Text>
      <Text style={{ marginTop: 12 }}>This book is provided for informational and educational purposes. It does not constitute individualized legal, tax, investment or financial advice.</Text>
    </Page>
    <Page size={[432, 648]} wrap style={interiorStyles.page}>
      {chapters.map((chapter: JsonRecord, index: number) => <View key={`${index}-${clean(chapter.chapter_title)}`} break={index > 0} style={interiorStyles.chapter}>
        <Text style={interiorStyles.chapterTitle}>{clean(chapter.chapter_title) || `Chapter ${index + 1}`}</Text>
        {paragraphs(chapter.draft).map((paragraph, paragraphIndex) => <Text key={paragraphIndex} style={interiorStyles.paragraph}>{paragraph}</Text>)}
      </View>)}
      <Text fixed style={interiorStyles.footer} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </Page>
    {addBlankPage ? <Page size={[432, 648]}><View style={interiorStyles.blank} /></Page> : null}
  </Document>;
}

async function pdfPageCount(bytes: Buffer) {
  const proxy = await getDocumentProxy(new Uint8Array(bytes));
  try { return proxy.numPages; }
  finally { await proxy.destroy?.(); }
}

export async function renderBookPrintInterior(project: JsonRecord) {
  let buffer = Buffer.from(await renderToBuffer(<InteriorDocument project={project} />));
  let pageCount = await pdfPageCount(buffer);
  if (pageCount % 2 !== 0) {
    buffer = Buffer.from(await renderToBuffer(<InteriorDocument project={project} addBlankPage />));
    pageCount = await pdfPageCount(buffer);
  }
  return {
    buffer,
    pageCount,
    widthPt: 432,
    heightPt: 648,
    trim: "6x9",
  };
}

const wrapStyles = StyleSheet.create({
  page: { position: "relative", backgroundColor: "#0a0d12", color: "#ffffff", fontFamily: "Helvetica" },
  back: { position: "absolute", top: 36, bottom: 36, left: 36, paddingRight: 26, justifyContent: "center" },
  backTitle: { fontFamily: "Helvetica-Bold", fontSize: 17, marginBottom: 14 },
  backText: { fontSize: 9.4, lineHeight: 1.45, marginBottom: 14 },
  author: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  spine: { position: "absolute", top: 18, bottom: 18, justifyContent: "center", alignItems: "center" },
  spineText: { fontFamily: "Helvetica-Bold", fontSize: 8.5, transform: "rotate(90deg)" },
  front: { position: "absolute", top: 9, bottom: 9, overflow: "hidden" },
  frontImage: { width: "100%", height: "100%", objectFit: "cover" },
  barcode: { position: "absolute", left: 42, bottom: 42, width: 108, height: 64, backgroundColor: "#ffffff", border: "1 solid #bbbbbb", alignItems: "center", justifyContent: "center" },
  barcodeText: { color: "#777777", fontSize: 7 },
});

function description(project: JsonRecord) {
  const metadata = project.metadata_plan && typeof project.metadata_plan === "object" ? project.metadata_plan : {};
  const kdp = metadata.kdp && typeof metadata.kdp === "object" ? metadata.kdp : metadata;
  return clean(kdp.description) || clean(kdp.description_html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") || clean(project.subtitle);
}

export async function renderKdpFullWrap(project: JsonRecord, pageCount: number, cover: CoverImage) {
  const profile = DEFAULT_KDP_PRINT_PROFILE;
  const dims = kdpFullCoverDimensionsIn(pageCount, profile);
  const pageWidthPt = inchesToPoints(dims.widthIn);
  const pageHeightPt = inchesToPoints(dims.heightIn);
  const bleedPt = inchesToPoints(profile.bleedIn);
  const trimWidthPt = inchesToPoints(profile.trimWidthIn);
  const spinePt = inchesToPoints(dims.spineWidthIn);
  const backLeft = bleedPt;
  const spineLeft = backLeft + trimWidthPt;
  const frontLeft = spineLeft + spinePt;
  const metadata = project.metadata_plan && typeof project.metadata_plan === "object" ? project.metadata_plan : {};
  const author = clean(metadata.author) || "Freddy Bremseth";
  const body = description(project).slice(0, 1700);
  const imageSource = { data: cover.buffer, format: cover.type } as any;

  const styles = {
    back: { ...wrapStyles.back, width: trimWidthPt - 72 },
    spine: { ...wrapStyles.spine, left: spineLeft, width: spinePt },
    front: { ...wrapStyles.front, left: frontLeft, width: trimWidthPt, top: bleedPt, bottom: bleedPt },
  } as const;

  const doc = <Document title={`${clean(project.title)} — KDP Full Cover`} author={author}>
    <Page size={[pageWidthPt, pageHeightPt]} style={wrapStyles.page}>
      <View style={styles.back}>
        <Text style={wrapStyles.backTitle}>{clean(project.title)}</Text>
        <Text style={wrapStyles.backText}>{body}</Text>
        <Text style={wrapStyles.author}>{author}</Text>
      </View>
      <View style={styles.spine}>
        <Text style={wrapStyles.spineText}>{clean(project.title)} · {author}</Text>
      </View>
      <View style={styles.front}>
        <Image src={imageSource} style={wrapStyles.frontImage} />
      </View>
      <View style={wrapStyles.barcode}><Text style={wrapStyles.barcodeText}>BARCODE AREA</Text></View>
    </Page>
  </Document>;
  const buffer = Buffer.from(await renderToBuffer(doc));
  return { buffer, ...dims, widthPt: pageWidthPt, heightPt: pageHeightPt };
}
