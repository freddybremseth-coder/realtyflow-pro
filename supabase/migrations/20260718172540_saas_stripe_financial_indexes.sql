-- Cover every foreign key introduced or touched by the SaaS financial
-- hardening migration. This keeps parent updates/deletes and billing lookups
-- efficient as invoice volume grows.

create index if not exists core_stripe_invoices_tenant_subscription_idx
  on core.stripe_invoices (tenant_subscription_id)
  where tenant_subscription_id is not null;

create index if not exists core_stripe_invoices_legacy_subscription_idx
  on core.stripe_invoices (legacy_subscription_id)
  where legacy_subscription_id is not null;

create index if not exists core_stripe_invoices_legacy_app_idx
  on core.stripe_invoices (legacy_app_id)
  where legacy_app_id is not null;

create index if not exists core_stripe_invoices_last_event_idx
  on core.stripe_invoices (last_stripe_event_id)
  where last_stripe_event_id is not null;

create index if not exists saas_opportunities_saas_app_idx
  on public.saas_opportunities (saas_app_id)
  where saas_app_id is not null;
