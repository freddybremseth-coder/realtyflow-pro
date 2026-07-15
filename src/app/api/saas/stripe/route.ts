import { NextRequest, NextResponse } from 'next/server';
import { getSaasSupabase } from '@/lib/saas-api-supabase';
import { verifyStripeWebhookSignature } from '@/lib/stripe-webhook';

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

    let event: any;
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      console.warn('[Stripe Webhook] Supabase not configured');
      return NextResponse.json({ received: true, warning: 'Supabase not configured' });
    }

    const type = event.type;
    const data = event.data?.object;

    console.log(`[Stripe Webhook] ${type}`, data?.id);

    switch (type) {
      // ─── New subscription created ────────────────────────────
      case 'customer.subscription.created': {
        const appSlug = data.metadata?.app_slug;
        if (!appSlug) break;

        // Find app by slug
        const { data: app } = await supabase
          .from('saas_apps')
          .select('id')
          .eq('slug', appSlug)
          .single();

        if (app) {
          // Create subscription record
          await supabase.from('saas_subscriptions').insert({
            app_id: app.id,
            customer_email: data.customer_email || data.metadata?.customer_email || '',
            customer_name: data.metadata?.customer_name,
            plan: data.metadata?.plan || 'basic',
            status: data.status === 'active' ? 'active' : 'trialing',
            amount: (data.items?.data?.[0]?.price?.unit_amount || 0) / 100,
            currency: data.currency?.toUpperCase() || 'USD',
            billing_cycle: data.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly',
            stripe_customer_id: data.customer,
            stripe_subscription_id: data.id,
            next_billing_at: data.current_period_end
              ? new Date(data.current_period_end * 1000).toISOString()
              : null,
          });

          // Update app metrics
          await recalculateAppMetrics(supabase, app.id);
        }
        break;
      }

      // ─── Subscription updated (upgrade/downgrade/cancel) ─────
      case 'customer.subscription.updated': {
        const subId = data.id;
        const { data: existingSub } = await supabase
          .from('saas_subscriptions')
          .select('id, app_id')
          .eq('stripe_subscription_id', subId)
          .single();

        if (existingSub) {
          const newStatus = data.cancel_at_period_end ? 'cancelled' :
            data.status === 'active' ? 'active' :
            data.status === 'past_due' ? 'past_due' : 'active';

          await supabase.from('saas_subscriptions').update({
            status: newStatus,
            amount: (data.items?.data?.[0]?.price?.unit_amount || 0) / 100,
            cancelled_at: data.canceled_at
              ? new Date(data.canceled_at * 1000).toISOString()
              : null,
            next_billing_at: data.current_period_end
              ? new Date(data.current_period_end * 1000).toISOString()
              : null,
          }).eq('id', existingSub.id);

          await recalculateAppMetrics(supabase, existingSub.app_id);
        }
        break;
      }

      // ─── Subscription deleted ────────────────────────────────
      case 'customer.subscription.deleted': {
        const subId = data.id;
        const { data: existingSub } = await supabase
          .from('saas_subscriptions')
          .select('id, app_id')
          .eq('stripe_subscription_id', subId)
          .single();

        if (existingSub) {
          await supabase.from('saas_subscriptions').update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
          }).eq('id', existingSub.id);

          await recalculateAppMetrics(supabase, existingSub.app_id);
        }
        break;
      }

      // ─── Invoice paid (revenue tracking) ─────────────────────
      case 'invoice.paid': {
        const subId = data.subscription;
        if (!subId) break;

        const { data: existingSub } = await supabase
          .from('saas_subscriptions')
          .select('app_id')
          .eq('stripe_subscription_id', subId)
          .single();

        if (existingSub) {
          const amount = (data.amount_paid || 0) / 100;

          // Add to total revenue
          try {
            await supabase.rpc('increment_app_revenue', {
              p_app_id: existingSub.app_id,
              p_amount: amount,
            });
          } catch {
            // Fallback: manual update if RPC doesn't exist
            const { data: app } = await supabase
              .from('saas_apps')
              .select('total_revenue')
              .eq('id', existingSub.app_id)
              .single();
            if (app) {
              await supabase.from('saas_apps').update({
                total_revenue: (app.total_revenue || 0) + amount,
              }).eq('id', existingSub.app_id);
            }
          }

          // Add to daily analytics
          const today = new Date().toISOString().split('T')[0];
          await supabase.from('saas_analytics').upsert({
            app_id: existingSub.app_id,
            date: today,
            revenue: amount,
          }, { onConflict: 'app_id,date' });
        }
        break;
      }

      // ─── Checkout completed (one-time or first subscription) ──
      case 'checkout.session.completed': {
        // DemoSites purchase: mark the order paid + claimed automatically.
        const demositeOrderId = data.metadata?.demosite_order_id;
        if (demositeOrderId) {
          const paidAt = new Date().toISOString();
          const { data: order } = await supabase
            .from('demo_site_orders')
            .select('id, status, editable_fields, company_name')
            .eq('id', demositeOrderId)
            .maybeSingle();

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

            await supabase.from('demo_site_orders').update({
              billing_status: 'paid',
              status: order.status === 'deployed' ? 'deployed' : 'approved',
              claimed_at: paidAt,
              editable_fields: fields,
            }).eq('id', demositeOrderId);

            await supabase.from('demo_site_order_events').insert({
              order_id: demositeOrderId,
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
            });

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

        const { data: app } = await supabase
          .from('saas_apps')
          .select('id, total_users')
          .eq('slug', appSlug)
          .single();

        if (app) {
          // Increment total users
          await supabase.from('saas_apps').update({
            total_users: (app.total_users || 0) + 1,
          }).eq('id', app.id);

          // Track signup in analytics
          const today = new Date().toISOString().split('T')[0];
          const { data: existing } = await supabase
            .from('saas_analytics')
            .select('signups')
            .eq('app_id', app.id)
            .eq('date', today)
            .single();

          await supabase.from('saas_analytics').upsert({
            app_id: app.id,
            date: today,
            signups: (existing?.signups || 0) + 1,
          }, { onConflict: 'app_id,date' });
        }
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event: ${type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook error' },
      { status: 500 }
    );
  }
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
