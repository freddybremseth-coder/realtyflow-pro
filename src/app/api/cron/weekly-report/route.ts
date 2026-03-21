import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MarketDataFetcher } from '@/services/market/data-fetcher';
import { ReportGenerator } from '@/services/market/report-generator';

// Vercel cron: "crons": [{ "path": "/api/cron/weekly-report", "schedule": "0 8 * * 1" }]

export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // 1. Fetch market data
    const fetcher = new MarketDataFetcher();
    const marketData = await fetcher.fetchAll(supabase);

    // 2. Get last 8 reports to determine rotation
    const { data: recentReports } = await supabase
      .from('market_reports')
      .select('template_id, theme, brand, generated_at')
      .order('generated_at', { ascending: false })
      .limit(8);

    // 3. Auto-pick template based on rotation logic
    const generator = new ReportGenerator();
    const lastReportData = (recentReports ?? []).map(r => ({
      template_id: r.template_id,
      date: r.generated_at,
    }));
    const templateId = generator.getNextTemplate(lastReportData);

    // 4. Determine options (theme for B, brand for C)
    const options: { theme?: string; brand?: string } = {};
    if (templateId === 'det-store-bildet') {
      const usedThemes = (recentReports ?? [])
        .filter(r => r.template_id === 'det-store-bildet' && r.theme)
        .map(r => r.theme as string);
      options.theme = generator.getNextTheme(usedThemes);
    } else if (templateId === 'brand-spotlight') {
      const usedBrands = (recentReports ?? [])
        .filter(r => r.template_id === 'brand-spotlight' && r.brand)
        .map(r => r.brand as string);
      options.brand = generator.getNextBrand(usedBrands);
    }

    // 5. Generate report
    const report = await generator.generateReport(templateId, marketData, options);

    // 6. Save to Supabase
    const { data: saved, error: saveError } = await supabase
      .from('market_reports')
      .insert({
        template_id: report.template_id,
        title: report.title,
        subtitle: report.subtitle,
        summary: report.summary,
        content_html: report.content_html,
        content_text: report.content_text,
        key_metrics: report.key_metrics,
        sections: report.sections,
        theme: report.theme,
        brand: report.brand,
        recipients: report.recipients,
        data_sources: report.data_sources,
        generated_at: report.generated_at,
      })
      .select()
      .single();

    if (saveError) throw saveError;

    // 7. Send via Resend
    const resendKey = process.env.RESEND_API_KEY;
    const recipient = process.env.REPORT_RECIPIENT_EMAIL || 'freddy@soleada.no';

    if (resendKey && saved) {
      const emailData = generator.formatForEmail(report);

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'RealtyFlow Pro <reports@freddybremseth.com>',
          to: [recipient],
          subject: emailData.subject,
          html: emailData.html,
        }),
      });

      if (!res.ok) {
        console.error('[Cron: weekly-report] Resend error:', await res.text());
      } else {
        await supabase
          .from('market_reports')
          .update({ sent_at: new Date().toISOString(), sent_to: [recipient] })
          .eq('id', saved.id);
      }
    } else {
      console.warn('[Cron: weekly-report] RESEND_API_KEY not configured, skipping email');
    }

    console.log(`[Cron: weekly-report] Generated "${report.title}" (${templateId})`);

    return NextResponse.json({
      success: true,
      template: templateId,
      title: report.title,
    });
  } catch (error) {
    console.error('[Cron: weekly-report]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
