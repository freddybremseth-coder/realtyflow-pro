# RealtyFlow Pro - Claude Project Knowledge

## Prosjektoversikt

**RealtyFlow Pro** er en AI-drevet super-app som kombinerer eiendoms-CRM, innholdsgenerering, AI-agenter, og forretningsverktøy i én Next.js 14-applikasjon. Appen er bygget av Freddy Bremseth for å drive hans eiendoms- og innholdsvirksomhet langs Costa Blanca, Spania.

**Repo:** `/Users/freddyogannabremseth/Documents/Apps/realtyflow-pro`
**Stack:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase + Claude AI + Gemini AI
**Språk i UI:** Norsk (nb-NO)
**Deploy:** Vercel

---

## Teknisk Stack

| Kategori | Teknologi |
|----------|-----------|
| Frontend | Next.js 14.2, React 18, TypeScript, Tailwind CSS |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| AI | Anthropic Claude (`claude-haiku-4-5-20251001`), Google Gemini |
| Kart | Leaflet + React Leaflet |
| Charts | Recharts |
| State | Zustand |
| Ikoner | Lucide React |
| Video | FFmpeg, Creatomate |
| Email | Resend API, IMAP/SMTP (Nodemailer, IMAPFlow) |
| Validering | Zod |
| Styling | CVA + clsx + tailwind-merge (shadcn-style) |

---

