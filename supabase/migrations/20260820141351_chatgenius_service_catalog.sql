-- ChatGenius service catalog
-- Public sales pages live on chatgenius.pro. RealtyFlow owns the operational
-- catalog used for Stripe setup, ad campaigns, budgets and reporting.

create table if not exists public.chatgenius_services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  brand_id text not null default 'chatgenius',
  saas_app_slug text,
  name text not null,
  short_name text,
  service_type text not null default 'service',
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'archived')),
  source_url text,
  public_url text,
  booking_url text,
  description text,
  audience text,
  offer text,
  cta_label text,
  pricing_model text not null default 'custom' check (pricing_model in ('free', 'hourly', 'fixed', 'subscription', 'project', 'custom')),
  price_amount numeric(12,2),
  currency text not null default 'NOK',
  billing_interval text,
  setup_fee_amount numeric(12,2),
  monthly_fee_amount numeric(12,2),
  stripe_product_id text,
  stripe_price_id text,
  stripe_mode text not null default 'manual_invoice',
  stripe_status text not null default 'needs_setup' check (stripe_status in ('not_required', 'manual', 'needs_setup', 'configured')),
  recommended_budget_amount numeric(12,2) not null default 0,
  recommended_budget_currency text not null default 'NOK',
  recommended_budget_period text not null default 'month',
  campaign_objective text,
  campaign_channels text[] not null default '{}'::text[],
  campaign_angles text[] not null default '{}'::text[],
  funnel_stage text not null default 'lead',
  readiness text not null default 'campaign_ready',
  priority integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chatgenius_services_brand_status_idx
  on public.chatgenius_services (brand_id, status, priority);

create index if not exists chatgenius_services_saas_app_idx
  on public.chatgenius_services (saas_app_slug);

create index if not exists chatgenius_services_stripe_status_idx
  on public.chatgenius_services (stripe_status);

create index if not exists chatgenius_services_campaign_channels_gin_idx
  on public.chatgenius_services using gin (campaign_channels);

create or replace function public.set_chatgenius_services_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chatgenius_services_updated_at on public.chatgenius_services;
create trigger chatgenius_services_updated_at
  before update on public.chatgenius_services
  for each row
  execute function public.set_chatgenius_services_updated_at();

alter table public.chatgenius_services enable row level security;

revoke all on public.chatgenius_services from public, anon, authenticated;
grant select, insert, update, delete on public.chatgenius_services to service_role;
revoke execute on function public.set_chatgenius_services_updated_at() from public;
revoke execute on function public.set_chatgenius_services_updated_at() from anon;
revoke execute on function public.set_chatgenius_services_updated_at() from authenticated;
grant execute on function public.set_chatgenius_services_updated_at() to service_role;

drop policy if exists chatgenius_services_service_select on public.chatgenius_services;
create policy chatgenius_services_service_select
  on public.chatgenius_services for select
  to service_role
  using (true);

drop policy if exists chatgenius_services_service_insert on public.chatgenius_services;
create policy chatgenius_services_service_insert
  on public.chatgenius_services for insert
  to service_role
  with check (true);

drop policy if exists chatgenius_services_service_update on public.chatgenius_services;
create policy chatgenius_services_service_update
  on public.chatgenius_services for update
  to service_role
  using (true)
  with check (true);

drop policy if exists chatgenius_services_service_delete on public.chatgenius_services;
create policy chatgenius_services_service_delete
  on public.chatgenius_services for delete
  to service_role
  using (true);

drop policy if exists chatgenius_services_deny_browser_direct on public.chatgenius_services;
create policy chatgenius_services_deny_browser_direct
  on public.chatgenius_services for all
  to anon, authenticated
  using (false)
  with check (false);

