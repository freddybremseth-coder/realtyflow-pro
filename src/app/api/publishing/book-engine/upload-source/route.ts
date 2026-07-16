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
      const parsed = await mammoth.extractRawText({ buffer });
      text = String(parsed.value || "");
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

    return NextResponse.json({
      success: true,
      file_name: file.name,
      char_count: text.length,
      preview: text.slice(0, 700),
      content: text.slice(0, 120000),
      truncated: text.length > 120000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke lese filen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
