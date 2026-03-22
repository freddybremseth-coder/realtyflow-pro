import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { contact, context, language = 'no' } = await request.json();

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      draft: `Hei ${contact.name},\n\nTakk for din interesse for eiendommer i Spania. Vi har spennende muligheter som kan passe for deg.\n\nVennlig hilsen,\nFreddy Bremseth\nSoleada.no`,
    });
  }

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic();

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

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const draft = response.content[0].type === 'text' ? response.content[0].text : '';

  return NextResponse.json({ draft });
}
