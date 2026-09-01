import JSZip from "jszip";

function clean(value: unknown) {
  return String(value || "").trim();
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function extractJsonStringField(raw: string, field: string): string {
  const key = `"${field}"`;
  const keyIndex = raw.indexOf(key);
  if (keyIndex < 0) return "";
  const colonIndex = raw.indexOf(":", keyIndex + key.length);
  if (colonIndex < 0) return "";
  const firstQuote = raw.indexOf("\"", colonIndex + 1);
  if (firstQuote < 0) return "";

  let i = firstQuote + 1;
  let encoded = "";
  let escaped = false;
  while (i < raw.length) {
    const ch = raw[i];
    if (escaped) {
      encoded += `\\${ch}`;
      escaped = false;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      i += 1;
      continue;
    }
    if (ch === "\"") break;
    encoded += ch;
    i += 1;
  }

  try {
    return JSON.parse(`"${encoded}"`);
  } catch {
    return encoded
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }
}

function sanitizeDraftText(raw: unknown): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const parsed = safeJsonParse<Record<string, unknown>>(fenced[1], {});
    const draft = String(parsed.draft || "").trim();
    if (draft) return draft;
  }
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    const parsed = safeJsonParse<Record<string, unknown>>(text, {});
    const draft = String(parsed.draft || "").trim();
    if (draft) return draft;
  }
  const looseDraft = extractJsonStringField(text, "draft").trim();
  if (looseDraft) return looseDraft;
  return text
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function xmlEscape(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function projectParts(project: Record<string, any>) {
  const title = clean(project.title) || "Untitled";
  const subtitle = clean(project.subtitle);
  const outline = (project.outline_plan || {}) as Record<string, any>;
  const chapterDrafts = asArray<Record<string, any>>(project.chapter_drafts);
  const toc = asArray<Record<string, any>>(outline.toc);
  const metadata = (project.metadata_plan || {}) as Record<string, any>;
  const imagePlan = metadata.image_plan || {};
  const coverUrl = clean(imagePlan?.cover?.image_url) || clean(metadata.cover_image_url);
  const author = clean(metadata.author) || "Freddy Bremseth";
  const kdp = metadata.kdp && typeof metadata.kdp === "object" ? metadata.kdp : metadata;
  const description = clean(kdp.description_html) || clean(kdp.description);
  return { title, subtitle, chapterDrafts, toc, coverUrl, author, description };
}

type LoadedImage = { buffer: Buffer; type: "jpg" | "png" | "gif" | "bmp" };

async function fetchImageBuffer(url: string): Promise<LoadedImage | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const type: LoadedImage["type"] = contentType.includes("jpeg") || contentType.includes("jpg")
      ? "jpg"
      : contentType.includes("gif")
        ? "gif"
        : contentType.includes("bmp")
          ? "bmp"
          : "png";
    return { buffer: Buffer.from(await res.arrayBuffer()), type };
  } catch {
    return null;
  }
}

/** Build the canonical EPUB used by downloads and every distribution connector. */
export async function toEpubBuffer(project: Record<string, any>) {
  const { title, subtitle, chapterDrafts, toc, coverUrl, author, description } = projectParts(project);
  const language = clean(project.language) || "en";
  const sourceModifiedAt = new Date(clean(project.updated_at) || clean(project.created_at) || "2000-01-01T00:00:00Z");
  const modifiedIso = Number.isNaN(sourceModifiedAt.getTime())
    ? "2000-01-01T00:00:00Z"
    : sourceModifiedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.folder("META-INF")?.file("container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);

  const oebps = zip.folder("OEBPS");
  const images = oebps?.folder("images");
  const text = oebps?.folder("text");
  const chapters = chapterDrafts.length > 0
    ? chapterDrafts.map((chapter, index) => ({
        title: clean(chapter.chapter_title) || `Chapter ${index + 1}`,
        body: sanitizeDraftText(chapter.draft),
      }))
    : toc.map((row, index) => ({
        title: clean(row.title) || `Chapter ${index + 1}`,
        body: clean(row.goal),
      }));

  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const navItems: string[] = [];
  const imageManifest: string[] = [];
  let coverPageHref = "";

  if (coverUrl && images) {
    const loaded = await fetchImageBuffer(coverUrl);
    if (loaded) {
      const coverName = `cover.${loaded.type}`;
      const coverHref = `images/${coverName}`;
      images.file(coverName, loaded.buffer);
      imageManifest.push(`<item id="cover-image" href="${coverHref}" media-type="${loaded.type === "jpg" ? "image/jpeg" : `image/${loaded.type}`}" properties="cover-image"/>`);
      text?.file("cover.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${xmlEscape(language)}">
<head><meta charset="UTF-8"/><title>${xmlEscape(title)}</title><style>body{margin:0;padding:0;text-align:center}img{max-width:100%;height:auto}</style></head>
<body epub:type="cover"><img src="${coverHref}" alt="Cover for ${xmlEscape(title)}"/></body></html>`);
      coverPageHref = "text/cover.xhtml";
    }
  }

  chapters.forEach((chapter, index) => {
    const id = `chap${index + 1}`;
    const file = `${id}.xhtml`;
    const chapterTitle = xmlEscape(chapter.title);
    const paragraphs = String(chapter.body || "")
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${xmlEscape(paragraph)}</p>`)
      .join("\n");
    text?.file(file, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="${xmlEscape(language)}">
<head><meta charset="UTF-8"/><title>${chapterTitle}</title></head>
<body><h1>${chapterTitle}</h1>${paragraphs || "<p></p>"}</body></html>`);
    manifestItems.push(`<item id="${id}" href="text/${file}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${id}"/>`);
    navItems.push(`<li><a href="text/${file}">${chapterTitle}</a></li>`);
  });

  oebps?.file("nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${xmlEscape(language)}">
<head><meta charset="UTF-8"/><title>Table of Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navItems.join("\n")}</ol></nav>
<nav epub:type="landmarks" hidden="hidden"><h2>Landmarks</h2><ol><li><a epub:type="bodymatter" href="text/chap1.xhtml">Start of content</a></li></ol></nav></body></html>`);

  const descriptionText = (description || subtitle || title).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const hasCover = Boolean(coverPageHref);
  oebps?.file("content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0" prefix="schema: http://schema.org/">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${xmlEscape(slug(title) || `book-${Date.now()}`)}</dc:identifier>
    <dc:title>${xmlEscape(title)}</dc:title><dc:creator>${xmlEscape(author)}</dc:creator>
    <dc:language>${xmlEscape(language)}</dc:language><dc:description>${xmlEscape(descriptionText.slice(0, 4000))}</dc:description>
    <meta property="schema:accessMode">textual</meta>
    <meta property="schema:accessibilityFeature">tableOfContents</meta>
    <meta property="schema:accessibilityFeature">structuralNavigation</meta>
    <meta property="schema:accessibilityFeature">readingOrder</meta>
    <meta property="schema:accessibilityHazard">none</meta>
    <meta property="schema:accessibilitySummary">This publication uses headings, a structured reading order, navigation and alternative text for the cover.</meta>
    ${hasCover ? '<meta name="cover" content="cover-image"/>' : ""}
    <meta property="dcterms:modified">${modifiedIso}</meta>
  </metadata>
  <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${hasCover ? `<item id="coverpage" href="${coverPageHref}" media-type="application/xhtml+xml"/>` : ""}
    ${imageManifest.join("\n")}${manifestItems.join("\n")}
  </manifest>
  <spine>${hasCover ? '<itemref idref="coverpage" linear="yes"/>' : ""}${spineItems.join("\n")}</spine>
</package>`);

  return zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" });
}
