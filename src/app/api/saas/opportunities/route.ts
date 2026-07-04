import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-admin';
import { getSaasSupabase } from '@/lib/saas-api-supabase';
import { SaaSOpportunityScanner } from '@/services/saas/opportunity-scanner';

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

function getSupabase() {
  return getSaasSupabase();
}

/**
 * GET /api/saas/opportunities
 * List all opportunities with optional status filter
 */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { opportunities: [] });
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const supabase = getSupabase();

    if (!supabase) {
      // Return mock data if no DB
      const scanner = new SaaSOpportunityScanner();
      const { opportunities } = await scanner.discoverOpportunities();
      return NextResponse.json({
        opportunities: opportunities.map((o, i) => ({
          id: `mock-${i}`,
          ...o,
          status: 'discovered',
          created_at: new Date().toISOString(),
        })),
      });
    }

    let query = supabase
      .from('saas_opportunities')
      .select('*')
      .order('opportunity_score', { ascending: false })
      .order('created_at', { ascending: false });

    if (status) {
      if (status === 'active') {
        // All non-rejected, non-archived
        query = query.not('status', 'in', '("rejected","archived")');
      } else {
        query = query.eq('status', status);
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    // Also get latest discovery run info
    const { data: latestRun } = await supabase
      .from('saas_discovery_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      opportunities: data || [],
      latest_scan: latestRun || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/saas/opportunities
 * Actions: discover, refine, update_status, generate_build_prompt
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const { action } = body;
    const supabase = getSupabase();
    const scanner = new SaaSOpportunityScanner();

    switch (action) {
      // ── Discover new opportunities ───────────────────────────────
      case 'discover': {
        const { opportunities, raw_analysis } = await scanner.discoverOpportunities();

        if (supabase) {
          // Save opportunities
          const toInsert = opportunities.map((o) => ({
            title: o.title,
            slug: o.slug,
            description: o.description,
            category: o.category,
            problem_statement: o.problem_statement,
            target_audience: o.target_audience,
            market_size: o.market_size,
            competitor_count: o.competitor_count,
            competitors: o.competitors,
            competitor_weakness: o.competitor_weakness,
            opportunity_score: o.opportunity_score,
            suggested_pricing: o.suggested_pricing,
            estimated_mrr_potential: o.estimated_mrr_potential,
            monetization_strategy: o.monetization_strategy,
            tech_stack_suggestion: o.tech_stack_suggestion,
            build_complexity: o.build_complexity,
            estimated_build_days: o.estimated_build_days,
            mvp_features: o.mvp_features,
            differentiators: o.differentiators,
            trend_keywords: o.trend_keywords,
            trend_sources: o.trend_sources,
            trend_momentum: o.trend_momentum,
            search_volume_trend: o.search_volume_trend,
            status: 'discovered',
          }));

          const { data: inserted, error } = await supabase
            .from('saas_opportunities')
            .insert(toInsert)
            .select();

          if (error) {
            console.error('[SaaS Discovery] Insert error:', error);
          }

          // Log discovery run
          try {
            await supabase.from('saas_discovery_runs').insert({
              run_type: 'manual',
              opportunities_found: opportunities.length,
              categories_scanned: Array.from(new Set(opportunities.map((o) => o.category))),
              ai_model: 'claude-sonnet-4-20250514',
              raw_analysis,
            });
          } catch {
            // non-critical
          }

          return NextResponse.json({
            success: true,
            opportunities: inserted || toInsert,
            count: opportunities.length,
          });
        }

        return NextResponse.json({
          success: true,
          opportunities: opportunities.map((o, i) => ({ id: `new-${i}`, ...o, status: 'discovered' })),
          count: opportunities.length,
        });
      }

      // ── Update status (approve, reject, investigate, etc.) ──────
      case 'update_status': {
        const { id, status, user_feedback } = body;
        if (!id || !status) {
          return NextResponse.json({ error: 'id and status required' }, { status: 400 });
        }

        const updates: Record<string, unknown> = {
          status,
          updated_at: new Date().toISOString(),
        };

        if (user_feedback) updates.user_feedback = user_feedback;
        if (status === 'approved') updates.approved_at = new Date().toISOString();
        if (status === 'building') updates.build_started_at = new Date().toISOString();
        if (status === 'deployed') updates.deployed_at = new Date().toISOString();

        if (supabase) {
          const { data, error } = await supabase
            .from('saas_opportunities')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

          if (error) throw error;
          return NextResponse.json({ success: true, opportunity: data });
        }

        return NextResponse.json({ success: true, opportunity: { id, ...updates } });
      }

      // ── Refine an opportunity ───────────────────────────────────
      case 'refine': {
        const { id, title, description, category, target_audience, competitors, mvp_features, user_feedback } = body;

        const refined = await scanner.refineOpportunity({
          title,
          description,
          category,
          target_audience,
          competitors: competitors || [],
          mvp_features: mvp_features || [],
          user_feedback,
        });

        if (supabase && id) {
          const { data, error } = await supabase
            .from('saas_opportunities')
            .update({
              status: 'refining',
              business_plan: refined.business_plan,
              refinement_notes: refined.refinement_notes,
              mvp_features: refined.updated_mvp_features,
              differentiators: refined.updated_differentiators,
              suggested_pricing: refined.updated_pricing,
              updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

          if (error) throw error;
          return NextResponse.json({ success: true, opportunity: data, refined });
        }

        return NextResponse.json({ success: true, refined });
      }

      // ── Generate build prompt for Claude Code ──────────────────
      case 'generate_build_prompt': {
        const { id: oppId, title: oppTitle, slug: oppSlug, description: oppDesc, mvp_features: oppFeatures, tech_stack_suggestion: oppTech, business_plan: oppPlan, suggested_pricing: oppPricing } = body;

        const prompt = await scanner.generateBuildPrompt({
          title: oppTitle,
          slug: oppSlug,
          description: oppDesc,
          mvp_features: oppFeatures || [],
          tech_stack_suggestion: oppTech || ['next.js', 'supabase', 'stripe'],
          business_plan: oppPlan,
          suggested_pricing: oppPricing,
        });

        if (supabase && oppId) {
          await supabase
            .from('saas_opportunities')
            .update({
              status: 'approved',
              approved_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', oppId);
        }

        return NextResponse.json({ success: true, build_prompt: prompt });
      }

      // ── Go-To-Market strategy for an opportunity ────────────
      case 'go_to_market': {
        const { askClaude } = await import('@/services/ai/claude-client');
        const { title: gtmTitle, description: gtmDesc, target_audience: gtmAudience, suggested_pricing: gtmPricing, mvp_features: gtmFeatures, differentiators: gtmDiff } = body;

        const gtmPrompt = `Du er en SaaS go-to-market strateg. Lag en komplett lanseringsstrategi for:

SAAS: ${gtmTitle}
BESKRIVELSE: ${gtmDesc}
MÅLGRUPPE: ${gtmAudience}
PRISING: ${gtmPricing}
FEATURES: ${(gtmFeatures || []).join(', ')}
DIFFERENSIATORER: ${(gtmDiff || []).join(', ')}

Returner JSON:
{
  "icp": {
    "title": "Ideal Customer Profile",
    "demographics": "Hvem de er",
    "pain_points": ["Smertepunkt 1", "Smertepunkt 2"],
    "buying_triggers": ["Trigger 1", "Trigger 2"],
    "objections": ["Innvending 1", "Innvending 2"],
    "channels": ["Hvor du finner dem"]
  },
  "first_100_customers": {
    "strategy": "Overordnet strategi for første 100 kunder",
    "tactics": [
      { "channel": "Kanal", "action": "Konkret handling", "expected_leads": 20, "timeline": "Uke 1-2" }
    ]
  },
  "outreach_templates": {
    "cold_email": { "subject": "Emnelinje", "body": "E-posttekst med {name} og {company} variabler" },
    "linkedin_dm": "LinkedIn DM-mal",
    "facebook_post": "Facebook-gruppepost"
  },
  "content_plan": [
    { "day": 1, "platform": "LinkedIn", "type": "Post", "topic": "Emne", "hook": "Åpningslinje" }
  ],
  "seo_keywords": ["keyword1", "keyword2"],
  "launch_timeline": [
    { "week": 1, "focus": "Fokusområde", "milestones": ["Milepæl 1"] }
  ],
  "pricing_psychology": "Prispsykologi-strategi for konvertering"
}

Returner KUN valid JSON.`;

        const gtmText = await askClaude(gtmPrompt, { maxTokens: 3000, model: 'sonnet' });
        let gtmResult;
        try {
          gtmResult = extractJSON(gtmText);
        } catch {
          gtmResult = { error: 'Kunne ikke parse GTM-strategi', raw: gtmText };
        }

        return NextResponse.json({ success: true, gtm: gtmResult });
      }

      // ── Clone Competitor analysis ───────────────────────────────
      case 'clone_competitor': {
        const { askClaude } = await import('@/services/ai/claude-client');
        const { url, niche } = body;

        const clonePrompt = `Du er en SaaS-analytiker. Analyser denne konkurrenten og lag et forslag til en BEDRE versjon:

KONKURRENT URL: ${url}
NISJE/KATEGORI: ${niche || 'Ukjent'}

Basert på URL-en, analyser (bruk din kunnskap om populære SaaS-produkter):
1. Hva gjør dette produktet?
2. Hvem er målgruppen?
3. Hva tar de betalt?
4. Hva er svakhetene/manglene?

Returner JSON:
{
  "competitor_analysis": {
    "name": "Produktnavn",
    "description": "Hva de gjør",
    "target_audience": "Hvem de serverer",
    "pricing": "Prismodell",
    "strengths": ["Styrke 1", "Styrke 2"],
    "weaknesses": ["Svakhet 1", "Svakhet 2"],
    "missing_features": ["Manglende feature 1", "Manglende feature 2"],
    "bad_reviews_themes": ["Vanlig klage 1", "Vanlig klage 2"]
  },
  "better_version": {
    "title": "Navn på din bedre versjon",
    "slug": "url-slug",
    "description": "Hva din versjon gjør bedre",
    "usp": "Unique Selling Proposition",
    "why_now": "Hvorfor dette er riktig timing",
    "differentiators": ["Differensiator 1", "Differensiator 2"],
    "mvp_features": ["Feature 1", "Feature 2", "Feature 3"],
    "suggested_pricing": "Prisforslag",
    "estimated_mrr_potential": "MRR-estimat",
    "build_complexity": "simple|medium|complex",
    "estimated_build_days": 3,
    "opportunity_score": 80,
    "category": "ai|productivity|finance|health|education|ecommerce|developer-tools|real-estate|legal|marketing"
  }
}

Returner KUN valid JSON.`;

        const cloneText = await askClaude(clonePrompt, { maxTokens: 3000, model: 'sonnet' });
        let cloneResult;
        try {
          cloneResult = extractJSON(cloneText);
        } catch {
          cloneResult = { error: 'Kunne ikke analysere konkurrenten', raw: cloneText };
        }

        // Optionally save as new opportunity
        const bv = cloneResult.better_version as Record<string, unknown> | undefined;
        const ca = cloneResult.competitor_analysis as Record<string, unknown> | undefined;
        if (supabase && bv) {
          try {
            await supabase.from('saas_opportunities').insert({
              title: bv.title,
              slug: bv.slug,
              description: bv.description,
              category: bv.category || 'ai',
              problem_statement: `Bedre alternativ til ${ca?.name || url}`,
              target_audience: (ca?.target_audience as string) || '',
              competitor_count: 1,
              competitors: [ca?.name || url],
              competitor_weakness: ((ca?.weaknesses as string[]) || []).join(', '),
              opportunity_score: bv.opportunity_score || 75,
              suggested_pricing: bv.suggested_pricing,
              estimated_mrr_potential: bv.estimated_mrr_potential,
              monetization_strategy: bv.usp,
              tech_stack_suggestion: ['next.js', 'supabase', 'stripe', 'claude-api'],
              build_complexity: bv.build_complexity || 'medium',
              estimated_build_days: bv.estimated_build_days || 3,
              mvp_features: bv.mvp_features || [],
              differentiators: bv.differentiators || [],
              trend_momentum: 'rising',
              status: 'discovered',
            });
          } catch (insertErr) {
            console.error('[Clone Competitor] Insert error:', insertErr);
          }
        }

        return NextResponse.json({ success: true, clone: cloneResult });
      }

      // ── Deep scoring breakdown ──────────────────────────────────
      case 'deep_score': {
        const { askClaude } = await import('@/services/ai/claude-client');
        const { title: dsTitle, description: dsDesc, target_audience: dsAudience, competitor_count: dsCompCount, build_complexity: dsComplexity, trend_momentum: dsTrend, estimated_mrr_potential: dsMrr } = body;

        const scorePrompt = `Du er en SaaS-investeringsanalytiker. Gi en detaljert scoring (0-100) for denne muligheten:

SAAS: ${dsTitle}
BESKRIVELSE: ${dsDesc}
MÅLGRUPPE: ${dsAudience}
KONKURRENTER: ${dsCompCount}
KOMPLEKSITET: ${dsComplexity}
TREND: ${dsTrend}
MRR-POTENSIAL: ${dsMrr}

Returner JSON:
{
  "scores": {
    "market_demand": { "score": 75, "reason": "Kort forklaring" },
    "competition": { "score": 80, "reason": "Kort forklaring" },
    "ai_advantage": { "score": 90, "reason": "Kort forklaring" },
    "time_to_market": { "score": 70, "reason": "Kort forklaring" },
    "revenue_potential": { "score": 85, "reason": "Kort forklaring" },
    "willingness_to_pay": { "score": 65, "reason": "Kort forklaring" }
  },
  "overall_score": 78,
  "verdict": "BUILD|VALIDATE|SKIP",
  "verdict_reason": "Kort begrunnelse for verdict",
  "risks": ["Risiko 1", "Risiko 2"],
  "opportunities": ["Mulighet 1", "Mulighet 2"]
}

Returner KUN valid JSON.`;

        const scoreText = await askClaude(scorePrompt, { maxTokens: 1500, model: 'sonnet' });
        let scoreResult;
        try {
          scoreResult = extractJSON(scoreText);
        } catch {
          scoreResult = { error: 'Kunne ikke generere scoring' };
        }

        return NextResponse.json({ success: true, deep_score: scoreResult });
      }

      // ── 14-day customer acquisition plan ────────────────────────
      case 'customer_plan': {
        const { askClaude } = await import('@/services/ai/claude-client');
        const { brand, product_name, target_market } = body;

        const planPrompt = `Du er en SaaS-salgsstrateg som spesialiserer seg på rask kundeanskaffelse for norske gründere.

BRAND: ${brand || 'AI Property Advisor'}
PRODUKT: ${product_name || 'AI-drevet boligrådgivning for kjøpere i Spania'}
MÅLMARKED: ${target_market || 'Skandinaviske kjøpere av bolig i Spania'}

KONTEKST: Freddy Bremseth driver eiendomsvirksomhet i Spania med 25 års erfaring, har nettverk blant skandinaviske kjøpere, holder webinarer, og har AI-verktøy som analyserer eiendommer.

Lag en konkret 14-dagers plan for å skaffe de første 10 betalende kundene. IKKE generisk - KONKRET og handlingsbar.

Returner JSON:
{
  "goal": "10 betalende kunder på 14 dager",
  "offer": {
    "name": "Tilbudsnavn",
    "description": "Hva kunden får",
    "price": "€49-99",
    "hook": "Fengende hook",
    "upsell": "Hva du kan selge videre (€500-3000)"
  },
  "daily_plan": [
    {
      "day": 1,
      "focus": "Fokusområde",
      "tasks": [
        { "task": "Konkret oppgave", "detail": "Nøyaktig hva du gjør", "expected_result": "Forventet resultat" }
      ]
    }
  ],
  "outreach_messages": {
    "initial_contact": { "subject": "Emnelinje", "message": "Melding med {navn} variabel" },
    "follow_up_interest": "Oppfølgingsmelding når noen svarer 'ja interessant'",
    "deliver_value": "Melding med analysresultat og CTA",
    "close_sale": "Salgsmeldingen"
  },
  "email_sequence": [
    { "day": 0, "subject": "Emnelinje", "body": "E-posttekst", "purpose": "Formål" }
  ],
  "webinar": {
    "title": "Webinar-tittel",
    "outline": ["Punkt 1", "Punkt 2", "Punkt 3"],
    "cta": "Call to action"
  },
  "kpis": {
    "messages_sent": 50,
    "expected_responses": 15,
    "expected_analyses": 5,
    "expected_customers": "2-3 per uke"
  },
  "channels": [
    { "channel": "Facebook-grupper", "action": "Post i 'Nordmenn i Spania'", "frequency": "2x/uke" }
  ]
}

Returner KUN valid JSON.`;

        const planText = await askClaude(planPrompt, { maxTokens: 4000, model: 'sonnet' });
        let planResult;
        try {
          planResult = extractJSON(planText);
        } catch {
          planResult = { error: 'Kunne ikke generere kundeplan' };
        }

        return NextResponse.json({ success: true, customer_plan: planResult });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[SaaS Opportunities] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/saas/opportunities
 * Update opportunity fields
 */
export async function PATCH(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  try {
    const { id, ...updates } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 503 });

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('saas_opportunities')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, opportunity: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
  }
}
