import type { SupabaseClient } from '@supabase/supabase-js';

export interface MarketData {
  exchangeRates: { pair: string; rate: number; date: string; change7d: number }[];
  ecbRate: { rate: number; date: string; previousRate: number };
  idealistaNews: { title: string; link: string; date: string; summary: string }[];
  internalMetrics: {
    totalLeads: number;
    newLeadsWeek: number;
    leadsByStatus: Record<string, number>;
    pipelineValue: number;
    totalProperties: number;
    newListingsWeek: number;
    activeUsers: number;
  };
  fetchedAt: string;
}

interface ExchangeRateEntry {
  currency_pair: string;
  rate: number;
  date: string;
}

interface ECBRateResult {
  rate: number;
  date: string;
  previous_rate: number;
}

interface NewsEntry {
  title: string;
  link: string;
  date: string;
  summary: string;
}

interface InternalMetrics {
  totalLeads: number;
  newLeadsWeek: number;
  leadsByStatus: Record<string, number>;
  pipelineValue: number;
  totalProperties: number;
  newListingsWeek: number;
  activeUsers: number;
}

export class MarketDataFetcher {
  private static readonly ECB_EXCHANGE_URL =
    'https://data-api.ecb.europa.eu/service/data/EXR/D.NOK+SEK+GBP.EUR.SP00.A?format=jsondata&lastNObservations=30';

  private static readonly ECB_INTEREST_URL =
    'https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.MRR_FR.LEV?format=jsondata&lastNObservations=5';

  private static readonly IDEALISTA_RSS_URL =
    'https://www.idealista.com/en/news/feed/';

  private static readonly NEWS_KEYWORDS = [
    'price',
    'market',
    'costa blanca',
    'alicante',
    'murcia',
    'spain property',
  ];

  // ---------------------------------------------------------------------------
  // 1. ECB Exchange Rates
  // ---------------------------------------------------------------------------

