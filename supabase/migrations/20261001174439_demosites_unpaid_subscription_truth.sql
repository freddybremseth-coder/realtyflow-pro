-- Preserve payment truth for DemoSites subscriptions.
-- Unpaid/not-yet-invoiced orders must never look like started subscriptions.
-- This migration cleans legacy false timestamps and prevents recurrence.

update public.demo_site_orders
set subscription_started_at = null,
    subscription_renews_at = null,
    updated_at = now()
where billing_status in ('not_invoiced','pending')
  and (subscription_started_at is not null or subscription_renews_at is not null);

alter table public.demo_site_orders
  drop constraint if exists demo_site_orders_unpaid_subscription_dates_check;

alter table public.demo_site_orders
  add constraint demo_site_orders_unpaid_subscription_dates_check
  check (
    billing_status not in ('not_invoiced','pending')
    or (subscription_started_at is null and subscription_renews_at is null)
  );
