-- Growth Hub hardening: keep legacy JSON metrics and canonical flat result columns in sync.
-- This lets AutonomousGrowthEngine keep reading/writing metrics while newer APIs use
-- impressions/clicks/conversions/leads_generated directly.

alter table public.growth_actions add column if not exists metrics jsonb;
alter table public.growth_actions add column if not exists metrics_b jsonb;

create or replace function public.sync_growth_action_metrics_compat()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.metrics is not null then
      new.impressions := coalesce((new.metrics->>'impressions')::int, (new.metrics->>'views')::int, new.impressions, 0);
      new.clicks := coalesce((new.metrics->>'clicks')::int, new.clicks, 0);
      new.conversions := coalesce((new.metrics->>'conversions')::int, new.conversions, 0);
      new.engagement_rate := coalesce((new.metrics->>'engagement_rate')::real, new.engagement_rate, 0);
      new.shares := coalesce((new.metrics->>'shares')::int, new.shares, 0);
      new.leads_generated := coalesce((new.metrics->>'leads_generated')::int, (new.metrics->>'leads')::int, new.leads_generated, 0);
    else
      new.metrics := jsonb_build_object('impressions',coalesce(new.impressions,0),'views',coalesce(new.impressions,0),'clicks',coalesce(new.clicks,0),'conversions',coalesce(new.conversions,0),'engagement_rate',coalesce(new.engagement_rate,0),'shares',coalesce(new.shares,0),'leads_generated',coalesce(new.leads_generated,0));
    end if;

    if new.metrics_b is not null then
      new.impressions_b := coalesce((new.metrics_b->>'impressions')::int, (new.metrics_b->>'views')::int, new.impressions_b, 0);
      new.clicks_b := coalesce((new.metrics_b->>'clicks')::int, new.clicks_b, 0);
      new.conversions_b := coalesce((new.metrics_b->>'conversions')::int, new.conversions_b, 0);
      new.engagement_rate_b := coalesce((new.metrics_b->>'engagement_rate')::real, new.engagement_rate_b, 0);
      new.shares_b := coalesce((new.metrics_b->>'shares')::int, new.shares_b, 0);
      new.leads_generated_b := coalesce((new.metrics_b->>'leads_generated')::int, (new.metrics_b->>'leads')::int, new.leads_generated_b, 0);
    else
      new.metrics_b := jsonb_build_object('impressions',coalesce(new.impressions_b,0),'views',coalesce(new.impressions_b,0),'clicks',coalesce(new.clicks_b,0),'conversions',coalesce(new.conversions_b,0),'engagement_rate',coalesce(new.engagement_rate_b,0),'shares',coalesce(new.shares_b,0),'leads_generated',coalesce(new.leads_generated_b,0));
    end if;
  else
    if new.metrics is distinct from old.metrics then
      new.impressions := coalesce((new.metrics->>'impressions')::int, (new.metrics->>'views')::int, 0);
      new.clicks := coalesce((new.metrics->>'clicks')::int, 0);
      new.conversions := coalesce((new.metrics->>'conversions')::int, 0);
      new.engagement_rate := coalesce((new.metrics->>'engagement_rate')::real, 0);
      new.shares := coalesce((new.metrics->>'shares')::int, 0);
      new.leads_generated := coalesce((new.metrics->>'leads_generated')::int, (new.metrics->>'leads')::int, 0);
    elsif row(new.impressions,new.clicks,new.conversions,new.engagement_rate,new.shares,new.leads_generated) is distinct from row(old.impressions,old.clicks,old.conversions,old.engagement_rate,old.shares,old.leads_generated) then
      new.metrics := jsonb_build_object('impressions',coalesce(new.impressions,0),'views',coalesce(new.impressions,0),'clicks',coalesce(new.clicks,0),'conversions',coalesce(new.conversions,0),'engagement_rate',coalesce(new.engagement_rate,0),'shares',coalesce(new.shares,0),'leads_generated',coalesce(new.leads_generated,0));
    end if;

    if new.metrics_b is distinct from old.metrics_b then
      new.impressions_b := coalesce((new.metrics_b->>'impressions')::int, (new.metrics_b->>'views')::int, 0);
      new.clicks_b := coalesce((new.metrics_b->>'clicks')::int, 0);
      new.conversions_b := coalesce((new.metrics_b->>'conversions')::int, 0);
      new.engagement_rate_b := coalesce((new.metrics_b->>'engagement_rate')::real, 0);
      new.shares_b := coalesce((new.metrics_b->>'shares')::int, 0);
      new.leads_generated_b := coalesce((new.metrics_b->>'leads_generated')::int, (new.metrics_b->>'leads')::int, 0);
    elsif row(new.impressions_b,new.clicks_b,new.conversions_b,new.engagement_rate_b,new.shares_b,new.leads_generated_b) is distinct from row(old.impressions_b,old.clicks_b,old.conversions_b,old.engagement_rate_b,old.shares_b,old.leads_generated_b) then
      new.metrics_b := jsonb_build_object('impressions',coalesce(new.impressions_b,0),'views',coalesce(new.impressions_b,0),'clicks',coalesce(new.clicks_b,0),'conversions',coalesce(new.conversions_b,0),'engagement_rate',coalesce(new.engagement_rate_b,0),'shares',coalesce(new.shares_b,0),'leads_generated',coalesce(new.leads_generated_b,0));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_growth_action_metrics_compat on public.growth_actions;
create trigger trg_sync_growth_action_metrics_compat
before insert or update on public.growth_actions
for each row execute function public.sync_growth_action_metrics_compat();

update public.growth_actions
set metrics = jsonb_build_object('impressions',coalesce(impressions,0),'views',coalesce(impressions,0),'clicks',coalesce(clicks,0),'conversions',coalesce(conversions,0),'engagement_rate',coalesce(engagement_rate,0),'shares',coalesce(shares,0),'leads_generated',coalesce(leads_generated,0)),
    metrics_b = jsonb_build_object('impressions',coalesce(impressions_b,0),'views',coalesce(impressions_b,0),'clicks',coalesce(clicks_b,0),'conversions',coalesce(conversions_b,0),'engagement_rate',coalesce(engagement_rate_b,0),'shares',coalesce(shares_b,0),'leads_generated',coalesce(leads_generated_b,0))
where metrics is null or metrics_b is null;
