import Anthropic from '@anthropic-ai/sdk';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SaaSOpportunity {
  title: string;
  slug: string;
  description: string;
  category: string;
  problem_statement: string;
  target_audience: string;
  market_size: string;
  competitor_count: number;
  competitors: string[];
  competitor_weakness: string;
  opportunity_score: number;
  suggested_pricing: string;
  estimated_mrr_potential: string;
  monetization_strategy: string;
  tech_stack_suggestion: string[];
  build_complexity: 'simple' | 'medium' | 'complex';
  estimated_build_days: number;
  mvp_features: string[];
  differentiators: string[];
  trend_keywords: string[];
  trend_sources: string[];
  trend_momentum: 'rising' | 'stable' | 'peaking' | 'declining';
  search_volume_trend: string;
}

export interface RefinedConcept {
  business_plan: string;
  refinement_notes: string;
  updated_mvp_features: string[];
  updated_differentiators: string[];
  updated_pricing: string;
  build_plan: string;
}

// ─── SaaS Opportunity Scanner ────────────────────────────────────────────────

export class SaaSOpportunityScanner {
  private client: Anthropic | null = null;

  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
  }

  /**
   * Scans for SaaS opportunities using AI analysis of current trends
   * Focuses on underserved niches where a solo dev can compete
   */
  async discoverOpportunities(): Promise<{
    opportunities: SaaSOpportunity[];
    raw_analysis: string;
  }> {
    if (!this.client) {
      return { opportunities: this.getMockOpportunities(), raw_analysis: 'Mock data - no API key' };
    }

    const systemPrompt = `Du er en elite SaaS-markedsanalytiker og seriegrunder. Du jobber for Freddy Bremseth som driver ChatGenius.pro - en SaaS-plattform med AI-drevne micro-SaaS apper.

DITT MÅL: Finn 4-6 SaaS-muligheter som en solo-utvikler med Claude Code kan bygge på 1-5 dager og tjene penger på.

VIKTIGE KRITERIER:
- IKKE foreslå det mest populære/overmettet (f.eks. "yet another project management tool")
- Fokuser på nisjer med FÅ tilbydere (1-5 konkurrenter) men klar etterspørsel
- Prioriter muligheter der AI gir en urettferdig fordel
- Alt bygges med Next.js + Supabase + Stripe + Vercel + Claude API
- Prisen bør være $9-49/mnd for å treffe "impuls-kjøp"-segmentet
- Målgrupper: SMB, freelancere, nisje-profesjonelle (eiendomsmeglere, coaches, etc.)
- Vurder hva som trender nå i 2026 innen AI, automasjon og nisje-SaaS

TREND-KATEGORIER Å ANALYSERE:
1. AI-verktøy for spesifikke profesjoner
2. Automasjonsverktøy for repetitive oppgaver
3. Nisje-CRM/dashboards for bestemte bransjer
4. Content/marketing-verktøy med AI
5. Dataanalyse/rapportering for spesifikke use-cases
6. Compliance/regulering-verktøy
7. Integrasjons-broer mellom populære verktøy

RETURFORMAT: JSON-array med objekter. Hvert objekt MÅ ha:
{
  "title": "Kort navn på SaaS-ideen",
  "slug": "url-slug",
  "description": "2-3 setninger om hva det er",
  "category": "ai|productivity|finance|health|education|ecommerce|developer-tools|real-estate|legal|marketing",
  "problem_statement": "Hvilket problem løser det?",
  "target_audience": "Hvem betaler for dette?",
  "market_size": "Estimert marked (eks: '$500M TAM, 50k potential customers')",
  "competitor_count": 2,
  "competitors": ["Konkurrent 1", "Konkurrent 2"],
  "competitor_weakness": "Hva gjør konkurrentene dårlig?",
  "opportunity_score": 78,
  "suggested_pricing": "Free tier + $19/mo Pro + $49/mo Business",
  "estimated_mrr_potential": "$3k-8k innen 6 mnd",
  "monetization_strategy": "Freemium med AI-genererte credits",
  "tech_stack_suggestion": ["next.js", "supabase", "stripe", "claude-api"],
  "build_complexity": "simple|medium|complex",
  "estimated_build_days": 3,
  "mvp_features": ["Feature 1", "Feature 2", "Feature 3"],
  "differentiators": ["Hva gjør denne unik vs konkurrenter"],
  "trend_keywords": ["ai assistant", "niche tool"],
  "trend_sources": ["Product Hunt", "Indie Hackers", "Reddit"],
  "trend_momentum": "rising|stable|peaking|declining",
  "search_volume_trend": "Beskrivelse av søketrend"
}

opportunity_score beregnes slik:
- Lav konkurranse (0-3 konkurrenter): +30
- Klar betalingsvilje i målgruppen: +20
- Kan bygges på <3 dager: +15
- AI gir klar fordel: +15
- Trend er stigende: +10
- MRR-potensial >$5k: +10

Returner KUN valid JSON-array, ingen annen tekst.`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Dato: ${new Date().toISOString().split('T')[0]}. Analyser dagens SaaS-marked og finn 4-6 underserverte nisjer med lavt antall tilbydere der vi kan bygge en lønnsom micro-SaaS. Fokuser på hva som trender akkurat nå og hvor det finnes hull i markedet.`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      // Extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array found in response');

      const opportunities: SaaSOpportunity[] = JSON.parse(jsonMatch[0]);
      return { opportunities, raw_analysis: text };
    } catch {
      console.error('[SaaSScanner] Failed to parse AI response');
      return { opportunities: this.getMockOpportunities(), raw_analysis: text };
    }
  }

  /**
   * Refine a specific opportunity - deep research and business plan
   */
  async refineOpportunity(opportunity: {
    title: string;
    description: string;
    category: string;
    target_audience: string;
    competitors: string[];
    mvp_features: string[];
    user_feedback?: string;
  }): Promise<RefinedConcept> {
    if (!this.client) {
      return {
        business_plan: `# ${opportunity.title}\n\nBusiness plan placeholder - set ANTHROPIC_API_KEY for real analysis.`,
        refinement_notes: 'Mock refinement',
        updated_mvp_features: opportunity.mvp_features,
        updated_differentiators: ['AI-powered', 'Simple UX', 'Fair pricing'],
        updated_pricing: 'Free + $19/mo Pro',
        build_plan: '1. Setup Next.js\n2. Build core features\n3. Add auth & billing\n4. Deploy',
      };
    }

    const userContext = opportunity.user_feedback
      ? `\n\nBRUKERENS TILBAKEMELDING/ØNSKER:\n${opportunity.user_feedback}`
      : '';

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: `Du er en erfaren SaaS-rådgiver og teknisk arkitekt. Du skal lage en komplett, handlingsklar forretningsplan for en micro-SaaS.

Returner et JSON-objekt med:
{
  "business_plan": "Komplett forretningsplan i Markdown med seksjoner: Sammendrag, Problem, Løsning, Målgruppe, Konkurranse, Go-to-Market, Prismodell, MVP-scope, Vekststrategi, Risiko",
  "refinement_notes": "Kort oppsummering av forbedringer fra original idé",
  "updated_mvp_features": ["Oppdatert liste med MVP-features, prioritert"],
  "updated_differentiators": ["Hva gjør denne unik"],
  "updated_pricing": "Detaljert prismodell med tiers",
  "build_plan": "Steg-for-steg teknisk plan for å bygge med Claude Code, Next.js, Supabase, Stripe. Inkluder dag-for-dag plan."
}

Returner KUN valid JSON, ingen annen tekst.`,
      messages: [
        {
          role: 'user',
          content: `Forfin og lag komplett forretningsplan for denne SaaS-ideen:

TITTEL: ${opportunity.title}
BESKRIVELSE: ${opportunity.description}
KATEGORI: ${opportunity.category}
MÅLGRUPPE: ${opportunity.target_audience}
KONKURRENTER: ${opportunity.competitors.join(', ')}
MVP-FEATURES: ${opportunity.mvp_features.join(', ')}${userContext}

Lag en grundig, realistisk plan som en solo-utvikler kan følge for å bygge og lansere dette som en ChatGenius.pro subdomain-app.`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      return JSON.parse(jsonMatch[0]);
    } catch {
      return {
        business_plan: text,
        refinement_notes: 'Could not parse structured response',
        updated_mvp_features: opportunity.mvp_features,
        updated_differentiators: [],
        updated_pricing: '',
        build_plan: '',
      };
    }
  }

  /**
   * Generate a Claude Code build prompt for an approved opportunity
   */
  async generateBuildPrompt(opportunity: {
    title: string;
    slug: string;
    description: string;
    mvp_features: string[];
    tech_stack_suggestion: string[];
    business_plan?: string;
    suggested_pricing?: string;
  }): Promise<string> {
    if (!this.client) {
      return `Build ${opportunity.title} - set ANTHROPIC_API_KEY for detailed prompt.`;
    }

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      system: `Du er en ekspert på å skrive prompts for Claude Code (Anthropic's AI coding tool). Du skal lage en komplett, klar prompt som en utvikler kan gi til Claude Code for å bygge en hel SaaS-app fra scratch.

Prompten skal inkludere:
1. Prosjektnavn og beskrivelse
2. Tech stack: Next.js 14 (App Router), Tailwind CSS, Supabase (auth + DB), Stripe (billing), Vercel (deploy)
3. Komplett filstruktur
4. Database schema (Supabase SQL)
5. Alle sider og komponenter
6. API routes
7. Auth-flow
8. Stripe-integrasjon med prismodell
9. Deploy-instruksjoner

Skriv prompten PÅ ENGELSK (Claude Code forstår det best), men i en steg-for-steg format som Claude Code kan følge autonomt.`,
      messages: [
        {
          role: 'user',
          content: `Lag en komplett Claude Code build-prompt for:

APP: ${opportunity.title}
SLUG: ${opportunity.slug} (subdomain: ${opportunity.slug}.chatgenius.pro)
BESKRIVELSE: ${opportunity.description}
FEATURES: ${opportunity.mvp_features.join(', ')}
TECH: ${opportunity.tech_stack_suggestion.join(', ')}
PRICING: ${opportunity.suggested_pricing || 'Freemium + Pro tier'}
${opportunity.business_plan ? `\nBUSINESS PLAN:\n${opportunity.business_plan.substring(0, 2000)}` : ''}

Prompten skal gjøre at Claude Code kan bygge hele appen autonomt.`,
        },
      ],
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  private getMockOpportunities(): SaaSOpportunity[] {
    return [
      {
        title: 'RentRadar AI',
        slug: 'rentradar',
        description: 'AI-drevet analyse av utleiemarkedet som hjelper utleiere å sette optimal husleie basert på lokale data, sesong og tilstand.',
        category: 'real-estate',
        problem_statement: 'Utleiere setter priser basert på magefølelse, ikke data. Taper 10-30% potensielle inntekter.',
        target_audience: 'Private utleiere med 1-10 enheter, property managers',
        market_size: '$2B TAM, 8M private utleiere i Europa',
        competitor_count: 2,
        competitors: ['Rentometer', 'Zillow Rent Zestimate'],
        competitor_weakness: 'Kun US-fokus, ingen AI-analyse av tilstand/oppgraderinger, dyr',
        opportunity_score: 82,
        suggested_pricing: 'Free: 1 analyse/mnd, Pro $19/mo: unlimited + alerts, Agency $49/mo: teams + API',
        estimated_mrr_potential: '$5k-12k innen 6 mnd',
        monetization_strategy: 'Freemium med begrenset analyse, Pro for alerts og historikk',
        tech_stack_suggestion: ['next.js', 'supabase', 'stripe', 'claude-api', 'mapbox'],
        build_complexity: 'medium',
        estimated_build_days: 4,
        mvp_features: ['Adresse-søk med markedsanalyse', 'AI prisforslag', 'Konkurrentsammenligning', 'Månedlig trendrapport'],
        differentiators: ['Europeisk fokus', 'AI-analyse av oppgraderinger', 'Sesongbasert prising'],
        trend_keywords: ['rental pricing', 'landlord tools', 'property management ai'],
        trend_sources: ['Product Hunt', 'Reddit r/landlord', 'Indie Hackers'],
        trend_momentum: 'rising',
        search_volume_trend: 'Stigende 40% YoY for "AI rental pricing"',
      },
      {
        title: 'ComplianceBot',
        slug: 'compliancebot',
        description: 'AI-assistent som hjelper små bedrifter å holde seg compliant med GDPR, cookie-lover og bransje-reguleringer.',
        category: 'legal',
        problem_statement: 'SMBer bruker €2-5k/år på advokater for compliance som AI kan automatisere 80% av.',
        target_audience: 'SMBer med 1-50 ansatte, SaaS-startups, e-commerce',
        market_size: '$1.5B TAM, compliance-markedet vokser 15% årlig',
        competitor_count: 3,
        competitors: ['Vanta', 'Drata', 'OneTrust'],
        competitor_weakness: 'Enterprise-priser ($10k+/år), overkomplekst for SMBer',
        opportunity_score: 75,
        suggested_pricing: 'Free: compliance-sjekk, Pro $29/mo: auto-dokumenter, Business $79/mo: full audit',
        estimated_mrr_potential: '$8k-20k innen 6 mnd',
        monetization_strategy: 'Freemium compliance-scanner, betalt for auto-generering av policies',
        tech_stack_suggestion: ['next.js', 'supabase', 'stripe', 'claude-api'],
        build_complexity: 'medium',
        estimated_build_days: 5,
        mvp_features: ['GDPR compliance-sjekk', 'Auto-generer privacy policy', 'Cookie consent setup', 'Månedlig compliance-rapport'],
        differentiators: ['SMB-priser', 'Norsk/europeisk fokus', 'AI-genererte dokumenter'],
        trend_keywords: ['gdpr compliance', 'ai legal', 'small business compliance'],
        trend_sources: ['Hacker News', 'EU regulation news'],
        trend_momentum: 'rising',
        search_volume_trend: 'Økende pga nye EU AI Act reguleringer',
      },
      {
        title: 'PitchCraft AI',
        slug: 'pitchcraft',
        description: 'AI som lager profesjonelle pitch decks, forretningsplaner og investor-presentasjoner fra en kort beskrivelse.',
        category: 'productivity',
        problem_statement: 'Gründere bruker 20+ timer på pitch decks. De fleste har dårlig design og mangler nøkkelmetrikker.',
        target_audience: 'Startup-gründere, freelancere, konsulenter',
        market_size: '$800M TAM, 300M presentasjoner lages årlig globalt',
        competitor_count: 3,
        competitors: ['Beautiful.ai', 'Tome', 'Gamma'],
        competitor_weakness: 'Generiske templates, ikke spesialisert for fundraising/salg',
        opportunity_score: 71,
        suggested_pricing: 'Free: 1 deck/mnd, Pro $15/mo: unlimited + export, Team $39/mo: collaboration',
        estimated_mrr_potential: '$4k-10k innen 6 mnd',
        monetization_strategy: 'Freemium med PDF/PPT eksport som premium-feature',
        tech_stack_suggestion: ['next.js', 'supabase', 'stripe', 'claude-api', 'react-pdf'],
        build_complexity: 'medium',
        estimated_build_days: 5,
        mvp_features: ['Input: bedriftsbeskrivelse → Output: komplett pitch deck', 'Investor-ready format', 'PDF/PPT eksport', '5 templates'],
        differentiators: ['Spesialisert for fundraising', 'AI skriver innhold, ikke bare design', 'Norsk/engelsk'],
        trend_keywords: ['ai pitch deck', 'startup pitch generator', 'ai presentation'],
        trend_sources: ['Product Hunt', 'Y Combinator forums'],
        trend_momentum: 'rising',
        search_volume_trend: 'Stabil høy etterspørsel, lite god konkurranse under $20/mo',
      },
    ];
  }
}
