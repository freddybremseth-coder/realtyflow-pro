/**
 * RealtyFlow Pro - AI-Powered Market Report Generator
 *
 * Uses Claude (Anthropic) to generate varied, expert-quality market reports
 * based on templates and real-time market data.
 */

import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export interface GeneratedReport {
  id: string;
  template_id: string;
  title: string;
  subtitle: string;
  content_html: string;
  content_text: string;
  summary: string;
  key_metrics: { label: string; value: string; change?: string }[];
  sections: { heading: string; content: string }[];
  theme?: string;
  brand?: string;
  recipients: 'all' | 'investors' | 'leads' | 'internal' | 'donaanna';
  generated_at: string;
  data_sources: string[];
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  frequency: string;
  sections?: readonly string[];
  themes?: readonly string[];
  brands?: readonly string[];
}

// ---------------------------------------------------------------------------
// Report Templates
// ---------------------------------------------------------------------------

export const REPORT_TEMPLATES = {
  A: {
    id: 'tall-og-trender',
    name: 'Tall og Trender',
    description: 'Standard markedsrapport med friske tall',
    frequency: 'biweekly',
    sections: [
      'exchange_rates',
      'ecb_rate',
      'idealista_news',
      'pipeline_summary',
      'new_listings',
    ],
  },
  B: {
    id: 'det-store-bildet',
    name: 'Det Store Bildet',
    description: 'Geopolitisk og makroekonomisk analyse',
    frequency: 'monthly',
    themes: [
      'Russerne venter \u2013 oppdemt ettersp\u00f8rsel og hva som skjer n\u00e5r sanksjoner l\u00f8sner',
      'Krigen tar slutt \u2013 byggekostnader, arbeidskraft og BlackRocks rolle i gjenoppbygging',
      'EUR/NOK og hva det betyr for norske kj\u00f8pere \u2013 konkrete eksempler',
      'Luksus og internasjonale kj\u00f8pere \u2013 prime property trender',
      'B\u00e6rekraft og gr\u00f8nne boliger \u2013 EUs energikrav og muligheter',
      'Digital nomad-b\u00f8lgen \u2013 remote workers og boligettersp\u00f8rsel i kystbyer',
      'Spansk boligpolitikk \u2013 nye lover, skatter og reguleringer for utlendinger',
      'Generasjonsskifte \u2013 millennials og Gen Z som kj\u00f8pere i Spania',
    ],
  },
  C: {
    id: 'brand-spotlight',
    name: 'Brand Spotlight',
    description: 'Dypdykk i ett brand med dedikert analyse',
    frequency: 'monthly',
    brands: [
      'soleada',
      'zeneco',
      'pinosoecolife',
      'donaanna',
      'chatgenius',
      'freddyb',
      'neuralbeat',
    ],
  },
  D: {
    id: 'intern-ukesoppsummering',
    name: 'Intern Ukesoppsummering',
    description: 'Fredag helikopterblikk over alle brands',
    frequency: 'weekly_friday',
    sections: [
      'pipeline_changes',
      'new_leads',
      'content_published',
      'agent_activity',
      'currency_moves',
      'action_items',
    ],
  },
  E: {
    id: 'dona-anna-sesong',
    name: 'Dona Anna Sesongbrev',
    description: 'Kvartalsvis olivenoljestatus og g\u00e5rdsliv',
    frequency: 'quarterly',
    sections: [
      'harvest_status',
      'quality_notes',
      'availability',
      'recipes',
      'sustainability',
    ],
  },
} as const;

type TemplateKey = keyof typeof REPORT_TEMPLATES;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEMPLATE_RECIPIENTS: Record<string, GeneratedReport['recipients']> = {
  'tall-og-trender': 'all',
  'det-store-bildet': 'investors',
  'brand-spotlight': 'all',
  'intern-ukesoppsummering': 'internal',
  'dona-anna-sesong': 'donaanna',
};

const DONA_ANNA_TEMPLATE_ID = REPORT_TEMPLATES.E.id;

function templateById(id: string): (typeof REPORT_TEMPLATES)[TemplateKey] | undefined {
  return Object.values(REPORT_TEMPLATES).find((t) => t.id === id);
}

function templateKeyById(id: string): TemplateKey | undefined {
  return (Object.keys(REPORT_TEMPLATES) as TemplateKey[]).find(
    (k) => REPORT_TEMPLATES[k].id === id,
  );
}

