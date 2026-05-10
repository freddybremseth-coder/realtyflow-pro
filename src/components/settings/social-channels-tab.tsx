"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Wifi,
  Youtube,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BRANDS } from "@/lib/constants";

/**
 * Phase 5 social channels tab.
 *
 * The contract is intentionally simple: the user picks ONE brand, and every
 * action on the page (Connect, Test, Disconnect) is scoped to that brand.
 * That's the structural fix that started in Phase 1 — there is no UI affordance
 * for "connect Facebook globally and figure out which brand it belongs to
 * later".
 *
 * Data sources:
 *   - GET /api/oauth/channels?brand_id=...  → new tables (social_channels +
 *     oauth_tokens). Returns scrubbed rows with scopes / token rotated_at /
 *     no token material.
 *   - GET /api/social-accounts              → legacy table, shown read-only
 *     in a "Legacy" section so the user can see what's pending migration.
 *
 * Actions:
 *   - Connect → window.location to /api/oauth/<platform>?brand_id=...&return_to=...
 *               Server creates the state row and 302s to the provider. After
 *               consent the provider 302s to /api/oauth/<platform>/callback,
 *               which either auto-finalizes or sends the user through
 *               /oauth/select to disambiguate.
 *   - Test    → POST /api/oauth/test {social_channel_id}
 *   - Disconnect → POST /api/oauth/disconnect {social_channel_id, hard?}
 */

interface OAuthChannel {
  id: string;
  brand_id: string;
  platform: string;
  external_id: string;
  display_name: string;
  metadata: Record<string, unknown>;
  scopes: string[];
  token_rotated_at: string | null;
  token_expires_at: string | null;
  has_token: boolean;
}

interface LegacySocialAccount {
  id: string;
  platform: string;
  account_name: string;
  account_id: string;
  brand: string;
  is_active: boolean;
}

const RETURN_TO = "/settings?tab=sosiale-medier";

const PLATFORM_META: Record<
  string,
  { label: string; Icon: typeof Facebook; color: string; description: string; provider: "google" | "facebook" | "linkedin" }
> = {
  youtube: {
    label: "YouTube",
    Icon: Youtube,
    color: "text-red-400",
    description: "Per-kanal token. Velg en kanal i pickeren hvis Google-kontoen din eier flere.",
    provider: "google",
  },
  google_drive: {
    label: "Google Drive",
    Icon: Globe,
    color: "text-emerald-400",
    description: "For arkivering og opplasting.",
    provider: "google",
  },
  facebook: {
    label: "Facebook",
    Icon: Facebook,
    color: "text-blue-400",
    description: "Velger ÉN side per merkevare. Linket Instagram Business kobles automatisk.",
    provider: "facebook",
  },
  instagram: {
    label: "Instagram",
    Icon: Instagram,
    color: "text-pink-400",
    description: "Kobles via Facebook Page-token. Bruk Facebook-knappen for å koble.",
    provider: "facebook",
  },
  linkedin: {
    label: "LinkedIn",
    Icon: Linkedin,
    color: "text-sky-400",
    description: "Personlig profil eller bedriftsside.",
    provider: "linkedin",
  },
};

interface ChannelTestState {
  loading: boolean;
  result: { ok: boolean; info?: Record<string, unknown>; error?: string } | null;
}

