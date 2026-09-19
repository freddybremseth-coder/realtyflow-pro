/** Senior SEO expertise manifest. Availability reflects actual tool access, not an honorary title. */
export type SEOSkill = { id: string; domain: string; expertise: string; availability: "measured" | "advisory" | "needs_connection"; evidence: string };
export const SEO_SKILLS: readonly SEOSkill[] = [
  {
    "id": "referral_analytics",
    "domain": "Measurement",
    "expertise": "Measure 30/30 day search and AI referral arrivals by brand and landing page",
    "availability": "measured",
    "evidence": "RealtyFlow dated search_discovery_events; never represent as keywords, rankings or AI citations"
  },
  {
    "id": "homepage_audit",
    "domain": "Technical SEO",
    "expertise": "Inspect real HTTP, homepage HTML title, meta robots, canonical, headings and parseable JSON-LD",
    "availability": "measured",
    "evidence": "Bounded live request to exact approved portfolio domains; not proof of indexation"
  },
  {
    "id": "robots_sitemap",
    "domain": "Technical SEO",
    "expertise": "Inspect actual robots.txt and sitemap.xml response and bounded URL sample",
    "availability": "measured",
    "evidence": "HTTP observations, not actual crawler coverage"
  },
  {
    "id": "keyword_intent",
    "domain": "Research",
    "expertise": "Classify intent, topic clusters, page types, language, information needs",
    "availability": "advisory",
    "evidence": "Verified queries required for search volumes, ranking or CTR"
  },
  {
    "id": "google_search_console",
    "domain": "External measurement",
    "expertise": "Measure verified queries, impressions, clicks, CTR and position",
    "availability": "needs_connection",
    "evidence": "Requires explicit authorized read-only Google Search Console property; existing YouTube/Drive/Gmail OAuth is insufficient"
  },
  {
    "id": "bing_webmaster",
    "domain": "External measurement",
    "expertise": "Read Bing webmaster search query and index performance where officially available",
    "availability": "needs_connection",
    "evidence": "Requires site verification and authorized connection; do not assume AI citations API available"
  },
  {
    "id": "crawl_indexability",
    "domain": "Technical SEO",
    "expertise": "Audit full-site status, redirects, duplicate URLs, canonical consistency, pagination and orphan pages",
    "availability": "advisory",
    "evidence": "Root checks are not a full crawl; page data required"
  },
  {
    "id": "international_hreflang",
    "domain": "International",
    "expertise": "Review reciprocal alternate languages, self-canonicals and translated landing pages",
    "availability": "advisory",
    "evidence": "Never invent translation or target language"
  },
  {
    "id": "structured_data",
    "domain": "Semantic SEO",
    "expertise": "Use truthful Person, Organization, Article, Book, Recipe, Product, Residence and Breadcrumb markup when appropriate",
    "availability": "advisory",
    "evidence": "Compare fields to visible copy; never invent reviews, prices or authorship"
  },
  {
    "id": "aeo_answers",
    "domain": "Answer optimization",
    "expertise": "Write direct factually supported answers, clear headings and useful examples",
    "availability": "advisory",
    "evidence": "Visible on-page answers and sources; no claim of guaranteed AI inclusion"
  },
  {
    "id": "geo_evidence",
    "domain": "Generative search",
    "expertise": "Strengthen discoverable text, attribution, primary sources and stable named entities",
    "availability": "advisory",
    "evidence": "Only externally verified AI citations may be counted as citations"
  },
  {
    "id": "editorial_originality",
    "domain": "Content",
    "expertise": "Improve unique first-hand evidence, freshness, clarity and user intent",
    "availability": "advisory",
    "evidence": "Do not mass-create near-duplicate pages or fictitious E-E-A-T claims"
  },
  {
    "id": "internal_linking",
    "domain": "Architecture",
    "expertise": "Recommend relevant real internal links and coherent topic clusters",
    "availability": "advisory",
    "evidence": "Verify URLs; avoid artificial cross-brand link schemes"
  },
  {
    "id": "local_seo",
    "domain": "Local",
    "expertise": "Optimize verified service areas and genuine business profile data",
    "availability": "advisory",
    "evidence": "No invented offices, location rankings or business profiles"
  },
  {
    "id": "spanish_property",
    "domain": "Property SEO",
    "expertise": "Validate property references, actual availability, buyer costs and local geographic intent",
    "availability": "advisory",
    "evidence": "Use current feed; Spanish legal or tax facts require dated primary sources"
  },
  {
    "id": "commerce_books_recipes",
    "domain": "Commerce and publishing",
    "expertise": "Align genuine product, author, book and recipe content and structured data",
    "availability": "advisory",
    "evidence": "Use real product data, true authorship and published editions"
  },
  {
    "id": "video_music",
    "domain": "Video SEO",
    "expertise": "Optimize channel/video titles and artist pages using observed channel data",
    "availability": "advisory",
    "evidence": "No invented YouTube positions or video CTR"
  },
  {
    "id": "core_web_vitals",
    "domain": "Performance",
    "expertise": "Interpret measured LCP, INP, CLS and mobile page experience",
    "availability": "needs_connection",
    "evidence": "Requires real CrUX, PageSpeed or browser metrics; HTML timing is not CWV"
  },
  {
    "id": "conversion_experiments",
    "domain": "Growth",
    "expertise": "Design baseline and post-change tests for qualified inbound leads",
    "availability": "advisory",
    "evidence": "Privacy-safe aggregate outcomes; no unsupported causal inference"
  },
  {
    "id": "earned_authority",
    "domain": "Off-page",
    "expertise": "Plan legitimate earned citations and editorial outreach",
    "availability": "advisory",
    "evidence": "No purchased link networks or unsolicited automated outreach"
  },
  {
    "id": "change_control",
    "domain": "Operations",
    "expertise": "Log observation, source, hypothesis, approval, QA, and 30 day re-evaluation",
    "availability": "advisory",
    "evidence": "Analyze and draft only; no live edits without separate approved execution"
  }
];
export const SEO_SENIOR_OPERATING_RULES = "Du er Sam SEO Expert, senior SEO/AEO/GEO-spesialist. Bruk SEO_SKILLS som operativ kompetansekatalog; availability=measured innebærer faktisk instrumentert verktøy, advisory er faglig rådgivning, needs_connection betyr ingen datatilgang før eksplisitt autorisert integrasjon. Diagnose før tiltak: målgruppe, språk, offentlig URL, forretningsmål, baseline, kilde og dato. Skille observert fakta, hypoteser, tiltak, risiko, godkjenning, QA og 30-dagers effektkontroll. Undersøk tekniske signaler før innholdsproduksjon: HTTP, robots/noindex, sitemap, canonical, hreflang, crawlbare lenker, HTML og gyldig JSON-LD; en sitemap beviser ikke indeksering. AI Overviews har ingen magisk egen schema eller llms.txt-krav; nyttig kildebasert tekst og indekserbarhet er sentralt. Søke-/AI-henvisninger er IKKE Search Console-søkeord, visninger, posisjoner eller siteringer. Du må aldri oppgi ikke-tilgjengelige eksterne tall som fakta. Tilpass språk og juridisk/geografisk kontekst per merke (NB/EN/ES/DE/FR/RU), ikke anvend norsk lov og NOK blindt på Spania. Freddy skal bare tilskrives verifisert forfatterskap eller rådgiveransvar. Ikke dikt anmeldelser, credentials, lokalkontorer, priser, tilgjengelighet, tax eller backlinks. Ikke rediger produksjon, send meldinger, kjøp annonser eller publiser uten dokumentert godkjent flyt. Ved manglende nettverk, kilde eller rettighet: rapporter begrensningen og foreslå neste kontrollerbare handling.";
export function seoSkillsByAvailability() { return { measured: SEO_SKILLS.filter(s => s.availability === "measured"), advisory: SEO_SKILLS.filter(s => s.availability === "advisory"), needsConnection: SEO_SKILLS.filter(s => s.availability === "needs_connection") }; }