function norwegianSeason(date = new Date()): string {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'vår';
  if (month >= 5 && month <= 7) return 'sommer';
  if (month >= 8 && month <= 10) return 'høst';
  return 'vinter';
}

function donaAnnaSeasonTitle(date = new Date()): string {
  const season = norwegianSeason(date);
  const year = date.getFullYear();
  const seasonName = season.charAt(0).toUpperCase() + season.slice(1);
  return `Dona Anna sesongbrev: ${seasonName} ${year} fra olivengården`;
}

function looksLikeFinancialOrRealEstateContent(value: string): boolean {
  return /finansmarked|boligmarked|eiendomsmarked|boligkjøp|boligkjøpere|rente|ecb|eur\/?nok|eurokurs|lånerente|investor|costa blanca/i.test(value);
}

function buildDonaAnnaFallbackParsed() {
  const season = norwegianSeason();
  return {
    title: donaAnnaSeasonTitle(),
    subtitle: 'Nytt fra Dona Anna: olivenolje, sesong og enkel middelhavsmat',
    summary:
      'Et varmt sesongbrev fra Dona Anna med fokus på olivenolje, gårdsliv, kvalitet og god verdi i hverdagskjøkkenet.',
    key_metrics: [
      { label: 'Sesong', value: season },
      { label: 'Fokus', value: 'Olivenolje' },
      { label: 'Bruk', value: 'Hverdagsmat' },
    ],
    sections: [
      {
        heading: 'Hilsen fra gården',
        content:
          '<p>Dona Anna handler om ren olivenolje, rolig gårdsliv og smaken av Middelhavet i hverdagen. Dette sesongbrevet skal gjøre det enkelt å forstå hva som skjer på gården akkurat nå, og hvordan oljen kan brukes hjemme.</p>',
      },
      {
        heading: 'Sesongen nå',
        content:
          '<p>Fokuset denne sesongen er stell av trærne, kvalitet i produksjonen og god planlegging frem mot neste innhøsting. Målet er en olivenolje som er lett å bruke, ærlig i smaken og gir god verdi både til hverdagsmat og små øyeblikk ved bordet.</p>',
      },
      {
        heading: 'Slik bruker du oljen',
        content:
          '<p>Prøv Dona Anna over ristede grønnsaker, salater, godt brød, fisk, pasta eller en enkel tomatrett. Bruk den gjerne til slutt i retten, der aromaen og munnfølelsen kommer best frem.</p>',
      },
      {
        heading: 'Tilgjengelighet',
        content:
          '<p>Hold kundene oppdatert på hvilke flasker som er tilgjengelige, hvordan de kan bestille, og om det finnes sesongpakker eller begrensede partier. Vær konkret, men lov aldri mer enn lager og logistikk faktisk kan levere.</p>',
      },
    ],
    data_sources: ['Dona Anna merkevarekontekst', 'Sesongbrev-mal'],
  };
}

// ---------------------------------------------------------------------------
// ReportGenerator
// ---------------------------------------------------------------------------

export class ReportGenerator {
  private anthropicApiKey: string | undefined;

  constructor() {
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  }

  // -----------------------------------------------------------------------
  // Rotation Logic
  // -----------------------------------------------------------------------

  /**
   * Determines which template should be used next based on the history of
   * previously sent reports.
   *
   * Rotation schedule:
   *   Week 1 - A (Tall og Trender)
   *   Week 2 - D (Intern Ukesoppsummering)
   *   Week 3 - A
   *   Week 4 - B or C (alternating months)
   *   Fridays always get D
   *
   * For template B, the next unused theme is selected.
   * For template C, brands are cycled in order.
   */
  getNextTemplate(lastReports: { template_id: string; date: string }[]): string {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 5 = Friday

    // Fridays always get the internal weekly summary
    if (dayOfWeek === 5) {
      return REPORT_TEMPLATES.D.id;
    }

    // Sort reports descending by date
    const sorted = [...lastReports].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // Determine the ISO week number (1-based)
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const daysDiff = Math.floor(
      (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24),
    );
    const weekNumber = Math.ceil((daysDiff + startOfYear.getDay() + 1) / 7);
    const weekInMonth = ((weekNumber - 1) % 4) + 1; // 1-4

    switch (weekInMonth) {
      case 1:
      case 3:
        return REPORT_TEMPLATES.A.id;

      case 2:
        return REPORT_TEMPLATES.D.id;

      case 4: {
        // Alternate between B and C each month
        const lastBOrC = sorted.find(
          (r) =>
            r.template_id === REPORT_TEMPLATES.B.id ||
            r.template_id === REPORT_TEMPLATES.C.id,
        );

        if (!lastBOrC || lastBOrC.template_id === REPORT_TEMPLATES.C.id) {
          return REPORT_TEMPLATES.B.id;
        }
        return REPORT_TEMPLATES.C.id;
      }

      default:
        return REPORT_TEMPLATES.A.id;
    }
  }

