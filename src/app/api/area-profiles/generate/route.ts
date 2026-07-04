/**
 * POST /api/area-profiles/generate
 *
 * Use Claude (with Gemini/OpenAI fallback) to draft or expand an area profile.
 *
 * Body:
 *   name        : string                           required ("Calpe")
 *   country?    : string                           hint to AI ("Spain")
 *   region?     : string                           hint ("Costa Blanca")
 *   notes?      : string                           agent's own bullet points
 *                                                  / facts to weave in
 *   existing?   : {                                if expanding an existing
 *     description?, hero_blurb?, highlights?,        profile, the AI uses what
 *     climate?, lifestyle?                          you have and adds depth
 *   }
 *   mode?       : "create" | "expand" | "section"  default "create"
 *   section?    : "description" | "hero_blurb" |   only for mode "section"
 *                 "highlights" | "climate" |
 *                 "lifestyle"
 *   audience?   : string                           target buyer description
 *
 * Returns:
 *   { hero_blurb, description, highlights[], climate, lifestyle }
 *   or for mode "section": { [section]: text }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { askClaude } from "@/services/ai/claude-client";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `Du er en erfaren spansk eiendomsmegler som skriver områdebeskrivelser for skandinaviske kjøpere som vurderer å kjøpe bolig i Spania.

Stilen din:
- Konkret, autentisk, varm — ikke turistbrosjyre-klisjéer
- Skriv på norsk (bokmål), unntatt egennavn
- Legg vekt på det praktiske: klima, hverdagsliv, hvor langt til strand/skole/flyplass, hvilken type kjøper som trives her
- Ærlig: nevn både fordeler og ting man bør være klar over
- Konkrete tall og navn der det finnes (kommune-størrelse, kjøretid, kjente landsbyer/strender)

Output skal være ren JSON uten markdown-fence eller annen forklaring.`;

interface ExistingProfile {
  description?: string | null;
  hero_blurb?: string | null;
  highlights?: string[] | null;
  climate?: string | null;
  lifestyle?: string | null;
}

interface RequestBody {
  name?: string;
  country?: string;
  region?: string;
  notes?: string;
  existing?: ExistingProfile;
  mode?: "create" | "expand" | "section";
  section?: "description" | "hero_blurb" | "highlights" | "climate" | "lifestyle";
  audience?: string;
}

function buildUserPrompt(body: RequestBody): string {
  const lines: string[] = [];
  lines.push(`Sted: ${body.name}`);
  if (body.country) lines.push(`Land: ${body.country}`);
  if (body.region) lines.push(`Region: ${body.region}`);
  if (body.audience) lines.push(`Målgruppe: ${body.audience}`);
  if (body.notes && body.notes.trim()) {
    lines.push("", "Megleren har lagt inn følgende fakta og notater:", body.notes.trim());
  }

  const ex = body.existing || {};
  const hasExisting =
    ex.description || ex.hero_blurb || (ex.highlights && ex.highlights.length) || ex.climate || ex.lifestyle;

  if (body.mode === "section" && body.section) {
    if (hasExisting) {
      lines.push("", "Eksisterende profil for konsistens:");
      if (ex.hero_blurb) lines.push(`hero_blurb: ${ex.hero_blurb}`);
      if (ex.description) lines.push(`description: ${ex.description}`);
      if (ex.highlights?.length) lines.push(`highlights: ${ex.highlights.join(" | ")}`);
      if (ex.climate) lines.push(`climate: ${ex.climate}`);
      if (ex.lifestyle) lines.push(`lifestyle: ${ex.lifestyle}`);
    }
    lines.push(
      "",
      `Skriv KUN feltet "${body.section}" som ren tekst (uten JSON, uten anførselstegn).`,
    );
    if (body.section === "highlights") {
      lines.push("Returner 5–8 punkter, ett pr. linje, uten bullet-tegn.");
    } else if (body.section === "hero_blurb") {
      lines.push("Maks 1 setning, 12–18 ord, fengende men ærlig.");
    } else {
      lines.push("2–4 avsnitt, levende språk, konkrete detaljer.");
    }
    return lines.join("\n");
  }

  if (body.mode === "expand" && hasExisting) {
    lines.push(
      "",
      "Du skal UTVIDE og foredle den eksisterende profilen — behold tonen og nøyaktige fakta som allerede står der, men gjør den dypere, mer konkret og mer overbevisende. Behold bullet-stil for highlights.",
      "",
      "Eksisterende profil:",
    );
    if (ex.hero_blurb) lines.push(`hero_blurb: ${ex.hero_blurb}`);
    if (ex.description) lines.push(`description: ${ex.description}`);
    if (ex.highlights?.length) lines.push(`highlights: ${ex.highlights.join(" | ")}`);
    if (ex.climate) lines.push(`climate: ${ex.climate}`);
    if (ex.lifestyle) lines.push(`lifestyle: ${ex.lifestyle}`);
  } else {
    lines.push("", "Skriv en helt ny områdeprofil.");
  }

  lines.push(
    "",
    "Returner ren JSON med disse feltene (alle påkrevd):",
    "{",
    `  "hero_blurb": "1 setning, 12–18 ord",`,
    `  "description": "3–5 avsnitt, konkret og levende, om stedet, hvem som trives her, hvordan hverdagen er",`,
    `  "highlights": ["5–8 korte punkter med konkrete fordeler"],`,
    `  "climate": "1 avsnitt om klima og sesonger",`,
    `  "lifestyle": "1–2 avsnitt om hverdagsliv, mat, kultur, aktiviteter"`,
    "}",
  );

  return lines.join("\n");
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  // strip ```json … ``` fences if the model added them
  const stripped = raw.replace(/```json\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // try to find the first {...} block
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireAdminApi(req);
    if (unauthorized) return unauthorized;

    const body = (await req.json()) as RequestBody;
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const prompt = buildUserPrompt(body);
    const text = await askClaude(prompt, {
      systemPrompt: SYSTEM_PROMPT,
      model: "sonnet",
      maxTokens: body.mode === "section" ? 700 : 1800,
      temperature: 0.7,
    });

    if (body.mode === "section" && body.section) {
      const cleaned = text
        .replace(/^```[a-z]*\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      if (body.section === "highlights") {
        const items = cleaned
          .split(/\r?\n/)
          .map((l) => l.replace(/^[-*•\d.\)\s]+/, "").trim())
          .filter(Boolean)
          .slice(0, 8);
        return NextResponse.json({ section: body.section, value: items });
      }
      return NextResponse.json({ section: body.section, value: cleaned });
    }

    const parsed = tryParseJson(text);
    if (!parsed) {
      return NextResponse.json(
        { error: "AI returned non-JSON output", raw: text },
        { status: 502 },
      );
    }

    const highlightsRaw = parsed.highlights;
    const highlights = Array.isArray(highlightsRaw)
      ? highlightsRaw.map(String).filter(Boolean).slice(0, 8)
      : typeof highlightsRaw === "string"
        ? highlightsRaw
            .split(/\r?\n/)
            .map((l: string) => l.replace(/^[-*•\d.\)\s]+/, "").trim())
            .filter(Boolean)
            .slice(0, 8)
        : [];

    return NextResponse.json({
      hero_blurb: typeof parsed.hero_blurb === "string" ? parsed.hero_blurb : "",
      description: typeof parsed.description === "string" ? parsed.description : "",
      highlights,
      climate: typeof parsed.climate === "string" ? parsed.climate : "",
      lifestyle: typeof parsed.lifestyle === "string" ? parsed.lifestyle : "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generate failed";
    console.error("[area-profiles/generate]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
