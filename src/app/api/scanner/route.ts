import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PropertyScanner } from '@/services/scanner/property-scanner';

export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/scanner
 * List scanned properties from DB + available sources
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // new, interested, rejected, imported
    const type = searchParams.get('type');
    const supabase = getSupabase();

    const scanner = new PropertyScanner();
    const sources = scanner.getSources();

    if (!supabase) {
      return NextResponse.json({ properties: [], sources, latest_scan: null });
    }

    let query = supabase
      .from('scanned_properties')
      .select('*')
      .order('scraped_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('type', type);

    const { data, error } = await query.limit(100);
    if (error) throw error;

    // Get latest scan info
    const { data: latestScan } = await supabase
      .from('property_scan_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      properties: data || [],
      sources,
      latest_scan: latestScan,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/scanner
 * Actions: scan_url, weekly_scan, update_status, import_property
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const supabase = getSupabase();
    const scanner = new PropertyScanner();

    switch (action) {
      // ── Scan a specific URL ─────────────────────────────────────
      case 'scan_url': {
        const { url } = body;
        if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

        const result = await scanner.scanUrl(url);

        if (supabase && result.properties.length > 0) {
          const toInsert = result.properties.map((p) => ({
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
            image_urls: p.image_urls,
            features: p.features,
            is_new_build: p.is_new_build,
            developer: p.developer,
            completion_date: p.completion_date,
            energy_rating: p.energy_rating,
            ref_number: p.ref_number,
            status: 'new',
            scraped_at: p.scraped_at,
          }));

          await supabase.from('scanned_properties').insert(toInsert);
        }

        return NextResponse.json({
          success: true,
          ...result,
        });
      }

      // ── Weekly discovery scan ───────────────────────────────────
      case 'weekly_scan': {
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

          await supabase.from('scanned_properties').insert(toInsert);

          // Log the scan run
          try {
            await supabase.from('property_scan_runs').insert({
              run_type: 'weekly',
              properties_found: all_properties.length,
              sources_scanned: Object.keys(by_source),
              by_source,
              errors,
            });
          } catch {
            // non-critical
          }
        }

        return NextResponse.json({
          success: true,
          total_found: all_properties.length,
          by_source,
          properties: all_properties,
          errors,
        });
      }

      // ── Update property status ──────────────────────────────────
      case 'update_status': {
        const { id, status: newStatus, notes } = body;
        if (!id || !newStatus) return NextResponse.json({ error: 'id and status required' }, { status: 400 });

        if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 503 });

        const updates: Record<string, unknown> = {
          status: newStatus,
          updated_at: new Date().toISOString(),
        };
        if (notes) updates.user_notes = notes;

        const { data, error } = await supabase
          .from('scanned_properties')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, property: data });
      }

      // ── Import to properties table ──────────────────────────────
      case 'import_property': {
        const { id: importId } = body;
        if (!importId || !supabase) return NextResponse.json({ error: 'id required' }, { status: 400 });

        // Get scanned property
        const { data: scanned, error: fetchErr } = await supabase
          .from('scanned_properties')
          .select('*')
          .eq('id', importId)
          .single();

        if (fetchErr || !scanned) return NextResponse.json({ error: 'Property not found' }, { status: 404 });

        // Insert into properties table
        const { error: insertErr } = await supabase.from('properties').insert({
          title: scanned.title,
          price: scanned.price_numeric,
          location: scanned.location,
          size: scanned.size_m2 ? `${scanned.size_m2} m²` : null,
          bedrooms: scanned.bedrooms,
          bathrooms: scanned.bathrooms,
          type: scanned.type,
          description: scanned.description,
          status: 'active',
          source: scanned.source,
          external_url: scanned.source_url,
        });

        if (insertErr) throw insertErr;

        // Update scanned property status
        await supabase
          .from('scanned_properties')
          .update({ status: 'imported', updated_at: new Date().toISOString() })
          .eq('id', importId);

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[Scanner API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scanner error' },
      { status: 500 }
    );
  }
}