  /**
   * Returns the next theme for template B that hasn't been used recently.
   */
  getNextTheme(usedThemes: string[]): string {
    const themes = REPORT_TEMPLATES.B.themes;
    const unused = themes.filter((t) => !usedThemes.includes(t));
    if (unused.length === 0) {
      // All used -- restart rotation
      return themes[0];
    }
    return unused[0];
  }

  /**
   * Returns the next brand for template C that hasn't been featured recently.
   */
  getNextBrand(usedBrands: string[]): string {
    const brands = REPORT_TEMPLATES.C.brands;
    const unused = brands.filter((b) => !usedBrands.includes(b));
    if (unused.length === 0) {
      return brands[0];
    }
    return unused[0];
  }

  // -----------------------------------------------------------------------
  // Report Generation
  // -----------------------------------------------------------------------

  async generateReport(
    templateId: string,
    marketData: any,
    options?: { theme?: string; brand?: string },
  ): Promise<GeneratedReport> {
    const template = templateById(templateId);
    if (!template) {
      throw new Error(`Unknown template: ${templateId}`);
    }

    const systemPrompt = this.buildSystemPrompt(templateId, options);
    const userPrompt = this.buildUserPrompt(templateId, marketData, options);

    // If no API key, return a mock report
    if (!this.anthropicApiKey) {
      return this.buildMockReport(templateId, template, options);
    }

    // Call Claude
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.anthropicApiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawContent =
      response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n') || '';

    const report = this.parseClaudeResponse(rawContent, templateId, template, options);

    // Override key_metrics with actual data to prevent AI hallucination
    if (templateId === DONA_ANNA_TEMPLATE_ID) {
      report.title = looksLikeFinancialOrRealEstateContent(report.title)
        ? donaAnnaSeasonTitle()
        : report.title;
      report.key_metrics = report.key_metrics?.length
        ? report.key_metrics.slice(0, 4)
        : buildDonaAnnaFallbackParsed().key_metrics;
      report.data_sources = Array.from(new Set([
        ...(report.data_sources || []),
        'Dona Anna merkevarekontekst',
        'Sesongbrev-mal',
      ]));
      return report;
    }

    report.key_metrics = [];
    if (marketData.exchangeRates?.length) {
      const eurNok = marketData.exchangeRates.find((r: any) => r.pair === 'EUR/NOK');
      if (eurNok) {
        report.key_metrics.push({
          label: 'EUR/NOK',
          value: eurNok.rate.toFixed(4),
          change: eurNok.change7d ? `${eurNok.change7d > 0 ? '+' : ''}${eurNok.change7d.toFixed(2)}%` : undefined,
        });
      }
    }
    if (marketData.ecbRate) {
      report.key_metrics.push({
        label: 'ECB Rente',
        value: `${marketData.ecbRate.rate}%`,
        change: marketData.ecbRate.rate !== marketData.ecbRate.previousRate
          ? `${marketData.ecbRate.rate > marketData.ecbRate.previousRate ? '+' : ''}${(marketData.ecbRate.rate - marketData.ecbRate.previousRate).toFixed(2)}pp`
          : 'Uendret',
      });
    }
    if (marketData.interestRates?.norway) {
      const rates = marketData.interestRates.norway;
      report.key_metrics.push({
        label: 'Norges Bank',
        value: `${rates.policyRate}%`,
        change: `Bank +${rates.bankMarkupMin}-${rates.bankMarkupMax}pp`,
      });
      report.key_metrics.push({
        label: 'NO boliglån est.',
        value: `${rates.estimatedMortgageMin}-${rates.estimatedMortgageMax}%`,
      });
    }
    if (marketData.interestRates?.spain) {
      const rates = marketData.interestRates.spain;
      report.key_metrics.push({
        label: 'ES boliglån est.',
        value: `${rates.estimatedMortgageMin}-${rates.estimatedMortgageMax}%`,
        change: `ECB +${rates.bankMarkupMin}-${rates.bankMarkupMax}pp`,
      });
    }
    if (marketData.perplexityInsights?.length) {
      report.key_metrics.push(
        { label: 'Markedskilder', value: `${marketData.perplexityInsights.length} analyser` },
      );
    }
    report.data_sources = [
      ...(marketData.exchangeRates?.length ? ['ECB Exchange Rates'] : []),
      ...(marketData.ecbRate ? ['ECB Interest Rate'] : []),
      ...(marketData.interestRates?.norway ? ['Norges Bank Policy Rate'] : []),
      ...(marketData.interestRates ? ['Bank margin assumptions'] : []),
      ...(marketData.idealistaNews?.length ? ['Idealista News'] : []),
      ...(marketData.perplexityInsights?.length ? ['Perplexity AI (sanntid)'] : []),
    ];

    return report;
  }

