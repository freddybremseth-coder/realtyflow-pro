import Anthropic from '@anthropic-ai/sdk';
import { BRANDS } from '@/lib/constants';
import type { Brand } from '@/types';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface GrowthActionMetrics {
  impressions?: number;
  clicks?: number;
  conversions?: number;
  engagement_rate?: number;
  shares?: number;
  leads_generated?: number;
}

export interface GrowthAction {
  id: string;
  brand: string;
  action_type: string;
  platform: string;
  content: string;
  content_b?: string;
  hypothesis: string;
  expected_outcome: string;
  priority: number;
  status: 'planned' | 'ready' | 'published' | 'completed' | 'failed';
  metrics?: GrowthActionMetrics;
  metrics_b?: GrowthActionMetrics;
  ab_winner?: 'a' | 'b' | null;
  learnings?: string;
  created_at: string;
  executed_at?: string;
  reviewed_at?: string;
}

export interface GrowthStrategy {
  brand: string;
  current_followers: Record<string, number>;
  target_followers: Record<string, number>;
  best_performing: string[];
  worst_performing: string[];
  recommended_focus: string[];
  weekly_action_plan: GrowthAction[];
}

export interface LeadMagnet {
  id: string;
  brand: string;
  title: string;
  description: string;
  type: 'ebook' | 'checklist' | 'webinar' | 'template' | 'calculator' | 'guide' | 'quiz';
  landing_page_headline: string;
  landing_page_subheadline: string;
  cta_text: string;
  email_sequence: { subject: string; body: string; delay_days: number }[];
  target_audience: string;
  status: 'draft' | 'active' | 'paused';
}