insert into public.chatgenius_services (
  slug, brand_id, saas_app_slug, name, short_name, service_type, status,
  source_url, public_url, booking_url, description, audience, offer, cta_label,
  pricing_model, price_amount, currency, billing_interval, setup_fee_amount, monthly_fee_amount,
  stripe_mode, stripe_status, recommended_budget_amount, recommended_budget_currency,
  recommended_budget_period, campaign_objective, campaign_channels, campaign_angles,
  funnel_stage, readiness, priority, metadata
) values
(
  'ai-opplaering-radgivning',
  'chatgenius',
  'chatgenius',
  'AI-opplæring og rådgivning',
  'AI-opplæring',
  'training',
  'published',
  'https://www.chatgenius.pro/#ai-training',
  'https://www.chatgenius.pro/#ai-training',
  'https://appointment.chatgenius.pro/booking.html?brand=chat',
  'Personlig opplæring for bedrifter som vil forstå og bruke AI i faktiske arbeidsprosesser.',
  'Ledere, gründere, markedsførere, rådgivere og små bedrifter som vil bli tryggere og raskere med AI.',
  '890 NOK per time. Før oppstart settes mål, fase 1/2-plan, estimat og dokumentasjon/oppskrifter for kunden.',
  'Book AI-opplæring',
  'hourly',
  890,
  'NOK',
  'hour',
  null,
  null,
  'manual_invoice',
  'manual',
  7000,
  'NOK',
  'month',
  'Booke kvalifiserte AI-opplæringskunder som vil ha plan, rådgivning og praktisk innføring.',
  array['LinkedIn', 'Facebook/Instagram', 'Google Search', 'E-post'],
  array[
    'AI-opplæring som ender i konkrete arbeidsflyter, ikke bare inspirasjon',
    'Få en realistisk faseplan og kostnadsestimat før du starter',
    'Lær når du bør bruke ChatGPT, Claude, Gemini, Perplexity og bildegeneratorer'
  ],
  'booking',
  'campaign_ready',
  10,
  '{"expertise_since":"2022","deliverables":["faseplan","kostnadsestimat","dokumentasjon","oppskrifter","prompt-malverk"],"topics":["creative workflow","analytical workflow","AI model selection","prompting","backend","database"]}'::jsonb
),
(
  'ai-mulighetssamtale',
  'chatgenius',
  'chatgenius',
  'AI-mulighetssamtale',
  'Gratis AI-samtale',
  'consulting',
  'published',
  'https://www.chatgenius.pro/#booking',
  'https://www.chatgenius.pro/#booking',
  'https://appointment.chatgenius.pro/booking.html?brand=chat',
  'Uforpliktende kartlegging av hvordan AI kan hjelpe en bedrift med salg, kundedialog, oppfølging eller automatisering.',
  'Bedrifter som er nysgjerrige på AI, men trenger en trygg første vurdering.',
  'Gratis samtale som kvalifiserer behov, modenhet og neste anbefalte steg.',
  'Book gratis AI-samtale',
  'free',
  0,
  'NOK',
  'session',
  null,
  null,
  'booking',
  'not_required',
  3500,
  'NOK',
  'month',
  'Få flere gratis kartleggingssamtaler med bedrifter som har et tydelig problem å løse.',
  array['Facebook/Instagram', 'Google Search', 'LinkedIn'],
  array[
    'Vet du ikke hva AI kan gjøre i bedriften din? Start med en gratis kartlegging',
    'Finn de første 2-3 prosessene AI kan effektivisere',
    'Få ærlig råd før du kjøper verktøy eller bygger noe'
  ],
  'lead',
  'campaign_ready',
  20,
  '{"crm_destination":"realtyflow.chatgenius.pro","booking_brand":"chatgenius"}'::jsonb
),
(
  'ai-salgsfunnel-gjennomgang',
  'chatgenius',
  'chatgenius',
  'AI og salgsfunnel-gjennomgang',
  'Funnel-gjennomgang',
  'audit',
  'published',
  'https://www.chatgenius.pro/#booking',
  'https://www.chatgenius.pro/#booking',
  'https://appointment.chatgenius.pro/booking.html?brand=chat',
  'Betalt gjennomgang av nettside, leadfangst, kundereise og oppfølging med konkrete AI-forbedringer.',
  'Bedrifter med trafikk eller leads som ikke konverterer godt nok.',
  'Gjennomgang av hva som skjer etter første kontakt, hvor leads lekker, og hva AI kan automatisere.',
  'Book funnel-gjennomgang',
  'fixed',
  195,
  'EUR',
  'session',
  195,
  null,
  'checkout',
  'needs_setup',
  4500,
  'NOK',
  'month',
  'Selge betalte salgsfunnel-audits til bedrifter med konkrete vekstutfordringer.',
  array['LinkedIn', 'Google Search', 'Retargeting'],
  array[
    'Se hvor leads forsvinner før du bruker mer annonsepenger',
    'Få AI-forslag til oppfølging, booking og CRM-flyt',
    'Én gjennomgang kan gi neste automatiseringsprosjekt'
  ],
  'conversion',
  'needs_stripe_price',
  30,
  '{"recommended_form":"Skjema for AI-samtale","crm_destination":"realtyflow.chatgenius.pro"}'::jsonb
),
(
  'skreddersydd-ai-app',
  'chatgenius',
  'chatgenius',
  'Skreddersydd AI-app og internt system',
  'AI-appbygging',
  'app_build',
  'published',
  'https://www.chatgenius.pro/#apps',
  'https://www.chatgenius.pro/#apps',
  'https://appointment.chatgenius.pro/booking.html?brand=chat',
  'Ferdige apper og interne systemer bygget rundt kundens prosess, data, CRM, backend og betalingsflyt.',
  'Bedrifter som vil ha et verktøy som faktisk gjør arbeid, ikke bare en chatbot på siden.',
  'Prosjekt deles i faser med scope, estimat, teknologi-anbefaling og leveranser før utvikling starter.',
  'Planlegg app',
  'project',
  null,
  'NOK',
  'project',
  25000,
  1500,
  'manual_invoice',
  'needs_setup',
  12000,
  'NOK',
  'month',
  'Fange bedrifter som trenger skreddersydd AI-app, automatisering eller intern portal.',
  array['LinkedIn', 'Google Search', 'YouTube', 'E-post'],
  array[
    'Fra ide til fungerende app med database, backend og betalingsflyt',
    'Du får anbefalt riktig språk, database og arkitektur for caset ditt',
    'Bygg mindre først, mål effekten, utvid i fase 2'
  ],
  'sales',
  'campaign_ready',
  40,
  '{"phase_model":["fase 1: prototype og datamodell","fase 2: integrasjoner og automasjon","fase 3: lansering og drift"],"admin_home":"realtyflow.chatgenius.pro"}'::jsonb
),
(
  'automatisering-effektivisering',
  'chatgenius',
  'chatgenius',
  'Automatisering og effektivisering',
  'AI-effektivisering',
  'automation',
  'published',
  'https://www.chatgenius.pro/#automation',
  'https://www.chatgenius.pro/#automation',
  'https://appointment.chatgenius.pro/booking.html?brand=chat',
  'Kartlegging og bygging av automatiserte arbeidsflyter for oppfølging, innhold, CRM, rapportering og kundeservice.',
  'Små og mellomstore bedrifter med manuelt arbeid, sviktende oppfølging eller lite tid.',
  'Kunden får en konkret automasjonsplan og kan kjøpe implementering eller opplæring.',
  'Finn automasjoner',
  'hourly',
  890,
  'NOK',
  'hour',
  null,
  null,
  'manual_invoice',
  'manual',
  6000,
  'NOK',
  'month',
  'Selge rådgivning og implementering av AI-flyter som sparer timer hver uke.',
  array['LinkedIn', 'Facebook/Instagram', 'Google Search'],
  array[
    'Automatiser oppfølgingen uten å miste den personlige tonen',
    'Få oversikt over hvor manuelt arbeid kan fjernes',
    'Koble skjema, CRM, e-post, innhold og rapportering'
  ],
  'consideration',
  'campaign_ready',
  50,
  '{"deliverables":["prosesskart","automations backlog","implementeringsplan","prompt-oppskrifter"]}'::jsonb
),
(
  'demosites-nettsidepakke',
  'chatgenius',
  'demosites',
  'DemoSites nettsidepakke',
  'DemoSites',
  'website_package',
  'published',
  'https://www.chatgenius.pro/demosites/',
  'https://www.chatgenius.pro/demosites/',
  'https://appointment.chatgenius.pro/booking.html?brand=chat',
  'Produktisert nettsidepakke med demo-maler, bestillingsskjema, CRM, preview og abonnement/MRR-sporing.',
  'Lokale bedrifter som trenger en bedre nettside, leadfangst og en enkel digital resepsjonist.',
  'Fra 4 900 NOK setup + 490 NOK per måned. Standardpakken kobler nettside og AI-resepsjonist.',
  'Se DemoSites',
  'subscription',
  490,
  'NOK',
  'month',
  4900,
  490,
  'checkout',
  'configured',
  8000,
  'NOK',
  'month',
  'Skaffe lokale bedrifter som vil ha ny nettside, leads og månedlig drift.',
  array['Facebook/Instagram', 'Google Search', 'Lokale partnerskap'],
  array[
    'Ny nettside raskt, med AI-chat og leadfangst',
    'Én ekstra kunde kan betale månedsprisen',
    'Få preview før kunden bestemmer seg'
  ],
  'lead',
  'stripe_ready',
  60,
  '{"packages":[{"id":"basis","setupFeeNok":4900,"monthlyFeeNok":490},{"id":"standard","setupFeeNok":7900,"monthlyFeeNok":990},{"id":"premium","setupFeeNok":14900,"monthlyFeeNok":1990}],"crm_path":"/demosites"}'::jsonb
),
(
  'ai-resepsjonist-chatbot',
  'chatgenius',
  'chatgenius',
  'AI-resepsjonist og chatbot',
  'AI-resepsjonist',
  'chatbot',
  'published',
  'https://www.chatgenius.pro/#chatbot',
  'https://www.chatgenius.pro/#chatbot',
  'https://appointment.chatgenius.pro/booking.html?brand=chat',
  'Chatbot og digital resepsjonist som svarer på spørsmål, samler leads og sender kunden videre til riktig oppfølging.',
  'Bedrifter med mange like spørsmål, bookingbehov eller leads som bør kvalifiseres før kontakt.',
  'Kan selges alene eller som del av DemoSites/AI-app-prosjekt.',
  'Planlegg chatbot',
  'subscription',
  990,
  'NOK',
  'month',
  7900,
  990,
  'checkout',
  'needs_setup',
  7000,
  'NOK',
  'month',
  'Selge chatbot som leadmotor og kundeservice, spesielt til lokale bedrifter.',
  array['Google Search', 'Facebook/Instagram', 'Retargeting'],
  array[
    'Svar kundene etter stengetid',
    'Ikke mist leads som ikke gidder å ringe',
    'Tren boten på bedriftens egne tjenester, priser og FAQ'
  ],
  'lead',
  'needs_stripe_price',
  70,
  '{"integrations":["CRM","email","booking","forms"],"can_bundle_with":"demosites-nettsidepakke"}'::jsonb
),
(
  'realtyflow-crm-marketing',
  'chatgenius',
  'realtyflow',
  'RealtyFlow CRM, kampanjer og økonomi',
  'RealtyFlow',
  'internal_platform',
  'published',
  'https://realtyflow.chatgenius.pro',
  'https://realtyflow.chatgenius.pro',
  null,
  'Adminplattformen som styrer CRM, annonser, kampanjer, økonomi, Stripe, budsjetter, publisering og app-portefølje.',
  'Internt operativt system og demonstrasjon av hva ChatGenius kan bygge for kunder.',
  'Brukes som kontrollrom for ChatGenius, RealtyFlow, DemoSites, Remaster og tilknyttede apper.',
  'Åpne RealtyFlow',
  'custom',
  null,
  'NOK',
  null,
  null,
  null,
  'manual_invoice',
  'not_required',
  5000,
  'NOK',
  'month',
  'Vise troverdighet gjennom eget operativt AI-system og selge tilsvarende systembygging.',
  array['LinkedIn', 'YouTube', 'E-post'],
  array[
    'Dette er ikke teori: ChatGenius bruker sin egen AI-backend til drift',
    'Se hvordan CRM, annonser, økonomi og app-portefølje kan samles',
    'Bygg et kontrollrom rundt din egen bedrift'
  ],
  'trust',
  'campaign_ready',
  80,
  '{"role":"admin_backend","domains":["realtyflow.chatgenius.pro"],"controls":["campaigns","ads","finance","stripe","budgets","publishing"]}'::jsonb
),
(
  'olivia-farm-iot',
  'chatgenius',
  'olivia',
  'Olivia gårdsoversikt og IoT',
  'Olivia AI',
  'vertical_app',
  'published',
  'https://olivia.donaanna.com',
  'https://olivia.donaanna.com',
  null,
  'Gårdsoversikt for Doña Anna med IoT-sensorer, regnskap, produksjon, oppskrifter og sporbar drift.',
  'Gårdsdrift, produksjonsbedrifter og nisjer som trenger skreddersydd driftskontroll.',
  'Brukes som referansecase for vertikale AI-systemer med data, drift og økonomi.',
  'Se Olivia',
  'custom',
  null,
  'NOK',
  null,
  null,
  null,
  'manual_invoice',
  'not_required',
  3500,
  'NOK',
  'month',
  'Bruke Olivia som bevis på spesialiserte systemer for drift, IoT og produksjon.',
  array['LinkedIn', 'Nisjeinnhold', 'E-post'],
  array[
    'Fra gårdsdata til styring, økonomi og produksjon i ett system',
    'IoT og regnskap kan bli praktiske arbeidsflater, ikke bare rapporter',
    'Vertikal AI-app bygget rundt ekte drift'
  ],
  'trust',
  'campaign_ready',
  90,
  '{"alternate_urls":["https://olivia.chatgenius.pro"],"owner_brand":"donaanna","features":["IoT","regnskap","produksjon","oppskrifter","sporbarhet"]}'::jsonb
),
(
  'familyhub',
  'chatgenius',
  'familyhub',
  'FamilieHub Bremseth',
  'FamilyHub',
  'vertical_app',
  'published',
  'https://family.chatgenius.pro',
  'https://family.chatgenius.pro',
  null,
  'Familieadministrasjon med kalender, handleliste, transaksjoner, dokumenter, regninger og ansvar.',
  'Familier og private husholdninger som trenger oversikt, men også referansecase for private kontrollrom.',
  'Viser hvordan hverdagsprosesser kan bli en samlet app med Supabase og AI-assistanse.',
  'Se FamilyHub',
  'custom',
  null,
  'NOK',
  null,
  null,
  null,
  'manual_invoice',
  'not_required',
  2500,
  'NOK',
  'month',
  'Bruke FamilyHub som case for interne portaler og private administrasjonsapper.',
  array['Facebook/Instagram', 'E-post', 'Demo'],
  array[
    'En familieportal viser hvor konkret AI-systemer kan bli',
    'Kalender, økonomi og dokumenter på ett sted',
    'Samme tankegang kan bygges for team, familiekontor og småbedrifter'
  ],
  'trust',
  'campaign_ready',
  100,
  '{"reference_case":true,"screenshots":"logged_in"}'::jsonb
),
(
  'vm2026',
  'chatgenius',
  'vm2026',
  'VM 2026 app',
  'VM2026',
  'vertical_app',
  'published',
  'https://vm2026.chatgenius.pro',
  'https://vm2026.chatgenius.pro',
  null,
  'Sports- og innholdsapp for VM 2026, bygget som demonstrasjon av nisjeapper og kampanjeflater.',
  'Kunder som vil bygge kampanjesider, event-apper eller innholdsprodukter rundt en tydelig nisje.',
  'Reference case for raske nisjeprodukter som kan få annonser, innhold og leadfangst.',
  'Se VM2026',
  'custom',
  null,
  'NOK',
  null,
  null,
  null,
  'manual_invoice',
  'not_required',
  3000,
  'NOK',
  'month',
  'Selge raske nisjeapper og kampanjesider rundt eventer, sesonger eller produkter.',
  array['Facebook/Instagram', 'Google Search', 'TikTok/Shorts'],
  array[
    'Nisjeapp kan bygges før markedet topper seg',
    'Eventer trenger innhold, trafikk og enkel monetisering',
    'AI gjør små kampanjeprodukter mulig å lansere raskt'
  ],
  'trust',
  'campaign_ready',
  110,
  '{"event":"FIFA World Cup 2026","reference_case":true}'::jsonb
),
(
  'astro-ai',
  'chatgenius',
  'astro',
  'Astro AI',
  'Astro',
  'consumer_app',
  'published',
  'https://astro.chatgenius.pro',
  'https://astro.chatgenius.pro',
  null,
  'AI-drevet astrologiassistent med personlige horoskoper, refleksjon og coaching-format.',
  'Forbrukerorienterte nisjeapper og kunder som vil se personlige AI-opplevelser.',
  'Reference case for personaliserte AI-produkter med abonnement eller freemium.',
  'Se Astro',
  'subscription',
  null,
  'NOK',
  'month',
  null,
  null,
  'checkout',
  'needs_setup',
  3000,
  'NOK',
  'month',
  'Teste forbrukerapp-vinkler og personaliserte abonnement rundt AI-opplevelser.',
  array['TikTok/Shorts', 'Facebook/Instagram', 'Influencer'],
  array[
    'Personlig AI-opplevelse med daglig grunn til å komme tilbake',
    'Fra nisjeinteresse til abonnementsprodukt',
    'Viser hvordan tone, data og AI kan skape en egen app-personlighet'
  ],
  'trust',
  'needs_stripe_price',
  120,
  '{"reference_case":true,"category":"consumer_ai"}'::jsonb
),
(
  'spanish-ai',
  'chatgenius',
  'spanish',
  'Spanish ChatGenius',
  'Spanish',
  'education_app',
  'published',
  'https://spanish.chatgenius.pro/',
  'https://spanish.chatgenius.pro/',
  null,
  'Spansk-/språkopplevelse som viser hvordan ChatGenius kan lage læringsapper og øvingsflyter.',
  'Kunder innen kurs, opplæring, språk, coaching og kunnskapsprodukter.',
  'Reference case for AI-læring, øving, quiz, samtaler og progresjon.',
  'Se Spanish',
  'subscription',
  null,
  'NOK',
  'month',
  null,
  null,
  'checkout',
  'needs_setup',
  2500,
  'NOK',
  'month',
  'Selge læringsapper og opplæringsløp med AI-assistert progresjon.',
  array['Google Search', 'Facebook/Instagram', 'E-post'],
  array[
    'AI kan bli en tålmodig trener, ikke bare en tekstgenerator',
    'Gjør kursinnhold om til øving, dialog og progresjon',
    'Læringsapper kan bygges rundt kundens metode'
  ],
  'trust',
  'needs_stripe_price',
  130,
  '{"reference_case":true,"category":"education"}'::jsonb
),
(
  'remaster-freddy',
  'chatgenius',
  'remaster',
  'Re-Master Freddy',
  'Remaster',
  'media_app',
  'published',
  'https://remaster.freddybremseth.com/',
  'https://remaster.freddybremseth.com/',
  null,
  'Musikk- og remasteringflyt kontrollert fra RealtyFlow, knyttet til innhold, publisering og mediaarbeid.',
  'Musikere, skapere og kunder som vil se AI-støttet mediaflyt, remastering og publisering.',
  'Reference case for kreative produksjonsflyter og appstyrt mediaarbeid.',
  'Se Remaster',
  'custom',
  null,
  'NOK',
  null,
  null,
  null,
  'manual_invoice',
  'not_required',
  2500,
  'NOK',
  'month',
  'Vise kreative AI-workflows og selge oppsett for innhold, musikk og media.',
  array['YouTube', 'TikTok/Shorts', 'E-post'],
  array[
    'Kreativ workflow kan systematiseres like godt som salg',
    'Media, remaster og publisering kan styres fra samme backend',
    'Et case for skapere som vil bruke AI praktisk'
  ],
  'trust',
  'campaign_ready',
  140,
  '{"controlled_by":"realtyflow.chatgenius.pro","parent_app":"realtyflow","reference_case":true}'::jsonb
)
on conflict (slug) do update set
  brand_id = excluded.brand_id,
  saas_app_slug = excluded.saas_app_slug,
  name = excluded.name,
  short_name = excluded.short_name,
  service_type = excluded.service_type,
  status = excluded.status,
  source_url = excluded.source_url,
  public_url = excluded.public_url,
  booking_url = excluded.booking_url,
  description = excluded.description,
  audience = excluded.audience,
  offer = excluded.offer,
  cta_label = excluded.cta_label,
  pricing_model = excluded.pricing_model,
  price_amount = excluded.price_amount,
  currency = excluded.currency,
  billing_interval = excluded.billing_interval,
  setup_fee_amount = excluded.setup_fee_amount,
  monthly_fee_amount = excluded.monthly_fee_amount,
  stripe_mode = excluded.stripe_mode,
  stripe_status = excluded.stripe_status,
  recommended_budget_amount = excluded.recommended_budget_amount,
  recommended_budget_currency = excluded.recommended_budget_currency,
  recommended_budget_period = excluded.recommended_budget_period,
  campaign_objective = excluded.campaign_objective,
  campaign_channels = excluded.campaign_channels,
  campaign_angles = excluded.campaign_angles,
  funnel_stage = excluded.funnel_stage,
  readiness = excluded.readiness,
  priority = excluded.priority,
  metadata = public.chatgenius_services.metadata || excluded.metadata,
  updated_at = now();

comment on table public.chatgenius_services is
  'Operational ChatGenius service catalog used by RealtyFlow for Stripe setup, ad campaign planning, budgets and business overview reporting.';