  // -----------------------------------------------------------------------
  // Prompt Building
  // -----------------------------------------------------------------------

  private formatDataContext(marketData: any): string {
    let context = 'VIKTIG: Bruk KUN disse tallene. IKKE gjett eller anta trender som ikke støttes av dataene.\n\n';

    // Exchange rates
    if (marketData.exchangeRates?.length) {
      context += 'VALUTAKURSER (siste 30 dager):\n';
      for (const rate of marketData.exchangeRates) {
        context += `- ${rate.pair}: ${rate.rate} per ${rate.date || 'siste'}. `;
        if (rate.change7d !== undefined && rate.change7d !== null) {
          const pct = rate.change7d.toFixed(2);
          context += `Endring siste 7 dager: ${rate.change7d > 0 ? '+' : ''}${pct}%.\n`;
          if (rate.pair === 'EUR/NOK') {
            if (rate.change7d < 0) {
              context += '  NOK har STYRKET seg mot EUR (billigere for nordmenn).\n';
            } else if (rate.change7d > 0) {
              context += '  NOK har SVEKKET seg mot EUR (dyrere for nordmenn).\n';
            } else {
              context += '  NOK er uendret mot EUR.\n';
            }
          }
          if (rate.pair === 'EUR/SEK') {
            if (rate.change7d < 0) {
              context += '  SEK har STYRKET seg mot EUR.\n';
            } else if (rate.change7d > 0) {
              context += '  SEK har SVEKKET seg mot EUR.\n';
            }
          }
        } else {
          context += '\n';
        }
      }
      context += '\n';
    }

    // ECB rate
    if (marketData.ecbRate) {
      context += `ECB STYRINGSRENTE: ${marketData.ecbRate.rate}%`;
      if (marketData.ecbRate.previousRate !== undefined) {
        context += ` (forrige: ${marketData.ecbRate.previousRate}%)\n`;
        if (marketData.ecbRate.rate < marketData.ecbRate.previousRate) {
          context += 'ECB har KUTTET renten.\n';
        } else if (marketData.ecbRate.rate > marketData.ecbRate.previousRate) {
          context += 'ECB har HEVET renten.\n';
        } else {
          context += 'ECB har HOLDT renten uendret.\n';
        }
      } else {
        context += '\n';
      }
      context += '\n';
    }

    if (marketData.interestRates) {
      const norway = marketData.interestRates.norway;
      const spain = marketData.interestRates.spain;
      context += 'RENTER OG BANKPÅSLAG:\n';
      if (norway) {
        context += `- Norge: Norges Bank styringsrente ${norway.policyRate}% per ${norway.policyRateDate}. `;
        context += `Praktisk bankpåslag: +${norway.bankMarkupMin}-${norway.bankMarkupMax} prosentpoeng. `;
        context += `Estimert norsk boliglånsrente: ${norway.estimatedMortgageMin}-${norway.estimatedMortgageMax}%.\n`;
        context += `  Merk: ${norway.note}\n`;
      }
      if (spain) {
        context += `- Eurosonen/Spania: ECB deposit ${spain.ecbDepositRate}%, MRO ${spain.ecbMainRefinancingRate}%, marginal lending ${spain.ecbMarginalLendingRate}% per ${spain.ecbRateDate}. `;
        context += `Praktisk spansk bankpåslag: +${spain.bankMarkupMin}-${spain.bankMarkupMax} prosentpoeng. `;
        context += `Estimert spansk lånerente: ${spain.estimatedMortgageMin}-${spain.estimatedMortgageMax}%.\n`;
        context += `  Merk: ${spain.note}\n`;
      }
      context += 'Bruk disse rentene som rådgivningskontekst for kjøpekraft, månedskostnad og timing, ikke som bindende banktilbud.\n\n';
    }

    // News
    if (marketData.idealistaNews?.length) {
      context += 'NYHETER FRA IDEALISTA:\n';
      for (const news of marketData.idealistaNews) {
        context += `- ${news.title}${news.date ? ` (${news.date})` : ''}\n`;
      }
      context += '\n';
    }

    // Perplexity real-time market intelligence
    if (marketData.perplexityInsights?.length) {
      context += 'MARKEDSINTELLIGENS (sanntidsdata fra internett):\n\n';
      for (const insight of marketData.perplexityInsights) {
        context += `--- ${insight.topic.toUpperCase()} ---\n`;
        context += `${insight.details}\n`;
        if (insight.sources?.length) {
          context += `Kilder: ${insight.sources.join(', ')}\n`;
        }
        context += '\n';
      }
      context += '\n';
    }

    // Internal metrics (kun for intern bruk, ikke del med omverden)
    if (marketData.internalMetrics) {
      const m = marketData.internalMetrics;
      context += 'INTERNE TALL (kun for kontekst, IKKE inkluder i ekstern rapport):\n';
      context += `- Totalt leads: ${m.totalLeads ?? 'Ukjent'}\n`;
      context += `- Totalt eiendommer: ${m.totalProperties ?? 'Ukjent'}\n`;
      context += '\n';
    }

    return context;
  }

