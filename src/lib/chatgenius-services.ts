export type ChatGeniusServiceStatus = "draft" | "published" | "paused" | "archived";
export type ChatGeniusPricingModel = "free" | "hourly" | "fixed" | "subscription" | "project" | "custom";
export type ChatGeniusStripeStatus = "not_required" | "manual" | "needs_setup" | "configured";

export type ChatGeniusService = {
  id?: string;
  slug: string;
  brand_id: string;
  saas_app_slug?: string | null;
  name: string;
  short_name?: string | null;
  service_type: string;
  status: ChatGeniusServiceStatus;
  source_url?: string | null;
  public_url?: string | null;
  booking_url?: string | null;
  description?: string | null;
  audience?: string | null;
  offer?: string | null;
  cta_label?: string | null;
  pricing_model: ChatGeniusPricingModel;
  price_amount?: number | null;
  currency: string;
  billing_interval?: string | null;
  setup_fee_amount?: number | null;
  monthly_fee_amount?: number | null;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  stripe_mode: string;
  stripe_status: ChatGeniusStripeStatus;
  recommended_budget_amount: number;
  recommended_budget_currency: string;
  recommended_budget_period: string;
  campaign_objective?: string | null;
  campaign_channels: string[];
  campaign_angles: string[];
  funnel_stage: string;
  readiness: string;
  priority: number;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type ChatGeniusServiceSummary = {
  totalServices: number;
  publishedServices: number;
  campaignReady: number;
  stripeReady: number;
  needsStripeSetup: number;
  monthlyBudgetNok: number;
  subscriptionMrrPotentialNok: number;
  oneTimeSetupPotentialNok: number;
  hourlyRateNok: number;
  serviceTypes: Record<string, number>;
  statuses: Record<string, number>;
  channels: string[];
};

const BOOKING_URL = "https://appointment.chatgenius.pro/booking.html?brand=chat";

export const CHATGENIUS_SERVICE_CATALOG: ChatGeniusService[] = [
  {
    slug: "ai-opplaering-radgivning",
    brand_id: "chatgenius",
    saas_app_slug: "chatgenius",
    name: "AI-opplæring og rådgivning",
    short_name: "AI-opplæring",
    service_type: "training",
    status: "published",
    source_url: "https://www.chatgenius.pro/#ai-training",
    public_url: "https://www.chatgenius.pro/#ai-training",
    booking_url: BOOKING_URL,
    description: "Personlig opplæring for bedrifter som vil forstå og bruke AI i faktiske arbeidsprosesser.",
    audience: "Ledere, gründere, markedsførere, rådgivere og små bedrifter som vil bli tryggere og raskere med AI.",
    offer: "890 NOK per time. Før oppstart settes mål, fase 1/2-plan, estimat og dokumentasjon/oppskrifter for kunden.",
    cta_label: "Book AI-opplæring",
    pricing_model: "hourly",
    price_amount: 890,
    currency: "NOK",
    billing_interval: "hour",
    stripe_mode: "manual_invoice",
    stripe_status: "manual",
    recommended_budget_amount: 7000,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Booke kvalifiserte AI-opplæringskunder som vil ha plan, rådgivning og praktisk innføring.",
    campaign_channels: ["LinkedIn", "Facebook/Instagram", "Google Search", "E-post"],
    campaign_angles: [
      "AI-opplæring som ender i konkrete arbeidsflyter, ikke bare inspirasjon",
      "Få en realistisk faseplan og kostnadsestimat før du starter",
      "Lær når du bør bruke ChatGPT, Claude, Gemini, Perplexity og bildegeneratorer",
    ],
    funnel_stage: "booking",
    readiness: "campaign_ready",
    priority: 10,
    metadata: {
      expertise_since: "2022",
      deliverables: ["faseplan", "kostnadsestimat", "dokumentasjon", "oppskrifter", "prompt-malverk"],
      topics: ["creative workflow", "analytical workflow", "AI model selection", "prompting", "backend", "database"],
    },
  },
  {
    slug: "ai-mulighetssamtale",
    brand_id: "chatgenius",
    saas_app_slug: "chatgenius",
    name: "AI-mulighetssamtale",
    short_name: "Gratis AI-samtale",
    service_type: "consulting",
    status: "published",
    source_url: "https://www.chatgenius.pro/#booking",
    public_url: "https://www.chatgenius.pro/#booking",
    booking_url: BOOKING_URL,
    description: "Uforpliktende kartlegging av hvordan AI kan hjelpe en bedrift med salg, kundedialog, oppfølging eller automatisering.",
    audience: "Bedrifter som er nysgjerrige på AI, men trenger en trygg første vurdering.",
    offer: "Gratis samtale som kvalifiserer behov, modenhet og neste anbefalte steg.",
    cta_label: "Book gratis AI-samtale",
    pricing_model: "free",
    price_amount: 0,
    currency: "NOK",
    billing_interval: "session",
    stripe_mode: "booking",
    stripe_status: "not_required",
    recommended_budget_amount: 3500,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Få flere gratis kartleggingssamtaler med bedrifter som har et tydelig problem å løse.",
    campaign_channels: ["Facebook/Instagram", "Google Search", "LinkedIn"],
    campaign_angles: [
      "Vet du ikke hva AI kan gjøre i bedriften din? Start med en gratis kartlegging",
      "Finn de første 2-3 prosessene AI kan effektivisere",
      "Få ærlig råd før du kjøper verktøy eller bygger noe",
    ],
    funnel_stage: "lead",
    readiness: "campaign_ready",
    priority: 20,
    metadata: { crm_destination: "realtyflow.chatgenius.pro", booking_brand: "chatgenius" },
  },
  {
    slug: "ai-salgsfunnel-gjennomgang",
    brand_id: "chatgenius",
    saas_app_slug: "chatgenius",
    name: "AI og salgsfunnel-gjennomgang",
    short_name: "Funnel-gjennomgang",
    service_type: "audit",
    status: "published",
    source_url: "https://www.chatgenius.pro/#booking",
    public_url: "https://www.chatgenius.pro/#booking",
    booking_url: BOOKING_URL,
    description: "Betalt gjennomgang av nettside, leadfangst, kundereise og oppfølging med konkrete AI-forbedringer.",
    audience: "Bedrifter med trafikk eller leads som ikke konverterer godt nok.",
    offer: "Gjennomgang av hva som skjer etter første kontakt, hvor leads lekker, og hva AI kan automatisere.",
    cta_label: "Book funnel-gjennomgang",
    pricing_model: "fixed",
    price_amount: 195,
    currency: "EUR",
    billing_interval: "session",
    setup_fee_amount: 195,
    stripe_mode: "checkout",
    stripe_status: "needs_setup",
    recommended_budget_amount: 4500,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Selge betalte salgsfunnel-audits til bedrifter med konkrete vekstutfordringer.",
    campaign_channels: ["LinkedIn", "Google Search", "Retargeting"],
    campaign_angles: [
      "Se hvor leads forsvinner før du bruker mer annonsepenger",
      "Få AI-forslag til oppfølging, booking og CRM-flyt",
      "Én gjennomgang kan gi neste automatiseringsprosjekt",
    ],
    funnel_stage: "conversion",
    readiness: "needs_stripe_price",
    priority: 30,
    metadata: { recommended_form: "Skjema for AI-samtale", crm_destination: "realtyflow.chatgenius.pro" },
  },
  {
    slug: "skreddersydd-ai-app",
    brand_id: "chatgenius",
    saas_app_slug: "chatgenius",
    name: "Skreddersydd AI-app og internt system",
    short_name: "AI-appbygging",
    service_type: "app_build",
    status: "published",
    source_url: "https://www.chatgenius.pro/#apps",
    public_url: "https://www.chatgenius.pro/#apps",
    booking_url: BOOKING_URL,
    description: "Ferdige apper og interne systemer bygget rundt kundens prosess, data, CRM, backend og betalingsflyt.",
    audience: "Bedrifter som vil ha et verktøy som faktisk gjør arbeid, ikke bare en chatbot på siden.",
    offer: "Prosjekt deles i faser med scope, estimat, teknologi-anbefaling og leveranser før utvikling starter.",
    cta_label: "Planlegg app",
    pricing_model: "project",
    currency: "NOK",
    billing_interval: "project",
    setup_fee_amount: 25000,
    monthly_fee_amount: 1500,
    stripe_mode: "manual_invoice",
    stripe_status: "needs_setup",
    recommended_budget_amount: 12000,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Fange bedrifter som trenger skreddersydd AI-app, automatisering eller intern portal.",
    campaign_channels: ["LinkedIn", "Google Search", "YouTube", "E-post"],
    campaign_angles: [
      "Fra ide til fungerende app med database, backend og betalingsflyt",
      "Du får anbefalt riktig språk, database og arkitektur for caset ditt",
      "Bygg mindre først, mål effekten, utvid i fase 2",
    ],
    funnel_stage: "sales",
    readiness: "campaign_ready",
    priority: 40,
    metadata: {
      phase_model: ["fase 1: prototype og datamodell", "fase 2: integrasjoner og automasjon", "fase 3: lansering og drift"],
      admin_home: "realtyflow.chatgenius.pro",
    },
  },
  {
    slug: "automatisering-effektivisering",
    brand_id: "chatgenius",
    saas_app_slug: "chatgenius",
    name: "Automatisering og effektivisering",
    short_name: "AI-effektivisering",
    service_type: "automation",
    status: "published",
    source_url: "https://www.chatgenius.pro/#automation",
    public_url: "https://www.chatgenius.pro/#automation",
    booking_url: BOOKING_URL,
    description: "Kartlegging og bygging av automatiserte arbeidsflyter for oppfølging, innhold, CRM, rapportering og kundeservice.",
    audience: "Små og mellomstore bedrifter med manuelt arbeid, sviktende oppfølging eller lite tid.",
    offer: "Kunden får en konkret automasjonsplan og kan kjøpe implementering eller opplæring.",
    cta_label: "Finn automasjoner",
    pricing_model: "hourly",
    price_amount: 890,
    currency: "NOK",
    billing_interval: "hour",
    stripe_mode: "manual_invoice",
    stripe_status: "manual",
    recommended_budget_amount: 6000,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Selge rådgivning og implementering av AI-flyter som sparer timer hver uke.",
    campaign_channels: ["LinkedIn", "Facebook/Instagram", "Google Search"],
    campaign_angles: [
      "Automatiser oppfølgingen uten å miste den personlige tonen",
      "Få oversikt over hvor manuelt arbeid kan fjernes",
      "Koble skjema, CRM, e-post, innhold og rapportering",
    ],
    funnel_stage: "consideration",
    readiness: "campaign_ready",
    priority: 50,
    metadata: { deliverables: ["prosesskart", "automations backlog", "implementeringsplan", "prompt-oppskrifter"] },
  },
  {
    slug: "demosites-nettsidepakke",
    brand_id: "chatgenius",
    saas_app_slug: "demosites",
    name: "DemoSites nettsidepakke",
    short_name: "DemoSites",
    service_type: "website_package",
    status: "published",
    source_url: "https://www.chatgenius.pro/demosites/",
    public_url: "https://www.chatgenius.pro/demosites/",
    booking_url: BOOKING_URL,
    description: "Produktisert nettsidepakke med demo-maler, bestillingsskjema, CRM, preview og abonnement/MRR-sporing.",
    audience: "Lokale bedrifter som trenger en bedre nettside, leadfangst og en enkel digital resepsjonist.",
    offer: "Fra 4 900 NOK setup + 490 NOK per måned. Standardpakken kobler nettside og AI-resepsjonist.",
    cta_label: "Se DemoSites",
    pricing_model: "subscription",
    price_amount: 490,
    currency: "NOK",
    billing_interval: "month",
    setup_fee_amount: 4900,
    monthly_fee_amount: 490,
    stripe_mode: "checkout",
    stripe_status: "configured",
    recommended_budget_amount: 8000,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Skaffe lokale bedrifter som vil ha ny nettside, leads og månedlig drift.",
    campaign_channels: ["Facebook/Instagram", "Google Search", "Lokale partnerskap"],
    campaign_angles: [
      "Ny nettside raskt, med AI-chat og leadfangst",
      "Én ekstra kunde kan betale månedsprisen",
      "Få preview før kunden bestemmer seg",
    ],
    funnel_stage: "lead",
    readiness: "stripe_ready",
    priority: 60,
    metadata: {
      packages: [
        { id: "basis", setupFeeNok: 4900, monthlyFeeNok: 490 },
        { id: "standard", setupFeeNok: 7900, monthlyFeeNok: 990 },
        { id: "premium", setupFeeNok: 14900, monthlyFeeNok: 1990 },
      ],
      crm_path: "/demosites",
    },
  },
  {
    slug: "ai-resepsjonist-chatbot",
    brand_id: "chatgenius",
    saas_app_slug: "chatgenius",
    name: "AI-resepsjonist og chatbot",
    short_name: "AI-resepsjonist",
    service_type: "chatbot",
    status: "published",
    source_url: "https://www.chatgenius.pro/#chatbot",
    public_url: "https://www.chatgenius.pro/#chatbot",
    booking_url: BOOKING_URL,
    description: "Chatbot og digital resepsjonist som svarer på spørsmål, samler leads og sender kunden videre til riktig oppfølging.",
    audience: "Bedrifter med mange like spørsmål, bookingbehov eller leads som bør kvalifiseres før kontakt.",
    offer: "Kan selges alene eller som del av DemoSites/AI-app-prosjekt.",
    cta_label: "Planlegg chatbot",
    pricing_model: "subscription",
    price_amount: 990,
    currency: "NOK",
    billing_interval: "month",
    setup_fee_amount: 7900,
    monthly_fee_amount: 990,
    stripe_mode: "checkout",
    stripe_status: "needs_setup",
    recommended_budget_amount: 7000,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Selge chatbot som leadmotor og kundeservice, spesielt til lokale bedrifter.",
    campaign_channels: ["Google Search", "Facebook/Instagram", "Retargeting"],
    campaign_angles: [
      "Svar kundene etter stengetid",
      "Ikke mist leads som ikke gidder å ringe",
      "Tren boten på bedriftens egne tjenester, priser og FAQ",
    ],
    funnel_stage: "lead",
    readiness: "needs_stripe_price",
    priority: 70,
    metadata: { integrations: ["CRM", "email", "booking", "forms"], can_bundle_with: "demosites-nettsidepakke" },
  },
  {
    slug: "realtyflow-crm-marketing",
    brand_id: "chatgenius",
    saas_app_slug: "realtyflow",
    name: "RealtyFlow CRM, kampanjer og økonomi",
    short_name: "RealtyFlow",
    service_type: "internal_platform",
    status: "published",
    source_url: "https://realtyflow.chatgenius.pro",
    public_url: "https://realtyflow.chatgenius.pro",
    description: "Adminplattformen som styrer CRM, annonser, kampanjer, økonomi, Stripe, budsjetter, publisering og app-portefølje.",
    audience: "Internt operativt system og demonstrasjon av hva ChatGenius kan bygge for kunder.",
    offer: "Brukes som kontrollrom for ChatGenius, RealtyFlow, DemoSites, Remaster og tilknyttede apper.",
    cta_label: "Åpne RealtyFlow",
    pricing_model: "custom",
    currency: "NOK",
    stripe_mode: "manual_invoice",
    stripe_status: "not_required",
    recommended_budget_amount: 5000,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Vise troverdighet gjennom eget operativt AI-system og selge tilsvarende systembygging.",
    campaign_channels: ["LinkedIn", "YouTube", "E-post"],
    campaign_angles: [
      "Dette er ikke teori: ChatGenius bruker sin egen AI-backend til drift",
      "Se hvordan CRM, annonser, økonomi og app-portefølje kan samles",
      "Bygg et kontrollrom rundt din egen bedrift",
    ],
    funnel_stage: "trust",
    readiness: "campaign_ready",
    priority: 80,
    metadata: {
      role: "admin_backend",
      domains: ["realtyflow.chatgenius.pro"],
      controls: ["campaigns", "ads", "finance", "stripe", "budgets", "publishing"],
    },
  },
  {
    slug: "olivia-farm-iot",
    brand_id: "chatgenius",
    saas_app_slug: "olivia",
    name: "Olivia gårdsoversikt og IoT",
    short_name: "Olivia AI",
    service_type: "vertical_app",
    status: "published",
    source_url: "https://olivia.donaanna.com",
    public_url: "https://olivia.donaanna.com",
    description: "Gårdsoversikt for Doña Anna med IoT-sensorer, regnskap, produksjon, oppskrifter og sporbar drift.",
    audience: "Gårdsdrift, produksjonsbedrifter og nisjer som trenger skreddersydd driftskontroll.",
    offer: "Brukes som referansecase for vertikale AI-systemer med data, drift og økonomi.",
    cta_label: "Se Olivia",
    pricing_model: "custom",
    currency: "NOK",
    stripe_mode: "manual_invoice",
    stripe_status: "not_required",
    recommended_budget_amount: 3500,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Bruke Olivia som bevis på spesialiserte systemer for drift, IoT og produksjon.",
    campaign_channels: ["LinkedIn", "Nisjeinnhold", "E-post"],
    campaign_angles: [
      "Fra gårdsdata til styring, økonomi og produksjon i ett system",
      "IoT og regnskap kan bli praktiske arbeidsflater, ikke bare rapporter",
      "Vertikal AI-app bygget rundt ekte drift",
    ],
    funnel_stage: "trust",
    readiness: "campaign_ready",
    priority: 90,
    metadata: {
      alternate_urls: ["https://olivia.chatgenius.pro"],
      owner_brand: "donaanna",
      features: ["IoT", "regnskap", "produksjon", "oppskrifter", "sporbarhet"],
    },
  },
  {
    slug: "familyhub",
    brand_id: "chatgenius",
    saas_app_slug: "familyhub",
    name: "FamilieHub Bremseth",
    short_name: "FamilyHub",
    service_type: "vertical_app",
    status: "published",
    source_url: "https://family.chatgenius.pro",
    public_url: "https://family.chatgenius.pro",
    description: "Familieadministrasjon med kalender, handleliste, transaksjoner, dokumenter, regninger og ansvar.",
    audience: "Familier og private husholdninger som trenger oversikt, men også referansecase for private kontrollrom.",
    offer: "Viser hvordan hverdagsprosesser kan bli en samlet app med Supabase og AI-assistanse.",
    cta_label: "Se FamilyHub",
    pricing_model: "custom",
    currency: "NOK",
    stripe_mode: "manual_invoice",
    stripe_status: "not_required",
    recommended_budget_amount: 2500,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Bruke FamilyHub som case for interne portaler og private administrasjonsapper.",
    campaign_channels: ["Facebook/Instagram", "E-post", "Demo"],
    campaign_angles: [
      "En familieportal viser hvor konkret AI-systemer kan bli",
      "Kalender, økonomi og dokumenter på ett sted",
      "Samme tankegang kan bygges for team, familiekontor og småbedrifter",
    ],
    funnel_stage: "trust",
    readiness: "campaign_ready",
    priority: 100,
    metadata: { reference_case: true, screenshots: "logged_in" },
  },
  {
    slug: "vm2026",
    brand_id: "chatgenius",
    saas_app_slug: "vm2026",
    name: "VM 2026 app",
    short_name: "VM2026",
    service_type: "vertical_app",
    status: "published",
    source_url: "https://vm2026.chatgenius.pro",
    public_url: "https://vm2026.chatgenius.pro",
    description: "Sports- og innholdsapp for VM 2026, bygget som demonstrasjon av nisjeapper og kampanjeflater.",
    audience: "Kunder som vil bygge kampanjesider, event-apper eller innholdsprodukter rundt en tydelig nisje.",
    offer: "Reference case for raske nisjeprodukter som kan få annonser, innhold og leadfangst.",
    cta_label: "Se VM2026",
    pricing_model: "custom",
    currency: "NOK",
    stripe_mode: "manual_invoice",
    stripe_status: "not_required",
    recommended_budget_amount: 3000,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Selge raske nisjeapper og kampanjesider rundt eventer, sesonger eller produkter.",
    campaign_channels: ["Facebook/Instagram", "Google Search", "TikTok/Shorts"],
    campaign_angles: [
      "Nisjeapp kan bygges før markedet topper seg",
      "Eventer trenger innhold, trafikk og enkel monetisering",
      "AI gjør små kampanjeprodukter mulig å lansere raskt",
    ],
    funnel_stage: "trust",
    readiness: "campaign_ready",
    priority: 110,
    metadata: { event: "FIFA World Cup 2026", reference_case: true },
  },
  {
    slug: "astro-ai",
    brand_id: "chatgenius",
    saas_app_slug: "astro",
    name: "Astro AI",
    short_name: "Astro",
    service_type: "consumer_app",
    status: "published",
    source_url: "https://astro.chatgenius.pro",
    public_url: "https://astro.chatgenius.pro",
    description: "AI-drevet astrologiassistent med personlige horoskoper, refleksjon og coaching-format.",
    audience: "Forbrukerorienterte nisjeapper og kunder som vil se personlige AI-opplevelser.",
    offer: "Reference case for personaliserte AI-produkter med abonnement eller freemium.",
    cta_label: "Se Astro",
    pricing_model: "subscription",
    currency: "NOK",
    billing_interval: "month",
    stripe_mode: "checkout",
    stripe_status: "needs_setup",
    recommended_budget_amount: 3000,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Teste forbrukerapp-vinkler og personaliserte abonnement rundt AI-opplevelser.",
    campaign_channels: ["TikTok/Shorts", "Facebook/Instagram", "Influencer"],
    campaign_angles: [
      "Personlig AI-opplevelse med daglig grunn til å komme tilbake",
      "Fra nisjeinteresse til abonnementsprodukt",
      "Viser hvordan tone, data og AI kan skape en egen app-personlighet",
    ],
    funnel_stage: "trust",
    readiness: "needs_stripe_price",
    priority: 120,
    metadata: { reference_case: true, category: "consumer_ai" },
  },
  {
    slug: "spanish-ai",
    brand_id: "chatgenius",
    saas_app_slug: "spanish",
    name: "Spanish ChatGenius",
    short_name: "Spanish",
    service_type: "education_app",
    status: "published",
    source_url: "https://spanish.chatgenius.pro/",
    public_url: "https://spanish.chatgenius.pro/",
    description: "Spansk-/språkopplevelse som viser hvordan ChatGenius kan lage læringsapper og øvingsflyter.",
    audience: "Kunder innen kurs, opplæring, språk, coaching og kunnskapsprodukter.",
    offer: "Reference case for AI-læring, øving, quiz, samtaler og progresjon.",
    cta_label: "Se Spanish",
    pricing_model: "subscription",
    currency: "NOK",
    billing_interval: "month",
    stripe_mode: "checkout",
    stripe_status: "needs_setup",
    recommended_budget_amount: 2500,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Selge læringsapper og opplæringsløp med AI-assistert progresjon.",
    campaign_channels: ["Google Search", "Facebook/Instagram", "E-post"],
    campaign_angles: [
      "AI kan bli en tålmodig trener, ikke bare en tekstgenerator",
      "Gjør kursinnhold om til øving, dialog og progresjon",
      "Læringsapper kan bygges rundt kundens metode",
    ],
    funnel_stage: "trust",
    readiness: "needs_stripe_price",
    priority: 130,
    metadata: { reference_case: true, category: "education" },
  },
  {
    slug: "remaster-freddy",
    brand_id: "chatgenius",
    saas_app_slug: "remaster",
    name: "Re-Master Freddy",
    short_name: "Remaster",
    service_type: "media_app",
    status: "published",
    source_url: "https://remaster.freddybremseth.com/",
    public_url: "https://remaster.freddybremseth.com/",
    description: "Musikk- og remasteringflyt kontrollert fra RealtyFlow, knyttet til innhold, publisering og mediaarbeid.",
    audience: "Musikere, skapere og kunder som vil se AI-støttet mediaflyt, remastering og publisering.",
    offer: "Reference case for kreative produksjonsflyter og appstyrt mediaarbeid.",
    cta_label: "Se Remaster",
    pricing_model: "custom",
    currency: "NOK",
    stripe_mode: "manual_invoice",
    stripe_status: "not_required",
    recommended_budget_amount: 2500,
    recommended_budget_currency: "NOK",
    recommended_budget_period: "month",
    campaign_objective: "Vise kreative AI-workflows og selge oppsett for innhold, musikk og media.",
    campaign_channels: ["YouTube", "TikTok/Shorts", "E-post"],
    campaign_angles: [
      "Kreativ workflow kan systematiseres like godt som salg",
      "Media, remaster og publisering kan styres fra samme backend",
      "Et case for skapere som vil bruke AI praktisk",
    ],
    funnel_stage: "trust",
    readiness: "campaign_ready",
    priority: 140,
    metadata: { controlled_by: "realtyflow.chatgenius.pro", parent_app: "realtyflow", reference_case: true },
  },
];

const NUMBER_FIELDS = new Set([
  "price_amount",
  "setup_fee_amount",
  "monthly_fee_amount",
  "recommended_budget_amount",
  "priority",
]);

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export function normalizeChatGeniusServiceRow(row: Partial<ChatGeniusService> & Record<string, unknown>): ChatGeniusService {
  const normalized: ChatGeniusService = {
    slug: String(row.slug || ""),
    brand_id: String(row.brand_id || "chatgenius"),
    saas_app_slug: row.saas_app_slug ? String(row.saas_app_slug) : null,
    name: String(row.name || row.short_name || row.slug || "ChatGenius service"),
    short_name: row.short_name ? String(row.short_name) : null,
    service_type: String(row.service_type || "service"),
    status: (row.status as ChatGeniusServiceStatus) || "draft",
    source_url: row.source_url ? String(row.source_url) : null,
    public_url: row.public_url ? String(row.public_url) : null,
    booking_url: row.booking_url ? String(row.booking_url) : null,
    description: row.description ? String(row.description) : null,
    audience: row.audience ? String(row.audience) : null,
    offer: row.offer ? String(row.offer) : null,
    cta_label: row.cta_label ? String(row.cta_label) : null,
    pricing_model: (row.pricing_model as ChatGeniusPricingModel) || "custom",
    price_amount: toOptionalNumber(row.price_amount),
    currency: String(row.currency || "NOK").toUpperCase(),
    billing_interval: row.billing_interval ? String(row.billing_interval) : null,
    setup_fee_amount: toOptionalNumber(row.setup_fee_amount),
    monthly_fee_amount: toOptionalNumber(row.monthly_fee_amount),
    stripe_product_id: row.stripe_product_id ? String(row.stripe_product_id) : null,
    stripe_price_id: row.stripe_price_id ? String(row.stripe_price_id) : null,
    stripe_mode: String(row.stripe_mode || "manual_invoice"),
    stripe_status: (row.stripe_status as ChatGeniusStripeStatus) || "needs_setup",
    recommended_budget_amount: toNumber(row.recommended_budget_amount),
    recommended_budget_currency: String(row.recommended_budget_currency || "NOK").toUpperCase(),
    recommended_budget_period: String(row.recommended_budget_period || "month"),
    campaign_objective: row.campaign_objective ? String(row.campaign_objective) : null,
    campaign_channels: toStringArray(row.campaign_channels),
    campaign_angles: toStringArray(row.campaign_angles),
    funnel_stage: String(row.funnel_stage || "lead"),
    readiness: String(row.readiness || "campaign_ready"),
    priority: toNumber(row.priority, 100),
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {},
  };

  if (row.id) normalized.id = String(row.id);
  if (row.created_at) normalized.created_at = String(row.created_at);
  if (row.updated_at) normalized.updated_at = String(row.updated_at);

  return normalized;
}

export function sortChatGeniusServices(services: ChatGeniusService[]) {
  return [...services].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "nb-NO"));
}

