import { NextRequest, NextResponse } from 'next/server';
import { askClaude, isConfigured } from '@/services/ai/claude-client';

export async function POST(request: NextRequest) {
  const { contact, context, language = 'no' } = await request.json();

  if (!isConfigured()) {
    return NextResponse.json({
      draft: `Hei ${contact.name},\n\nTakk for din interesse for eiendommer i Spania. Vi har spennende muligheter som kan passe for deg.\n\nVennlig hilsen,\nFreddy Bremseth\nSoleada.no`,
    });
  }

  const systemPrompt = `Du er Freddy Bremseth, eiendomsmegler i Spania med fokus på norske og skandinaviske kjøpere.
Skriv en personlig, varm og profesjonell e-post på ${language === 'no' ? 'norsk' : 'engelsk'}.
Tilpass tonen til kontaktens status og historikk.
Hold e-posten kort (2-4 avsnitt). Ikke bruk klisjeer.
Avslutt alltid med kontaktinformasjon.`;

  const userPrompt = `Skriv en oppfølgings-e-post til denne kontakten:

Navn: ${contact.name}
E-post: ${contact.email}
Status: ${contact.pipeline_status || contact.status}
Type: ${contact.type || 'Kjøper'}
Interessert i: ${contact.interested_in || contact.property || 'Ikke spesifisert'}
Siste kontakt: ${contact.last_contact || 'Ukjent'}
Notater: ${contact.notes || 'Ingen'}

Kontekst: ${context || 'Generell oppfølging'}

Skriv e-posten med subject line og body.`;

  try {
    const draft = await askClaude(userPrompt, {
      systemPrompt,
      maxTokens: 1000,
      model: 'sonnet',
    });
    return NextResponse.json({ draft });
  } catch (err: any) {
    console.error('[email-draft] All AI providers failed:', err?.message);
    return NextResponse.json({
      draft: `Hei ${contact.name},\n\nTakk for din interesse for eiendommer i Spania. Vi har spennende muligheter som kan passe for deg.\n\nJeg vil gjerne følge opp og høre mer om dine ønsker og behov.\n\nVennlig hilsen,\nFreddy Bremseth\nSoleada.no`,
    });
  }
}
