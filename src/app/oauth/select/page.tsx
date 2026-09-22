"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Multi-account picker rendered after Google or Facebook OAuth when the user
 * authorized more than one channel/page. The user explicitly binds ONE
 * account to the brand they started the flow for. This is the structural
 * fix for cross-brand contamination — there is no implicit "auto-bind every
 * account the user can manage" path through this UI.
 *
 * URL contract:
 *   /oauth/select?state=<nonce>&provider=<google|google_drive|facebook>
 *
 * Server contract:
 *   - GET  /api/oauth/pending?state=<nonce>   → reads candidates (no tokens)
 *   - POST /api/oauth/<provider>/finalize     → consumes state, creates rows
 */

interface PendingCandidate {
  id: string;
  // Google fields
  title?: string;
  customUrl?: string;
  thumbnail?: string;
  subscriberCount?: number;
  // Facebook fields
  name?: string;
  category?: string;
  instagram?: { id: string; username?: string };
}

interface PendingPick {
  state_nonce: string;
  brand_id: string;
  platform: string;
  return_to: string;
  pending_pick: "google_channel" | "facebook_page";
  candidates: PendingCandidate[];
  non_postable: Array<{ id: string; name: string }>;
  expires_at: string;
}

export default function OAuthSelectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stateNonce = searchParams.get("state");
  const provider = searchParams.get("provider") || "google";

  const [pending, setPending] = useState<PendingPick | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    if (!stateNonce) {
      setError("Missing state parameter");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/oauth/pending?state=${encodeURIComponent(stateNonce)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || `Failed to load pending OAuth (${res.status})`);
          return;
        }
        const data = (await res.json()) as PendingPick;
        setPending(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [stateNonce]);

  const onPick = async (externalId: string) => {
    if (!pending || !stateNonce) return;
    setSubmittingId(externalId);
    setError(null);

    // Map pending_pick → finalize endpoint. The shape mirrors the OAuth
    // route layout: /api/oauth/<provider>/finalize.
    const endpoint =
      pending.pending_pick === "facebook_page"
        ? "/api/oauth/facebook/finalize"
        : "/api/oauth/google/finalize";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: stateNonce, external_id: externalId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || `Finalize failed (${res.status})`);
        setSubmittingId(null);
        return;
      }
      // Add a query string so the settings page can show a confirmation toast.
      const target = new URL(pending.return_to, window.location.origin);
      target.searchParams.set("oauth_success", "true");
      target.searchParams.set("platform", pending.platform);
      target.searchParams.set("brand", pending.brand_id);
      // Forward the orphan summary from the callback so the Settings UI
      // can warn the user about Pages that lost app access during this
      // OAuth (FLB "select only these Pages" choice). null means no
      // orphans detected.
      if (body.orphaned) {
        target.searchParams.set("oauth_orphaned", String(body.orphaned));
      }
      if (target.origin === window.location.origin) {
        router.replace(target.pathname + target.search);
      } else {
        window.location.assign(target.toString());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmittingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-slate-300">
        <p>Laster …</p>
      </div>
    );
  }

  if (error || !pending) {
    return (
      <div className="p-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-300">OAuth-feil</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-300">{error || "Ukjent feil"}</p>
            <Button variant="outline" className="mt-4" onClick={() => router.push("/settings?tab=sosiale-medier")}>
              Tilbake til Innstillinger
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isFacebook = pending.pending_pick === "facebook_page";
  const isArtPicker = isFacebook && pending.brand_id === "freddyart";
  const expectedArtHandle = "freddybremseth.art";
  const isArtInstagram = (username?: string) => username?.trim().replace(/^@/, "").toLowerCase() === expectedArtHandle;

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold text-white mb-2">
        {isFacebook && pending.brand_id === "freddyart" ? "Velg Facebook-siden som er koblet til kunstens Instagram" : isFacebook ? "Velg Facebook-side" : "Velg YouTube-kanal"}
      </h1>
      <p className="text-slate-400 mb-6">
        {isFacebook && pending.brand_id === "freddyart"
          ? <>Velg Facebook-siden som gir tilgang til Instagram-kontoen for <Badge>Freddy Bremseth Art</Badge>. Vi kobler <strong>bare Instagram</strong> til kunstmerkevaren; Facebook-siden forblir under Freddy Bremseth eller den merkevaren den tilhører.</>
          : <>Du autoriserte tilgang til flere kontoer. Velg <strong>én</strong> konto som skal kobles til merkevaren <Badge>{pending.brand_id}</Badge>. Ingen andre kontoer kobles automatisk til merkevaren.</>}
      </p>

      {isArtPicker && !pending.candidates.some((candidate) => isArtInstagram(candidate.instagram?.username)) && (
        <div className="mb-5 rounded-lg border border-amber-400/60 bg-amber-950/40 p-4 text-sm leading-6 text-amber-100" role="alert">
          <p className="font-bold">Meta finner ikke @freddybremseth.art på noen av Facebook-sidene du har autorisert.</p>
          <p className="mt-2">Knappen ved Freddy Bremseth-siden er derfor sperret med vilje. Sjekk at kunstkontoen er en profesjonell Instagram-konto og at den er koblet direkte til <strong>Facebook-siden Freddy Bremseth</strong> via sidens Innstillinger → Tilknyttede kontoer → Instagram, ikke bare til din private Facebook-konto i Kontosenter. Fullfør koblingen hos Meta, gå tilbake til Channel Connections, og start Meta publishing-tilkoblingen på nytt.</p>
          <p className="mt-2">Ikke velg Instagram-kontoene som tilhører andre merkevarer.</p>
        </div>
      )}
      <div className="space-y-3">
        {pending.candidates.map((c) => {
          const label = c.title || c.name || c.id;
          const sub =
            c.customUrl ||
            c.category ||
            (c.instagram?.username ? `IG: @${c.instagram.username}` : null) ||
            (c.subscriberCount ? `${c.subscriberCount.toLocaleString()} subs` : null);

          const isSubmitting = submittingId === c.id;
          const disabled = submittingId !== null && !isSubmitting;
          const canBindArt = Boolean(c.instagram?.id && isArtInstagram(c.instagram.username));

          return (
            <Card key={c.id} className="border-slate-700">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {c.thumbnail ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={c.thumbnail}
                      alt=""
                      className="w-10 h-10 rounded-full bg-slate-800"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-400">
                      {label.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{label}</p>
                    {sub && <p className="text-xs text-slate-400 truncate">{sub}</p>}
                    {isArtPicker && !c.instagram?.id && (
                      <p className="mt-1 text-xs leading-5 text-amber-200">Meta har ikke bekreftet noen tilknyttet, profesjonell Instagram-konto for denne Facebook-siden. Kontroller sidekoblingen i Meta før du prøver på nytt.</p>
                    )}
                    {isArtPicker && c.instagram?.id && !canBindArt && (
                      <p className="mt-1 text-xs leading-5 text-amber-200">Meta fant @{c.instagram.username || "ukjent"}, ikke @freddybremseth.art. Kontoen kan ikke knyttes til kunstmerkevaren.</p>
                    )}
                    {c.instagram?.id && (!isArtPicker || canBindArt) && isFacebook && (
                      <p className="text-xs text-pink-300 mt-0.5">
                        {pending.brand_id === "freddyart"
                          ? `Kobler kun Instagram @${c.instagram.username || c.instagram.id} til Freddy Bremseth Art`
                          : `Vil også koble Instagram @${c.instagram.username || c.instagram.id}`}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="default"
                  disabled={disabled || (isArtPicker && !canBindArt)}
                  title={isArtPicker && !canBindArt ? "Mangler verifisert Instagram @freddybremseth.art på denne Facebook-siden" : undefined}
                  onClick={() => onPick(c.id)}
                >
                  {isSubmitting ? "Kobler …" : "Velg denne"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {pending.non_postable.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-300 mb-2">Hoppet over</h2>
          <p className="text-xs text-slate-500 mb-2">
            Disse sidene mangler nødvendige tillatelser (pages_manage_posts /
            pages_read_engagement / CREATE_CONTENT). Hvis du faktisk vil koble en
            av dem, kjør tilkoblingen på nytt og godkjenn alle tillatelsene.
          </p>
          <ul className="text-xs text-slate-500 list-disc pl-5">
            {pending.non_postable.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="mt-6 p-3 rounded border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
