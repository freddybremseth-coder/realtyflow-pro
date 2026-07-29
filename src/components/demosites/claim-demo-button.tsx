"use client";

import { useState } from "react";
import { CheckCircle, CreditCard, Loader2 } from "lucide-react";

type ClaimDemoButtonProps = {
  token: string;
  alreadyClaimed?: boolean;
  expired?: boolean;
  paid?: boolean;
};

/**
 * The money moment: opens Stripe Checkout (setup fee + monthly subscription
 * in one payment). The flow fails closed when payment is unavailable, so a
 * temporary provider/configuration problem can never grant unpaid access.
 */
export function ClaimDemoButton({ token, alreadyClaimed, expired, paid }: ClaimDemoButtonProps) {
  const [loading, setLoading] = useState(false);
  const [seoAddon, setSeoAddon] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/saas/demosites/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, seo_addon: seoAddon }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke starte betalingen.");

      if (data.url || data.checkout_url) {
        window.location.href = data.url || data.checkout_url;
        return;
      }
      throw new Error("Betalingsleverandøren returnerte ingen checkout-lenke.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke starte betalingen.");
    } finally {
      setLoading(false);
    }
  }

  if (paid) {
    return (
      <div className="rounded-xl bg-emerald-500/20 p-3 text-sm font-medium text-emerald-50">
        <CheckCircle className="mr-2 inline h-4 w-4" />
        Betaling mottatt! Vi klargjør og publiserer siden din.
      </div>
    );
  }

  if (expired) {
    return <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-100">Denne prøvesiden er utløpt. Kontakt ChatGenius, så åpner vi den igjen.</div>;
  }

  return (
    <div className="space-y-3">
      {alreadyClaimed && (
        <div className="rounded-xl bg-emerald-500/20 p-3 text-sm font-medium text-emerald-50">
          <CheckCircle className="mr-2 inline h-4 w-4" />
          Siden er reservert. Du kan fullføre betaling når du er klar.
        </div>
      )}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-3 text-sm">
        <input
          type="checkbox"
          checked={seoAddon}
          onChange={(e) => setSeoAddon(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-emerald-400"
        />
        <span>
          <span className="font-semibold text-emerald-50">SEO & Google-optimalisering</span>{" "}
          <span className="text-emerald-100/80">+490 kr (engangsbeløp)</span>
          <span className="mt-0.5 block text-xs text-emerald-100/70">
            Søkeordsoptimalisering, Google Business-profil og synlighet i lokale søk — satt opp én gang, virker videre.
          </span>
        </span>
      </label>
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-400 px-4 py-3.5 text-sm font-bold text-slate-950 transition-transform hover:scale-[1.01] hover:bg-emerald-300 disabled:opacity-70"
      >
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
        {loading ? "Åpner sikker betaling..." : "Bestill og betal nå"}
      </button>
      <p className="text-center text-[11px] text-slate-400">
        Sikker betaling via Stripe · Oppstart + første måned · Ingen bindingstid utover måneden
      </p>
      {error && <div className="rounded-lg bg-red-500/10 p-3 text-xs text-red-100">{error}</div>}
    </div>
  );
}
