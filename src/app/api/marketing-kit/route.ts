import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

/**
 * POST /api/marketing-kit
 * Generate a complete marketing kit for a property using AI agent chain:
 *   Agent 1 (Extractor): Analyzes property → defines target audience + vibe
 *   Agent 2 (Copywriter): Generates platform-specific content
 *   Agent 3 (Publisher):  Suggests timing, budget, and publishing strategy
 */
export async function POST(req: NextRequest) {
  try {
    const { property } = await req.json();

    if (!property) {
      return NextResponse.json({ error: 'property is required' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        error: 'ANTHROPIC_API_KEY er ikke konfigurert',
      }, { status: 500 });
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic();

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

    const extractorResult = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: extractorPrompt }],
    });

    const extractorText = extractorResult.content[0].type === 'text' ? extractorResult.content[0].text : '';
    let analysis;
    try {
      const jsonMatch = extractorText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
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

    const copywriterResult = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{ role: 'user', content: copywriterPrompt }],
    });

    const copywriterText = copywriterResult.content[0].type === 'text' ? copywriterResult.content[0].text : '';
    let content;
    try {
      const jsonMatch = copywriterText.match(/\{[\s\S]*\}/);
      content = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
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

    const publisherResult = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: publisherPrompt }],
    });

    const publisherText = publisherResult.content[0].type === 'text' ? publisherResult.content[0].text : '';
    let strategy;
    try {
      const jsonMatch = publisherText.match(/\{[\s\S]*\}/);
      strategy = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
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
