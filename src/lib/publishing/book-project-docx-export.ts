import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from "docx";

function clean(value: unknown) { return String(value || "").trim(); }
function asArray<T = any>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
function safeJsonParse<T>(value: string, fallback: T): T { try { return JSON.parse(value) as T; } catch { return fallback; } }

function extractJsonStringField(raw: string, field: string): string {
  const key = `"${field}"`;
  const keyIndex = raw.indexOf(key);
  if (keyIndex < 0) return "";
  const colonIndex = raw.indexOf(":", keyIndex + key.length);
  const firstQuote = colonIndex < 0 ? -1 : raw.indexOf("\"", colonIndex + 1);
  if (firstQuote < 0) return "";
  let i = firstQuote + 1, encoded = "", escaped = false;
  while (i < raw.length) {
    const ch = raw[i];
    if (escaped) { encoded += `\\${ch}`; escaped = false; i += 1; continue; }
    if (ch === "\\") { escaped = true; i += 1; continue; }
    if (ch === "\"") break;
    encoded += ch; i += 1;
  }
  try { return JSON.parse(`"${encoded}"`); } catch { return encoded.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, "\"").replace(/\\\\/g, "\\"); }
}

function sanitizeDraftText(raw: unknown): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) { const parsed = safeJsonParse<Record<string, unknown>>(fenced[1], {}); const draft = clean(parsed.draft); if (draft) return draft; }
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    const parsed = safeJsonParse<Record<string, unknown>>(text, {}); const draft = clean(parsed.draft); if (draft) return draft;
  }
  const loose = extractJsonStringField(text, "draft").trim();
  return loose || text.replace(/```json[\s\S]*?```/gi, "").replace(/```[\s\S]*?```/g, "").trim();
}

type LoadedImage = { buffer: Buffer; type: "jpg" | "png" | "gif" | "bmp" };
export async function fetchBookImage(url: string): Promise<LoadedImage | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const type: LoadedImage["type"] = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : contentType.includes("gif") ? "gif" : contentType.includes("bmp") ? "bmp" : "png";
    return { buffer: Buffer.from(await res.arrayBuffer()), type };
  } catch { return null; }
}

export function bookProjectCoverUrl(project: Record<string, any>) {
  const metadata = project.metadata_plan && typeof project.metadata_plan === "object" ? project.metadata_plan : {};
  return clean(metadata?.image_plan?.cover?.image_url) || clean(metadata?.cover_image_url);
}

export async function toBookProjectDocxBuffer(project: Record<string, any>) {
  const title = clean(project.title) || "Untitled";
  const subtitle = clean(project.subtitle);
  const chapters = asArray<Record<string, any>>(project.chapter_drafts);
  const metadata = project.metadata_plan && typeof project.metadata_plan === "object" ? project.metadata_plan : {};
  const chapterImages = asArray<Record<string, any>>(metadata?.image_plan?.chapters);
  const chapterImageMap = new Map<string, string>();
  for (const row of chapterImages) {
    const key = clean(row.chapter_title).toLowerCase(); const url = clean(row.image_url); if (key && url) chapterImageMap.set(key, url);
  }
  const children: Paragraph[] = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] })];
  if (subtitle) children.push(new Paragraph({ children: [new TextRun({ text: subtitle, italics: true })] }));
  children.push(new Paragraph({ text: "" }));

  const coverUrl = bookProjectCoverUrl(project);
  if (coverUrl) {
    const cover = await fetchBookImage(coverUrl);
    if (cover) children.push(new Paragraph({ children: [new ImageRun({ type: cover.type, data: cover.buffer, transformation: { width: 520, height: 300 } })] }), new Paragraph({ text: "" }));
  }
  for (let index = 0; index < chapters.length; index += 1) {
    const chapter = chapters[index];
    const chapterTitle = clean(chapter.chapter_title) || `Chapter ${index + 1}`;
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(chapterTitle)] }));
    const imageUrl = chapterImageMap.get(chapterTitle.toLowerCase());
    if (imageUrl) {
      const image = await fetchBookImage(imageUrl);
      if (image) children.push(new Paragraph({ children: [new ImageRun({ type: image.type, data: image.buffer, transformation: { width: 460, height: 270 } })] }), new Paragraph({ text: "" }));
    }
    for (const paragraph of sanitizeDraftText(chapter.draft).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
      children.push(new Paragraph({ children: [new TextRun(paragraph)] }));
    }
    children.push(new Paragraph({ text: "" }));
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}
