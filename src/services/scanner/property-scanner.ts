import Anthropic from '@anthropic-ai/sdk';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScannedProperty {
  title: string;
  price: string;
  price_numeric: number;
  location: string;
  municipality: string;
  province: string;
  size_m2: number;
  plot_m2?: number;
  bedrooms?: number;
  bathrooms?: number;
  type: 'villa' | 'apartment' | 'townhouse' | 'finca' | 'plot' | 'new_build' | 'other';
  description: string;
  source: string;
  source_url: string;
  image_urls: string[];
  features: string[];
  is_new_build: boolean;
  developer?: string;
  completion_date?: string;
  energy_rating?: string;
  ref_number?: string;
  scraped_at: string;
}

export interface ScanResult {
  properties: ScannedProperty[];
  source: string;
  total_found: number;
  scan_date: string;
  errors: string[];
}

// ─── Costa Blanca Property Sources ───────────────────────────────────────────

interface PropertySource {
  name: string;
  type: 'api' | 'rss' | 'scrape';
  base_url: string;
  search_urls: string[];
  description: string;
}

const PROPERTY_SOURCES: PropertySource[] = [
  {
    name: 'Kyero RSS',
    type: 'rss',
    base_url: 'https://www.kyero.com',
    search_urls: [
      'https://www.kyero.com/en/costa-blanca-property-for-sale.rss',
      'https://www.kyero.com/en/alicante-province-property-for-sale.rss',
    ],
    description: 'Kyero RSS feed - less protected than HTML pages. International portal for Costa Blanca.',
  },
  {
    name: 'ThinkSpain',
    type: 'scrape',
    base_url: 'https://www.thinkspain.com',
    search_urls: [
      'https://www.thinkspain.com/property-for-sale/costa-blanca-north/new-builds',
      'https://www.thinkspain.com/property-for-sale/costa-blanca-south/new-builds',
    ],
    description: 'Britisk-fokusert portal for eiendom i Spania. God for nye prosjekter.',
  },
  {
    name: 'Newbuilds.es',
    type: 'scrape',
    base_url: 'https://newbuilds.es',
    search_urls: [
      'https://newbuilds.es/costa-blanca/',
    ],
    description: 'Kun nybygg i Spania. Komplett oversikt over nye prosjekter.',
  },
  {
    name: 'SpanishPropertyChoice',
    type: 'scrape',
    base_url: 'https://www.spanishpropertychoice.com',
    search_urls: [
      'https://www.spanishpropertychoice.com/new-build-properties-for-sale-in-costa-blanca',
    ],
    description: 'Spesialisert på Costa Blanca og Costa Cálida.',
  },
];

// ─── Property Scanner Service ────────────────────────────────────────────────