export interface RunGrowthCycleOptions {
  /**
   * Persist generated actions through the engine-owned Supabase client.
   * Defaults to true when the engine was constructed with Supabase.
   */
  persist?: boolean;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionType =
  | 'social_post'
  | 'lead_magnet'
  | 'email_campaign'
  | 'ab_test'
  | 'viral_content'
  | 'engagement'
  | 'collaboration'
  | 'seo_content';

interface BrandPerformance {
  brand: string;
  total_actions: number;
  completed_actions: number;
  win_rate: number;
  avg_engagement_rate: number;
  avg_conversions: number;
  best_action_types: string[];
  worst_action_types: string[];
  best_platforms: string[];
}

interface AnalysisResult {
  insights: string[];
  recommendations: string[];
}

interface SupabaseClient {
  from(table: string): {
    select(columns?: string): any;
    insert(data: any): any;
    update(data: any): any;
    delete(): any;
    upsert(data: any): any;
  };
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class AutonomousGrowthEngine {
  private anthropic: Anthropic | null = null;
  private supabase: SupabaseClient | null = null;

  private readonly SYSTEM_PROMPT = `Du er en vekstekspert som jobber for Freddy Bremseth. Du styrer 7 brands og din jobb er å maksimere vekst, følgere, leads og inntekt. Du tenker som en growth hacker - kreativ, datadrevet og uredd.

Du har tilgang til data om hvert brand sin ytelse og skal generere konkrete, handlingsrettede veksttiltak.

Brands du styrer:
1. Soleada.no - Premium spansk eiendom for skandinaviske kjøpere
2. Zen Eco Homes - Bærekraftige boliger i Spania
3. ChatGenius.pro - AI-drevet chatplattform (SaaS)
4. Dona Anna - Premium olivenolje og bærekraftig landbruk
5. Freddy Bremseth - Personlig merkevare, gründer og eiendomsekspert
6. Pinoso Ecolife - Bærekraftig landliv i Pinosos, Alicante
7. Neural Beat - AI-drevet EDM og elektronisk musikkproduksjon

Svar ALLTID i gyldig JSON-format.`;

  constructor(supabase?: SupabaseClient) {
    if (supabase) {
      this.supabase = supabase;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    }
  }

  // ─── Main Cycle ───────────────────────────────────────────────────────────

  async runCycle(
    brands?: string[],
    options: RunGrowthCycleOptions = {}
  ): Promise<GrowthAction[]> {
    const targetBrands = brands
      ? BRANDS.filter((b) => brands.includes(b.id))
      : BRANDS;

    if (targetBrands.length === 0) {
      return [];
    }

    // 1. Analyze current state per brand
    const performances = await Promise.all(
      targetBrands.map((b) => this.analyzeBrandPerformance(b.id))
    );

    // 2. Generate growth actions
    const actions = await this.generateGrowthActions(targetBrands, performances);

    // 3. Execute/prepare actions
    const preparedActions = await this.prepareActions(actions);

    // 4. Save to Supabase. Keep persistence owned by the engine so API routes
    // and cron jobs do not accidentally insert the same generated actions twice.
    const shouldPersist = options.persist ?? true;
    if (this.supabase && shouldPersist) {
      await this.saveActions(preparedActions);
    }

    return preparedActions;
  }

  // ─── Performance Analysis ─────────────────────────────────────────────────

  private async analyzeBrandPerformance(
    brandId: string
  ): Promise<BrandPerformance> {
    const defaultPerformance: BrandPerformance = {
      brand: brandId,
      total_actions: 0,
      completed_actions: 0,
      win_rate: 0,
      avg_engagement_rate: 0,
      avg_conversions: 0,
      best_action_types: [],
      worst_action_types: [],
      best_platforms: [],
    };

    if (!this.supabase) {
      return defaultPerformance;
    }

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: actions, error } = await this.supabase
        .from('growth_actions')
        .select('*')
        .eq('brand', brandId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (error || !actions || actions.length === 0) {
        return defaultPerformance;
      }

      const completed = actions.filter(
        (a: GrowthAction) => a.status === 'completed'
      );
      const withMetrics = completed.filter(
        (a: GrowthAction) => a.metrics
      );

      // Calculate engagement rates
      const engagementRates = withMetrics
        .map((a: GrowthAction) => a.metrics?.engagement_rate ?? 0)
        .filter((r: number) => r > 0);
      const avgEngagement =
        engagementRates.length > 0
          ? engagementRates.reduce((s: number, v: number) => s + v, 0) /
            engagementRates.length
          : 0;

      // Calculate conversions
      const conversions = withMetrics
        .map((a: GrowthAction) => a.metrics?.conversions ?? 0)
        .filter((c: number) => c > 0);
      const avgConversions =
        conversions.length > 0
          ? conversions.reduce((s: number, v: number) => s + v, 0) /
            conversions.length
          : 0;

      // Identify best/worst action types
      const typePerformance = this.groupPerformanceByField(
        withMetrics,
        'action_type'
      );
      const platformPerformance = this.groupPerformanceByField(
        withMetrics,
        'platform'
      );

      return {
        brand: brandId,
        total_actions: actions.length,
        completed_actions: completed.length,
        win_rate:
          actions.length > 0 ? completed.length / actions.length : 0,
        avg_engagement_rate: avgEngagement,
        avg_conversions: avgConversions,
        best_action_types: typePerformance.best,
        worst_action_types: typePerformance.worst,
        best_platforms: platformPerformance.best,
      };
    } catch {
      return defaultPerformance;
    }
  }

  private groupPerformanceByField(
    actions: GrowthAction[],
    field: 'action_type' | 'platform'
  ): { best: string[]; worst: string[] } {
    const groups: Record<string, number[]> = {};

    for (const action of actions) {
      const key = action[field];
      if (!key) continue;
      if (!groups[key]) groups[key] = [];
      groups[key].push(action.metrics?.engagement_rate ?? 0);
    }

    const averages = Object.entries(groups).map(([key, rates]) => ({
      key,
      avg: rates.reduce((s, v) => s + v, 0) / rates.length,
    }));

    averages.sort((a, b) => b.avg - a.avg);

    return {
      best: averages.slice(0, 3).map((a) => a.key),
      worst: averages
        .slice(-3)
        .reverse()
        .map((a) => a.key),
    };
  }

  // ─── AI Generation ────────────────────────────────────────────────────────

