type SupabaseLike = {
  from(table: string): any;
};

type SignalGuidance = {
  text: string;
  evidence: {
    seo: Record<string, unknown> | null;
    youtube: Record<string, unknown> | null;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactPath(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text || text.length > 180) return "";
  return text.startsWith("/") ? text : "/" + text.replace(/^\/+/, "");
}

/**
 * Read-only learning context used by autonomous content generation.
 *
 * This adapter never grants publishing rights by itself. It only summarizes
 * already persisted Sam SEO observations and YouTube engagement snapshots so
 * the publishing pipeline can make evidence-aware creative choices.
 */
export async function loadAutopilotSignalGuidance(
  supabase: SupabaseLike,
  brandId: string,
): Promise<SignalGuidance> {
  const brand = String(brandId || "").trim().toLowerCase();
  const parts: string[] = [];
  let seoEvidence: Record<string, unknown> | null = null;
  let youtubeEvidence: Record<string, unknown> | null = null;

  try {
    const { data: seoRow } = await supabase
      .from("automation_logs")
      .select("details,created_at")
      .eq("action", "seo_portfolio_growth_review")
      .in("status", ["success", "partial"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const details = asRecord(seoRow?.details);
    if (details) {
      const brandCounts = asArray(details.by_brand)
        .map(asRecord)
        .find((row) => String(row?.brandId ?? row?.brand_id ?? "").toLowerCase() === brand) ?? null;
      const topPages = asArray(details.top_pages ?? details.topPages)
        .map(asRecord)
        .filter((row) => String(row?.brandId ?? row?.brand_id ?? "").toLowerCase() === brand)
        .slice(0, 3);

      if (brandCounts || topPages.length) {
        const current = finite(brandCounts?.current);
        const previous = finite(brandCounts?.previous);
        const search = finite(brandCounts?.search);
        const ai = finite(brandCounts?.ai);
        const paths = topPages.map((row) => compactPath(row?.path)).filter(Boolean);
        const observations: string[] = [];
        if (current != null) observations.push(`${current} målte søke/AI-ankomster siste 30 dager`);
        if (previous != null) observations.push(`${previous} i forrige 30-dagersperiode`);
        if (search != null || ai != null) observations.push(`fordeling søk=${search ?? 0}, AI=${ai ?? 0}`);
        if (paths.length) observations.push(`mest besøkte målte sider: ${paths.join(", ")}`);
        if (observations.length) {
          parts.push("Sam SEO-observasjon: " + observations.join("; ") + ". Bruk dette som retning, ikke som bevis på søkeord eller kausal effekt.");
          seoEvidence = {
            collectedAt: seoRow?.created_at ?? null,
            current,
            previous,
            search,
            ai,
            topPages: paths,
          };
        }
      }
    }
  } catch {
    // SEO learning is additive; missing telemetry must never block publishing.
  }

  try {
    const { data: snapshots } = await supabase
      .from("engagement_snapshots")
      .select("post_id,views,likes,comments,shares,raw_data,snapshot_at")
      .eq("platform", "youtube")
      .order("snapshot_at", { ascending: false })
      .limit(200);

    const rows = (snapshots || [])
      .map((row: unknown) => asRecord(row))
      .filter((row): row is Record<string, unknown> => Boolean(row))
      .filter((row) => String(asRecord(row.raw_data)?.brand ?? "").toLowerCase() === brand);

    const latestByVideo = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const id = String(row.post_id ?? "");
      if (id && !latestByVideo.has(id)) latestByVideo.set(id, row);
      if (latestByVideo.size >= 12) break;
    }
    const latest = [...latestByVideo.values()];
    if (latest.length) {
      const totalViews = latest.reduce((sum, row) => sum + (finite(row.views) ?? 0), 0);
      const percentages = latest
        .map((row) => finite(asRecord(row.raw_data)?.average_view_percentage))
        .filter((value): value is number => value != null);
      const averageViewPercentage = percentages.length
        ? Math.round((percentages.reduce((sum, value) => sum + value, 0) / percentages.length) * 10) / 10
        : null;
      const netSubscribers = latest.reduce((sum, row) => {
        const raw = asRecord(row.raw_data);
        return sum + (finite(raw?.net_subscribers) ?? 0);
      }, 0);

      const observations = [
        `${latest.length} YouTube-videoer med siste lagrede måling`,
        `${Math.round(totalViews)} samlede visninger i disse målingene`,
      ];
      if (averageViewPercentage != null) observations.push(`gjennomsnittlig sett-andel ${averageViewPercentage}%`);
      observations.push(`netto abonnenter ${Math.round(netSubscribers)}`);
      parts.push("YouTube-observasjon: " + observations.join("; ") + ". Favoriser mønstre som allerede har målt seertid/engasjement, men behold utforskning slik at systemet fortsatt lærer.");
      youtubeEvidence = {
        measuredVideos: latest.length,
        totalViews: Math.round(totalViews),
        averageViewPercentage,
        netSubscribers: Math.round(netSubscribers),
      };
    }
  } catch {
    // YouTube learning is additive; missing analytics must never block publishing.
  }

  return {
    text: parts.length ? " " + parts.join(" ") : "",
    evidence: { seo: seoEvidence, youtube: youtubeEvidence },
  };
}