  async fetchExchangeRates(): Promise<ExchangeRateEntry[]> {
    try {
      console.log('[MarketDataFetcher] Fetching ECB exchange rates...');
      const res = await fetch(MarketDataFetcher.ECB_EXCHANGE_URL);
      if (!res.ok) throw new Error(`ECB exchange API returned ${res.status}`);
      const json = await res.json();

      const results: ExchangeRateEntry[] = [];
      const dataSets = json?.dataSets ?? [];
      const structure = json?.structure?.dimensions?.observation ?? [];
      const seriesStructure = json?.structure?.dimensions?.series ?? [];

      // Identify which series-dimension index corresponds to the currency
      // In the EXR dataset the second series key (index 1) holds the currency code.
      const currencyDim = seriesStructure[1];
      const currencyValues: Record<string, { id: string }> =
        currencyDim?.values ?? {};

      // Time periods come from the observation-level dimension (index 0 usually)
      const timeDim = structure[0];
      const timePeriods: { id: string }[] = timeDim?.values ?? [];

      if (dataSets.length === 0) return results;

      const series = dataSets[0]?.series ?? {};

      for (const seriesKey of Object.keys(series)) {
        const keyParts = seriesKey.split(':');
        const currencyIndex = parseInt(keyParts[1], 10);
        const currencyCode =
          currencyValues[String(currencyIndex)]?.id ??
          Object.values(currencyValues)[currencyIndex]?.id ??
          'UNKNOWN';

        const observations = series[seriesKey]?.observations ?? {};

        for (const obsKey of Object.keys(observations)) {
          const obsIndex = parseInt(obsKey, 10);
          const value = observations[obsKey]?.[0];
          const date = timePeriods[obsIndex]?.id ?? '';

          if (value != null && date) {
            results.push({
              currency_pair: `EUR/${currencyCode}`,
              rate: Number(value),
              date,
            });
          }
        }
      }

      console.log(
        `[MarketDataFetcher] Fetched ${results.length} exchange rate observations.`
      );
      return results;
    } catch (err) {
      console.log(
        '[MarketDataFetcher] Failed to fetch exchange rates:',
        (err as Error).message
      );
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // 2. ECB Interest Rate (Main Refinancing Rate)
  // ---------------------------------------------------------------------------

  async fetchECBInterestRate(): Promise<ECBRateResult | null> {
    try {
      console.log('[MarketDataFetcher] Fetching ECB interest rate...');
      const res = await fetch(MarketDataFetcher.ECB_INTEREST_URL);
      if (!res.ok) throw new Error(`ECB interest API returned ${res.status}`);
      const json = await res.json();

      const dataSets = json?.dataSets ?? [];
      const structure = json?.structure?.dimensions?.observation ?? [];
      const timeDim = structure[0];
      const timePeriods: { id: string }[] = timeDim?.values ?? [];

      if (dataSets.length === 0) return null;

      const series = dataSets[0]?.series ?? {};
      const firstSeriesKey = Object.keys(series)[0];
      if (!firstSeriesKey) return null;

      const observations = series[firstSeriesKey]?.observations ?? {};
      const obsKeys = Object.keys(observations)
        .map(Number)
        .sort((a, b) => a - b);

      if (obsKeys.length === 0) return null;

      const latestIdx = obsKeys[obsKeys.length - 1];
      const previousIdx =
        obsKeys.length > 1 ? obsKeys[obsKeys.length - 2] : latestIdx;

      const rate = Number(observations[String(latestIdx)]?.[0]);
      const previousRate = Number(observations[String(previousIdx)]?.[0]);
      const date = timePeriods[latestIdx]?.id ?? '';

      console.log(`[MarketDataFetcher] ECB rate: ${rate}% (${date})`);
      return { rate, date, previous_rate: previousRate };
    } catch (err) {
      console.log(
        '[MarketDataFetcher] Failed to fetch ECB interest rate:',
        (err as Error).message
      );
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Idealista RSS News
  // ---------------------------------------------------------------------------

  async fetchIdealistaNews(): Promise<NewsEntry[]> {
    try {
      console.log('[MarketDataFetcher] Fetching Idealista RSS feed...');
      const res = await fetch(MarketDataFetcher.IDEALISTA_RSS_URL);
      if (!res.ok) throw new Error(`Idealista RSS returned ${res.status}`);
      const xml = await res.text();

      const items = this.parseRSSItems(xml);

      // Filter by keywords
      const filtered = items.filter((item) => {
        const text =
          `${item.title} ${item.summary}`.toLowerCase();
        return MarketDataFetcher.NEWS_KEYWORDS.some((kw) => text.includes(kw));
      });

      console.log(
        `[MarketDataFetcher] Fetched ${items.length} RSS items, ${filtered.length} matched keywords.`
      );
      return filtered;
    } catch (err) {
      console.log(
        '[MarketDataFetcher] Failed to fetch Idealista news:',
        (err as Error).message
      );
      return [];
    }
  }

  /**
   * Simple regex-based RSS/XML parser. Extracts <item> blocks and pulls out
   * title, link, pubDate, and description from each.
   */
  private parseRSSItems(xml: string): NewsEntry[] {
    const results: NewsEntry[] = [];
    const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;

    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = this.extractTag(block, 'title');
      const link = this.extractTag(block, 'link');
      const pubDate = this.extractTag(block, 'pubDate');
      const description = this.extractTag(block, 'description');

      results.push({
        title: this.stripCDATA(title),
        link: this.stripCDATA(link),
        date: pubDate ? new Date(pubDate).toISOString() : '',
        summary: this.stripHTML(this.stripCDATA(description)).slice(0, 300),
      });
    }

    return results;
  }

  private extractTag(xml: string, tag: string): string {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = regex.exec(xml);
    return m ? m[1].trim() : '';
  }

  private stripCDATA(str: string): string {
    return str.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
  }

  private stripHTML(str: string): string {
    return str.replace(/<[^>]+>/g, '').trim();
  }

  // ---------------------------------------------------------------------------
  // 4. Internal CRM Data (Supabase)
  // ---------------------------------------------------------------------------

  async fetchInternalMetrics(
    supabase: SupabaseClient
  ): Promise<InternalMetrics> {
    try {
      console.log('[MarketDataFetcher] Fetching internal CRM metrics...');

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoISO = sevenDaysAgo.toISOString();

      // Run queries in parallel
      const [
        leadsRes,
        newLeadsRes,
        pipelineRes,
        propertiesRes,
        newListingsRes,
        usersRes,
      ] = await Promise.all([
        supabase.from('leads').select('status', { count: 'exact' }),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgoISO),
        supabase.from('leads').select('estimated_value'),
        supabase
          .from('properties')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('properties')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgoISO),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
      ]);

      // Leads by status
      const leadsByStatus: Record<string, number> = {};
      if (leadsRes.data) {
        for (const lead of leadsRes.data) {
          const status = (lead as { status: string }).status ?? 'unknown';
          leadsByStatus[status] = (leadsByStatus[status] ?? 0) + 1;
        }
      }

      // Pipeline value
      let pipelineValue = 0;
      if (pipelineRes.data) {
        for (const lead of pipelineRes.data) {
          pipelineValue +=
            Number((lead as { estimated_value: number }).estimated_value) || 0;
        }
      }

      const metrics: InternalMetrics = {
        totalLeads: leadsRes.count ?? leadsRes.data?.length ?? 0,
        newLeadsWeek: newLeadsRes.count ?? 0,
        leadsByStatus,
        pipelineValue,
        totalProperties: propertiesRes.count ?? 0,
        newListingsWeek: newListingsRes.count ?? 0,
        activeUsers: usersRes.count ?? 0,
      };

      console.log(
        `[MarketDataFetcher] Internal metrics: ${metrics.totalLeads} leads, ${metrics.totalProperties} properties.`
      );
      return metrics;
    } catch (err) {
      console.log(
        '[MarketDataFetcher] Failed to fetch internal metrics:',
        (err as Error).message
      );
      return {
        totalLeads: 0,
        newLeadsWeek: 0,
        leadsByStatus: {},
        pipelineValue: 0,
        totalProperties: 0,
        newListingsWeek: 0,
        activeUsers: 0,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Combined Fetch
  // ---------------------------------------------------------------------------

  async fetchAll(supabase: SupabaseClient): Promise<MarketData> {
    console.log('[MarketDataFetcher] Starting full market data fetch...');

    const [exchangeRatesRaw, ecbRateRaw, idealistaNews, internalMetrics] =
      await Promise.all([
        this.fetchExchangeRates(),
        this.fetchECBInterestRate(),
        this.fetchIdealistaNews(),
        this.fetchInternalMetrics(supabase),
      ]);

    // Build exchange rates with 7-day change
    const exchangeRates = this.computeExchangeRatesWithChange(exchangeRatesRaw);

    const ecbRate = ecbRateRaw
      ? {
          rate: ecbRateRaw.rate,
          date: ecbRateRaw.date,
          previousRate: ecbRateRaw.previous_rate,
        }
      : { rate: 0, date: '', previousRate: 0 };

    const result: MarketData = {
      exchangeRates,
      ecbRate,
      idealistaNews,
      internalMetrics,
      fetchedAt: new Date().toISOString(),
    };

    console.log('[MarketDataFetcher] Full market data fetch complete.');
    return result;
  }

  /**
   * Groups raw exchange rate entries by currency pair, picks the latest rate,
   * and computes the 7-day percentage change.
   */
  private computeExchangeRatesWithChange(
    entries: ExchangeRateEntry[]
  ): MarketData['exchangeRates'] {
    const grouped: Record<string, ExchangeRateEntry[]> = {};

    for (const entry of entries) {
      if (!grouped[entry.currency_pair]) {
        grouped[entry.currency_pair] = [];
      }
      grouped[entry.currency_pair].push(entry);
    }

    const results: MarketData['exchangeRates'] = [];

    for (const pair of Object.keys(grouped)) {
      const sorted = grouped[pair].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const latest = sorted[sorted.length - 1];
      // Find the rate ~7 days ago (pick the entry closest to 7 days back)
      const targetDate = new Date(latest.date);
      targetDate.setDate(targetDate.getDate() - 7);
      const targetTime = targetDate.getTime();

      let closest = sorted[0];
      let closestDiff = Math.abs(
        new Date(closest.date).getTime() - targetTime
      );
      for (const entry of sorted) {
        const diff = Math.abs(new Date(entry.date).getTime() - targetTime);
        if (diff < closestDiff) {
          closest = entry;
          closestDiff = diff;
        }
      }

      const change7d =
        closest.rate !== 0
          ? ((latest.rate - closest.rate) / closest.rate) * 100
          : 0;

      results.push({
        pair: latest.currency_pair,
        rate: latest.rate,
        date: latest.date,
        change7d: Math.round(change7d * 100) / 100,
      });
    }

    return results;
  }
}
