/**
 * Phase 7.1D — PublishingAccountResolver (multi-account routing).
 *
 * Virkeligheten er brand → service → market/language → channel → KONTO, ikke
 * brand → én konto. Bruker IKKE maybeSingle: 0 treff → ACCOUNT_NOT_FOUND,
 * 1 → OK, >1 → ACCOUNT_AMBIGUOUS (AI velger aldri tilfeldig). Et menneske-valgt
 * publishing_account_id vinner alltid; AI kan ikke overstyre det.
 *
 * Feiltaksonomi (fail closed):
 *   ACCOUNT_NOT_FOUND | ACCOUNT_AMBIGUOUS | BRAND_MISMATCH | ACCOUNT_SCOPE_MISMATCH
 *
 * Scope (service/market/language) leses fra social_channels.metadata.
 */

import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

const CHANNEL_TO_PLATFORM: Record<string, string> = {
  instagram: "instagram", facebook: "facebook", linkedin: "linkedin",
  youtube: "youtube", youtube_shorts: "youtube", tiktok: "tiktok",
};

export interface PublishingDestinationQuery {
  brandId: string;
  channel: string;
  service?: string | null;
  market?: string | null;
  language?: string | null;
  /** Menneske-valgt konto (external_id) — vinner alltid, AI kan ikke overstyre. */
  publishingAccountId?: string | null;
}

export interface ResolvedAccount {
  brandId: string;
  channel: string;
  platform: string;
  accountId: string; // external_id
  displayName: string;
  service?: string | null;
  market?: string | null;
  language?: string | null;
}

const meta = (r: any) => (r?.metadata ?? {}) as Record<string, unknown>;
const scopeVal = (r: any, key: string) => {
  const v = meta(r)[key];
  return typeof v === "string" && v ? v : null;
};

function toResolved(r: any, channel: string, platform: string): ResolvedAccount {
  return {
    brandId: r.brand_id, channel, platform, accountId: String(r.external_id), displayName: r.display_name,
    service: scopeVal(r, "service"), market: scopeVal(r, "market"), language: scopeVal(r, "language"),
  };
}

/** Innsnevre på scope: foretrekk eksakt match, fall tilbake til scope-agnostiske kontoer. */
function narrow(rows: any[], key: string, want?: string | null): any[] {
  if (!want) return rows;
  const exact = rows.filter((r) => scopeVal(r, key) === want);
  if (exact.length) return exact;
  return rows.filter((r) => scopeVal(r, key) == null); // brand-wide fallback
}

export async function resolvePublishingAccount(
  supabase: MarketingSupabaseLike,
  q: PublishingDestinationQuery,
): Promise<ResolvedAccount> {
  const platform = CHANNEL_TO_PLATFORM[q.channel];
  if (!platform) throw new Error(`ACCOUNT_NOT_FOUND: ukjent kanal «${q.channel}».`);

  const { data } = await supabase
    .from("social_channels")
    .select("brand_id, platform, external_id, display_name, is_active, metadata")
    .eq("brand_id", q.brandId)
    .eq("platform", platform)
    .eq("is_active", true);
  const rows = (data ?? []) as any[];

  // Menneske-valgt konto vinner alltid.
  if (q.publishingAccountId) {
    const exact = rows.find((r) => String(r.external_id) === q.publishingAccountId);
    if (!exact) {
      // Finnes den i det hele tatt — men på feil brand eller inaktiv?
      const other = await supabase.from("social_channels").select("brand_id").eq("platform", platform).eq("external_id", q.publishingAccountId).maybeSingle();
      if (other.data && other.data.brand_id !== q.brandId) throw new Error(`BRAND_MISMATCH: konto «${q.publishingAccountId}» tilhører «${other.data.brand_id}», ikke «${q.brandId}».`);
      throw new Error(`ACCOUNT_NOT_FOUND: konto «${q.publishingAccountId}» finnes ikke aktiv for «${q.brandId}».`);
    }
    if (q.service && scopeVal(exact, "service") && scopeVal(exact, "service") !== q.service) {
      throw new Error(`ACCOUNT_SCOPE_MISMATCH: konto «${q.publishingAccountId}» er for service «${scopeVal(exact, "service")}», ikke «${q.service}».`);
    }
    return toResolved(exact, q.channel, platform);
  }

  // Auto-routing på scope.
  let candidates = rows;
  candidates = narrow(candidates, "service", q.service);
  candidates = narrow(candidates, "market", q.market);
  candidates = narrow(candidates, "language", q.language);

  if (candidates.length === 0) throw new Error(`ACCOUNT_NOT_FOUND: ingen aktiv ${platform}-konto for brand «${q.brandId}»${q.service ? ` / service «${q.service}»` : ""}.`);
  if (candidates.length > 1) {
    throw new Error(`ACCOUNT_AMBIGUOUS: ${candidates.length} aktive ${platform}-kontoer matcher — angi publishing_account_id (AI velger aldri tilfeldig). Kandidater: ${candidates.map((r) => r.external_id).join(", ")}.`);
  }
  return toResolved(candidates[0], q.channel, platform);
}
