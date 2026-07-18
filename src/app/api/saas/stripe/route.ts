import { NextRequest, NextResponse } from 'next/server';
import { getSaasSupabase } from '@/lib/saas-api-supabase';
import { verifyStripeWebhookSignature } from '@/lib/stripe-webhook';

type StripeObject = Record<string, any>;

type StripeEvent = {
  id: string;
  type: string;
  account?: string;
  livemode?: boolean;
  api_version?: string;
  data: { object: StripeObject };
};

type SupabaseResult<T = unknown> = {
  data: T | null;
  error: { message?: string } | null;
};

function requireDbResult<T>(result: SupabaseResult<T>, operation: string): T | null {
  if (result.error) {
    throw new Error(`${operation}: ${result.error.message || 'database operation failed'}`);
  }
  return result.data;
}

function parseStripeEvent(body: string): StripeEvent | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(body);
  } catch {
    return null;
  }

  if (!candidate || typeof candidate !== 'object') return null;
  const event = candidate as Partial<StripeEvent>;
  if (
    typeof event.id !== 'string' || !event.id ||
    typeof event.type !== 'string' || !event.type ||
    !event.data || typeof event.data.object !== 'object' || event.data.object === null
  ) {
    return null;
  }
  return event as StripeEvent;
}

function legacySubscriptionStatus(status: unknown) {
  if (status === 'active' || status === 'trialing' || status === 'past_due') return status;
  if (status === 'canceled' || status === 'cancelled') return 'cancelled';
  return 'past_due';
}

function getSupabase() {
  return getSaasSupabase();
}

/**
 * POST /api/saas/stripe
 * Stripe webhook endpoint. Receives events and updates SaaS metrics.
 *
 * Set up in Stripe Dashboard → Developers → Webhooks:
 *   URL: https://realtyflow-pro-two.vercel.app/api/saas/stripe
 *   Events: checkout.session.completed, customer.subscription.created,
 *           customer.subscription.updated, customer.subscription.deleted,
 *           invoice.paid, invoice.payment_failed
 */
