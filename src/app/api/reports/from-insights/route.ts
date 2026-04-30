import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { askClaude } from "@/services/ai/claude-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function stripCodeFence(value: string) {
  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function asParagraphs(value: string) {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const insightIds = Array.isArray(body.insightIds)
    ? body.insightIds.map((id: string) => String(id)).filter(Boolean)
    : [];
  const title = String(body.title || "Markedsrapport for norske boligkjøpere").trim();
  const area = String(body.area || "Costa Blanca og Costa Calida").trim();
  const outputType = ["report", "presentation", "both"].includes(body.outputType) ? body.outputType : "both";

  if (insightIds.length === 0) {
    return NextResponse.json({ error: "insightIds is required" }, { status: 400 });
  }

  const { data: insights, error: insightError } = await supabase
    .from("market_insights")
    .select("id, topic, summary, details, sources, created_at")
    .in("id", insightIds);

  if (insightError) return NextResponse.json({ error: insightError.message }, { status: 500 });
  if (!insights?.length) return NextResponse.json({ error: "No insights found" }, { status: 404 });

  const sourceText = insights
    .map((insight, index) => `KILDE ${index + 1}: ${insight.topic}
Dato: ${insight.created_at || "ukjent"}
Sammendrag: ${insight.summary || ""}
Detaljer:
${insight.details || ""}`)
    .join("\n\n---\n\n");

  const systemPrompt = `Du er RealtyFlow sin senior Market Intelligence-agent for Zen Eco Homes.
Du skriver for norske kjøpere som vurderer nybygg, tomter eller investering i Spania.
Bruk kun råmaterialet du får, og skill tydelig mellom fakta, tolkning og praktisk betydning.
Ikke lov avkastning. Ikke overdriv. Ikke finn på tall. Hvis tall mangler, skriv hva Freddy bør hente inn.`;

  const prompt = `Lag profesjonelt kundemateriale basert på lagrede markedsdata.

Tittel: ${title}
Område: ${area}
Ønsket format: ${outputType}
Målgruppe: norske kjøpere og varme leads

Lag JSON med denne strukturen:
{
  "title": "kort tittel",
  "subtitle": "område og vinkling",
  "summary": "2-3 setninger som kan vises i Min side",
  "key_metrics": [{"label":"Kort label","value":"Verdi eller innsikt","change":"valgfritt"}],
  "report_sections": [{"heading":"Tittel","content":"Ren tekst, 1-3 avsnitt"}],
  "presentation_slides": [{"title":"Slide-tittel","bullets":["kort punkt","kort punkt"],"speaker_note":"Hva Freddy kan si"}],
  "recommended_cta": "Hva kunden bør gjøre videre",
  "freddy_followup_questions": ["spørsmål 1","spørsmål 2"]
}

Krav:
- Norsk, tydelig og kjøpervennlig.
- Bruk konkrete tall og observasjoner fra råmaterialet når de finnes.
- Presentasjonen skal kunne brukes i samtale, webinar eller PDF.
- Rapporten skal kunne publiseres under Dokumenter på Min side.
- Inkluder praktisk kjøpsbetydning for Costa Blanca Nord, Costa Blanca Sør eller Costa Calida hvis relevant.

Råmateriale:
${sourceText}`;

  const aiText = await askClaude(prompt, { systemPrompt, model: "sonnet", maxTokens: 3500, temperature: 0.25 });

  let parsed: {
    title?: string;
    subtitle?: string;
    summary?: string;
    key_metrics?: { label: string; value: string; change?: string }[];
    report_sections?: { heading: string; content: string }[];
    presentation_slides?: { title: string; bullets?: string[]; speaker_note?: string }[];
    recommended_cta?: string;
    freddy_followup_questions?: string[];
  };

  try {
    parsed = JSON.parse(stripCodeFence(aiText));
  } catch {
    parsed = {
      title,
      subtitle: `${area} · AI-bearbeidet markedsmateriale`,
      summary: aiText.split("\n").find((line) => line.trim().length > 60)?.slice(0, 260) || title,
      report_sections: [{ heading: "AI-utkast", content: aiText }],
      presentation_slides: [],
    };
  }

  const reportSections = Array.isArray(parsed.report_sections) ? parsed.report_sections : [];
  const slides = Array.isArray(parsed.presentation_slides) ? parsed.presentation_slides : [];
  const followup = Array.isArray(parsed.freddy_followup_questions) ? parsed.freddy_followup_questions : [];

  const sections = [
    ...reportSections.map((section) => ({
      heading: section.heading || "Analyse",
      content: asParagraphs(section.content || ""),
    })),
    ...(slides.length
      ? [{
          heading: "Presentasjonsutkast",
          content: slides
            .map((slide, index) => {
              const bullets = (slide.bullets || []).map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("");
              return `<h4>Slide ${index + 1}: ${escapeHtml(slide.title || "Uten tittel")}</h4><ul>${bullets}</ul>${slide.speaker_note ? `<p><strong>Notat:</strong> ${escapeHtml(slide.speaker_note)}</p>` : ""}`;
            })
            .join(""),
        }]
      : []),
    ...(parsed.recommended_cta
      ? [{ heading: "Anbefalt neste steg", content: asParagraphs(parsed.recommended_cta) }]
      : []),
    ...(followup.length
      ? [{ heading: "Spørsmål Freddy bør stille", content: `<ul>${followup.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul>` }]
      : []),
  ];

  const contentText = [
    parsed.summary,
    ...reportSections.map((section) => `${section.heading}\n${section.content}`),
    slides.length ? `Presentasjon\n${slides.map((slide, i) => `${i + 1}. ${slide.title}\n- ${(slide.bullets || []).join("\n- ")}\nNotat: ${slide.speaker_note || ""}`).join("\n\n")}` : "",
    parsed.recommended_cta ? `Neste steg\n${parsed.recommended_cta}` : "",
  ].filter(Boolean).join("\n\n");

  const { data: report, error: reportError } = await supabase
    .from("market_reports")
    .insert({
      template_id: outputType === "presentation" ? "buyer-market-presentation" : "buyer-market-intelligence",
      title: parsed.title || title,
      subtitle: parsed.subtitle || `${area} · Basert på lagrede markedsdata`,
      summary: parsed.summary || title,
      content_text: contentText,
      key_metrics: Array.isArray(parsed.key_metrics) ? parsed.key_metrics : [],
      sections,
      data_sources: insights.flatMap((insight) => insight.sources?.length ? insight.sources : [insight.topic]),
      recipients: "internal",
      generated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 });

  return NextResponse.json({ report }, { status: 201 });
}
