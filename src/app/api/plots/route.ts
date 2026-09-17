import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';
import { normalizeBrandId, plotMatchesBrand } from '@/lib/realty/brand-rules';
import { normalizePlotArea, normalizePlotZoning } from '@/lib/realty/plot-normalization';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - fetch all plots
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ plots: [] });

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get('brandId') || searchParams.get('brand_id');

  const { data, error } = await supabase.from('land_plots').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ plots: [], error: error.message });

  const plots = data || [];
  if (!brandId) return NextResponse.json({ plots });

  const normalizedBrandId = normalizeBrandId(brandId);
  return NextResponse.json({
    plots: plots.filter((plot) => plotMatchesBrand(plot, normalizedBrandId)),
  });
}

// POST - create or update plot(s)
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const body = await request.json();
  const plots = Array.isArray(body) ? body : [body];

  // Normalize source-grounded facts before persistence. This protects against
  // KML/import truncation such as 12 554 m² -> 554 and default rustico zoning
  // when the source text explicitly identifies an urban plot.
  const processedPlots = plots.map(p => {
    let { price, area } = p;
    const notes = String(p.notes || '');

    if ((!price || price === 0) && notes) {
      // Try to extract price from notes - patterns like "39.000€", "€45,000", "45000 euros", "Precio: 39.000"
      const priceMatch = notes.match(/(?:precio|price|pris)?[:\s]*(?:€\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:€|euros?|EUR)/i)
        || notes.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(?:€|euros?)/i)
        || notes.match(/€\s*(\d{1,3}(?:[.,]\d{3})*)/i);
      if (priceMatch) {
        price = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
      }
    }

    area = normalizePlotArea(area, notes);
    const zoning = normalizePlotZoning(
      p.zoning,
      p.plotNumber,
      p.plot_number,
      p.location,
      p.municipality,
      notes,
    );

    // Remove id if it's a temp client-generated one (non-UUID)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id || '');

    return {
      ...(isUUID ? { id: p.id } : {}),
      plot_number: p.plotNumber || p.plot_number || '',
      area: area || 0,
      price: price || 0,
      location: p.location || '',
      municipality: p.municipality || '',
      zoning,
      water: p.water || false,
      electricity: p.electricity || false,
      slope: p.slope || '',
      road_access: p.roadAccess ?? p.road_access ?? false,
      notes,
      lat: p.lat || 0,
      lng: p.lng || 0,
      source: p.source || 'manual',
    };
  });

  const { data, error } = await supabase.from('land_plots').upsert(processedPlots).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plots: data });
}

// DELETE - delete a plot
export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const { id } = await request.json();
  const { error } = await supabase.from('land_plots').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
