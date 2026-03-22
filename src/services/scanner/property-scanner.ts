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
    name: 'Idealista',
    type: 'scrape',
    base_url: 'https://www.idealista.com',
    search_urls: [
      'https://www.idealista.com/en/venta-viviendas/alicante-provincia/con-obra-nueva/',
      'https://www.idealista.com/en/venta-viviendas/costa-blanca/con-obra-nueva/',
      'https://www.idealista.com/en/venta-terrenos/alicante-provincia/',
    ],
    description: 'Spanias største eiendomsportal. Nybygg og tomter i Alicante-provinsen.',
  },
  {
    name: 'Kyero',
    type: 'scrape',
    base_url: 'https://www.kyero.com',
    search_urls: [
      'https://www.kyero.com/en/costa-blanca-property-for-sale?property_types=new_development',
      'https://www.kyero.com/en/costa-blanca-property-for-sale?property_types=land',
    ],
    description: 'Internasjonal portal med fokus på utenlandske kjøpere. God dekning Costa Blanca.',
  },
  {
    name: 'ThinkSpain',
    type: 'scrape',
    base_url: 'https://www.thinkspain.com',
    search_urls: [
      'https://www.thinkspain.com/property-for-sale/costa-blanca-north/new-builds',
      'https://www.thinkspain.com/property-for-sale/costa-blanca-south/new-builds',
      'https://www.thinkspain.com/land-for-sale/costa-blanca',
    ],
    description: 'Britisk-fokusert portal for eiendom i Spania. God for nye prosjekter.',
  },
  {
    name: 'SpanishPropertyChoice',
    type: 'scrape',
    base_url: 'https://www.spanishpropertychoice.com',
    search_urls: [
      'https://www.spanishpropertychoice.com/new-build-properties-for-sale-in-costa-blanca',
      'https://www.spanishpropertychoice.com/plots-for-sale-in-costa-blanca',
    ],
    description: 'Spesialisert på Costa Blanca og Costa Cálida.',
  },
  {
    name: 'Newbuilds.es',
    type: 'scrape',
    base_url: 'https://newbuilds.es',
    search_urls: [
      'https://newbuilds.es/costa-blanca/',
      'https://newbuilds.es/costa-blanca-south/',
    ],
    description: 'Kun nybygg i Spania. Komplett oversikt over nye prosjekter.',
  },
  {
    name: 'Fotocasa',
    type: 'scrape',
    base_url: 'https://www.fotocasa.es',
    search_urls: [
      'https://www.fotocasa.es/en/buy/new-homes/alicante-province/all-zones/l',
      'https://www.fotocasa.es/en/buy/lands/alicante-province/all-zones/l',
    ],
    description: 'Spanias nest største portal etter Idealista.',
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

    // Use AI to discover and analyze current market
    try {
      const properties = await this.aiMarketDiscovery();
      allProperties.push(...properties);
      bySource['AI Market Discovery'] = properties.length;
    } catch (err) {
      errors.push(`AI Discovery: ${err instanceof Error ? err.message : 'Failed'}`);
    }

    // Try to fetch from sources that allow it
    for (const source of PROPERTY_SOURCES) {
      try {
        for (const searchUrl of source.search_urls.slice(0, 1)) { // 1 URL per source to save time
          const result = await this.scanUrl(searchUrl);
          if (result.properties.length > 0) {
            allProperties.push(...result.properties);
            bySource[source.name] = (bySource[source.name] || 0) + result.properties.length;
          }
          if (result.errors.length > 0) {
            errors.push(...result.errors.map(e => `${source.name}: ${e}`));
          }
        }
      } catch (err) {
        errors.push(`${source.name}: ${err instanceof Error ? err.message : 'Failed'}`);
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: `Du er en eiendomsekspert med dyp kunnskap om det spanske eiendomsmarkedet, spesielt Costa Blanca (Alicante-provinsen).

OPPGAVE: Identifiser reelle, aktuelle nybygg-prosjekter og tomter til salgs langs Costa Blanca. Fokuser på:

GEOGRAFISK FOKUS:
- Costa Blanca Nord: Dénia, Jávea, Moraira, Calpe, Altea, Benidorm, Villajoyosa, El Campello
- Costa Blanca Syd: Alicante, Santa Pola, Guardamar, Torrevieja, Orihuela Costa, Pilar de la Horadada
- Innland: Pinosos, Elda, Novelda, Castalla, Onil, Ibi, Jijona

TYPE EIENDOMMER:
1. Nye byggeprosjekter (obra nueva) - villaer, leiligheter, rekkehus
2. Tomter til salgs (parcelas, solares) - byggetomter, landbrukstomter med mulighet for bygging
3. Off-plan prosjekter som ikke har startet ennå

VIKTIG:
- Fokuser på eiendommer som faktisk finnes i markedet nå
- Oppgi realistiske priser basert på 2025/2026 markedspriser
- Inkluder utvikler/promotor-navn der du vet det
- Referer til kjente portaler der eiendommene kan finnes
- Prioriter prosjekter med FÅ enheter igjen eller som nettopp er lansert

RETURNER JSON-array med objekter:
{
  "title": "Prosjektnavn eller beskrivelse",
  "price": "€250.000",
  "price_numeric": 250000,
  "location": "Calpe, Costa Blanca",
  "municipality": "Calpe",
  "province": "Alicante",
  "size_m2": 120,
  "plot_m2": 500,
  "bedrooms": 3,
  "bathrooms": 2,
  "type": "villa|apartment|townhouse|finca|plot|new_build",
  "description": "Kort beskrivelse av eiendommen/prosjektet",
  "source": "Portalens navn",
  "source_url": "URL der man kan finne mer info",
  "image_urls": [],
  "features": ["basseng", "havutsikt", "parkering"],
  "is_new_build": true,
  "developer": "Utviklerens navn hvis kjent",
  "completion_date": "Q3 2026",
  "energy_rating": "A",
  "ref_number": "REF-123"
}

Returner 10-15 eiendommer. Kun valid JSON-array, ingen annen tekst.`,
      messages: [
        {
          role: 'user',
          content: `Dato: ${new Date().toISOString().split('T')[0]}. Identifiser aktuelle nybygg-prosjekter og tomter til salgs langs Costa Blanca. Inkluder både populære kystbyer og rimligere innlandsområder som Pinosos. Fokuser på prosjekter som er aktive akkurat nå.`,
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
   */
  private async fetchPage(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return null;
      const html = await res.text();

      // Strip scripts, styles, and reduce to meaningful content
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
    } catch {
      return null;
    }
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
        model: 'claude-sonnet-4-20250514',
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