## Mappestruktur

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout med sidebar, dark theme, Poppins font
│   ├── page.tsx                  # Dashboard
│   ├── (auth)/login/             # Supabase Auth login
│   ├── (realty)/                 # Eiendomsmoduler
│   │   ├── pipeline/             # Leads kanban (7 steg)
│   │   ├── inventory/            # Eiendommer med kart, XML/CSV import
│   │   ├── valuation/            # AI-vurdering (Gemini)
│   │   ├── crm/                  # Kundedatabase
│   │   └── tomtebase/            # Tomter med Leaflet-kart
│   ├── (content)/                # Innhold & Marketing
│   │   ├── content-studio/       # AI multi-agent innholdsgenerering
│   │   ├── content-hub/          # Innholdsoversikt
│   │   ├── youtube-studio/       # YouTube-administrasjon
│   │   ├── neural-beat/          # AI musikkvideopipeline
│   │   ├── image-studio/         # Bildegenerering
│   │   └── posts/                # Social media posts
│   ├── (business)/               # Forretning
│   │   ├── brands/               # 7 brands med konfigurasjon
│   │   ├── growth-hub/           # Growth engine med A/B-testing
│   │   ├── business-hub/         # Forretningsoversikt
│   │   ├── business-overview/    # Analytics
│   │   └── saas/                 # ChatGenius SaaS-plattform
│   ├── (tools)/                  # Verktøy
│   │   ├── agents/               # AI Agent Command Center
│   │   ├── automation/           # Workflow-automasjon
│   │   ├── calendar/             # Kalender
│   │   ├── analytics/            # Analytics dashboard
│   │   ├── scanner/              # Eiendomsskanner (AI-drevet)
│   │   ├── email/                # AI Email-assistent
│   │   ├── reports/              # Markedsrapporter
│   │   ├── marketing-tasks/      # Marketing kanban
│   │   └── settings/             # Innstillinger
│   └── api/                      # 44 API routes (se detaljer under)
├── components/
│   ├── ui/                       # Button, Card, Badge, Tabs, Input, Progress
│   └── layout/sidebar.tsx        # Hovednavigasjon
├── services/
│   ├── agents/                   # 10 AI-agenter (Claude-basert)
│   ├── ai/                       # Claude + Gemini klienter
│   ├── integrations/             # Airtable, YouTube, FFmpeg, social
│   ├── content/                  # Content pipeline, Neural Beat
│   ├── market/                   # Markedsdata + rapporter
│   ├── scanner/                  # Eiendomsskanner
│   ├── email/                    # IMAP/SMTP/kryptering
│   ├── growth/                   # Growth engine
│   └── saas/                     # Auto-deployer, opportunity scanner
├── lib/
│   ├── supabase/                 # Client + server Supabase-klienter
│   └── utils.ts                  # cn(), formatCurrency(), generateId()
└── types/index.ts                # Alle TypeScript-typer og enums
```

---

## 7 Brands

| Brand | Domene | Fokus |
|-------|--------|-------|
| Soleada.no | Eiendom | Costa Blanca/Cálida luksus |
| Zen Eco Homes | Eiendom | Bærekraftig/økologisk |
| ChatGenius.pro | SaaS | AI chatbot-plattform |
| Dona Anna | Landbruk | Olivenolje, økologisk |
| Freddy Bremseth | Personlig | Entrepreneur/eiendomsekspert |
| Pinosos Ecolife | Eiendom | Bærekraftig landliv |
| Neural Beat | Musikk | AI EDM-produksjon |

---

## AI-Agenter (10 stk, Claude-basert)

| Agent | Fil | Funksjon |
|-------|-----|----------|
| BaseAgent | `base-agent.ts` | Grunnklasse med Claude-integrasjon |
| MarketingAgent | `marketing-agent.ts` | Kampanjer, innholdsstrategi |
| SalesAgent | `sales-agent.ts` | Salgspitch, lead-oppfølging |
| SEOAgent | `seo-agent.ts` | SEO-optimalisering av innhold |
| BusinessAgent | `business-agent.ts` | Forretningsanalyse |
| CEOAgent | `ceo-agent.ts` | Strategisk rådgivning |
| EmailAgent | `email-agent.ts` | E-post-analyse og svar |
| MultiDomainExpert | `multi-domain-expert.ts` | Tverrfaglig ekspertise |
| YouTubeAgent | `youtube-agent.ts` | YouTube-innhold og SEO |
| Orchestrator | `orchestrator.ts` | Koordinerer multi-agent workflows |

**Modell:** `claude-haiku-4-5-20251001` (kostnadseffektiv med god kvalitet)

---

## API Routes (44 totalt)

### Kjerneressurser
- `GET/POST /api/leads` - Lead CRUD
- `GET/POST /api/properties` - Eiendoms CRUD
- `POST /api/properties/import` - XML/CSV import
- `GET/POST /api/contacts` - Kontakter/kunder
- `POST /api/contacts/email-draft` - AI e-postutkast
- `GET/POST /api/valuations` - AI-vurderinger (Gemini)
- `GET /api/plots` - Tomter

### AI & Innhold
- `POST /api/agents` - Agent-administrasjon
- `POST /api/agents/command` - Utfør agent-kommandoer
- `GET/POST /api/content` - Innholdsgenerering
- `POST /api/content/publish` - Publiser til social media
- `POST /api/neural-beat` - Musikkvideopipeline
- `GET/POST /api/youtube` - YouTube-administrasjon

### Scanner
- `GET/POST /api/scanner` - Eiendomsskanner med actions:
  - `weekly_scan` - Full Costa Blanca AI-skanning
  - `area_scan` - Områdespesifikk skanning (nytt)
  - `scan_url` - Skann spesifikk URL
  - `update_status` - Oppdater eiendomsstatus
  - `import_property` - Importer til eiendomsportefølje

### Email
- `GET/POST /api/email/inbox` - Innboks
- `POST /api/email/analyze` - AI-analyse av e-post
- `POST /api/email/send` - Send e-post
- `GET/POST /api/email/config` - E-postkonfigurasjon

### Growth & Marketing
- `POST /api/growth/engine` - Growth engine
- `GET/POST /api/growth/ab-tests` - A/B-testing
- `POST /api/growth/actions` - Growth-tiltak
- `POST /api/growth/lead-magnets` - Lead magnets
- `GET /api/growth/stats` - Statistikk

### SaaS (ChatGenius)
- `GET/POST /api/saas` - SaaS-apper
- `POST /api/saas/build` - Bygg ny app
- `GET /api/saas/opportunities` - Markedsmuligheter
- `POST /api/saas/stripe` - Stripe-integrasjon

### Cron Jobs
- `POST /api/cron/growth-engine`
- `POST /api/cron/market-data`
- `POST /api/cron/property-scanner`
- `POST /api/cron/saas-scanner`
- `POST /api/cron/weekly-report`

---

## Supabase Database-tabeller

### Eiendom (fra RealtyFlow)
- `brands` - 7 brands med logo, farge, kontakt
- `leads` - Lead pipeline med scoring
- `customers` - CRM data
- `appointments` - Kalender/visninger
- `properties` - Eiendommer med 6-språk support
- `marketing_tasks` - Marketing kanban
- `marketing_campaigns` - Kampanjer
- `market_analyses` - Markedsanalyser
- `saved_valuations` - AI-vurderinger
- `advisor_profiles` - Rådgiverprofiler
- `settings` - App-innstillinger

### Innhold (fra Social Media Hub)
- `posts` - Social media posts
- `content_generations` - AI-generert innhold
- `youtube_videos` - YouTube metadata
- `pipeline_runs` - Video pipeline runs
- `automation_logs` - Automasjonslogger
- `agent_commands` - Agent-historikk

### Scanner
- `scanned_properties` - Skannede eiendommer med status (new/interested/investigating/imported/rejected)
- `property_scan_runs` - Skanningshistorikk

### SaaS
- `saas_opportunities` - Oppdagede SaaS-ideer

---

## Eiendomsskanner (property-scanner.ts)

AI-drevet skanner som finner nybygg og tomter langs Costa Blanca.

### Kilder (etter fjerning av SpanishPropertyChoice)
1. **Kyero RSS** - Internasjonal portal
2. **ThinkSpain** - Britisk-fokusert, nybygg
3. **Newbuilds.es** - Kun nybygg i Spania

### Skanningsmoduser
1. **Weekly Discovery Scan** - Full AI-skanning av hele Costa Blanca (15-20 eiendommer)
2. **Area Scan** - Fokusert på én kommune (10-15 eiendommer), primært nye prosjekter
3. **URL Scan** - Skann en spesifikk portal-URL

### URL-sanitering
`sanitizeSourceUrl()` erstatter AI-fabrikkerte URLer med fungerende søke-URLer på Idealista basert på kommune og eiendomstype.

### Støttede kommuner (utvidet)
Costa Blanca Nord: Dénia, Jávea, Moraira, Calpe, Altea, Benidorm, Finestrat, La Nucia, Polop, Villajoyosa, El Campello
Costa Blanca Syd: Alicante, Santa Pola, Guardamar, Torrevieja, Orihuela Costa, Pilar de la Horadada, Rojales, San Miguel de Salinas
Innland: Pinosos, Novelda, Elda, Aspe, Castalla, Onil, Ibi, Jijona, Hondón de las Nieves

---

## Neural Beat Pipeline

AI-drevet musikkvideoproduksjon:
1. Hent sanger fra Airtable
2. Last ned audio
3. Analyser sang med AI (Claude Haiku)
4. Generer visuals med Gemini
5. Render video med FFmpeg
6. Last opp til YouTube

**Modell:** `claude-haiku-4-5-20251001` (oppdatert fra Gemini pga 403-feil)

---

## Content Studio Pipeline

Multi-agent innholdsgenerering:
1. **MarketingAgent** → Strategi og målgruppe
2. **SalesAgent** → Salgspitch
3. **AI Generation** → Innholdsproduksjon
4. **SEOAgent** → Optimalisering
5. **BusinessAgent** → Validering

---

## Growth Engine

Automatisert vekstmotor med:
- A/B-testing av innhold
- Lead magnet-generering
- Kanaloptimalisering
- ROI-sporing per brand

---

## Email AI-Assistent

- IMAP-tilkobling for å lese e-post
- AI-analyse av innhold, sentiment, urgency
- Automatisk utkast til svar
- Kryptering av sensitive data
- Merkelapp-klassifisering

---

## TypeScript Types (src/types/index.ts)

### Hoved-entiteter
- `Brand` (7 properties inkl. logo, primary_color, tagline)
- `Lead` (11 props: name, email, phone, status, score, source, brand_id, etc.)
- `Customer` (8 props: name, email, type, status, total_spent, etc.)
- `Property` (15 props: title, price, location, size, bedrooms, type, etc.)
- `Appointment` (9 props: title, date, type, status, customer_id, etc.)
- `Post` (9 props: title, content, platform, status, scheduled_at, etc.)
- `ContentGeneration` (8 props: prompt, result, agent, brand_id, etc.)
- `MarketingTask` (7 props: title, status, priority, brand_id, etc.)
- `Valuation` (5 props: property_id, estimated_value, report, etc.)
- `YouTubeVideo` (9 props: title, video_id, channel, views, etc.)

### Enums
- `LeadStatus`: new → contacted → qualified → proposal → negotiation → won → lost → archived
- `CustomerType`: buyer, seller, investor, tenant
- `Platform`: instagram, facebook, linkedin, youtube, tiktok, twitter
- `AppLanguage`: no, en, es, de, ru, fr

---

## Miljøvariabler

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

# YouTube
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=

# Airtable (Neural Beat)
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=
AIRTABLE_SONGS_TABLE=
AIRTABLE_GENRE_IMAGES_TABLE=

# Social Media
FACEBOOK_ACCESS_TOKEN=
LINKEDIN_ACCESS_TOKEN=

# Email
RESEND_API_KEY=
EMAIL_ENCRYPTION_KEY=

# Video
CREATOMATE_API_KEY=
```

