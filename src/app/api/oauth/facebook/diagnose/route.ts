/**
 * GET /api/oauth/facebook/diagnose?brand=xxx
 *
 * Inspects every `social_accounts` row for the given brand (facebook + instagram)
 * and reports per-account token health: type (USER/PAGE/APP), validity, scopes,
 * expiry, and a Norwegian hint if the row needs a reconnect.
 *
 * Intended for the Settings page to show a "Diagnose tilkobling" button.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { debugToken, sanitizeToken } from '@/services/publishing/facebook-token-helper';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

function normalizeBrand(b: string): string {
  return b.toLowerCase().replace(/[-_.\s]/g, '').replace(/homes$/, '').replace(/pro$/, '');
}

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get('brand');
  if (!brand) {
    return NextResponse.json({ error: 'brand is required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: allAccounts, error } = await supabase
    .from('social_accounts')
    .select('id, platform, account_id, account_name, access_token, brand, is_active')
    .in('platform', ['facebook', 'instagram']);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (allAccounts || []).filter(
    (a: { brand: string }) => normalizeBrand(a.brand) === normalizeBrand(brand),
  );

  const report = await Promise.all(
    rows.map(async (row) => {
      const clean = sanitizeToken(row.access_token);
      const hadWhitespace = clean !== row.access_token;
      const debug = clean ? await debugToken(clean) : { valid: false, error: 'Empty token' };

      // Derive a user-facing hint
      let hint: string | null = null;
      if (!clean) {
        hint = 'Tom token — koble til Facebook på nytt.';
      } else if (!debug.valid) {
        hint = `Token ugyldig (${debug.error || 'ukjent'}) — koble til på nytt.`;
      } else if (row.platform === 'facebook' && debug.type !== 'PAGE') {
        hint = `Denne raden har ${debug.type}-token, men trenger PAGE-token. Neste publisering prøver å oppgradere automatisk.`;
      } else if (row.platform === 'instagram' && debug.type !== 'PAGE') {
        hint = `Instagram krever FB Page-token (fikk ${debug.type}). Koble til Facebook på nytt.`;
      } else if (debug.expiresAt && debug.expiresAt > 0) {
        const daysLeft = Math.round((debug.expiresAt * 1000 - Date.now()) / 86400000);
        if (daysLeft < 7) hint = `Token utløper om ${daysLeft} dager — re-autoriser snart.`;
      }

      return {
        id: row.id,
        platform: row.platform,
        account_id: row.account_id,
        account_name: row.account_name,
        is_active: row.is_active,
        hadWhitespaceInToken: hadWhitespace,
        token: {
          present: !!clean,
          length: clean.length,
          valid: debug.valid,
          type: debug.type,
          scopes: debug.scopes,
          expiresAt: debug.expiresAt,
          error: debug.error,
        },
        hint,
      };
    }),
  );

  const problems = report.filter((r) => r.hint !== null);

  return NextResponse.json({
    brand,
    accountCount: report.length,
    problemCount: problems.length,
    accounts: report,
    summary:
      problems.length === 0
        ? `Alle ${report.length} kontoer ser gyldige ut.`
        : `${problems.length} av ${report.length} kontoer trenger oppmerksomhet.`,
  });
}

/**
 * PATCH /api/oauth/facebook/diagnose?id=<row-uuid>&brand=<new-brand>
 *
 * Moves a single social_accounts row to a different brand. Used after a
 * bulk OAuth run where multiple pages landed under one brand and need
 * redistributing (e.g. Chat Genius saved under zeneco → move to chatgenius).
 *
 * Returns the updated row or a not-found error.
 */
export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const newBrand = req.nextUrl.searchParams.get('brand');
  if (!id || !newBrand) {
    return NextResponse.json({ error: 'id and brand are required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('social_accounts')
    .update({ brand: newBrand })
    .eq('id', id)
    .select('id, platform, account_id, account_name, brand')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'row not found' }, { status: 404 });

  return NextResponse.json({ updated: data });
}

/**
 * DELETE /api/oauth/facebook/diagnose?brand=xxx&mode=invalid|all|id&id=uuid
 *
 *   mode=invalid (default): removes only rows whose token fails /debug_token
 *   mode=all: removes every FB/IG row for the brand (nuclear)
 *   mode=id (+ id=<uuid>): removes one specific row
 *
 * Use this to clean out stale rows that OAuth reconnects don't touch (e.g. a
 * Page the user no longer has admin access to, or a row from a previous
 * failed OAuth run).
 *
 * Returns: { removed: [...], kept: [...] }
 */
export async function DELETE(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get('brand');
  const mode = req.nextUrl.searchParams.get('mode') || 'invalid';
  const targetId = req.nextUrl.searchParams.get('id');
  if (!brand) {
    return NextResponse.json({ error: 'brand is required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: allAccounts, error } = await supabase
    .from('social_accounts')
    .select('id, platform, account_id, account_name, access_token, brand, is_active')
    .in('platform', ['facebook', 'instagram']);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (allAccounts || []).filter(
    (a: { brand: string }) => normalizeBrand(a.brand) === normalizeBrand(brand),
  );

  const removed: Array<{ id: string; platform: string; account_name: string; reason: string }> = [];
  const kept: Array<{ id: string; platform: string; account_name: string; reason: string }> = [];

  for (const row of rows) {
    let shouldRemove = false;
    let reason = '';

    if (mode === 'all') {
      shouldRemove = true;
      reason = 'mode=all';
    } else if (mode === 'id') {
      shouldRemove = !!targetId && row.id === targetId;
      reason = 'mode=id match';
    } else {
      // mode=invalid
      const clean = sanitizeToken(row.access_token);
      if (!clean) {
        shouldRemove = true;
        reason = 'empty token';
      } else {
        const debug = await debugToken(clean);
        if (!debug.valid) {
          shouldRemove = true;
          reason = `invalid: ${debug.error || 'unknown'}`;
        } else {
          reason = 'token valid';
        }
      }
    }

    if (!shouldRemove) {
      kept.push({ id: row.id, platform: row.platform, account_name: row.account_name, reason });
      continue;
    }

    const { error: delErr } = await supabase.from('social_accounts').delete().eq('id', row.id);
    if (delErr) {
      kept.push({
        id: row.id,
        platform: row.platform,
        account_name: row.account_name,
        reason: `delete failed: ${delErr.message}`,
      });
    } else {
      removed.push({ id: row.id, platform: row.platform, account_name: row.account_name, reason });
    }
  }

  return NextResponse.json({
    brand,
    mode,
    removed,
    kept,
    message: `Fjernet ${removed.length}. Beholdt ${kept.length}.`,
  });
}
