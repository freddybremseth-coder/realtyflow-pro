import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-admin';
import { askClaude } from '@/services/ai/claude-client';

export const maxDuration = 120;

/** Extract JSON from AI response */
function extractJSON(text: string): Record<string, unknown> {
  try { return JSON.parse(text.trim()); } catch { /* continue */ }
  const stripped = text.replace(/```(?:json)?\s*\n?/g, "").trim();
  try { return JSON.parse(stripped); } catch { /* continue */ }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch { /* continue */ }
  }
  throw new Error("Could not extract JSON");
}

/**
 * POST /api/marketing-kit
 * Generate a complete marketing kit for a property using AI agent chain:
 *   Agent 1 (Extractor): Analyzes property → defines target audience + vibe
 *   Agent 2 (Copywriter): Generates platform-specific content
 *   Agent 3 (Publisher):  Suggests timing, budget, and publishing strategy
 *
 * Uses askClaude() with automatic fallback: Anthropic → Gemini → OpenAI
 */
export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireAdminApi(req);
    if (unauthorized) return unauthorized;

    const { property } = await req.json();

    if (!property) {
      return NextResponse.json({ error: 'property is required' }, { status: 400 });
    }

    // ─── AGENT 1: Data-analytikeren (The Extractor) ──────────────────
    const extractorPrompt = `Du er en eiendomsanalytiker. Analyser denne eiendommen og definer målgruppe og "vibe".

EIENDOMSDATA:
- Tittel: ${property.title}
- Type: ${property.type}
- Beliggenhet: ${property.location}
- Pris: €${property.price?.toLocaleString('nb-NO')}
- Soverom: ${property.bedrooms}
- Bad: ${property.bathrooms}
- Boligareal: ${property.area} m²
- Tomteareal: ${property.plotArea || 0} m²
- Basseng: ${property.pool ? 'Ja' : 'Nei'}
- Garasje: ${property.garage ? 'Ja' : 'Nei'}
- Byggeår: ${property.yearBuilt || 'Ukjent'}
- Energiklasse: ${property.energyRating || 'Ukjent'}
- Beskrivelse: ${property.description || 'Ingen'}

Returner JSON:
{
  "target_audiences": [
    { "segment": "Navn på segment", "description": "Kort beskrivelse", "age_range": "40-65", "nationality": "Skandinavisk" }
  ],
  "property_vibe": "Kort beskrivelse av eiendommens stemning/stil",
  "key_selling_points": ["punkt1", "punkt2", "punkt3"],
  "emotional_hooks": ["hook1", "hook2"],
  "price_positioning": "Beskrivelse av prisposisjonering i markedet",
  "best_platforms": ["Instagram", "Facebook", "LinkedIn"]
}

Svar KUN med JSON, ingen annen tekst.`;

    const extractorText = await askClaude(extractorPrompt, { maxTokens: 1500, model: 'sonnet' });
    let analysis;
    try {
      analysis = extractJSON(extractorText);
    } catch {
      analysis = { target_audiences: [], property_vibe: 'Moderne bolig', key_selling_points: [], emotional_hooks: [], price_positioning: '', best_platforms: ['Facebook', 'Instagram'] };
    }

    // ─── AGENT 2: Tekstforfatteren (The Copywriter) ──────────────────
    const copywriterPrompt = `Du er en profesjonell eiendomstekstforfatter som skriver for det skandinaviske markedet.

EIENDOM:
- Tittel: ${property.title}
- Type: ${property.type}
- Sted: ${property.location}
- Pris: €${property.price?.toLocaleString('nb-NO')}
- ${property.bedrooms} soverom, ${property.bathrooms} bad, ${property.area} m²
- Tomt: ${property.plotArea || 0} m², Basseng: ${property.pool ? 'Ja' : 'Nei'}
- Byggeår: ${property.yearBuilt || 'Ukjent'}

ANALYSE FRA FORRIGE AGENT:
- Målgrupper: ${JSON.stringify(analysis.target_audiences)}
- Vibe: ${analysis.property_vibe}
- Salgsargumenter: ${JSON.stringify(analysis.key_selling_points)}
- Emosjonelle hooks: ${JSON.stringify(analysis.emotional_hooks)}

Generer ALLE disse tekstene. Skriv på NORSK med innslag av spansk stedsnavn der det passer:

{
  "headline": "Kort, fengende tittel for Finn.no / nettside (maks 80 tegn)",
  "facebook_ads": {
    "short": "Kort Facebook-ad (50-80 ord, med CTA)",
    "long": "Lang Facebook-ad (150-200 ord, storytelling med CTA)",
    "emotional": "Emosjonell Facebook-ad (100-150 ord, fokus på drømmen/livsstil)"
  },
  "instagram": "Instagram-tekst med emojis, hashtags, og bildebeskrivelse (100-150 ord)",
  "linkedin": "Profesjonell LinkedIn-post for investorer/næring (120-180 ord)",
  "website_description": "Fullstendig nettside-beskrivelse (200-300 ord, informativ og selgende)",
  "email_subject": "E-post emnelinje for nyhetsbrev",
  "email_body": "E-post tekst for nyhetsbrev (150-200 ord)",
  "sms": "SMS-tekst (maks 160 tegn)",
  "suggested_hashtags": ["#hashtag1", "#hashtag2", "..."]
}

Svar KUN med JSON, ingen annen tekst.`;

    const copywriterText = await askClaude(copywriterPrompt, { maxTokens: 3000, model: 'sonnet' });
    let content;
    try {
      content = extractJSON(copywriterText);
    } catch {
      content = { headline: property.title, facebook_ads: {}, instagram: '', linkedin: '', website_description: property.description };
    }

    // ─── AGENT 3: Kampanje-strategen (The Publisher) ──────────────────
    const publisherPrompt = `Du er en digital markedsføringsstrateg for eiendom i Spania, målrettet mot skandinaviske kjøpere.

EIENDOM: ${property.title} i ${property.location}, €${property.price?.toLocaleString('nb-NO')}
MÅLGRUPPER: ${JSON.stringify(analysis.target_audiences)}
BESTE PLATTFORMER: ${JSON.stringify(analysis.best_platforms)}

Lag en komplett publiseringsstrategi:

{
  "publishing_schedule": [
    { "platform": "Facebook", "day": "Tirsdag", "time": "18:00", "content_type": "Kort ad", "reason": "Hvorfor dette tidspunktet" },
    { "platform": "Instagram", "day": "Onsdag", "time": "12:00", "content_type": "Karusell", "reason": "..." }
  ],
  "budget_suggestion": {
    "total_weekly": 500,
    "currency": "NOK",
    "breakdown": [
      { "platform": "Facebook Ads", "amount": 300, "target": "Beskrivelse av målretting" },
      { "platform": "Instagram Boost", "amount": 200, "target": "..." }
    ]
  },
  "campaign_duration_days": 14,
  "ab_test_suggestions": [
    { "variable": "Hva testes", "variant_a": "Versjon A", "variant_b": "Versjon B" }
  ],
  "kpis": [
    { "metric": "Metrikk", "target": "Målverdi", "measurement": "Hvordan måle" }
  ],
  "retargeting_strategy": "Beskrivelse av retargeting-opplegg",
  "follow_up_actions": ["Handling 1 etter 7 dager", "Handling 2 etter 14 dager"]
}

Svar KUN med JSON, ingen annen tekst.`;

    const publisherText = await askClaude(publisherPrompt, { maxTokens: 2000, model: 'sonnet' });
    let strategy;
    try {
      strategy = extractJSON(publisherText);
    } catch {
      strategy = { publishing_schedule: [], budget_suggestion: { total_weekly: 500 }, campaign_duration_days: 14 };
    }

    return NextResponse.json({
      success: true,
      property_id: property.id,
      analysis,
      content,
      strategy,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Marketing Kit]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
