export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PropertyScanner } from '@/services/scanner/property-scanner';
import { requireCronApi } from '@/lib/api-cron';
import { evaluateCronSafeMode } from '@/lib/cron/safe-mode';

export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/cron/property-scanner
 * Weekly Sunday scan for new properties in Costa Blanca
 * Runs every Sunday at 08:00 UTC
 */
export async function GET(request: NextRequest) {
  try {
    const unauthorized = requireCronApi(request);
    if (unauthorized) return unauthorized;

    const safeMode = await evaluateCronSafeMode('/api/cron/property-scanner');
    if (safeMode.skip) {
      return NextResponse.json({
        success: true,
        skipped: true,
        mode: safeMode.mode,
        reason: safeMode.reason,
      });
    }

    console.log('[Property Scanner Cron] Starting weekly scan...');

    const supabase = getSupabase();
    const scanner = new PropertyScanner();

    const { all_properties, by_source, errors } = await scanner.weeklyDiscoveryScan();

    if (supabase && all_properties.length > 0) {
      const toInsert = all_properties.map((p) => ({
        title: p.title,
        price: p.price,
        price_numeric: p.price_numeric,
        location: p.location,
        municipality: p.municipality,
        province: p.province,
        size_m2: p.size_m2,
        plot_m2: p.plot_m2,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        type: p.type,
        description: p.description,
        source: p.source,
        source_url: p.source_url,
        image_urls: p.image_urls || [],
        features: p.features || [],
        is_new_build: p.is_new_build,
        developer: p.developer,
        completion_date: p.completion_date,
        energy_rating: p.energy_rating,
        ref_number: p.ref_number,
        status: 'new',
        scraped_at: p.scraped_at,
      }));

      const { error: insertError } = await supabase
        .from('scanned_properties')
        .insert(toInsert);

      if (insertError) {
        console.error('[Property Scanner Cron] Insert error:', insertError);
      }

      try {
        await supabase.from('property_scan_runs').insert({
          run_type: 'weekly_cron',
          properties_found: all_properties.length,
          sources_scanned: Object.keys(by_source),
          by_source,
          errors,
        });
      } catch {
        // non-critical
      }
    }

    console.log(`[Property Scanner Cron] Found ${all_properties.length} properties`);

    return NextResponse.json({
      success: true,
      properties_found: all_properties.length,
      by_source,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Property Scanner Cron] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scan failed' },
      { status: 500 }
    );
  }
}
