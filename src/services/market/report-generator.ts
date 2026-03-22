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

function templateById(id: string): (typeof REPORT_TEMPLATES)[TemplateKey] | undefined {
  return Object.values(REPORT_TEMPLATES).find((t) => t.id === id);
}

function templateKeyById(id: string): TemplateKey | undefined {
  return (Object.keys(REPORT_TEMPLATES) as TemplateKey[]).find(
    (k) => REPORT_TEMPLATES[k].id === id,
  );
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
      model: 'claude-sonnet-4-20250514',
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
    if (marketData.internalMetrics) {
      report.key_metrics.push(
        { label: 'Pipeline', value: `\u20AC${(marketData.internalMetrics.pipelineValue || 0).toLocaleString()}` },
        { label: 'Nye Leads', value: `${marketData.internalMetrics.newLeadsWeek || 0}` },
      );
    }

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

    // News
    if (marketData.idealistaNews?.length) {
      context += 'NYHETER FRA IDEALISTA:\n';
      for (const news of marketData.idealistaNews) {
        context += `- ${news.title}${news.date ? ` (${news.date})` : ''}\n`;
      }
      context += '\n';
    }

    // Internal metrics
    if (marketData.internalMetrics) {
      const m = marketData.internalMetrics;
      context += 'INTERNE TALL:\n';
      context += `- Totalt leads: ${m.totalLeads ?? 'Ukjent'}\n`;
      context += `- Nye leads siste 7 dager: ${m.newLeadsWeek ?? 'Ukjent'}\n`;
      context += `- Pipeline-verdi: ${m.pipelineValue !== undefined ? m.pipelineValue + ' EUR' : 'Ukjent'}\n`;
      context += `- Totalt eiendommer: ${m.totalProperties ?? 'Ukjent'}\n`;
      context += `- Nye oppforinger siste uke: ${m.newListingsWeek ?? 'Ukjent'}\n`;
      context += '\n';
    }

    return context;
  }

  private buildSystemPrompt(
    templateId: string,
    options?: { theme?: string; brand?: string },
  ): string {
    const base = `Du er Freddy Bremseth, eiendomsekspert i Spania med dyp kunnskap om det spanske boligmarkedet, spesielt langs kysten. Du skriver markedsrapporter for RealtyFlow Pro.

Regler:
- Skriv alltid p\u00e5 norsk (bokm\u00e5l).
- V\u00e6r analytisk og innsiktsfull, aldri robotisk.
- Bruk konkrete tall og eksempler.
- Varier skrivestilen: noen ganger narrativt, andre ganger datadrevet.
- Inkluder handlingsrettede innsikter.
- Gjenta aldri samme struktur to ganger.
- Svar med ren JSON i formatet beskrevet i brukerens melding.

STRENG REGEL: Du skal ALDRI skrive noe som motsier tallene du far. Hvis EUR/NOK har falt (NOK styrket seg), skal du IKKE skrive at kronen svekker seg. Bruk alltid de eksakte tallene som er oppgitt. Hvis du er usikker pa en trend, si det eksplisitt i stedet for a gjette.`;

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

      case REPORT_TEMPLATES.E.id:
        return `${base}

Spesielt for denne rapporten:
- Varm, personlig tone. Du skriver fra g\u00e5rden Dona Anna.
- Fokus p\u00e5 olivenoljeproduksjon, sesong og g\u00e5rdsliv.
- Inkluder en oppskrift eller et tips.`;

      default:
        return base;
    }
  }

  private buildUserPrompt(
    templateId: string,
    marketData: any,
    options?: { theme?: string; brand?: string },
  ): string {
    const dataJson = JSON.stringify(marketData, null, 2);
    const formattedContext = this.formatDataContext(marketData);
    const dateStr = new Date().toLocaleDateString('nb-NO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

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
          '<p>EUR/NOK: 11.45 (+0.3%)<br>ECB-rente: 3.75%<br>Nye annonser Costa del Sol: 1 247</p>',
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
        { label: 'ECB-rente', value: '3.75%' },
        { label: 'Nye annonser', value: '1 247', change: '+5.2%' },
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

    const metricsCards = report.key_metrics
      .map(
        (m) => `
        <td style="padding: 8px;">
          <div style="background: #1e293b; border: 1px solid #0891b2; border-radius: 8px; padding: 16px; text-align: center;">
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
            <h2 style="color: #22d3ee; font-size: 20px; font-weight: 600; margin: 0 0 12px 0; border-bottom: 1px solid #334155; padding-bottom: 8px;">
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
            <td style="background: linear-gradient(135deg, #0f172a 0%, #164e63 100%); padding: 32px; text-align: center;">
              <div style="color: #22d3ee; font-size: 14px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px;">
                RealtyFlow Pro
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
              <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0; font-style: italic; border-left: 3px solid #0891b2; padding-left: 16px;">
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
                Generated by <span style="color: #22d3ee;">RealtyFlow Pro Market Intelligence</span>
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
