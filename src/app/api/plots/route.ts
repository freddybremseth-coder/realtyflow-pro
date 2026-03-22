import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - fetch all plots
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ plots: [] });

  const { data, error } = await supabase.from('land_plots').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ plots: [], error: error.message });
  return NextResponse.json({ plots: data || [] });
}

// POST - create or update plot(s)
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const body = await request.json();
  const plots = Array.isArray(body) ? body : [body];

  // For each plot, try to extract price and area from notes/info if they're 0
  const processedPlots = plots.map(p => {
    let { price, area, notes } = p;
    if ((!price || price === 0) && notes) {
      // Try to extract price from notes - patterns like "39.000€", "€45,000", "45000 euros", "Precio: 39.000"
      const priceMatch = notes.match(/(?:precio|price|pris)?[:\s]*(?:€\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:€|euros?|EUR)/i)
        || notes.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(?:€|euros?)/i)
        || notes.match(/€\s*(\d{1,3}(?:[.,]\d{3})*)/i);
      if (priceMatch) {
        price = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
      }
    }
    if ((!area || area === 0) && notes) {
      // Try to extract area - patterns like "5.000 m2", "5000m²", "parcela de 3.200 m2"
      const areaMatch = notes.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(?:m2|m²|sqm|metros?)/i);
      if (areaMatch) {
        area = parseFloat(areaMatch[1].replace(/\./g, '').replace(',', '.'));
      }
    }

    // Remove id if it's a temp client-generated one (non-UUID)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id || '');

    return {
      ...(isUUID ? { id: p.id } : {}),
      plot_number: p.plotNumber || p.plot_number || '',
      area: area || 0,
      price: price || 0,
      location: p.location || '',
      municipality: p.municipality || '',
      zoning: p.zoning || 'rustico',
      water: p.water || false,
      electricity: p.electricity || false,
      slope: p.slope || '',
      road_access: p.roadAccess ?? p.road_access ?? false,
      notes: p.notes || '',
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
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 });

  const { id } = await request.json();
  const { error } = await supabase.from('land_plots').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
