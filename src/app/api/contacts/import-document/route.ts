import { NextRequest, NextResponse } from "next/server";
import { askClaude, askClaudeWithImage } from "@/services/ai/claude-client";

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
        "features": ["pool", "garden", "sea view", etc],
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
Be thorough with notes - include every piece of handwritten text.`;

/**
 * POST /api/contacts/import-document
 *
 * Accepts PDF or image files (including camera captures) and uses AI
 * to extract lead/contact information from them.
 *
 * Supports: image/jpeg, image/png, image/webp, image/heic, application/pdf
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
      // For PDFs: extract text and send to AI
      // Try to extract text content from PDF
      const textContent = extractTextFromPdfBuffer(buffer);

      if (textContent && textContent.trim().length > 50) {
        // PDF has readable text - use text-based analysis
        extractedText = await askClaude(
          `Here is text extracted from a PDF document:\n\n${textContent}\n\nExtract all contact/lead information from this content.`,
          {
            maxTokens: 2000,
            temperature: 0.2,
            systemPrompt: EXTRACTION_PROMPT,
          }
        );
      } else {
        // PDF might be scanned/image-based - convert first page to image
        // Send as image for OCR
        extractedText = await askClaudeWithImage(
          base64,
          "Extract all contact and lead information from this PDF document. Look for names, emails, phones, addresses, preferences, and any form fields or checkboxes.",
          { mimeType: "application/pdf", maxTokens: 2000 }
        );
      }
    } else if (mimeType.startsWith("image/")) {
      // For images (camera captures, scanned forms, etc.)
      const aiMimeType = mimeType === "image/heic" ? "image/jpeg" : mimeType;
      extractedText = await askClaudeWithImage(
        base64,
        "Extract all contact and lead information from this image. This may be a photograph of a handwritten interest form, business card, or printed document. Read ALL text carefully, including handwriting. Identify checkboxes and their states (checked/unchecked). Be thorough.",
        { mimeType: aiMimeType as string, maxTokens: 2000 }
      );
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}. Use PDF, JPEG, PNG, or WebP.` },
        { status: 400 }
      );
    }

    // Parse AI response
    let result;
    try {
      const clean = extractedText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      result = JSON.parse(clean);
    } catch {
      // If AI didn't return valid JSON, wrap the text response
      result = {
        leads: [],
        formType: "other",
        confidence: "low",
        rawText: extractedText,
        parseError: "AI response was not valid JSON - raw text included for manual review",
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Document Import] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
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

  // Extract text between BT (Begin Text) and ET (End Text) operators
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(content)) !== null) {
    const block = match[1];
    // Extract text from Tj and TJ operators
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
    // TJ arrays
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
