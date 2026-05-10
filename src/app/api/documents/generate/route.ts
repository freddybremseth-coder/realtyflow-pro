import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/services/ai/claude-client";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `Du er en erfaren norsk fagskribent som lager profesjonelle, kvalitetssikrede dokumenter for RealtyFlow (eiendom i Spania) og ChatGenius (AI-software for B2B).

Krav:
- Skriv på norsk i en tydelig, profesjonell tone — ikke selgende, ikke svulstig.
- Returner GYLDIG markdown. Bruk # for hovedtittel, ## for seksjoner, lister med "-" og fet skrift med **...** der det hjelper lesbarheten.
- Skill mellom verifiserte fakta og generelle vurderinger. Når noe må kontrolleres av advokat, økonom, bank eller revisor, skriv det eksplisitt.
- Ikke finn på tall, navn, lover eller paragrafer. Hvis du er usikker, skriv "[Må kvalitetssikres]" som plassholder.
- Ingen forord til meg som ber om dokumentet. Lever dokumentet direkte.
- Ingen avsluttende kommentar etter dokumentet.`;

function buildPrompt(args: {
  title: string;
  audience: string;
  sections?: string[];
  customPrompt?: string;
}) {
  const { title, audience, sections, customPrompt } = args;
  const lines: string[] = [];
  lines.push(`Lag et komplett, ferdig formatert dokument med følgende kontekst:`);
  lines.push("");
  lines.push(`**Tittel:** ${title}`);
  lines.push(`**Målgruppe:** ${audience}`);

  if (sections && sections.length > 0) {
    lines.push("");
    lines.push("**Påkrevd struktur (hold rekkefølgen):**");
    sections.forEach((section, idx) => {
      lines.push(`${idx + 1}. ${section}`);
    });
  }

  if (customPrompt) {
    lines.push("");
    lines.push("**Innhold/tema som skal dekkes:**");
    lines.push(customPrompt);
  }

  lines.push("");
  lines.push("Skriv et fullstendig dokument klart for kunde-bruk: tydelig innledning, gjennomarbeidede seksjoner, og en kort oppsummering med anbefalte neste steg.");

  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const title = String(body.title || "").trim();
    const audience = String(body.audience || "").trim();
    const sections = Array.isArray(body.sections)
      ? body.sections.map((s: unknown) => String(s)).filter(Boolean)
      : undefined;
    const customPrompt = body.customPrompt ? String(body.customPrompt).trim() : undefined;

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!audience) {
      return NextResponse.json({ error: "audience is required" }, { status: 400 });
    }
    if (!sections?.length && !customPrompt) {
      return NextResponse.json(
        { error: "sections or customPrompt is required" },
        { status: 400 }
      );
    }

    const prompt = buildPrompt({ title, audience, sections, customPrompt });

    const markdown = await askClaude(prompt, {
      systemPrompt: SYSTEM_PROMPT,
      model: "sonnet",
      maxTokens: 4000,
      temperature: 0.5,
    });

    if (!markdown.trim()) {
      return NextResponse.json({ error: "AI returned empty content" }, { status: 502 });
    }

    return NextResponse.json({ markdown });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
