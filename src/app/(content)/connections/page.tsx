"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { OWNED_GROWTH_BRANDS } from "@/lib/marketing/brand-registry";

type Channel = {
  id: string;
  brand_id: string;
  platform: string;
  external_id: string;
  display_name: string;
  has_token: boolean;
  token_expires_at: string | null;
  scopes: string[];
};

type BrandChannels = { brandId: string; channels: Channel[]; error?: string };
type HealthStatus = "ok" | "warning" | "error";
type HealthCheck = {
  brand: string;
  platform: string;
  accountName: string;
  accountId?: string | null;
  status: HealthStatus;
  message: string;
};
type RoutingIssue = {
  code: "duplicate_brand_platform" | "shared_external_account";
  severity: "warning" | "error";
  platform: string;
  externalId: string;
  brands: string[];
  channelIds: string[];
  message: string;
};
type HealthPayload = {
  generatedAt?: string;
  checks?: HealthCheck[];
  routingIssues?: RoutingIssue[];
  summary?: { ok: number; warning: number; error: number };
};

function communicationReady(channels: Channel[]) {
  const scopes = new Set(channels.flatMap((channel) => channel.scopes || []));
  const hasFb = channels.some((channel) => channel.platform === "facebook");
  const hasIg = channels.some((channel) => channel.platform === "instagram");
  const fbReady = !hasFb || (scopes.has("pages_manage_metadata") && scopes.has("pages_messaging") && scopes.has("pages_manage_engagement"));
  const igReady = !hasIg || (scopes.has("pages_manage_metadata") && scopes.has("instagram_manage_messages") && scopes.has("instagram_manage_comments"));
  return channels.length > 0 && fbReady && igReady;
}

function statusClasses(status: HealthStatus | undefined) {
  if (status === "ok") return "bg-emerald-100 text-emerald-950";
  if (status === "error") return "bg-rose-100 text-rose-950";
  if (status === "warning") return "bg-amber-100 text-amber-950";
  return "bg-slate-100 text-slate-700";
}

function statusLabel(status: HealthStatus | undefined) {
  if (status === "ok") return "Verified";
  if (status === "error") return "Blocked";
  if (status === "warning") return "Check";
  return "Not tested";
}