---

## Kjente Issues & Pågående Arbeid

### Fikset
- [x] Scanner URLer var fabrikkert av AI → Lagt til `sanitizeSourceUrl()`
- [x] SpanishPropertyChoice fjernet (selger ikke i området)
- [x] Områdespesifikk skanning lagt til (Benidorm, Polop, Finestrat, etc.)
- [x] Neural Beat modellnavn oppdatert til `claude-haiku-4-5-20251001`

### Pågående / Kjente Issues
- [ ] CRM: Manuelt lagt inn kunder forsvinner ved navigasjon (mangler Supabase-persistering)
- [ ] CRM: Trenger mulighet til å sette pipeline-steg for manuelt lagt inn kunder
- [ ] SaaS "Ny app"-skjema: Ingenting skjer når bruker fyller inn og starter
- [ ] Auto-deploy cron: Sjekk lokalt bygde apper → push GitHub → deploy Vercel (hver 2. time)
- [ ] Registrer deployet apper (som review-response-ai) under "Mine Apper" i SaaS-seksjonen
- [ ] Supabase-migrasjoner 010 (saas_opportunities) og 011 (property_scanner) ikke kjørt
- [ ] Vercel env vars: GITHUB_TOKEN og VERCEL_TOKEN mangler

### Deployet Side-apper
- **review-response-ai** - AI-drevet verktøy for å svare på kundevurderinger
  - GitHub: `freddybremseth-coder/review-response-ai`
  - Vercel: `review-response-ai-three.vercel.app`

