import { NextRequest, NextResponse } from "next/server";
import { askClaude, askClaudeWithImage } from "@/services/ai/claude-client";

/** Extract JSON from AI response that may contain markdown, preamble text, etc. */
function extractJSON(text: string): Record<string, unknown> {
  try { return JSON.parse(text.trim()); } catch { /* continue */ }
  const stripped = text.replace(/```(?:json)?\s*\n?/g, "").trim();
  try { return JSON.parse(stripped); } catch { /* continue */ }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch { /* continue */ }
  }
  throw new Error("Could not extract JSON from AI response");
}

const EXTRACTION_PROMPT = `You are an expert at extracting contact/lead information from documents and forms. Analyze this content and extract all leads/contacts you can find.

For handwritten or printed interest forms, pay attention to:
- Checkboxes (☑ or ☐ or filled squares = checked, empty = unchecked)
- Handwritten text in fields
- Any preferences, interests, or selections marked by the person

Return ONLY valid JSON with this structure:
{
  "leads": [
    {
      "name": "Full name",
      "email": "email@example.com or empty string",
      "phone": "phone number or empty string",
      "type": "buyer"|"seller"|"investor"|"tenant"|"other",
      "budget": 0,
      "source": "Form/Document Import",
      "property_interest": "what property/type they're interested in",
      "preferences": {
        "property_type": "villa|apartment|land|commercial|other",
        "bedrooms": null,
        "location": "",
        "features": ["pool", "garden", "sea view"],
        "other": []
      },
      "notes": "Any additional handwritten notes, comments, or context from the form. Include ALL text that doesn't fit in other fields.",
      "sentiment": "hot"|"warm"|"neutral"|"cold"
    }
  ],
  "formType": "interest_form"|"business_card"|"contact_list"|"survey"|"other",
  "confidence": "high"|"medium"|"low",
  "rawText": "Full extracted text from the document for reference"
}

Extract ALL leads from the document. If there are multiple people, create one entry per person.
For budget, try to parse any monetary amounts. Set to 0 if not found.
For sentiment, infer from the form: many checkboxes filled = hot, few = warm, minimal info = neutral.
Be thorough with notes - include every piece of handwritten text.
IMPORTANT: If you can identify a person from name, email or phone, create a lead entry even if some other fields are missing.`;

function hasLeads(result: Record<string, unknown>) {
  return Array.isArray(result.leads) && result.leads.length > 0;
}

async function repairExtraction(raw: string): Promise<Record<string, unknown> | null> {
  const source = raw.trim();
  if (!source) return null;

  try {
    const repaired = await askClaude(
      `The previous vision/OCR pass read the following content from a real-estate lead form, but it may not have returned valid structured JSON. Re-extract the lead data from this content and return the required JSON only.\n\nSOURCE CONTENT:\n${source}`,
      {
        maxTokens: 2500,
        temperature: 0.1,
        systemPrompt: EXTRACTION_PROMPT,
        responseMimeType: "application/json",
        validateResponse: (text) => {
          try { return hasLeads(extractJSON(text)); } catch { return false; }
        },
        fallbackOnInvalidResponse: true,
      },
    );
    return extractJSON(repaired);
  } catch (error) {
    console.warn("[Document Import] Structured repair failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * POST /api/contacts/import-document
 *
 * Accepts PDF or image files (including camera captures) and uses AI
 * to extract lead/contact information from them.
 *
 * Supports: image/jpeg, image/png, image/webp, application/pdf
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const mimeType = file.type;
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    let extractedText: string;

    if (mimeType === "application/pdf") {
      const textContent = extractTextFromPdfBuffer(buffer);

      if (textContent && textContent.trim().length > 50) {
        extractedText = await askClaude(
          `Here is text extracted from a PDF document:\n\n${textContent}\n\nExtract all contact/lead information from this content.`,
          {
            maxTokens: 2500,
            temperature: 0.1,
            systemPrompt: EXTRACTION_PROMPT,
            responseMimeType: "application/json",
          },
        );
      } else {
        extractedText = await askClaudeWithImage(
          base64,
          `${EXTRACTION_PROMPT}\n\nAnalyze the attached scanned PDF carefully. Read all visible printed and handwritten text, including names, email addresses, phone numbers, budget, locations, notes and checkbox states. Return ONLY the JSON structure described above.`,
          { mimeType: "application/pdf", maxTokens: 2500 },
        );
      }
    } else if (mimeType.startsWith("image/")) {
      const aiMimeType = mimeType === "image/heic" ? "image/jpeg" : mimeType;
      extractedText = await askClaudeWithImage(
        base64,
        `${EXTRACTION_PROMPT}\n\nAnalyze the attached photograph carefully. It may be a handwritten real-estate interest form. Read ALL visible text, including handwriting. Pay particular attention to the person's name, email, phone number, budget and desired area/location. Identify checkbox states. Return ONLY the JSON structure described above.`,
        { mimeType: aiMimeType as string, maxTokens: 2500 },
      );
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}. Use PDF, JPEG, PNG, or WebP.` },
        { status: 400 },
      );
    }

    let result: Record<string, unknown>;
    let initialParseError = false;
    try {
      result = extractJSON(extractedText);
    } catch {
      initialParseError = true;
      result = {
        leads: [],
        formType: "other",
        confidence: "low",
        rawText: extractedText,
      };
    }

    if (!hasLeads(result)) {
      const rawText = typeof result.rawText === "string" && result.rawText.trim()
        ? result.rawText
        : extractedText;
      const repaired = await repairExtraction(rawText);
      if (repaired && hasLeads(repaired)) {
        result = {
          ...repaired,
          recovered: true,
          initialParseError,
        };
      } else {
        result = {
          ...result,
          parseError: initialParseError
            ? "Vision response was not valid JSON and structured recovery found no lead"
            : "Vision response contained no lead and structured recovery found no lead",
        };
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Document Import] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * Basic text extraction from PDF buffer.
 * Looks for text streams in the PDF structure.
 */
function extractTextFromPdfBuffer(buffer: Buffer): string {
  const content = buffer.toString("latin1");
  const textChunks: string[] = [];

  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(content)) !== null) {
    const block = match[1];
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tj;
    while ((tj = tjRegex.exec(block)) !== null) {
      const decoded = tj[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
      if (decoded.trim()) textChunks.push(decoded);
    }
    const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
    let tja;
    while ((tja = tjArrayRegex.exec(block)) !== null) {
      const parts = tja[1].match(/\(([^)]*)\)/g);
      if (parts) {
        const text = parts.map((p) => p.slice(1, -1)).join("");
        if (text.trim()) textChunks.push(text);
      }
    }
  }

  return textChunks.join(" ").replace(/\s+/g, " ").trim();
}