  private buildSystemPrompt(
    templateId: string,
    options?: { theme?: string; brand?: string },
  ): string {
    if (templateId === DONA_ANNA_TEMPLATE_ID) {
      return `Du skriver på vegne av Dona Anna, et varmt og praktisk olivenolje-brand med røtter i Spania.

Regler:
- Skriv alltid på norsk (bokmål).
- Dette er IKKE en finansrapport, eiendomsrapport eller investoranalyse.
- Ikke bruk overskrifter eller metaforer om finansmarked, boligmarked, renter, eurokurs, investorer eller Costa Blanca-boligkjøp.
- Fokuser på olivenolje, smak, økonomisk smart hverdagsbruk, sesong på gården, kvalitet, bærekraftig drift, tilgjengelighet og enkel kundeverdi.
- Tonen skal være varm, personlig, ærlig og profesjonell.
- Ikke påstå sertifiseringer, økologimerker, helseeffekter eller lagerstatus hvis det ikke er eksplisitt oppgitt.
- Inkluder minst ett konkret brukstips eller en enkel serveringsidé.
- Svar med ren JSON i formatet beskrevet i brukerens melding.`;
    }

    const base = `Du er Freddy Bremseth, eiendomsekspert i Spania med dyp kunnskap om det spanske boligmarkedet, spesielt langs kysten. Du skriver markedsrapporter for RealtyFlow Pro.

Regler:
- Skriv alltid på norsk (bokmål).
- Vær analytisk og innsiktsfull, aldri robotisk.
- Bruk konkrete tall og eksempler fra MARKEDSINTELLIGENS-dataene (Perplexity-analyser).
- Fokuser på EKSTERN markedsdata: prisutvikling, transaksjonsvolum, rentetrender, utenlandske kjøpere, nye prosjekter.
- IKKE inkluder interne CRM-tall (leads, pipeline) i rapporten - disse er kun for kontekst.
- Varier skrivestilen: noen ganger narrativt, andre ganger datadrevet.
- Inkluder handlingsrettede innsikter og ekspertanalyse.
- Gjenta aldri samme struktur to ganger.
- Svar med ren JSON i formatet beskrevet i brukerens melding.
- Oppgi kilder når du refererer til spesifikke tall eller statistikk.

STRENG REGEL: Du skal ALDRI skrive noe som motsier tallene du får. Bruk alltid de eksakte tallene som er oppgitt. Hvis du er usikker på en trend, si det eksplisitt i stedet for å gjette.`;

    switch (templateId) {
      case REPORT_TEMPLATES.B.id:
        return `${base}

Spesielt for denne rapporten:
- Dyp geopolitisk og makro\u00f8konomisk analyse.
- Ha modige meninger. Ikke v\u00e6r redd for \u00e5 ta standpunkt.
- Knytt globale hendelser direkte til det spanske boligmarkedet.
- Tema: "${options?.theme ?? 'Generell makroanalyse'}"`;

      case REPORT_TEMPLATES.D.id:
        return `${base}

Spesielt for denne rapporten:
- Kort og konsist, bullet-point stil.
- Handlingsorientert \u2013 hva m\u00e5 gj\u00f8res f\u00f8r neste uke?
- Intern tone, direkte og uformell.`;

      case REPORT_TEMPLATES.C.id:
        return `${base}

Spesielt for denne rapporten:
- Dypdykk i brandet "${options?.brand ?? 'ukjent'}".
- Analyser brandets posisjon, styrker, svakheter og muligheter.
- Gi konkrete anbefalinger for neste kvartal.`;

      default:
        return base;
    }
  }

