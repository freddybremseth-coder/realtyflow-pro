import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { askClaude } from "@/services/ai/claude-client";

export const dynamic = "force-dynamic";

type Source = {
  label: string;
  url?: string;
  note?: string;
};

function stripCodeFence(value: string) {
  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSources(value: unknown): Source[] {
  if (!Array.isArray(value)) return [];
  const sources: Source[] = [];
  for (const source of value) {
    if (!source || typeof source !== "object") continue;
    const row = source as Record<string, unknown>;
    const label = String(row.label || row.title || "Kilde").trim();
    if (!label) continue;
    sources.push({
      label,
      url: String(row.url || "").trim(),
      note: String(row.note || row.summary || "").trim(),
    });
  }
  return sources;
}

function contextToText(context: Record<string, unknown>) {
  const sources = normalizeSources(context.sources);
  return [
    `Type: ${String(context.type || "markedskontekst")}`,
    `Tittel: ${String(context.title || context.label || "Uten tittel")}`,
    `Sammendrag: ${String(context.summary || "")}`,
    `Detaljer:\n${String(context.details || "")}`,
    sources.length
      ? `Kilder:\n${sources.map((source) => `- ${source.label}${source.url ? ` (${source.url})` : ""}${source.note ? `: ${source.note}` : ""}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const form = (body.form || {}) as Record<string, unknown>;
  const context = (body.context || {}) as Record<string, unknown>;
  const format = String(body.format || form.format || "report");
  const customAngle = String(body.customAngle || "").trim();

  if (!context.title && !context.summary && !context.details) {
    return NextResponse.json({ error: "context is required" }, { status: 400 });
  }

  const formSources = normalizeSources(form.sources);
  const contextSources = normalizeSources(context.sources);
  const mergedSources = [...contextSources, ...formSources].filter(
    (source, index, all) => all.findIndex((candidate) => `${candidate.label}-${candidate.url}` === `${source.label}-${source.url}`) === index,
  );

  const systemPrompt = `Du er Freddy Bremseth sin senior eiendoms- og markedsanalytiker.
Du skriver på profesjonell norsk for norske boligkjøpere, selgere og varme leads som vurderer Spania.
Målet er å bygge tillit og ekspertposisjon, ikke å lage generisk markedsføring.

Regler:
- Bruk kun markedskonteksten, kildene og brukerens vinkling som grunnlag.
- Ikke finn på tall, lovnader, avkastning eller juridiske konklusjoner.
- Skill tydelig mellom fakta, faglig vurdering og hva leseren bør gjøre videre.
- Skriv kundeklart. Interne sjekklister skal kun ligge i checklist/internal_notes.
- Juridiske, skattemessige og kommunale forhold skal omtales som noe som må bekreftes av advokat, gestor eller relevant myndighet.`;

  const prompt = `Lag ekspertinnhold basert på valgt markedskontekst.

Format: ${format}
Tittel: ${String(form.title || "")}
Målgruppe: ${String(form.audience || "Norske boligkjøpere som vurderer Spania")}
Region/tema: ${String(form.region || "")}
Leserens problem: ${String(form.readerProblem || "")}
Ønsket ekspertvinkel: ${String(form.expertAngle || "")}
Ekstra vinkling fra Freddy: ${customAngle || "Ingen ekstra vinkling."}
Ønsket neste steg: ${String(form.cta || "")}

MARKEDSKONTEKST:
${contextToText(context)}

Svar kun med gyldig JSON:
{
  "title": "Tittel",
  "summary": "Kort intern/ekstern oppsummering",
  "customer_message": "Kundeklar tekst med tydelige mellomtitler",
  "internal_notes": "Hva Freddy bør kontrollere før publisering",
  "checklist": ["intern kontroll 1", "intern kontroll 2"],
  "tags": ["tag1", "tag2"]
}

Krav til customer_message:
- Hvis format=report: skriv en profesjonell, kundeklar fagrapport.
- Hvis format=article: skriv en merkevarebyggende ekspertartikkel med tydelig standpunkt.
- Hvis format=instruction: skriv en intern instruks, men fortsatt presis og operativ.
- Bruk konkrete markedsfunn, renter, valuta eller rapportpoeng når de finnes i konteksten.
- Ta med praktisk betydning for leseren, ikke bare referat av data.
- Avslutt med en rolig, profesjonell CTA.`;

  const aiText = await askClaude(prompt, { systemPrompt, model: "sonnet", maxTokens: 3600, temperature: 0.28 });

  let parsed: {
    title?: string;
    summary?: string;
    customer_message?: string;
    internal_notes?: string;
    checklist?: string[];
    tags?: string[];
  };

  try {
    parsed = JSON.parse(stripCodeFence(aiText));
  } catch {
    parsed = {
      title: String(form.title || context.title || "AI-generert ekspertinnhold"),
      summary: aiText.split("\n").find((line) => line.trim().length > 60)?.slice(0, 260) || "AI-generert ekspertinnhold.",
      customer_message: aiText,
      internal_notes: "AI returnerte ikke JSON. Les gjennom tekst, kilder og forbehold før bruk.",
      checklist: ["Kontroller fakta og datoer.", "Kontroller juridiske og skattemessige forbehold.", "Tilpass CTA før publisering."],
      tags: [format, "market-intelligence", "expert-content"],
    };
  }

  const playbook = {
    id: `ai-${Date.now()}`,
    brand_id: "zeneco",
    title: parsed.title || String(form.title || context.title || "AI-generert ekspertinnhold"),
    topic: format === "article" ? "expert_article" : format === "instruction" ? "advisor_instruction" : "expert_report",
    region: String(form.region || ""),
    status: "draft",
    confidence: "needs_review",
    summary: parsed.summary || "",
    customer_message: parsed.customer_message || "",
    internal_notes: parsed.internal_notes || "Kontroller kilder, datoer og forbehold før publisering.",
    checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
    sources: mergedSources,
    tags: normalizeList(parsed.tags).length ? normalizeList(parsed.tags) : [format, "market-intelligence", "expert-content"],
    next_review_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10),
    synthetic: true,
  };

  return NextResponse.json({ playbook });
}
