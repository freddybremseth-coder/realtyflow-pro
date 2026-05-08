export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { evaluateCronSafeMode } from '@/lib/cron/safe-mode';

export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/cron/property-marketing
 * Proactive AI: Monitors properties that have been listed for 14+ days
 * without activity and generates new marketing suggestions.
 *
 * Schedule: Every day at 09:00 UTC
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    const safeMode = await evaluateCronSafeMode('/api/cron/property-marketing');
    if (safeMode.skip) {
      return NextResponse.json({
        success: true,
        skipped: true,
        mode: safeMode.mode,
        reason: safeMode.reason,
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    console.log('[Property Marketing Cron] Checking stale properties...');

    // Find properties that are TILGJENGELIG and were created 14+ days ago
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data: staleProperties, error: fetchError } = await supabase
      .from('properties')
      .select('id, title, location, price, property_type, bedrooms, bathrooms, built_area, plot_size, pool, views, created_at')
      .eq('status', 'TILGJENGELIG')
      .lt('created_at', fourteenDaysAgo.toISOString())
      .order('views', { ascending: true })
      .limit(5); // Process max 5 per run to control API costs

    if (fetchError) {
      console.error('[Property Marketing Cron] Fetch error:', fetchError.message);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!staleProperties || staleProperties.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No stale properties found',
        processed: 0,
      });
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic();

    const notifications = [];

    for (const prop of staleProperties) {
      const daysSinceCreated = Math.floor(
        (Date.now() - new Date(prop.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Generate a refreshed marketing suggestion
      const prompt = `Du er en proaktiv eiendomsmarkedsføringsrådgiver. Denne eiendommen har ligget ute i ${daysSinceCreated} dager med bare ${prop.views || 0} visninger.

EIENDOM:
- Tittel: ${prop.title}
- Sted: ${prop.location}
- Pris: €${prop.price?.toLocaleString('nb-NO')}
- Type: ${prop.property_type}
- ${prop.bedrooms} soverom, ${prop.bathrooms} bad, ${prop.built_area} m²
- Tomt: ${prop.plot_size || 0} m², Basseng: ${prop.pool ? 'Ja' : 'Nei'}

Analyser situasjonen og foreslå tiltak. Returner JSON:
{
  "urgency": "low|medium|high",
  "diagnosis": "Kort analyse av hvorfor den ikke selger (maks 50 ord)",
  "action_plan": [
    { "action": "Beskrivelse av tiltak", "platform": "Facebook|Instagram|LinkedIn|Prisendring|Ny tekst", "priority": 1 }
  ],
  "new_headline": "Ny, mer aggressiv tittel",
  "price_suggestion": "Vurdering av om pris bør justeres",
  "recommended_campaign_type": "retargeting|ny_kampanje|prisreduksjon|open_house"
}

Svar KUN med JSON.`;

      try {
        const result = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = result.content[0].type === 'text' ? result.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const suggestion = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

        if (suggestion) {
          // Save notification to database
          await supabase.from('marketing_notifications').insert({
            property_id: prop.id,
            property_title: prop.title,
            days_listed: daysSinceCreated,
            views: prop.views || 0,
            urgency: suggestion.urgency,
            diagnosis: suggestion.diagnosis,
            action_plan: suggestion.action_plan,
            new_headline: suggestion.new_headline,
            price_suggestion: suggestion.price_suggestion,
            recommended_campaign_type: suggestion.recommended_campaign_type,
            status: 'pending',
          }).then(({ error }) => {
            if (error) console.error('[Property Marketing Cron] Failed to save notification:', error.message);
          });

          notifications.push({
            property_id: prop.id,
            title: prop.title,
            days_listed: daysSinceCreated,
            urgency: suggestion.urgency,
            diagnosis: suggestion.diagnosis,
          });
        }
      } catch (err) {
        console.error(`[Property Marketing Cron] AI error for ${prop.id}:`, err);
      }
    }

    console.log(`[Property Marketing Cron] Processed ${notifications.length} stale properties`);

    return NextResponse.json({
      success: true,
      processed: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error('[Property Marketing Cron]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