  private buildUserPrompt(
    templateId: string,
    marketData: any,
    options?: { theme?: string; brand?: string },
  ): string {
    const dateStr = new Date().toLocaleDateString('nb-NO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const season = norwegianSeason();

    if (templateId === DONA_ANNA_TEMPLATE_ID) {
      return `Dato: ${dateStr}
Sesong: ${season}
Brand: Dona Anna

Oppgave:
Lag et kundeklart sesongbrev for Dona Anna. Brevet skal handle om olivenolje, gårdsliv, smak, kvalitet, tilgjengelighet og hvordan kunden kan bruke oljen økonomisk smart i hverdagen.

Viktig avgrensning:
- Ikke skriv om finansmarkedet, boligmarkedet, renter, eurokurs, investorer eller eiendom.
- Ikke bruk tittelen "finansmarkedet blåser vår vei" eller lignende finansspråk.
- Ikke påstå at oljen er økologisk sertifisert, helbredende eller utsolgt/tilgjengelig hvis det ikke er oppgitt.
- Skriv som et profesjonelt nyhetsbrev som kan leses av kunder før sending.

Innholdet bør ha:
- En tittel som starter med "Dona Anna sesongbrev".
- En kort, varm ingress.
- 4-6 seksjoner, for eksempel "Hilsen fra gården", "Sesongen nå", "Olivenoljen", "Slik bruker du den", "Tilgjengelighet" og "Neste steg".
- Ett konkret mat- eller serveringstips.
- En tydelig, men rolig CTA som passer olivenoljekunder.

Generer rapporten og svar med følgende JSON-struktur (ingen markdown utenfor JSON):

{
  "title": "Dona Anna sesongbrev: ...",
  "subtitle": "Undertittel",
  "summary": "2-3 setninger som oppsummerer brevet",
  "key_metrics": [
    { "label": "Metrikk", "value": "Verdi", "change": "valgfritt" }
  ],
  "sections": [
    { "heading": "Seksjonstittel", "content": "Innhold med HTML-formatering tillatt" }
  ],
  "data_sources": ["Dona Anna merkevarekontekst", "Sesongbrev-mal"]
}`;
    }

    const dataJson = JSON.stringify(marketData, null, 2);
    const formattedContext = this.formatDataContext(marketData);

    return `Dato: ${dateStr}

${formattedContext}

Radata (for referanse):
\`\`\`json
${dataJson}
\`\`\`

${options?.theme ? `Tema: ${options.theme}` : ''}
${options?.brand ? `Brand i fokus: ${options.brand}` : ''}

Generer en komplett markedsrapport og svar med f\u00f8lgende JSON-struktur (ingen markdown utenfor JSON):

{
  "title": "Rapporttittel",
  "subtitle": "Undertittel",
  "summary": "2-3 setninger som oppsummerer rapporten",
  "key_metrics": [
    { "label": "Metrikk", "value": "Verdi", "change": "+/- endring" }
  ],
  "sections": [
    { "heading": "Seksjonstittel", "content": "Innhold med HTML-formatering tillatt" }
  ],
  "data_sources": ["Kilde 1", "Kilde 2"]
}`;
  }

  // -----------------------------------------------------------------------
  // Response Parsing
  // -----------------------------------------------------------------------

  private parseClaudeResponse(
    raw: string,
    templateId: string,
    template: (typeof REPORT_TEMPLATES)[TemplateKey],
    options?: { theme?: string; brand?: string },
  ): GeneratedReport {
    let parsed: any;
    try {
      // Try to extract JSON from the response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      if (templateId === DONA_ANNA_TEMPLATE_ID) {
        parsed = buildDonaAnnaFallbackParsed();
      } else {
        // If parsing fails, wrap raw text as a single-section report
        parsed = {
          title: template.name,
          subtitle: new Date().toLocaleDateString('nb-NO'),
          summary: raw.slice(0, 200),
          key_metrics: [],
          sections: [{ heading: template.name, content: raw }],
          data_sources: [],
        };
      }
    }

    if (templateId === DONA_ANNA_TEMPLATE_ID) {
      const parsedSections = Array.isArray(parsed.sections) ? parsed.sections : [];
      const combinedText = [
        parsed.title,
        parsed.subtitle,
        parsed.summary,
        ...parsedSections.flatMap((section: any) => [section?.heading, section?.content]),
      ]
        .filter(Boolean)
        .join('\n');

      if (looksLikeFinancialOrRealEstateContent(combinedText)) {
        parsed = buildDonaAnnaFallbackParsed();
      } else if (!String(parsed.title || '').toLowerCase().includes('dona anna')) {
        parsed.title = donaAnnaSeasonTitle();
      }
    }

    const sections: { heading: string; content: string }[] = parsed.sections ?? [];
    const contentHtml = sections
      .map((s: any) => `<h2>${s.heading}</h2>\n${s.content}`)
      .join('\n\n');
    const contentText = sections
      .map((s: any) => `## ${s.heading}\n${s.content.replace(/<[^>]+>/g, '')}`)
      .join('\n\n');

    return {
      id: randomUUID(),
      template_id: templateId,
      title: parsed.title ?? template.name,
      subtitle: parsed.subtitle ?? '',
      content_html: contentHtml,
      content_text: contentText,
      summary: parsed.summary ?? '',
      key_metrics: parsed.key_metrics ?? [],
      sections,
      theme: options?.theme,
      brand: options?.brand,
      recipients: TEMPLATE_RECIPIENTS[templateId] ?? 'all',
      generated_at: new Date().toISOString(),
      data_sources: parsed.data_sources ?? [],
    };
  }

