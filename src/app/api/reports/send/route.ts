import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';
import { ReportGenerator } from '@/services/market/report-generator';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// POST /api/reports/send — send a report via email (Resend)
// Body: { reportId: string, recipients?: string[] }
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { reportId } = body as { reportId: string; recipients?: string[] };

    if (!reportId) {
      return NextResponse.json({ error: 'reportId is required' }, { status: 400 });
    }

    // 1. Fetch the report from Supabase
    const { data: report, error: fetchError } = await supabase
      .from('market_reports')
      .select('*')
      .eq('id', reportId)
      .single();

    if (fetchError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // 2. Get recipients - from body, or from recipient list, or fallback
    let recipients = body.recipients as string[] | undefined;
    const recipientGroup = report.recipients || 'internal';
    let fallbackRecipientUsed = false;
    if (!recipients || recipients.length === 0) {
      const { data: recipientList } = await supabase
        .from('report_recipients')
        .select('email')
        .eq('active', true)
        .eq('group_name', recipientGroup);

      recipients = recipientList?.map(r => r.email) || [];

      // Fallback to Freddy
      if (recipients.length === 0) {
        recipients = ['freddy@soleada.no'];
        fallbackRecipientUsed = true;
      }
    }

    // 3. Format for email
    const generator = new ReportGenerator();
    const emailData = generator.formatForEmail({
      id: report.id,
      template_id: report.template_id,
      title: report.title,
      subtitle: report.subtitle || '',
      content_html: report.content_html || '',
      content_text: report.content_text || '',
      summary: report.summary || '',
      key_metrics: report.key_metrics || [],
      sections: report.sections || [],
      theme: report.theme,
      brand: report.brand,
      recipients: report.recipients || 'internal',
      generated_at: report.generated_at,
      data_sources: report.data_sources || [],
    });

    // 4. Send via Resend API
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    const fromName = report.recipients === 'donaanna' || report.template_id === 'dona-anna-sesong'
      ? 'Dona Anna'
      : 'RealtyFlow Pro';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <reports@freddybremseth.com>`,
        to: recipients,
        subject: emailData.subject,
        html: emailData.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend API error: ${res.status} – ${err}`);
    }

    const resendResult = await res.json();

    // 5. Update report with send metadata
    await supabase
      .from('market_reports')
      .update({
        sent_at: new Date().toISOString(),
        sent_to: recipients,
      })
      .eq('id', reportId);

    return NextResponse.json({
      success: true,
      emailId: resendResult.id,
      sentTo: recipients,
      recipientGroup,
      fallbackRecipientUsed,
    });
  } catch (error) {
    console.error('[Reports Send]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