export function getChatGeniusServiceCatalog() {
  return sortChatGeniusServices(CHATGENIUS_SERVICE_CATALOG.map((service) => normalizeChatGeniusServiceRow(service)));
}

function hasManifestValue(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function mergeChatGeniusServiceRecord(
  base: Partial<ChatGeniusService>,
  incoming: Partial<ChatGeniusService> & Record<string, unknown>,
) {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    if (["id", "created_at", "updated_at"].includes(key)) continue;
    if (!hasManifestValue(value)) continue;

    if (
      key === "metadata" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      merged.metadata &&
      typeof merged.metadata === "object" &&
      !Array.isArray(merged.metadata)
    ) {
      merged.metadata = { ...(merged.metadata as Record<string, unknown>), ...(value as Record<string, unknown>) };
      continue;
    }

    merged[key] = value;
  }

  return normalizeChatGeniusServiceRow(merged);
}

export function mergeChatGeniusServiceSets(
  baseServices: Array<Partial<ChatGeniusService>>,
  incomingServices: Array<Partial<ChatGeniusService> & Record<string, unknown>>,
) {
  const servicesBySlug = new Map<string, ChatGeniusService>();

  for (const service of baseServices) {
    const normalized = normalizeChatGeniusServiceRow(service as Partial<ChatGeniusService> & Record<string, unknown>);
    if (normalized.slug) servicesBySlug.set(normalized.slug, normalized);
  }

  for (const service of incomingServices) {
    const incoming = normalizeChatGeniusServiceRow(service);
    if (!incoming.slug) continue;
    const existing = servicesBySlug.get(incoming.slug);
    servicesBySlug.set(incoming.slug, existing ? mergeChatGeniusServiceRecord(existing, service) : incoming);
  }

  return sortChatGeniusServices(Array.from(servicesBySlug.values()));
}