  // -----------------------------------------------------------------------
  // Mock Report (when no API key)
  // -----------------------------------------------------------------------

  private buildMockReport(
    templateId: string,
    template: (typeof REPORT_TEMPLATES)[TemplateKey],
    options?: { theme?: string; brand?: string },
  ): GeneratedReport {
    if (templateId === DONA_ANNA_TEMPLATE_ID) {
      const parsed = buildDonaAnnaFallbackParsed();
      const contentHtml = parsed.sections
        .map((s) => `<h2>${s.heading}</h2>\n${s.content}`)
        .join('\n\n');
      const contentText = parsed.sections
        .map((s) => `## ${s.heading}\n${s.content.replace(/<[^>]+>/g, '')}`)
        .join('\n\n');

      return {
        id: randomUUID(),
        template_id: templateId,
        title: parsed.title,
        subtitle: parsed.subtitle,
        content_html: contentHtml,
        content_text: contentText,
        summary: parsed.summary,
        key_metrics: parsed.key_metrics,
        sections: parsed.sections,
        theme: options?.theme,
        brand: options?.brand ?? 'donaanna',
        recipients: TEMPLATE_RECIPIENTS[templateId] ?? 'donaanna',
        generated_at: new Date().toISOString(),
        data_sources: parsed.data_sources,
      };
    }

    const dateStr = new Date().toLocaleDateString('nb-NO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const sections = [
      {
        heading: 'Markedsoversikt',
        content:
          '<p>Dette er en plassholder-rapport generert uten AI. Sett <code>ANTHROPIC_API_KEY</code> for ekte rapporter.</p>',
      },
      {
        heading: 'N\u00f8kkeltall',
        content:
          '<p>EUR/NOK: 11.45 (+0.3%)<br>Norges Bank: 4.25% + bankpåslag<br>ECB MRO: 2.15% + spansk bankpåslag</p>',
      },
      {
        heading: 'Oppsummering',
        content:
          '<p>Markedet viser stabil vekst med \u00f8kt interesse fra nordiske kj\u00f8pere. Prisniv\u00e5et p\u00e5 kysten holder seg, med st\u00f8rst aktivitet i segmentet 200-400k EUR.</p>',
      },
    ];

    const contentHtml = sections
      .map((s) => `<h2>${s.heading}</h2>\n${s.content}`)
      .join('\n\n');
    const contentText = sections
      .map((s) => `## ${s.heading}\n${s.content.replace(/<[^>]+>/g, '')}`)
      .join('\n\n');

    return {
      id: randomUUID(),
      template_id: templateId,
      title: `${template.name} \u2013 ${dateStr}`,
      subtitle: 'Plassholder-rapport (mangler API-n\u00f8kkel)',
      content_html: contentHtml,
      content_text: contentText,
      summary:
        'Dette er en plassholder-rapport. Konfigurer ANTHROPIC_API_KEY for AI-genererte rapporter med ekte analyse og innsikt.',
      key_metrics: [
        { label: 'EUR/NOK', value: '11.45', change: '+0.3%' },
        { label: 'Norges Bank', value: '4.25%', change: 'Bank +1.25-2.00pp' },
        { label: 'ECB MRO', value: '2.15%', change: 'ES bank +0.75-1.75pp' },
      ],
      sections,
      theme: options?.theme,
      brand: options?.brand,
      recipients: TEMPLATE_RECIPIENTS[templateId] ?? 'all',
      generated_at: new Date().toISOString(),
      data_sources: ['placeholder'],
    };
  }