export async function POST(request: NextRequest) {
  let eventId: string | null = null;
  let supabase: ReturnType<typeof getSupabase> = null;
  try {
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    const signatureCheck = verifyStripeWebhookSignature(body, sig, webhookSecret);
    if (!signatureCheck.ok) {
      console.warn('[Stripe Webhook] Signature verification failed', { reason: signatureCheck.reason });
      const status = signatureCheck.reason === 'missing-secret' ? 500 : 401;
      return NextResponse.json({ error: 'Invalid Stripe webhook signature' }, { status });
    }

    const event = parseStripeEvent(body);
    if (!event) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    eventId = event.id;

    supabase = getSupabase();
    if (!supabase) {
      console.warn('[Stripe Webhook] Supabase not configured');
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }

    const claim = requireDbResult<boolean>(await supabase.rpc('saas_claim_stripe_event', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_stripe_account_id: event.account || null,
      p_livemode: event.livemode === true,
      p_api_version: event.api_version || null,
      p_payload: event,
    }), 'Claim Stripe event');

    if (!claim) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const type = event.type;
    const data = event.data.object;

    console.log(`[Stripe Webhook] ${type}`, data?.id);

    switch (type) {
      // ─── New subscription created ────────────────────────────
      case 'customer.subscription.created': {
        const appSlug = data.metadata?.app_slug;
        if (!appSlug) {
          await syncStripeBillingState(supabase, event, data);
          break;
        }

        // Find app by slug
        const app = requireDbResult<{ id: string }>(await supabase
          .from('saas_apps')
          .select('id')
          .eq('slug', appSlug)
          .maybeSingle(), 'Find SaaS app for subscription');

        if (app) {
          // Upsert by Stripe's stable subscription id. This makes retries safe
          // even when a previous webhook attempt stopped halfway through.
          requireDbResult(await supabase.from('saas_subscriptions').upsert({
            app_id: app.id,
            tenant_id: data.metadata?.tenant_id || null,
            customer_email: data.customer_email || data.metadata?.customer_email || '',
            customer_name: data.metadata?.customer_name,
            plan: data.metadata?.plan || 'basic',
            status: legacySubscriptionStatus(data.status),
            amount: (data.items?.data?.[0]?.price?.unit_amount || 0) / 100,
            currency: data.currency?.toUpperCase() || 'USD',
            billing_cycle: data.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly',
            stripe_customer_id: data.customer,
            stripe_subscription_id: data.id,
            next_billing_at: data.current_period_end
              ? new Date(data.current_period_end * 1000).toISOString()
              : null,
          }, { onConflict: 'stripe_subscription_id' }), 'Upsert SaaS subscription');

          await syncStripeBillingState(supabase, event, data);

          // Update app metrics
          await recalculateAppMetrics(supabase, app.id);
        }
        break;
      }

      // ─── Subscription updated (upgrade/downgrade/cancel) ─────
      case 'customer.subscription.updated': {
        const synced = await syncStripeBillingState(supabase, event, data);
        if (synced.legacyAppId) await recalculateAppMetrics(supabase, synced.legacyAppId);
        break;
      }

      // ─── Subscription deleted ────────────────────────────────
      case 'customer.subscription.deleted': {
        const synced = await syncStripeBillingState(supabase, event, data);
        if (synced.legacyAppId) await recalculateAppMetrics(supabase, synced.legacyAppId);
        break;
      }

      // ─── Invoice paid / failed (ledger + access lifecycle) ───
      case 'invoice.paid': {
        const synced = await syncStripeBillingState(supabase, event, data);
        if (synced.legacyAppId) await recalculateAppMetrics(supabase, synced.legacyAppId);
        break;
      }

      case 'invoice.payment_failed': {
        const synced = await syncStripeBillingState(supabase, event, data);
        if (synced.legacyAppId) await recalculateAppMetrics(supabase, synced.legacyAppId);
        break;
      }

      // ─── Checkout completed (one-time or first subscription) ──
      case 'checkout.session.completed': {
        // Book PDF purchase on freddybremseth.com: create the download
        // grant and send the customer their permanent link.
        if (data.metadata?.book_scope) {
          const scope = data.metadata.book_scope === 'all' ? 'all' : 'single';
          const { randomBytes } = await import('node:crypto');
          const email = data.customer_details?.email || null;
          const { data: grant, error: grantError } = await supabase
            .from('book_download_grants')
            .insert({
              token: randomBytes(24).toString('hex'),
              email,
              scope,
              book_id: scope === 'single' ? data.metadata.book_id || null : null,
              stripe_session_id: data.id,
            })
            .select('token')
            .single();

          if (grantError) throw new Error(`Create book download grant: ${grantError.message}`);

          if (grant && email) {
            const base = process.env.BOOKS_SITE_BASE_URL || 'https://www.freddybremseth.com';
            const link = `${base}/nedlasting.html?token=${grant.token}`;
            const { sendBrandEmail } = await import('@/services/email/send-brand-email');
            await sendBrandEmail(supabase, {
              brandId: process.env.BOOKS_EMAIL_BRAND_ID || 'chatgenius',
              to: [email],
              subject: scope === 'all' ? 'Dine bøker er klare — ubegrenset nedlasting' : 'Boken din er klar for nedlasting',
              bodyText: `Takk for kjøpet!

Last ned ${scope === 'all' ? 'alle bøkene' : 'boken'} her (lenken er personlig og varer evig):
${link}

God lesing!
Freddy Bremseth`,
            }).catch(() => ({ success: false }));
          }
          console.log(`[Stripe Webhook] Book grant created for session ${data.id} (${scope})`);
          break;
        }

        // DemoSites purchase: mark the order paid + claimed automatically.
        const demositeOrderId = data.metadata?.demosite_order_id;
        if (demositeOrderId) {
          const paidAt = new Date().toISOString();
          const order = requireDbResult<any>(await supabase
            .from('demo_site_orders')
            .select('id, status, editable_fields, company_name')
            .eq('id', demositeOrderId)
            .maybeSingle(), 'Find DemoSites order');

          if (order) {
            const fields = { ...(order.editable_fields || {}) };
            fields.stripe = {
              checkout_session_id: data.id,
              customer_id: data.customer || null,
              subscription_id: data.subscription || null,
              paid_at: paidAt,
            };
            if (data.metadata?.seo_addon === 'true') {
              fields.addons = { ...(fields.addons || {}), seo: true };
            }

            requireDbResult(await supabase.from('demo_site_orders').update({
              billing_status: 'paid',
              status: order.status === 'deployed' ? 'deployed' : 'approved',
              claimed_at: paidAt,
              editable_fields: fields,
            }).eq('id', demositeOrderId), 'Mark DemoSites order paid');

            requireDbResult(await supabase.from('demo_site_order_events').upsert({
              order_id: demositeOrderId,
              stripe_event_id: event.id,
              event_type: 'demo_paid',
              title: 'Betaling mottatt via Stripe',
              description: `${order.company_name} har betalt oppstart + abonnement. Siden kan publiseres.`,
              metadata: {
                checkout_session_id: data.id,
                customer_id: data.customer || null,
                subscription_id: data.subscription || null,
                amount_total: data.amount_total || null,
                currency: data.currency || null,
              },
            }, { onConflict: 'stripe_event_id' }), 'Record DemoSites payment event');

            console.log(`[Stripe Webhook] DemoSites order ${demositeOrderId} marked paid`);

            // Delivery: publish the live site the second the payment lands.
            try {
              const { publishDemoSiteOrder } = await import('@/lib/demosites-publish');
              const publishResult = await publishDemoSiteOrder(supabase, demositeOrderId);
              console.log('[Stripe Webhook] DemoSites auto-publish:', JSON.stringify(publishResult));
            } catch (publishError) {
              console.error('[Stripe Webhook] DemoSites auto-publish failed:', publishError);
            }
          }
          break;
        }

        const appSlug = data.metadata?.app_slug;
        if (!appSlug) break;

        const app = requireDbResult<any>(await supabase
          .from('saas_apps')
          .select('id, total_users')
          .eq('slug', appSlug)
          .maybeSingle(), 'Find SaaS app for checkout');

        if (app) {
          // Increment total users
          requireDbResult(await supabase.from('saas_apps').update({
            total_users: (app.total_users || 0) + 1,
          }).eq('id', app.id), 'Increment SaaS users');

          // Track signup in analytics
          const today = new Date().toISOString().split('T')[0];
          const existing = requireDbResult<any>(await supabase
            .from('saas_analytics')
            .select('signups')
            .eq('app_id', app.id)
            .eq('date', today)
            .maybeSingle(), 'Read SaaS signup metrics');

          requireDbResult(await supabase.from('saas_analytics').upsert({
            app_id: app.id,
            date: today,
            signups: (existing?.signups || 0) + 1,
          }, { onConflict: 'app_id,date' }), 'Update SaaS signup metrics');
        }
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event: ${type}`);
    }

    requireDbResult(await supabase.rpc('saas_complete_stripe_event', {
      p_event_id: event.id,
      p_tenant_id: null,
    }), 'Complete Stripe event');

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error:', error);
    if (eventId && supabase) {
      const failed = await supabase.rpc('saas_fail_stripe_event', {
        p_event_id: eventId,
        p_error_message: error instanceof Error ? error.message : 'Webhook error',
      });
      if (failed.error) {
        console.error('[Stripe Webhook] Could not mark event failed:', failed.error.message);
      }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook error' },
      { status: 500 }
    );
  }
}

type StripeBillingSync = {
  tenantId?: string | null;
  legacyAppId?: string | null;
};

async function syncStripeBillingState(
  supabase: any,
  event: StripeEvent,
  object: StripeObject,
): Promise<StripeBillingSync> {
  const result = requireDbResult<StripeBillingSync>(await supabase.rpc('saas_sync_stripe_billing_state', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_object: object,
    p_grace_days: 7,
  }), 'Synchronize Stripe billing state');

  return result || {};
}

/**
 * Recalculate MRR, ARR, active users, churn for an app
 */
async function recalculateAppMetrics(supabase: any, appId: string) {
  try {
    // Get all active subscriptions
    const { data: subs } = await supabase
      .from('saas_subscriptions')
      .select('*')
      .eq('app_id', appId)
      .eq('status', 'active');

    const activeSubs = subs || [];
    let mrr = 0;

    for (const sub of activeSubs) {
      if (sub.billing_cycle === 'yearly') {
        mrr += (sub.amount || 0) / 12;
      } else {
        mrr += sub.amount || 0;
      }
    }

    // Count cancelled in last 30 days for churn
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: cancelledCount } = await supabase
      .from('saas_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', appId)
      .eq('status', 'cancelled')
      .gte('cancelled_at', thirtyDaysAgo.toISOString());

    const { count: totalEverActive } = await supabase
      .from('saas_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', appId);

    const churnRate = totalEverActive && totalEverActive > 0
      ? ((cancelledCount || 0) / totalEverActive) * 100
      : 0;

    await supabase.from('saas_apps').update({
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(mrr * 12 * 100) / 100,
      active_users_30d: activeSubs.length,
      churn_rate: Math.round(churnRate * 10) / 10,
    }).eq('id', appId);
  } catch (err) {
    console.error('[Stripe] Metrics recalc error:', err);
  }
}