export function summarizeChatGeniusServices(services: ChatGeniusService[]): ChatGeniusServiceSummary {
  const summary: ChatGeniusServiceSummary = {
    totalServices: services.length,
    publishedServices: 0,
    campaignReady: 0,
    stripeReady: 0,
    needsStripeSetup: 0,
    monthlyBudgetNok: 0,
    subscriptionMrrPotentialNok: 0,
    oneTimeSetupPotentialNok: 0,
    hourlyRateNok: 0,
    serviceTypes: {},
    statuses: {},
    channels: [],
  };
  const channels = new Set<string>();

  for (const service of services) {
    summary.statuses[service.status] = (summary.statuses[service.status] || 0) + 1;
    summary.serviceTypes[service.service_type] = (summary.serviceTypes[service.service_type] || 0) + 1;
    if (service.status === "published") summary.publishedServices += 1;
    if (service.readiness.includes("campaign") || service.campaign_angles.length > 0) summary.campaignReady += 1;
    if (service.stripe_status === "configured" || Boolean(service.stripe_price_id)) summary.stripeReady += 1;
    if (service.stripe_status === "needs_setup") summary.needsStripeSetup += 1;
    if (service.recommended_budget_currency === "NOK" && service.recommended_budget_period === "month") {
      summary.monthlyBudgetNok += service.recommended_budget_amount;
    }
    if (service.currency === "NOK") {
      if (service.pricing_model === "hourly") summary.hourlyRateNok = Math.max(summary.hourlyRateNok, Number(service.price_amount || 0));
      summary.subscriptionMrrPotentialNok += Number(service.monthly_fee_amount || (service.billing_interval === "month" ? service.price_amount || 0 : 0));
      summary.oneTimeSetupPotentialNok += Number(service.setup_fee_amount || (service.pricing_model === "fixed" ? service.price_amount || 0 : 0));
    }
    for (const channel of service.campaign_channels) channels.add(channel);
  }

  summary.channels = Array.from(channels).sort((a, b) => a.localeCompare(b, "nb-NO"));
  return summary;
}

export function buildChatGeniusServiceUpsertPayload(service: ChatGeniusService) {
  const normalized = normalizeChatGeniusServiceRow(service);
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(normalized)) {
    if (["id", "created_at", "updated_at"].includes(key)) continue;
    if (value === undefined) continue;
    payload[key] = NUMBER_FIELDS.has(key) && value !== null ? Number(value) : value;
  }
  return payload;
}