export class PropertyScanner {
  private client: Anthropic | null = null;

  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
  }

  /**
   * Scan a specific URL and extract property listings using AI
   */
  async scanUrl(url: string): Promise<ScanResult> {
    const source = PROPERTY_SOURCES.find(s => url.includes(new URL(s.base_url).hostname)) || {
      name: new URL(url).hostname,
      type: 'scrape' as const,
      base_url: url,
      search_urls: [url],
      description: 'Custom source',
    };

    try {
      // Fetch the page HTML
      const html = await this.fetchPage(url);

      if (!html) {
        return {
          properties: [],
          source: source.name,
          total_found: 0,
          scan_date: new Date().toISOString(),
          errors: ['Could not fetch page content'],
        };
      }

      // Use AI to extract properties from HTML
      const properties = await this.extractPropertiesWithAI(html, source.name, url);

      return {
        properties,
        source: source.name,
        total_found: properties.length,
        scan_date: new Date().toISOString(),
        errors: [],
      };
    } catch (error) {
      return {
        properties: [],
        source: source.name,
        total_found: 0,
        scan_date: new Date().toISOString(),
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Run weekly scan across all configured sources
   * Focus: New builds + plots in Costa Blanca
   */
  async weeklyDiscoveryScan(): Promise<{
    all_properties: ScannedProperty[];
    by_source: Record<string, number>;
    errors: string[];
  }> {
    const allProperties: ScannedProperty[] = [];
    const bySource: Record<string, number> = {};
    const errors: string[] = [];

    // If no AI available, use curated mock discovery
    if (!this.client) {
      const mock = this.getMockDiscoveryResults();
      return {
        all_properties: mock,
        by_source: { 'AI Discovery': mock.length },
        errors: ['Using mock data - set ANTHROPIC_API_KEY for real scanning'],
      };
    }

    // PRIMARY METHOD: AI-powered market discovery (always works, uses Claude's knowledge)
    try {
      console.log('[PropertyScanner] Starting AI Market Discovery (primary method)...');
      const properties = await this.aiMarketDiscovery();
      allProperties.push(...properties);
      bySource['AI Market Discovery'] = properties.length;
      console.log(`[PropertyScanner] AI Discovery found ${properties.length} properties`);
    } catch (err) {
      errors.push(`AI Discovery: ${err instanceof Error ? err.message : 'Failed'}`);
      console.error('[PropertyScanner] AI Discovery failed:', err);
    }

    // SUPPLEMENTARY: Try to fetch from portal sources (many will be blocked by anti-bot)
    for (const source of PROPERTY_SOURCES) {
      try {
        for (const searchUrl of source.search_urls.slice(0, 1)) {
          console.log(`[PropertyScanner] Trying ${source.name}: ${searchUrl}`);
          const result = await this.scanUrl(searchUrl);
          if (result.properties.length > 0) {
            allProperties.push(...result.properties);
            bySource[source.name] = (bySource[source.name] || 0) + result.properties.length;
            console.log(`[PropertyScanner] ${source.name}: found ${result.properties.length} properties`);
          } else {
            console.log(`[PropertyScanner] ${source.name}: no properties found (likely blocked by anti-bot)`);
          }
          if (result.errors.length > 0) {
            errors.push(...result.errors.map(e => `${source.name}: ${e}`));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed';
        errors.push(`${source.name}: ${msg}`);
        console.log(`[PropertyScanner] ${source.name}: failed - ${msg}`);
      }
    }

    // Deduplicate by title similarity
    const unique = this.deduplicateProperties(allProperties);

    return {
      all_properties: unique,
      by_source: bySource,
      errors,
    };
  }

  /**
   * AI-powered market discovery
   * Uses Claude's knowledge to identify current new build projects and land opportunities
   */
  private async aiMarketDiscovery(): Promise<ScannedProperty[]> {
    if (!this.client) return [];

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 6000,
      system: `Du er en eiendomsekspert med dyp kunnskap om det spanske eiendomsmarkedet, spesielt Costa Blanca (Alicante-provinsen).

OPPGAVE: List opp reelle, kjente nybygg-prosjekter og tomter til salgs langs Costa Blanca. Fokuser på KJENTE utviklinger som faktisk eksisterer og kan verifiseres.

GEOGRAFISK FOKUS (inkluder minst 2-3 eiendommer fra hver sone):
- Costa Blanca Nord: Dénia, Jávea, Moraira, Calpe, Altea, Benidorm, Villajoyosa, El Campello, Finestrat, La Nucia
- Costa Blanca Syd: Alicante by, Santa Pola, Guardamar del Segura, Torrevieja, Orihuela Costa, Pilar de la Horadada, San Miguel de Salinas, Rojales
- Innland (rimeligere): Pinosos, Elda, Novelda, Castalla, Onil, Ibi, Jijona, Aspe, Hondón de las Nieves

TYPE EIENDOMMER:
1. Nye byggeprosjekter (obra nueva) fra KJENTE utviklere som: TM Grupo Inmobiliario, Grupo Vapf, Allure Homes, AQ Acentor, Medvilla Spanje, Taylor Wimpey España, AEDAS Homes, Neinor Homes, Metrovacesa, Habitat Inmobiliaria
2. Tomter til salgs (parcelas, solares) - med realistiske priser for området
3. Off-plan prosjekter

VIKTIG:
- Returner MINST 15 og opptil 20 eiendommer
- Bruk VIRKELIGE prosjektnavn der du kjenner dem (f.eks. "Blue Infinity", "Allure Calpe", "Vistabella Golf", "La Finca Golf", "Cumbre del Sol")
- Priser MÅ være realistiske for 2025/2026-markedet:
  * Innland tomter: €20.000-€80.000
  * Kyst leiligheter: €180.000-€400.000
  * Kyst villaer: €350.000-€900.000
  * Premium villaer (Jávea/Moraira): €500.000-€1.500.000
- Oppgi utvikler/promotor-navn for alle nybygg
- Bruk source_url som peker til kjente portaler (idealista.com, kyero.com, thinkspain.com, spanishpropertychoice.com)

RETURNER JSON-array med objekter:
{
  "title": "Prosjektnavn eller beskrivelse",
  "price": "€250.000",
  "price_numeric": 250000,
  "location": "Calpe, Costa Blanca Nord",
  "municipality": "Calpe",
  "province": "Alicante",
  "size_m2": 120,
  "plot_m2": 500,
  "bedrooms": 3,
  "bathrooms": 2,
  "type": "villa|apartment|townhouse|finca|plot|new_build",
  "description": "Kort beskrivelse inkludert hva som gjør prosjektet unikt",
  "source": "Portal eller utvikler",
  "source_url": "URL til relevant portal-søk",
  "image_urls": [],
  "features": ["basseng", "havutsikt", "parkering"],
  "is_new_build": true,
  "developer": "Utviklerens fulle navn",
  "completion_date": "Q3 2026",
  "energy_rating": "A",
  "ref_number": "REF-123"
}

Returner 15-20 eiendommer. Kun valid JSON-array, ingen annen tekst.`,
      messages: [
        {
          role: 'user',
          content: `Dato: ${new Date().toISOString().split('T')[0]}. List opp kjente nybygg-prosjekter og tomter til salgs langs Costa Blanca. Inkluder:
- Minst 4-5 prosjekter fra Costa Blanca Nord (Jávea, Calpe, Benidorm, Finestrat, Altea)
- Minst 4-5 prosjekter fra Costa Blanca Syd (Torrevieja, Orihuela Costa, Santa Pola, Guardamar)
- Minst 3-4 tomter fra innlandsområder (Pinosos, Novelda, Aspe, Hondón)
- Minst 2-3 prosjekter fra kjente utviklere (TM Grupo, Taylor Wimpey, AEDAS Homes, etc.)
Bruk virkelige prosjektnavn der du kjenner dem. Returner minst 15 eiendommer.`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      const properties: ScannedProperty[] = JSON.parse(jsonMatch[0]).map((p: ScannedProperty) => ({
        ...p,
        scraped_at: new Date().toISOString(),
      }));
      return properties;
    } catch {
      console.error('[PropertyScanner] Failed to parse AI discovery response');
      return [];
    }
  }

  /**
   * Fetch a web page and return clean text/HTML
   * Handles anti-bot protection gracefully with fallbacks
   */
  private async fetchPage(url: string): Promise<string | null> {
    const fullUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const headers: Record<string, string> = {
      'User-Agent': fullUserAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,es;q=0.8,no;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    };

    // Attempt 1: Direct fetch
    try {
      const res = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const html = await res.text();
        const cleaned = this.cleanHtml(html);

        // Check if we got real content or a captcha/block page
        if (cleaned.length > 200 && !this.looksLikeAntiBot(cleaned)) {
          console.log(`[PropertyScanner] fetchPage OK: ${url} (${cleaned.length} chars)`);
          return cleaned;
        } else {
          console.log(`[PropertyScanner] fetchPage got anti-bot/empty response from: ${url}`);
        }
      } else {
        console.log(`[PropertyScanner] fetchPage HTTP ${res.status} from: ${url}`);
      }
    } catch (err) {
      console.log(`[PropertyScanner] fetchPage direct failed for: ${url} - ${err instanceof Error ? err.message : 'timeout'}`);
    }

    // Attempt 2: Try Google cache as fallback
    try {
      const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
      const res = await fetch(cacheUrl, {
        headers: { ...headers, 'Referer': 'https://www.google.com/' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const html = await res.text();
        const cleaned = this.cleanHtml(html);
        if (cleaned.length > 200) {
          console.log(`[PropertyScanner] fetchPage OK via Google cache: ${url} (${cleaned.length} chars)`);
          return cleaned;
        }
      }
    } catch {
      // Google cache not available, that's fine
    }

    console.log(`[PropertyScanner] fetchPage: all attempts failed for ${url}`);
    return null;
  }

  /**
   * Strip HTML to meaningful text content
   */
  private cleanHtml(html: string): string {
    const cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Limit to ~8000 chars to fit in AI context
    return cleaned.substring(0, 8000);
  }

  /**
   * Detect if page content looks like an anti-bot/captcha response
   */
  private looksLikeAntiBot(content: string): boolean {
    const lower = content.toLowerCase();
    const botSignals = [
      'captcha', 'recaptcha', 'hcaptcha', 'challenge-platform',
      'just a moment', 'checking your browser', 'access denied',
      'please verify you are a human', 'bot detection',
      'cloudflare', 'ray id', 'please turn javascript on',
      'enable cookies', 'unusual traffic',
    ];
    const matchCount = botSignals.filter(s => lower.includes(s)).length;
    return matchCount >= 2;
  }

  /**
   * Use AI to extract structured property data from HTML content
   */
  private async extractPropertiesWithAI(
    htmlContent: string,
    sourceName: string,
    sourceUrl: string
  ): Promise<ScannedProperty[]> {
    if (!this.client) return [];

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        system: `Du er en eiendomsdata-ekstraktor. Analyser innhold fra en eiendomsside og ekstraher strukturerte data om eiendommer.

RETURFORMAT: JSON-array med objekter:
{
  "title": "Tittel",
  "price": "€250.000",
  "price_numeric": 250000,
  "location": "By, Costa Blanca",
  "municipality": "By",
  "province": "Alicante",
  "size_m2": 120,
  "plot_m2": null,
  "bedrooms": 3,
  "bathrooms": 2,
  "type": "villa|apartment|townhouse|finca|plot|new_build",
  "description": "Kort beskrivelse",
  "source": "${sourceName}",
  "source_url": "${sourceUrl}",
  "image_urls": [],
  "features": [],
  "is_new_build": true,
  "developer": null,
  "completion_date": null,
  "energy_rating": null,
  "ref_number": null
}

Ekstraher alle eiendommer du finner. Hvis priser er i annen valuta, konverter til EUR.
Returner KUN valid JSON-array. Hvis ingen eiendommer finnes, returner [].`,
        messages: [
          {
            role: 'user',
            content: `Ekstraher eiendomsdata fra dette innholdet fra ${sourceName}:\n\n${htmlContent}`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      return JSON.parse(jsonMatch[0]).map((p: ScannedProperty) => ({
        ...p,
        scraped_at: new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Remove duplicate properties based on title/location similarity
   */
  private deduplicateProperties(properties: ScannedProperty[]): ScannedProperty[] {
    const seen = new Set<string>();
    return properties.filter((p) => {
      const key = `${p.title.toLowerCase().substring(0, 30)}-${p.municipality?.toLowerCase() || ''}-${p.price_numeric || 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Get available sources info
   */
  getSources(): PropertySource[] {
    return PROPERTY_SOURCES;
  }

  private getMockDiscoveryResults(): ScannedProperty[] {
    return [
      {
        title: 'Nytt villaprosjekt med havutsikt i Calpe',
        price: '€389.000',
        price_numeric: 389000,
        location: 'Calpe, Costa Blanca Nord',
        municipality: 'Calpe',
        province: 'Alicante',
        size_m2: 150,
        plot_m2: 400,
        bedrooms: 3,
        bathrooms: 2,
        type: 'new_build',
        description: 'Moderne villaer med privat basseng, 3 soverom, panoramautsikt over Middelhavet. Ferdigstillelse Q4 2026.',
        source: 'AI Discovery',
        source_url: 'https://newbuilds.es/costa-blanca/',
        image_urls: [],
        features: ['basseng', 'havutsikt', 'parkering', 'klimaanlegg', 'solceller'],
        is_new_build: true,
        developer: 'Grupo GVA Inmobiliaria',
        completion_date: 'Q4 2026',
        energy_rating: 'A',
        ref_number: 'CB-NEW-001',
        scraped_at: new Date().toISOString(),
      },
      {
        title: 'Byggetomt med fjell- og dalutsikt i Pinosos',
        price: '€45.000',
        price_numeric: 45000,
        location: 'Pinosos, Alicante innland',
        municipality: 'Pinosos',
        province: 'Alicante',
        size_m2: 0,
        plot_m2: 10000,
        bedrooms: 0,
        bathrooms: 0,
        type: 'plot',
        description: 'Rustik tomt pa 10.000 m2 med mulighet for bygging av opp til 200 m2 bolig. Vannbrønn. Fantastisk utsikt.',
        source: 'AI Discovery',
        source_url: 'https://www.idealista.com/en/venta-terrenos/pinoso-alicante/',
        image_urls: [],
        features: ['vannbrønn', 'utsikt', 'strøm tilgjengelig', 'vei'],
        is_new_build: false,
        ref_number: 'PIN-PLOT-001',
        scraped_at: new Date().toISOString(),
      },
      {
        title: 'Leiligheter i nytt kompleks med felles basseng, Guardamar',
        price: '€215.000',
        price_numeric: 215000,
        location: 'Guardamar del Segura, Costa Blanca Syd',
        municipality: 'Guardamar del Segura',
        province: 'Alicante',
        size_m2: 85,
        plot_m2: 0,
        bedrooms: 2,
        bathrooms: 2,
        type: 'new_build',
        description: 'Nye leiligheter med 2-3 soverom, felles basseng og hage. 800m fra stranden. Ferdig 2026.',
        source: 'AI Discovery',
        source_url: 'https://www.thinkspain.com/property-for-sale/costa-blanca-south/new-builds',
        image_urls: [],
        features: ['felles basseng', 'nær stranden', 'parkering', 'lagringsrom'],
        is_new_build: true,
        developer: 'Promo Levante',
        completion_date: 'Q2 2026',
        energy_rating: 'B',
        ref_number: 'GDS-NEW-003',
        scraped_at: new Date().toISOString(),
      },
      {
        title: 'Økologisk villaprosjekt i Jávea',
        price: '€595.000',
        price_numeric: 595000,
        location: 'Javea, Costa Blanca Nord',
        municipality: 'Javea',
        province: 'Alicante',
        size_m2: 220,
        plot_m2: 800,
        bedrooms: 4,
        bathrooms: 3,
        type: 'new_build',
        description: 'Bærekraftige villaer med solceller, varmepumpe, gjenbruksvann. Privat basseng og hage. Premium beliggenhet.',
        source: 'AI Discovery',
        source_url: 'https://www.kyero.com/en/javea-property-for-sale',
        image_urls: [],
        features: ['solceller', 'varmepumpe', 'privat basseng', 'smart home', 'EV-lader'],
        is_new_build: true,
        developer: 'Eco Homes Mediterranean',
        completion_date: 'Q1 2027',
        energy_rating: 'A+',
        ref_number: 'JAV-ECO-004',
        scraped_at: new Date().toISOString(),
      },
      {
        title: 'Stor landbrukstomt med byggmulighet i Novelda',
        price: '€32.000',
        price_numeric: 32000,
        location: 'Novelda, Alicante innland',
        municipality: 'Novelda',
        province: 'Alicante',
        size_m2: 0,
        plot_m2: 15000,
        bedrooms: 0,
        bathrooms: 0,
        type: 'plot',
        description: 'Flat tomt med frukttrær, enkel adkomst. Mulighet for 150 m2 bolig. 30 min fra Alicante sentrum.',
        source: 'AI Discovery',
        source_url: 'https://www.idealista.com/en/venta-terrenos/novelda-alicante/',
        image_urls: [],
        features: ['frukttrær', 'flat tomt', 'vei', 'nær motorvei'],
        is_new_build: false,
        ref_number: 'NOV-PLOT-005',
        scraped_at: new Date().toISOString(),
      },
    ];
  }
}
