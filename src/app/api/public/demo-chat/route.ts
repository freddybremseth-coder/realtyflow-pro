import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { askClaude } from "@/services/ai/claude-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * POST /api/public/demo-chat — the REAL AI receptionist on trial/live sites.
 * Body: { token, messages: [{ role: "user"|"assistant", content }] }
 *
 * This is the Standard package's main selling point demonstrated live:
 * the bot answers from the company's own (crawled + edited) content and
 * nudges visitors toward the contact form. Token-gated per demo order.
 */

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 600;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function textOf(value: unknown) {
  return String(value ?? "").trim();
}

function listOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => textOf(v)).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  return [];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const token = textOf(body.token).slice(0, 80);
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];

    if (!token) return NextResponse.json({ error: "Ugyldig side." }, { status: 400 });

    const messages = rawMessages
      .slice(-MAX_MESSAGES)
      .map((m) => {
        const item = m as Record<string, unknown>;
        const role = item.role === "assistant" ? "assistant" : "user";
        const content = textOf(item.content).slice(0, MAX_MESSAGE_LENGTH);
        return content ? { role, content } : null;
      })
      .filter((m): m is { role: "user" | "assistant"; content: string } => Boolean(m));

    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return NextResponse.json({ error: "Skriv et spørsmål først." }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "Tjenesten er ikke tilgjengelig." }, { status: 503 });

    const { data: order } = await supabase
      .from("demo_site_orders")
      .select("id, company_name, customer_phone, customer_email, industry, editable_fields, extracted_profile")
      .eq("claim_token", token)
      .maybeSingle();

    if (!order) return NextResponse.json({ error: "Fant ikke siden." }, { status: 404 });

    const fields = (order.editable_fields || {}) as Record<string, unknown>;
    const profile = (order.extracted_profile || {}) as Record<string, unknown>;
    const contact = (fields.contact_info || {}) as Record<string, unknown>;

    const knowledge = [
      `Bedrift: ${order.company_name}`,
      order.industry ? `Bransje: ${order.industry}` : "",
      textOf(fields.hero_title) ? `Hovedbudskap: ${textOf(fields.hero_title)} — ${textOf(fields.hero_subtitle)}` : "",
      textOf(fields.intro_text) ? `Om oss: ${textOf(fields.intro_text)}` : "",
      listOf(fields.services).length ? `Tjenester: ${listOf(fields.services).join(", ")}` : "",
      listOf(fields.products).length ? `Produkter/pakker: ${listOf(fields.products).join(", ")}` : "",
      listOf(fields.prices).length ? `Priser: ${listOf(fields.prices).join(", ")}` : "",
      listOf(fields.trust_points).length ? `Styrker: ${listOf(fields.trust_points).join(", ")}` : "",
      Array.isArray(fields.faq)
        ? `FAQ: ${(fields.faq as Array<Record<string, unknown>>)
            .map((item) => `${textOf(item.question)} → ${textOf(item.answer)}`)
            .filter((line) => line.length > 4)
            .join(" | ")}`
        : "",
      Array.isArray(profile.summary) || textOf(profile.summary) ? `Sammendrag: ${textOf(profile.summary)}` : "",
      `Kontakt: ${[textOf(contact.phone) || textOf(order.customer_phone), textOf(contact.email) || textOf(order.customer_email), textOf(contact.address)].filter(Boolean).join(" · ")}`,
    ]
      .filter(Boolean)
      .join("\n");

    const systemPrompt = `Du er AI-resepsjonisten til ${order.company_name} og svarer besøkende på nettsiden deres.

KUNNSKAP OM BEDRIFTEN (alt du vet — ikke finn på noe utover dette):
${knowledge}

Regler:
- Svar på norsk, kort og hjelpsomt (maks 3-4 setninger), varm og profesjonell tone
- Vet du ikke svaret: si det ærlig og henvis til kontaktskjemaet på siden eller telefon
- Avslutt gjerne med å tilby neste steg (kontaktskjema, ringe, be om tilbud)
- Aldri oppgi priser eller løfter som ikke står i kunnskapen over`;

    const conversation = messages
      .map((m) => `${m.role === "user" ? "Besøkende" : "Deg"}: ${m.content}`)
      .join("\n");

    const reply = await askClaude(`${conversation}\n\nDeg:`, {
      systemPrompt,
      maxTokens: 400,
      temperature: 0.6,
    });

    return NextResponse.json({ reply: reply.trim() });
  } catch (error) {
    console.error("[Demo Chat] Error:", error);
    return NextResponse.json({ error: "Beklager, jeg fikk ikke svart nå. Prøv kontaktskjemaet!" }, { status: 500 });
  }
}
