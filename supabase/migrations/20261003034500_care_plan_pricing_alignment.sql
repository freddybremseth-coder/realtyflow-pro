-- Align operational Care plan prices with the current public Zen Eco Homes Care offer.
-- Public pricing: Basic €55, Standard €89, Premium €169 per month.
-- This keeps onboarding contracts, plan snapshots and MRR consistent with care.zenecohomes.com.

update care.kh_plans
set price_cents = case lower(code)
  when 'basic' then 5500
  when 'standard' then 8900
  when 'premium' then 16900
  else price_cents
end
where lower(code) in ('basic', 'standard', 'premium')
  and price_cents is distinct from case lower(code)
    when 'basic' then 5500
    when 'standard' then 8900
    when 'premium' then 16900
    else price_cents
  end;
