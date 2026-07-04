import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { askClaude } from "@/services/ai/claude-client";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();
  const title = String(body.title || "Markedsrapport for norske boligkjøpere").trim();
  const area = String(body.area || "Costa Blanca og Costa Calida").trim();
  const sourceText = String(body.sourceText || "").trim();

  if (!sourceText) return NextResponse.json({ error: "sourceText is required" }, { status: 400 });

  const systemPrompt = `Du er RealtyFlow sin Market Intelligence-agent for Zen Eco Homes.
Skriv på profesjonell, trygg og kjøpervennlig norsk for norske boligkjøpere i Spania.
Gjør rådata fra Perplexity, Idealista eller andre kilder lett å forstå.
Ikke overdriv, ikke lov avkastning, og skill mellom fakta, tolkning og praktisk betydning.`;

  const prompt = `Lag en kjøpervennlig markedsrapport.

Tittel: ${title}
Område: ${area}
Målgruppe: norske kjøpere som vurderer nybygg i Spania

Rådata:
${sourceText}

Struktur:
1. Kort ingress
2. Hva dette betyr for norske kjøpere
3. Pris, tilbud/etterspørsel og timing hvis rådata støtter det
4. Risiko og forbehold
5. Praktiske råd før visning/kjøp
6. Spørsmål Freddy bør stille kunden

Svar som ren tekst med tydelige mellomtitler.`;

  const content = await askClaude(prompt, { systemPrompt, model: "sonnet", maxTokens: 2200, temperature: 0.35 });
  const summary = content.split("\n").find((line) => line.trim().length > 40)?.slice(0, 260) || title;

  const { data, error } = await supabase
    .from("market_reports")
    .insert({
      template_id: "buyer-market-intelligence",
      title,
      subtitle: `${area} · Kjøpervennlig AI-utkast`,
      summary,
      content_text: content.trim(),
      sections: [{ heading: title, content: content.trim() }],
      data_sources: ["Perplexity/Idealista rådata", "RealtyFlow AI"],
      recipients: "internal",
      generated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ report: data }, { status: 201 });
}
