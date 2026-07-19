import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import mammoth from "mammoth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

function extOf(name: string) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".md")) return "md";
  if (lower.endsWith(".txt")) return "txt";
  return "";
}

/**
 * Word-overskrifter til markdown. mammoth.extractRawText kaster bort all
 * struktur, så et 33-kapitlers manus kommer ut som én tekstvegg og
 * kapittelsplittingen finner ingenting. Ved å gå via HTML beholder vi
 * Overskrift 1-3 som #/##/### — da finner kapittelsplittingen alle kapitlene.
 */
function htmlToMarkdownish(html: string): string {
  return String(html || "")
    .replace(/<h1[^>]*>(.*?)<\/h1>/gis, "\n\n# $1\n\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gis, "\n\n## $1\n\n")
    .replace(/<h[3-6][^>]*>(.*?)<\/h[3-6]>/gis, "\n\n### $1\n\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gis, "\n- $1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  // Én side per element; blank linje mellom sidene bevarer avsnittsfølelsen.
  return (Array.isArray(text) ? text : [String(text || "")]).join("\n\n");
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Ugyldig opplasting." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fil mangler." }, { status: 400 });

  const ext = extOf(file.name);
  if (!ext) {
    return NextResponse.json({ error: "Støttede filer: .pdf, .docx, .txt, .md" }, { status: 400 });
  }

  try {
    let text = "";
    if (ext === "docx") {
      const buffer = Buffer.from(await file.arrayBuffer());
      // Først via HTML, så overskriftene (og dermed kapittelinndelingen)
      // overlever. Faller tilbake til ren tekst hvis konverteringen svikter.
      try {
        const html = await mammoth.convertToHtml({ buffer });
        text = htmlToMarkdownish(String(html.value || ""));
      } catch {
        text = "";
      }
      if (!text) {
        const parsed = await mammoth.extractRawText({ buffer });
        text = String(parsed.value || "");
      }
    } else if (ext === "pdf") {
      const buffer = Buffer.from(await file.arrayBuffer());
      text = await extractPdfText(buffer);
    } else {
      text = await file.text();
    }

    text = text.replace(/\u0000/g, "").trim();
    if (!text) {
      return NextResponse.json(
        {
          error:
            ext === "pdf"
              ? "Fant ingen lesbar tekst i PDF-en. Er den skannet (kun bilder)? Prøv en tekst-PDF, .docx eller lim inn teksten."
              : "Filen inneholder ingen lesbar tekst.",
        },
        { status: 400 },
      );
    }

    // Taket lå på 120k tegn — det kuttet et manus på ~10 kapitler midt i, så
    // en hel bok aldri kom inn. 1,5 mill. tegn dekker selv svært lange bøker
    // (~250 000 ord) og holder seg godt innenfor grensen for request-body.
    const MAX_CHARS = 1_500_000;
    return NextResponse.json({
      success: true,
      file_name: file.name,
      char_count: text.length,
      preview: text.slice(0, 700),
      content: text.slice(0, MAX_CHARS),
      truncated: text.length > MAX_CHARS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke lese filen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