  // -----------------------------------------------------------------------
  // Email Formatting
  // -----------------------------------------------------------------------

  formatForEmail(report: GeneratedReport): { subject: string; html: string } {
    const subject = `${report.title}${report.subtitle ? ' \u2013 ' + report.subtitle : ''}`;
    const isDonaAnna = report.template_id === DONA_ANNA_TEMPLATE_ID || report.recipients === 'donaanna';
    const brandLabel = isDonaAnna ? 'Dona Anna' : 'RealtyFlow Pro';
    const productLabel = isDonaAnna ? 'Sesongbrev' : 'Market Intelligence';
    const accent = isDonaAnna ? '#f59e0b' : '#22d3ee';
    const accentBorder = isDonaAnna ? '#d97706' : '#0891b2';
    const headerGradient = isDonaAnna
      ? 'linear-gradient(135deg, #1c1917 0%, #78350f 100%)'
      : 'linear-gradient(135deg, #0f172a 0%, #164e63 100%)';

    const metricsCards = report.key_metrics
      .map(
        (m) => `
        <td style="padding: 8px;">
          <div style="background: #1e293b; border: 1px solid ${accentBorder}; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">
              ${m.label}
            </div>
            <div style="color: #f1f5f9; font-size: 24px; font-weight: 700;">
              ${m.value}
            </div>
            ${
              m.change
                ? `<div style="color: ${m.change.startsWith('+') ? '#34d399' : '#f87171'}; font-size: 13px; margin-top: 4px;">
                    ${m.change}
                  </div>`
                : ''
            }
          </div>
        </td>`,
      )
      .join('');

    const sectionsHtml = report.sections
      .map(
        (s) => `
        <tr>
          <td style="padding: 24px 32px;">
            <h2 style="color: ${accent}; font-size: 20px; font-weight: 600; margin: 0 0 12px 0; border-bottom: 1px solid #334155; padding-bottom: 8px;">
              ${s.heading}
            </h2>
            <div style="color: #cbd5e1; font-size: 15px; line-height: 1.7;">
              ${s.content}
            </div>
          </td>
        </tr>`,
      )
      .join('');

    const dateFormatted = new Date(report.generated_at).toLocaleDateString('nb-NO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const html = `<!DOCTYPE html>
<html lang="no">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background-color: #0f172a;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <!-- Container -->
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width: 640px; background-color: #1e293b; border-radius: 12px; overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="background: ${headerGradient}; padding: 32px; text-align: center;">
              <div style="color: ${accent}; font-size: 14px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px;">
                ${brandLabel}
              </div>
              <h1 style="color: #f1f5f9; font-size: 26px; font-weight: 700; margin: 0 0 8px 0;">
                ${report.title}
              </h1>
              ${
                report.subtitle
                  ? `<p style="color: #94a3b8; font-size: 15px; margin: 0;">${report.subtitle}</p>`
                  : ''
              }
              <p style="color: #64748b; font-size: 13px; margin: 12px 0 0 0;">
                ${dateFormatted}
              </p>
            </td>
          </tr>

          <!-- Summary -->
          <tr>
            <td style="padding: 24px 32px 0;">
              <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0; font-style: italic; border-left: 3px solid ${accentBorder}; padding-left: 16px;">
                ${report.summary}
              </p>
            </td>
          </tr>

          <!-- Key Metrics -->
          ${
            report.key_metrics.length > 0
              ? `
          <tr>
            <td style="padding: 24px 24px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                <tr>
                  ${metricsCards}
                </tr>
              </table>
            </td>
          </tr>`
              : ''
          }

          <!-- Sections -->
          ${sectionsHtml}

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #334155; text-align: center;">
              <p style="color: #64748b; font-size: 12px; margin: 0;">
                Sendt fra <span style="color: ${accent};">${brandLabel} ${productLabel}</span>
              </p>
              <p style="color: #475569; font-size: 11px; margin: 8px 0 0 0;">
                ${report.data_sources.length > 0 ? 'Kilder: ' + report.data_sources.join(', ') : ''}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject, html };
  }
}