---

## Design & UI

- **Theme:** Dark mode med slate bakgrunn
- **Primary color:** Cyan (#06b6d4)
- **Font:** Poppins (Google Fonts)
- **Komponent-stil:** shadcn/ui-inspirert med CVA
- **Animasjoner:** fade-in, slide-in, pulse-slow
- **Responsivt:** Mobile-first med sidebar-navigasjon
- **Sidebar:** Grupperte seksjoner (Oversikt, Eiendom, Innhold, Forretning, Verktøy)

---

## Viktige Tekniske Beslutninger

1. **`"use client"`** på alle sider - Bevarer React-logikk fra original Vite SPA
2. **Supabase som unified DB** - Erstatter localStorage fra RealtyFlow
3. **Claude for AI-agenter** - Anthropic SDK direkte, ikke OpenAI
4. **Gemini for bilder/valuations** - Google AI for visuelt og verdivurdering
5. **Leaflet krever `dynamic()` import** med `ssr: false` (støtter ikke SSR)
6. **FFmpeg i Vercel** - Memory-begrensning 1024MB, håndtert
7. **Airtable kun for Neural Beat** - Resten bruker Supabase

---

## Prosjekt-Metriker

| Metrikk | Antall |
|---------|--------|
| Sider | 27 |
| API Routes | 44 |
| UI Komponenter | 7 |
| Service-filer | 28 |
| AI Agenter | 10 |
| Brands | 7 |
| TypeScript-typer | 18+ entiteter |
| Enums | 14+ |
| Støttede språk | 6 |