export function SocialChannelsTab() {
  // Default to first brand from canonical list (zeneco). The legacy hardcoded
  // ["zen-eco", "soleada", ...] used different IDs entirely.
  const [brandId, setBrandId] = useState<string>(BRANDS[0]?.id ?? "zeneco");
  const [channels, setChannels] = useState<OAuthChannel[]>([]);
  const [legacyAccounts, setLegacyAccounts] = useState<LegacySocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testStates, setTestStates] = useState<Record<string, ChannelTestState>>({});
  const [busyChannelId, setBusyChannelId] = useState<string | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const reloadChannels = useCallback(async (bid: string) => {
    const res = await fetch(`/api/oauth/channels?brand_id=${encodeURIComponent(bid)}`);
    if (!res.ok) {
      setError(`Klarte ikke laste kanaler (${res.status})`);
      return;
    }
    const data = (await res.json()) as { channels: OAuthChannel[] };
    setChannels(data.channels || []);
  }, []);

  const reloadLegacy = useCallback(async () => {
    try {
      const res = await fetch("/api/social-accounts");
      const data = await res.json();
      setLegacyAccounts((data.accounts as LegacySocialAccount[]) || []);
    } catch {
      // Non-fatal; legacy section just won't show anything.
    }
  }, []);

  // Initial load + reload on brand change.
  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([reloadChannels(brandId), reloadLegacy()]).finally(() => setLoading(false));
  }, [brandId, reloadChannels, reloadLegacy]);

  // Read OAuth result params on mount and surface as a toast. We use
  // window.location instead of useSearchParams to avoid forcing the parent
  // page into a Suspense boundary; the values are read once and dropped.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("oauth_success");
    const err = params.get("oauth_error");
    if (ok) {
      const platform = params.get("platform") || "konto";
      const brand = params.get("brand") || brandId;
      const count = params.get("count") || "1";
      setToast({
        kind: "success",
        message: `Koblet til ${platform} for ${brand}${count !== "1" ? ` (${count} kontoer)` : ""}.`,
      });
      // Clear the params so a refresh doesn't re-trigger the toast.
      const u = new URL(window.location.href);
      ["oauth_success", "oauth_error", "platform", "brand", "count"].forEach((k) => u.searchParams.delete(k));
      window.history.replaceState(null, "", u.toString());
    } else if (err) {
      setToast({ kind: "error", message: `OAuth-feil: ${err}` });
      const u = new URL(window.location.href);
      ["oauth_success", "oauth_error", "platform", "brand", "count"].forEach((k) => u.searchParams.delete(k));
      window.history.replaceState(null, "", u.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const channelsByPlatform = useMemo(() => {
    const map = new Map<string, OAuthChannel[]>();
    for (const c of channels) {
      const list = map.get(c.platform) ?? [];
      list.push(c);
      map.set(c.platform, list);
    }
    return map;
  }, [channels]);

  const onConnect = (platform: "youtube" | "facebook" | "linkedin" | "google_drive") => {
    const url = new URL(
      platform === "google_drive"
        ? "/api/oauth/google"
        : platform === "youtube"
          ? "/api/oauth/google"
          : `/api/oauth/${platform}`,
      window.location.origin,
    );
    url.searchParams.set("brand_id", brandId);
    url.searchParams.set("return_to", RETURN_TO);
    if (platform === "google_drive") url.searchParams.set("service", "drive");
    if (platform === "youtube") url.searchParams.set("service", "youtube");
    window.location.href = url.toString();
  };

  const onTest = async (channel: OAuthChannel) => {
    setTestStates((p) => ({ ...p, [channel.id]: { loading: true, result: null } }));
    try {
      const res = await fetch("/api/oauth/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ social_channel_id: channel.id }),
      });
      const data = await res.json();
      setTestStates((p) => ({
        ...p,
        [channel.id]: { loading: false, result: { ok: !!data.ok, info: data.info, error: data.error } },
      }));
    } catch (err) {
      setTestStates((p) => ({
        ...p,
        [channel.id]: {
          loading: false,
          result: { ok: false, error: err instanceof Error ? err.message : "Nettverksfeil" },
        },
      }));
    }
  };

  const onDisconnect = async (channel: OAuthChannel, hard = false) => {
    if (
      !window.confirm(
        hard
          ? `Slett ${channel.display_name} permanent? Tokens og bindingen til ${channel.brand_id} forsvinner.`
          : `Deaktiver ${channel.display_name}? Du kan re-aktivere ved å koble til på nytt.`,
      )
    ) {
      return;
    }
    setBusyChannelId(channel.id);
    try {
      const res = await fetch("/api/oauth/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ social_channel_id: channel.id, hard }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ kind: "error", message: data.error || "Disconnect feilet" });
      } else {
        setToast({
          kind: "success",
          message: hard ? `Slettet ${channel.display_name}.` : `Deaktiverte ${channel.display_name}.`,
        });
        await reloadChannels(brandId);
      }
    } finally {
      setBusyChannelId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
            toast.kind === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border border-red-500/30 text-red-300"
          }`}
        >
          {toast.kind === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-200">
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Brand selector */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield size={16} className="text-blue-400" /> Velg merkevare
          </CardTitle>
          <CardDescription>
            Alle kontoer som kobles til på denne siden bindes eksplisitt til den valgte
            merkevaren. Det finnes ingen «felles» tilkobling — hver merkevare har sine
            egne tokens.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {BRANDS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBrandId(b.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all border ${
                brandId === b.id
                  ? "bg-primary-500/20 text-primary-200 border-primary-500/40"
                  : "bg-slate-800/40 text-slate-300 border-slate-700 hover:bg-slate-700/40"
              }`}
              style={brandId === b.id ? { boxShadow: `0 0 0 1px ${b.color}` } : undefined}
            >
              {b.name}
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Per-platform connect cards */}
      {(["youtube", "facebook", "linkedin", "google_drive"] as const).map((platform) => {
        const meta = PLATFORM_META[platform];
        const Icon = meta.Icon;
        const list = channelsByPlatform.get(platform) ?? [];
        // Instagram is always connected as a side-effect of Facebook — show
        // its rows under the Facebook card too.
        const igPiggyback =
          platform === "facebook" ? channelsByPlatform.get("instagram") ?? [] : [];

        return (
          <Card key={platform}>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                  <Icon size={20} className={meta.color} />
                </div>
                <div>
                  <CardTitle className="text-base">{meta.label}</CardTitle>
                  <CardDescription className="text-xs">{meta.description}</CardDescription>
                </div>
              </div>
              <Button
                variant="default"
                onClick={() =>
                  onConnect(platform as "youtube" | "facebook" | "linkedin" | "google_drive")
                }
              >
                <Plus size={14} className="mr-1.5" />
                {list.length === 0 ? "Koble til" : "Koble til en til"}
              </Button>
            </CardHeader>

            <CardContent className="space-y-2">
              {list.length === 0 && igPiggyback.length === 0 && (
                <p className="text-xs text-slate-500">
                  Ingen {meta.label.toLowerCase()}-kontoer koblet til {brandId} ennå.
                </p>
              )}
              {[...list, ...igPiggyback].map((c) => (
                <ChannelRow
                  key={c.id}
                  channel={c}
                  test={testStates[c.id]}
                  busy={busyChannelId === c.id}
                  onTest={() => onTest(c)}
                  onSoftDisconnect={() => onDisconnect(c, false)}
                  onHardDisconnect={() => onDisconnect(c, true)}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}

      {/* Legacy section — read-only summary of social_accounts rows still
          backing the publisher's fallback path. */}
      <Card className="border-slate-700">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Wifi size={14} className="text-slate-400" /> Eldre tilkoblinger (social_accounts)
            </CardTitle>
            <CardDescription className="text-xs">
              Disse er fortsatt tilgjengelige for publisering som fallback. De flyttes til
              det nye systemet ved første re-OAuth eller via backfill-skriptet.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowLegacy((v) => !v)}>
            {showLegacy ? "Skjul" : `Vis (${legacyAccounts.length})`}
          </Button>
        </CardHeader>
        {showLegacy && (
          <CardContent className="space-y-2">
            {legacyAccounts.length === 0 && (
              <p className="text-xs text-slate-500">Ingen eldre tilkoblinger lagret.</p>
            )}
            {legacyAccounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between p-2 rounded border border-slate-700/40 bg-slate-900/30 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-xs">
                    {acc.platform}
                  </Badge>
                  <span className="text-slate-200 truncate">{acc.account_name}</span>
                  <span className="text-xs text-slate-500">/ {acc.brand}</span>
                </div>
                <Badge
                  className={`text-xs ${
                    acc.is_active
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                      : "bg-slate-700/40 text-slate-500 border-slate-700"
                  }`}
                >
                  {acc.is_active ? "Legacy aktiv" : "Inaktiv"}
                </Badge>
              </div>
            ))}
            <p className="text-[11px] text-slate-500 pt-1">
              Tips: Klikk «Koble til» under riktig plattform over for å migrere en konto til det
              nye systemet (krypterte tokens, eksplisitt brand-binding).
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function ChannelRow({
  channel,
  test,
  busy,
  onTest,
  onSoftDisconnect,
  onHardDisconnect,
}: {
  channel: OAuthChannel;
  test: ChannelTestState | undefined;
  busy: boolean;
  onTest: () => void;
  onSoftDisconnect: () => void;
  onHardDisconnect: () => void;
}) {
  const meta = PLATFORM_META[channel.platform];
  const Icon = meta?.Icon ?? Globe;
  const rotatedAt = channel.token_rotated_at
    ? new Date(channel.token_rotated_at).toLocaleString("no-NO")
    : null;
  const expiresAt = channel.token_expires_at
    ? new Date(channel.token_expires_at).toLocaleString("no-NO")
    : null;
  const expired = channel.token_expires_at
    ? new Date(channel.token_expires_at).getTime() < Date.now()
    : false;

  return (
    <div className="p-3 rounded-lg border border-slate-700/50 bg-slate-900/40">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Icon size={18} className={meta?.color ?? "text-slate-400"} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{channel.display_name}</p>
            <p className="text-[11px] text-slate-500 truncate">
              {channel.platform} · ext: {channel.external_id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={onTest} disabled={test?.loading || busy}>
            {test?.loading ? (
              <Loader2 size={12} className="animate-spin mr-1" />
            ) : (
              <RefreshCw size={12} className="mr-1" />
            )}
            Test
          </Button>
          <Button variant="outline" size="sm" onClick={onSoftDisconnect} disabled={busy}>
            Deaktiver
          </Button>
          <Button variant="ghost" size="sm" onClick={onHardDisconnect} disabled={busy}>
            <Trash2 size={12} className="text-red-400" />
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
        {channel.has_token ? (
          <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/25 text-[10px]">
            Token lagret
          </Badge>
        ) : (
          <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/25 text-[10px]">
            Mangler token
          </Badge>
        )}
        {expired && (
          <Badge className="bg-red-500/15 text-red-300 border-red-500/25 text-[10px]">Utløpt</Badge>
        )}
        {rotatedAt && <span>Rotert: {rotatedAt}</span>}
        {expiresAt && !expired && <span>Utløper: {expiresAt}</span>}
        {channel.scopes.length > 0 && (
          <span className="truncate max-w-[420px]">
            scopes: {channel.scopes.slice(0, 4).join(", ")}
            {channel.scopes.length > 4 ? ` +${channel.scopes.length - 4}` : ""}
          </span>
        )}
      </div>

      {test?.result && (
        <div
          className={`mt-2 text-xs p-2 rounded ${
            test.result.ok
              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25"
              : "bg-red-500/10 text-red-300 border border-red-500/25"
          }`}
        >
          {test.result.ok ? (
            <>
              ✅ Tilkobling OK
              {test.result.info && (
                <code className="ml-2 text-emerald-400/70">
                  {JSON.stringify(test.result.info)}
                </code>
              )}
            </>
          ) : (
            <>❌ {test.result.error || "Test feilet"}</>
          )}
        </div>
      )}
    </div>
  );
}

// Re-export types so the parent can read its own legacy account list shape
// against the same definition without import duplication.
export type { LegacySocialAccount, OAuthChannel };