export default function ChannelConnectionsPage() {
  const [rows, setRows] = useState<BrandChannels[]>([]);
  const [health, setHealth] = useState<HealthPayload>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [channelRows, healthPayload] = await Promise.all([
      Promise.all(
        OWNED_GROWTH_BRANDS.map(async (brand) => {
          try {
            const res = await fetch(`/api/oauth/channels?brand_id=${encodeURIComponent(brand.id)}`, {
              cache: "no-store",
              credentials: "same-origin",
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
            return { brandId: brand.id, channels: (body.channels ?? []) as Channel[] };
          } catch (error) {
            return {
              brandId: brand.id,
              channels: [],
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      ),
      fetch("/api/integrations/health", { cache: "no-store", credentials: "same-origin" })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          return res.ok ? body as HealthPayload : {};
        })
        .catch(() => ({} as HealthPayload)),
    ]);
    setRows(channelRows);
    setHealth(healthPayload);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const rowByBrand = useMemo(() => new Map(rows.map((row) => [row.brandId, row])), [rows]);
  const checks = health.checks ?? [];
  const routingIssues = health.routingIssues ?? [];
  const totalConnected = rows.reduce((sum, row) => sum + row.channels.length, 0);
  const brandsFullyMeta = rows.filter((row) => row.channels.some((channel) => channel.platform === "facebook") && row.channels.some((channel) => channel.platform === "instagram")).length;
  const brandsCommunicationReady = rows.filter((row) => communicationReady(row.channels.filter((channel) => ["facebook", "instagram"].includes(channel.platform)))).length;
  const brandsYoutubeVerified = OWNED_GROWTH_BRANDS.filter((brand) => checks.some((check) => check.brand === brand.id && check.platform === "youtube" && check.status === "ok")).length;
  const brandsLinkedIn = rows.filter((row) => row.channels.some((channel) => channel.platform === "linkedin")).length;

  const checkFor = (brandId: string, channel: Channel) => checks.find((check) =>
    check.brand === brandId &&
    check.platform === channel.platform &&
    String(check.accountId || "") === String(channel.external_id || ""),
  );

  const connectMeta = (brandId: string, capability: "publishing" | "communications" = "publishing") => {
    const url = new URL("/api/oauth/facebook", window.location.origin);
    url.searchParams.set("brand_id", brandId);
    url.searchParams.set("return_to", "/connections");
    url.searchParams.set("capability", capability);
    window.location.href = url.toString();
  };

  const connectYoutube = (brandId: string) => {
    const url = new URL("/api/oauth/google", window.location.origin);
    url.searchParams.set("brand_id", brandId);
    url.searchParams.set("return_to", "/connections");
    url.searchParams.set("service", "youtube");
    window.location.href = url.toString();
  };

  const connectLinkedIn = (brandId: string) => {
    const url = new URL("/api/oauth/linkedin", window.location.origin);
    url.searchParams.set("brand_id", brandId);
    url.searchParams.set("return_to", "/connections");
    window.location.href = url.toString();
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 text-slate-950 sm:p-6">
      <header className="rounded-3xl border border-cyan-800 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl">
        <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Nexus OS · Connections</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-white">Channel Connections</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-200">
              Canonical channel binding + live provider health. A stored connection is not shown as healthy until the provider and exact account routing are verified.
            </p>
          </div>
          <button onClick={load} disabled={loading} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">
            {loading ? "Tester…" : "Test alle tilkoblinger"}
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-300 bg-white p-4"><div className="text-xs font-black text-slate-600">CONNECTED ROWS</div><div className="mt-1 text-3xl font-black">{totalConnected}</div></div>
        <div className="rounded-xl border border-slate-300 bg-white p-4"><div className="text-xs font-black text-slate-600">META COMPLETE</div><div className="mt-1 text-3xl font-black">{brandsFullyMeta}/{OWNED_GROWTH_BRANDS.length}</div></div>
        <div className="rounded-xl border border-slate-300 bg-white p-4"><div className="text-xs font-black text-slate-600">META COMMUNICATIONS</div><div className="mt-1 text-3xl font-black">{brandsCommunicationReady}/{OWNED_GROWTH_BRANDS.length}</div></div>
        <div className="rounded-xl border border-slate-300 bg-white p-4"><div className="text-xs font-black text-slate-600">YOUTUBE VERIFIED</div><div className="mt-1 text-3xl font-black">{brandsYoutubeVerified}/{OWNED_GROWTH_BRANDS.length}</div></div>
        <div className="rounded-xl border border-slate-300 bg-white p-4"><div className="text-xs font-black text-slate-600">LINKEDIN CONNECTED</div><div className="mt-1 text-3xl font-black">{brandsLinkedIn}/{OWNED_GROWTH_BRANDS.length}</div></div>
      </section>

      {routingIssues.length > 0 && (
        <section className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 text-rose-950">
          <div className="text-xs font-black uppercase tracking-[0.2em]">Routing needs attention</div>
          <h2 className="mt-1 text-xl font-black">Autopilot will fail closed on ambiguous/wrong channel bindings</h2>
          <div className="mt-3 space-y-2">
            {routingIssues.map((issue, index) => (
              <div key={`${issue.code}-${issue.platform}-${issue.externalId}-${index}`} className="rounded-xl border border-rose-200 bg-white/70 p-3 text-sm">
                <b>{issue.platform.toUpperCase()}</b> · {issue.message}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-300 p-5">
          <h2 className="text-xl font-black">Brands & providers</h2>
          <p className="mt-1 text-sm text-slate-600">Green = live provider verification. Red = reconnect or routing cleanup required. DM/comment capability remains separate from publishing.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] border-collapse text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wider text-slate-700">
              <tr><th className="p-4">Brand</th><th className="p-4">Meta</th><th className="p-4">LinkedIn</th><th className="p-4">YouTube</th><th className="p-4">Growth plan</th></tr>
            </thead>
            <tbody>
              {OWNED_GROWTH_BRANDS.map((brand) => {
                const state = rowByBrand.get(brand.id);
                const channels = state?.channels ?? [];
                const meta = channels.filter((channel) => channel.platform === "facebook" || channel.platform === "instagram");
                const facebook = meta.filter((channel) => channel.platform === "facebook");
                const instagram = meta.filter((channel) => channel.platform === "instagram");
                const linkedin = channels.filter((channel) => channel.platform === "linkedin");
                const youtube = channels.filter((channel) => channel.platform === "youtube");
                const commReady = communicationReady(meta);

                const renderChannel = (channel: Channel) => {
                  const check = checkFor(brand.id, channel);
                  return (
                    <div key={channel.id} className="mt-2 rounded-lg border border-slate-200 p-2 text-xs text-slate-700">
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{channel.display_name}</b>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${statusClasses(check?.status)}`}>{statusLabel(check?.status)}</span>
                      </div>
                      {check?.message && <div className="mt-1 leading-5 text-slate-600">{check.message}</div>}
                    </div>
                  );
                };

                return (
                  <tr key={brand.id} className="border-t border-slate-200 align-top">
                    <td className="p-4">
                      <div className="font-black">{brand.name}</div>
                      <a href={brand.website} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-bold text-cyan-800">{brand.website.replace(/^https?:\/\//, "")}</a>
                      {state?.error && <div className="mt-2 text-xs font-semibold text-rose-800">{state.error}</div>}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${facebook.length ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>Facebook {facebook.length ? "✓" : "—"}</span>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${instagram.length ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>Instagram {instagram.length ? "✓" : "—"}</span>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${commReady ? "bg-cyan-100 text-cyan-950" : "bg-amber-100 text-amber-950"}`}>{commReady ? "Communications ready" : "Publishing only / scope mangler"}</span>
                      </div>
                      {meta.map(renderChannel)}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => connectMeta(brand.id, "publishing")} className={`rounded-lg px-3 py-2 text-xs font-black ${meta.length ? "border border-slate-400 bg-white text-slate-950" : "bg-blue-800 text-white"}`}>{meta.length ? "Reconnect publishing" : "Koble Meta publishing"}</button>
                        <button onClick={() => connectMeta(brand.id, "communications")} className={`rounded-lg px-3 py-2 text-xs font-black ${commReady ? "border border-emerald-400 bg-emerald-50 text-emerald-950" : "bg-slate-950 text-white"}`}>{commReady ? "Re-authorize communications" : "Utvid til DM + kommentarer"}</button>
                      </div>
                    </td>
                    <td className="p-4">
                      {linkedin.length ? linkedin.map(renderChannel) : <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-700">Not connected</span>}
                      <button onClick={() => connectLinkedIn(brand.id)} className={`mt-3 block rounded-lg px-3 py-2 text-xs font-black ${linkedin.length ? "border border-slate-400 bg-white text-slate-950" : "bg-sky-800 text-white"}`}>{linkedin.length ? "Koble LinkedIn på nytt" : "Koble LinkedIn"}</button>
                    </td>
                    <td className="p-4">
                      {youtube.length ? youtube.map(renderChannel) : <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-700">Not connected</span>}
                      <button onClick={() => connectYoutube(brand.id)} className={`mt-3 block rounded-lg px-3 py-2 text-xs font-black ${youtube.length ? "border border-slate-400 bg-white text-slate-950" : "bg-red-800 text-white"}`}>{youtube.length ? "Koble YouTube på nytt" : "Koble YouTube"}</button>
                    </td>
                    <td className="p-4 text-xs text-slate-700">
                      <div className="font-bold text-slate-950">{brand.plannedChannels.join(" · ")}</div>
                      <div className="mt-2 leading-5">{brand.notes}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-300 bg-white p-4"><b>1. Publishing</b><div className="mt-1 text-sm text-slate-600">Koble kanalene for posting, ads, measurement og growth.</div></div>
        <div className="rounded-xl border border-slate-300 bg-white p-4"><b>2. Communications</b><div className="mt-1 text-sm text-slate-600">Utvid bare der du vil ha DM/comment workflow. Nexus verifiserer faktisk granted scope etterpå.</div></div>
        <div className="rounded-xl border border-slate-300 bg-white p-4"><b>3. Routing guard</b><div className="mt-1 text-sm text-slate-600">Duplikate eller delte YouTube-bindinger blokkeres i stedet for at systemet gjetter hvilken kanal som er riktig.</div></div>
      </section>

      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950"><b>Canonical:</b> social_channels + oauth_tokens. Gamle social_accounts brukes ikke til publishing eller engagement tracking.</div>
      <div className="rounded-xl border border-cyan-300 bg-cyan-50 p-4 text-sm text-cyan-950"><b>Social Communications:</b> <Link href="/nexus-os/communications/social" className="font-black underline">Åpne capability- og inbox-readiness →</Link></div>
    </div>
  );
}