  private async generateGrowthActions(
    brands: Brand[],
    performances: BrandPerformance[]
  ): Promise<GrowthAction[]> {
    if (!this.anthropic) {
      return this.generateMockActions(brands);
    }

    try {
      const brandContext = brands
        .map((b, i) => {
          const perf = performances[i];
          return `
Brand: ${b.name} (${b.id})
Type: ${b.type}
Tone: ${b.tone || 'professional'}
Target: ${b.target_audience || 'general'}
Specialties: ${b.specialties?.join(', ') || 'N/A'}
Performance (30d): ${perf.total_actions} actions, ${(perf.win_rate * 100).toFixed(0)}% completion, ${(perf.avg_engagement_rate * 100).toFixed(1)}% engagement
Best types: ${perf.best_action_types.join(', ') || 'no data'}
Best platforms: ${perf.best_platforms.join(', ') || 'no data'}`;
        })
        .join('\n---\n');

      const message = await this.anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: this.SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Analyser følgende brands og generer 3-5 spesifikke vekstaksjoner for HVER brand.

${brandContext}

For HVER aksjon, gi meg:
- action_type: en av 'social_post', 'lead_magnet', 'email_campaign', 'ab_test', 'viral_content', 'engagement', 'collaboration', 'seo_content'
- brand: brand id
- platform: en av 'instagram', 'facebook', 'linkedin', 'twitter', 'tiktok', 'youtube', 'website', 'email'
- content: det faktiske innholdet/teksten
- hypothesis: hvorfor dette burde fungere
- expected_outcome: hva vi forventer
- priority: 1-10 (10 = høyest)

Svar som JSON-array: { "actions": [...] }`,
          },
        ],
      });

      const textBlock = message.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        return this.generateMockActions(brands);
      }

      const parsed = this.parseJsonResponse(textBlock.text);
      if (!parsed?.actions || !Array.isArray(parsed.actions)) {
        return this.generateMockActions(brands);
      }

      const now = new Date().toISOString();
      return parsed.actions.map(
        (a: Record<string, unknown>) =>
          ({
            id: this.generateId(),
            brand: String(a.brand || ''),
            action_type: String(a.action_type || 'social_post'),
            platform: String(a.platform || 'instagram'),
            content: String(a.content || ''),
            hypothesis: String(a.hypothesis || ''),
            expected_outcome: String(a.expected_outcome || ''),
            priority: Number(a.priority) || 5,
            status: 'planned' as const,
            created_at: now,
          }) satisfies GrowthAction
      );
    } catch (err) {
      console.error('[GrowthEngine] AI generation failed:', err);
      return this.generateMockActions(brands);
    }
  }

  private parseJsonResponse(text: string): Record<string, unknown> | null {
    try {
      // Try direct parse
      return JSON.parse(text);
    } catch {
      // Extract JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch {
          return null;
        }
      }
      // Try to find JSON object in text
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          return JSON.parse(objMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  // ─── Action Preparation ───────────────────────────────────────────────────

  private async prepareActions(
    actions: GrowthAction[]
  ): Promise<GrowthAction[]> {
    const prepared: GrowthAction[] = [];

    for (const action of actions) {
      try {
        switch (action.action_type as ActionType) {
          case 'social_post':
            prepared.push({ ...action, status: 'ready' });
            break;

          case 'lead_magnet': {
            const enriched = await this.enrichLeadMagnetAction(action);
            prepared.push(enriched);
            break;
          }

          case 'email_campaign': {
            const emailAction = await this.enrichEmailCampaignAction(action);
            prepared.push(emailAction);
            break;
          }

          case 'ab_test': {
            const abAction = await this.enrichAbTestAction(action);
            prepared.push(abAction);
            break;
          }

          case 'viral_content':
            prepared.push({ ...action, status: 'ready' });
            break;

          case 'engagement':
            prepared.push({ ...action, status: 'ready' });
            break;

          case 'collaboration':
          case 'seo_content':
          default:
            prepared.push({ ...action, status: 'planned' });
            break;
        }
      } catch {
        prepared.push(action);
      }
    }

    return prepared;
  }

  private async enrichLeadMagnetAction(
    action: GrowthAction
  ): Promise<GrowthAction> {
    if (!this.anthropic) return { ...action, status: 'ready' };

    const brand = BRANDS.find((b) => b.id === action.brand);
    try {
      const msg = await this.anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 2048,
        system: this.SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Lag en komplett lead magnet-plan for ${brand?.name || action.brand}.

Original idé: ${action.content}

Gi meg JSON:
{
  "headline": "landing page overskrift",
  "subheadline": "undertekst",
  "cta": "call-to-action tekst",
  "lead_magnet_description": "hva brukeren får",
  "content": "fullstendig innhold/beskrivelse"
}`,
          },
        ],
      });

      const textBlock = msg.content.find((b) => b.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        const parsed = this.parseJsonResponse(textBlock.text);
        if (parsed) {
          const enrichedContent = [
            action.content,
            `\n---\nHeadline: ${parsed.headline || ''}`,
            `Subheadline: ${parsed.subheadline || ''}`,
            `CTA: ${parsed.cta || ''}`,
            `Description: ${parsed.lead_magnet_description || ''}`,
          ].join('\n');
          return { ...action, content: enrichedContent, status: 'ready' };
        }
      }
    } catch {
      // Fall through
    }
    return { ...action, status: 'ready' };
  }

  private async enrichEmailCampaignAction(
    action: GrowthAction
  ): Promise<GrowthAction> {
    if (!this.anthropic) return { ...action, status: 'ready' };

    const brand = BRANDS.find((b) => b.id === action.brand);
    try {
      const msg = await this.anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 3000,
        system: this.SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Lag en e-postsekvens (3 e-poster) for ${brand?.name || action.brand}.

Tema: ${action.content}
Tone: ${brand?.tone || 'professional'}

Gi meg JSON:
{
  "emails": [
    { "subject": "...", "body": "...", "delay_days": 0 },
    { "subject": "...", "body": "...", "delay_days": 3 },
    { "subject": "...", "body": "...", "delay_days": 7 }
  ]
}`,
          },
        ],
      });

      const textBlock = msg.content.find((b) => b.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        const parsed = this.parseJsonResponse(textBlock.text);
        if (parsed?.emails && Array.isArray(parsed.emails)) {
          const emailContent =
            action.content +
            '\n\n---\nEmail Sequence:\n' +
            (parsed.emails as Array<{ subject: string; body: string; delay_days: number }>)
              .map(
                (e, i) =>
                  `\nEmail ${i + 1} (day ${e.delay_days}):\nSubject: ${e.subject}\n${e.body}`
              )
              .join('\n---');
          return { ...action, content: emailContent, status: 'ready' };
        }
      }
    } catch {
      // Fall through
    }
    return { ...action, status: 'ready' };
  }

  private async enrichAbTestAction(
    action: GrowthAction
  ): Promise<GrowthAction> {
    if (!this.anthropic) {
      return {
        ...action,
        content_b: `[Variant B] ${action.content}`,
        status: 'ready',
      };
    }

    const brand = BRANDS.find((b) => b.id === action.brand);
    try {
      const msg = await this.anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 2048,
        system: this.SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Lag en A/B-test for ${brand?.name || action.brand}.

Original (Variant A): ${action.content}

Lag Variant B som tester en annen vinkling/hook.

Gi meg JSON:
{
  "variant_b": "innhold for variant B",
  "hypothesis": "hva vi tester og hvorfor"
}`,
          },
        ],
      });

      const textBlock = msg.content.find((b) => b.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        const parsed = this.parseJsonResponse(textBlock.text);
        if (parsed?.variant_b) {
          return {
            ...action,
            content_b: String(parsed.variant_b),
            hypothesis:
              action.hypothesis +
              ' | A/B: ' +
              String(parsed.hypothesis || ''),
            status: 'ready',
          };
        }
      }
    } catch {
      // Fall through
    }
    return {
      ...action,
      content_b: `[Variant B] ${action.content}`,
      status: 'ready',
    };
  }

  // ─── Lead Magnet Generation ───────────────────────────────────────────────

  async generateLeadMagnet(brand: string): Promise<LeadMagnet> {
    const brandInfo = BRANDS.find((b) => b.id === brand);
    if (!brandInfo) {
      throw new Error(`Brand "${brand}" not found`);
    }

    if (!this.anthropic) {
      return this.mockLeadMagnet(brandInfo);
    }

    try {
      const msg = await this.anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 3000,
        system: this.SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Lag en komplett lead magnet for ${brandInfo.name}.

Brand type: ${brandInfo.type}
Target: ${brandInfo.target_audience || 'general'}
Tone: ${brandInfo.tone || 'professional'}
Specialties: ${brandInfo.specialties?.join(', ') || 'N/A'}

Gi meg JSON:
{
  "title": "tittel på lead magnet",
  "description": "beskrivelse",
  "type": "ebook|checklist|webinar|template|calculator|guide|quiz",
  "landing_page_headline": "overskrift",
  "landing_page_subheadline": "undertekst",
  "cta_text": "knappetekst",
  "target_audience": "målgruppe",
  "email_sequence": [
    { "subject": "...", "body": "...", "delay_days": 0 },
    { "subject": "...", "body": "...", "delay_days": 2 },
    { "subject": "...", "body": "...", "delay_days": 5 }
  ]
}`,
          },
        ],
      });

      const textBlock = msg.content.find((b) => b.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        const parsed = this.parseJsonResponse(textBlock.text);
        if (parsed) {
          return {
            id: this.generateId(),
            brand,
            title: String(parsed.title || ''),
            description: String(parsed.description || ''),
            type: (parsed.type as LeadMagnet['type']) || 'guide',
            landing_page_headline: String(parsed.landing_page_headline || ''),
            landing_page_subheadline: String(
              parsed.landing_page_subheadline || ''
            ),
            cta_text: String(parsed.cta_text || 'Last ned nå'),
            email_sequence: Array.isArray(parsed.email_sequence)
              ? (parsed.email_sequence as LeadMagnet['email_sequence'])
              : [],
            target_audience: String(
              parsed.target_audience || brandInfo.target_audience || ''
            ),
            status: 'draft',
          };
        }
      }
    } catch (err) {
      console.error('[GrowthEngine] Lead magnet generation failed:', err);
    }

    return this.mockLeadMagnet(brandInfo);
  }

  // ─── A/B Test Generation ──────────────────────────────────────────────────

  async generateAbTest(
    brand: string,
    contentType: string
  ): Promise<{ a: string; b: string; hypothesis: string }> {
    const brandInfo = BRANDS.find((b) => b.id === brand);
    if (!brandInfo) {
      throw new Error(`Brand "${brand}" not found`);
    }

    if (!this.anthropic) {
      return {
        a: `[${brandInfo.name}] ${contentType} - Variant A: Fokus på verdi og resultater`,
        b: `[${brandInfo.name}] ${contentType} - Variant B: Fokus på emosjon og FOMO`,
        hypothesis:
          'Tester om verdibasert innhold fungerer bedre enn emosjonsbasert innhold',
      };
    }

    try {
      const msg = await this.anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 2048,
        system: this.SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Lag en A/B-test for ${brandInfo.name}.

Content type: ${contentType}
Brand tone: ${brandInfo.tone || 'professional'}
Target audience: ${brandInfo.target_audience || 'general'}

Gi meg JSON:
{
  "a": "fullt innhold for variant A",
  "b": "fullt innhold for variant B",
  "hypothesis": "hva vi tester og hvorfor"
}`,
          },
        ],
      });

      const textBlock = msg.content.find((b) => b.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        const parsed = this.parseJsonResponse(textBlock.text);
        if (parsed?.a && parsed?.b) {
          return {
            a: String(parsed.a),
            b: String(parsed.b),
            hypothesis: String(parsed.hypothesis || ''),
          };
        }
      }
    } catch (err) {
      console.error('[GrowthEngine] A/B test generation failed:', err);
    }

    return {
      a: `[${brandInfo.name}] ${contentType} - Variant A`,
      b: `[${brandInfo.name}] ${contentType} - Variant B`,
      hypothesis: 'Standard A/B test',
    };
  }

  // ─── Learning & Analysis ──────────────────────────────────────────────────

  async recordResult(
    actionId: string,
    metrics: GrowthActionMetrics,
    variant?: 'a' | 'b'
  ): Promise<void> {
    if (!this.supabase) return;

    const updateData: Record<string, unknown> =
      variant === 'b'
        ? { metrics_b: metrics, reviewed_at: new Date().toISOString() }
        : {
            metrics,
            status: 'completed',
            reviewed_at: new Date().toISOString(),
          };

    await this.supabase
      .from('growth_actions')
      .update(updateData)
      .eq('id', actionId);

    // Auto-select A/B winner if both variants have enough data
    if (variant) {
      await this.evaluateAbTest(actionId);
    }
  }

  private async evaluateAbTest(actionId: string): Promise<void> {
    if (!this.supabase) return;

    const { data } = await this.supabase
      .from('growth_actions')
      .select('*')
      .eq('id', actionId)
      .single();

    if (!data?.metrics || !data?.metrics_b) return;

    const metricsA = data.metrics as GrowthActionMetrics;
    const metricsB = data.metrics_b as GrowthActionMetrics;

    const impressionThreshold = 100;
    if (
      (metricsA.impressions ?? 0) < impressionThreshold ||
      (metricsB.impressions ?? 0) < impressionThreshold
    ) {
      return; // Not enough data yet
    }

    const scoreA =
      (metricsA.engagement_rate ?? 0) * 0.4 +
      (metricsA.conversions ?? 0) * 0.4 +
      (metricsA.shares ?? 0) * 0.2;
    const scoreB =
      (metricsB.engagement_rate ?? 0) * 0.4 +
      (metricsB.conversions ?? 0) * 0.4 +
      (metricsB.shares ?? 0) * 0.2;

    const winner: 'a' | 'b' = scoreA >= scoreB ? 'a' : 'b';
    const learnings = `Variant ${winner.toUpperCase()} won. A score: ${scoreA.toFixed(2)}, B score: ${scoreB.toFixed(2)}. Engagement: A=${(metricsA.engagement_rate ?? 0).toFixed(2)}% vs B=${(metricsB.engagement_rate ?? 0).toFixed(2)}%`;

    await this.supabase
      .from('growth_actions')
      .update({ ab_winner: winner, learnings })
      .eq('id', actionId);
  }

  async analyzeAndLearn(): Promise<AnalysisResult> {
    if (!this.supabase) {
      return {
        insights: ['No database connection - cannot analyze historical data'],
        recommendations: ['Connect Supabase to enable data-driven learning'],
      };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: actions, error } = await this.supabase
      .from('growth_actions')
      .select('*')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (error || !actions || actions.length === 0) {
      return {
        insights: ['No actions found in the last 30 days'],
        recommendations: ['Start running growth cycles to generate data'],
      };
    }

    const completed = actions.filter(
      (a: GrowthAction) => a.status === 'completed' && a.metrics
    );

    if (completed.length === 0) {
      return {
        insights: [
          `${actions.length} actions created but none completed with metrics`,
        ],
        recommendations: [
          'Execute planned actions and record their metrics',
          'Focus on publishing ready content first',
        ],
      };
    }

    // Analyze by type
    const typeStats = this.aggregateByField(completed, 'action_type');
    const platformStats = this.aggregateByField(completed, 'platform');
    const brandStats = this.aggregateByField(completed, 'brand');

    // A/B test learnings
    const abTests = actions.filter(
      (a: GrowthAction) => a.ab_winner
    );
    const abInsights = abTests.map(
      (a: GrowthAction) => a.learnings || `A/B test winner: ${a.ab_winner}`
    );

    // Generate insights
    const insights: string[] = [
      `Analyzed ${completed.length} completed actions across ${Object.keys(brandStats).length} brands`,
    ];

    // Best content types
    const sortedTypes = Object.entries(typeStats)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3);
    if (sortedTypes.length > 0) {
      insights.push(
        `Top content types: ${sortedTypes.map(([t, s]) => `${t} (${(s as number).toFixed(1)}% eng)`).join(', ')}`
      );
    }

    // Best platforms
    const sortedPlatforms = Object.entries(platformStats)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3);
    if (sortedPlatforms.length > 0) {
      insights.push(
        `Top platforms: ${sortedPlatforms.map(([p, s]) => `${p} (${(s as number).toFixed(1)}% eng)`).join(', ')}`
      );
    }

    if (abInsights.length > 0) {
      insights.push(...abInsights);
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (sortedTypes.length > 0) {
      recommendations.push(
        `Double down on ${sortedTypes[0][0]} content - highest engagement`
      );
    }

    if (sortedPlatforms.length > 0) {
      recommendations.push(
        `Prioritize ${sortedPlatforms[0][0]} - best performing platform`
      );
    }

    // Find underperforming brands
    const brandEntries = Object.entries(brandStats);
    const lowPerformers = brandEntries
      .sort(([, a], [, b]) => (a as number) - (b as number))
      .slice(0, 2);
    if (lowPerformers.length > 0) {
      recommendations.push(
        `Invest more in: ${lowPerformers.map(([b]) => b).join(', ')} - currently underperforming`
      );
    }

    // Use AI for deeper analysis if available
    if (this.anthropic && completed.length >= 5) {
      try {
        const aiInsights = await this.getAiInsights(completed);
        if (aiInsights) {
          insights.push(...(aiInsights.insights || []));
          recommendations.push(...(aiInsights.recommendations || []));
        }
      } catch {
        // AI analysis is optional
      }
    }

    return { insights, recommendations };
  }

  private aggregateByField(
    actions: GrowthAction[],
    field: keyof GrowthAction
  ): Record<string, number> {
    const groups: Record<string, number[]> = {};

    for (const action of actions) {
      const key = String(action[field] || 'unknown');
      if (!groups[key]) groups[key] = [];
      groups[key].push(action.metrics?.engagement_rate ?? 0);
    }

    const result: Record<string, number> = {};
    for (const [key, rates] of Object.entries(groups)) {
      result[key] = rates.reduce((s, v) => s + v, 0) / rates.length;
    }

    return result;
  }

  private async getAiInsights(
    actions: GrowthAction[]
  ): Promise<AnalysisResult | null> {
    if (!this.anthropic) return null;

    const summary = actions.slice(0, 50).map((a) => ({
      brand: a.brand,
      type: a.action_type,
      platform: a.platform,
      engagement: a.metrics?.engagement_rate ?? 0,
      conversions: a.metrics?.conversions ?? 0,
      shares: a.metrics?.shares ?? 0,
      ab_winner: a.ab_winner,
    }));

    try {
      const msg = await this.anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 2048,
        system: this.SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Analyser disse vekstresultatene og gi meg innsikter og anbefalinger:

${JSON.stringify(summary, null, 2)}

Gi meg JSON:
{
  "insights": ["innsikt 1", "innsikt 2", ...],
  "recommendations": ["anbefaling 1", "anbefaling 2", ...]
}`,
          },
        ],
      });

      const textBlock = msg.content.find((b) => b.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        const parsed = this.parseJsonResponse(textBlock.text);
        if (parsed) {
          return {
            insights: Array.isArray(parsed.insights)
              ? (parsed.insights as string[])
              : [],
            recommendations: Array.isArray(parsed.recommendations)
              ? (parsed.recommendations as string[])
              : [],
          };
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  // ─── Strategy ─────────────────────────────────────────────────────────────

  async getStrategyForBrand(brand: string): Promise<GrowthStrategy> {
    const brandInfo = BRANDS.find((b) => b.id === brand);
    if (!brandInfo) {
      throw new Error(`Brand "${brand}" not found`);
    }

    const performance = await this.analyzeBrandPerformance(brand);
    const actions = await this.runCycle([brand], { persist: false });

    return {
      brand,
      current_followers: {
        instagram: 0,
        facebook: 0,
        linkedin: 0,
        youtube: 0,
        tiktok: 0,
      },
      target_followers: {
        instagram: 1000,
        facebook: 500,
        linkedin: 500,
        youtube: 1000,
        tiktok: 2000,
      },
      best_performing: performance.best_action_types,
      worst_performing: performance.worst_action_types,
      recommended_focus: performance.best_platforms.length > 0
        ? performance.best_platforms
        : ['instagram', 'linkedin'],
      weekly_action_plan: actions.filter((a) => a.brand === brand),
    };
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private async saveActions(actions: GrowthAction[]): Promise<void> {
    if (!this.supabase || actions.length === 0) return;

    try {
      const { error } = await this.supabase
        .from('growth_actions')
        .insert(actions);

      if (error) {
        console.error('[GrowthEngine] Failed to save actions:', error);
      }
    } catch (err) {
      console.error('[GrowthEngine] Save error:', err);
    }
  }

  // ─── Mock Data ────────────────────────────────────────────────────────────

  private generateMockActions(brands: Brand[]): GrowthAction[] {
    const now = new Date().toISOString();
    const actions: GrowthAction[] = [];

    const mockTemplates: Array<{
      action_type: ActionType;
      platform: string;
      template: (brand: Brand) => { content: string; hypothesis: string; expected_outcome: string };
    }> = [
      {
        action_type: 'social_post',
        platform: 'instagram',
        template: (b) => ({
          content: `Discover the future of ${b.specialties?.[0] || b.type} with ${b.name}. Our latest insights reveal what's trending now. Link in bio for the full story.`,
          hypothesis: 'Curiosity-driven posts with clear CTA perform 2x better',
          expected_outcome: '3-5% engagement rate, 50+ profile visits',
        }),
      },
      {
        action_type: 'viral_content',
        platform: 'tiktok',
        template: (b) => ({
          content: `POV: You just discovered ${b.name} and your life changed. Here are 3 things nobody tells you about ${b.specialties?.[0] || b.type}...`,
          hypothesis: 'POV hooks + listicle format drives shares on TikTok',
          expected_outcome: '10K+ views, 500+ shares',
        }),
      },
      {
        action_type: 'engagement',
        platform: 'linkedin',
        template: (b) => ({
          content: `Reply template: "Great point! At ${b.name} we've seen similar trends. Would love to share our data on ${b.specialties?.[0] || b.type}. DM me for details."`,
          hypothesis: 'Thoughtful engagement on others\' posts builds authority',
          expected_outcome: '20+ new connections, 5+ DM conversations',
        }),
      },
      {
        action_type: 'seo_content',
        platform: 'website',
        template: (b) => ({
          content: `Blog: "The Ultimate Guide to ${b.specialties?.[0] || b.type} in 2026" - 2000 word SEO-optimized article covering trends, tips, and expert advice from ${b.name}.`,
          hypothesis: 'Long-form SEO content ranks within 3 months for target keywords',
          expected_outcome: '500+ organic visits/month after 90 days',
        }),
      },
    ];

    for (const brand of brands) {
      for (const tmpl of mockTemplates) {
        const generated = tmpl.template(brand);
        actions.push({
          id: this.generateId(),
          brand: brand.id,
          action_type: tmpl.action_type,
          platform: tmpl.platform,
          content: generated.content,
          hypothesis: generated.hypothesis,
          expected_outcome: generated.expected_outcome,
          priority: Math.floor(Math.random() * 5) + 5,
          status: 'planned',
          created_at: now,
        });
      }
    }

    return actions;
  }

  private mockLeadMagnet(brand: Brand): LeadMagnet {
    return {
      id: this.generateId(),
      brand: brand.id,
      title: `The Essential ${brand.specialties?.[0] || brand.type} Guide by ${brand.name}`,
      description: `A comprehensive guide covering everything you need to know about ${brand.specialties?.join(', ') || brand.type}.`,
      type: 'guide',
      landing_page_headline: `Transform Your ${brand.specialties?.[0] || brand.type} Journey`,
      landing_page_subheadline: `Download our free guide and discover the strategies that top performers use.`,
      cta_text: 'Download Free Guide',
      email_sequence: [
        {
          subject: `Welcome! Here's your ${brand.name} guide`,
          body: `Thank you for downloading our guide. Here's what you'll discover inside...`,
          delay_days: 0,
        },
        {
          subject: `Did you know? 3 insider tips from ${brand.name}`,
          body: `We wanted to share some bonus tips that didn't make it into the guide...`,
          delay_days: 3,
        },
        {
          subject: `Ready to take the next step with ${brand.name}?`,
          body: `Now that you've had time to review our guide, let's discuss how we can help you...`,
          delay_days: 7,
        },
      ],
      target_audience: brand.target_audience || 'General audience',
      status: 'draft',
    };
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private generateId(): string {
    return `ga_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
