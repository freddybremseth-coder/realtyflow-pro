"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";

type ClaimDemoButtonProps = {
  token: string;
  alreadyClaimed?: boolean;
  expired?: boolean;
};

export function ClaimDemoButton({ token, alreadyClaimed, expired }: ClaimDemoButtonProps) {
  const [loading, setLoading] = useState(false);
  const [claimed, setClaimed] = useState(Boolean(alreadyClaimed));
  const [error, setError] = useState<string | null>(null);

  async function claimDemo() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/saas/demosites/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke claime demoen.");
      setClaimed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke claime demoen.");
    } finally {
      setLoading(false);
    }
  }

  if (expired) {
    return <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-100">Denne demoen er utløpt. Kontakt ChatGenius for å åpne den igjen.</div>;
  }

  if (claimed) {
    return <div className="rounded-xl bg-emerald-500/20 p-3 text-sm font-medium text-emerald-50"><CheckCircle className="mr-2 inline h-4 w-4" />Demoen er claimet. Vi tar neste steg med faktura/godkjenning.</div>;
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={claimDemo} disabled={loading} className="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-50 disabled:opacity-70">
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
        Jeg vil beholde demoen
      </button>
      {error && <div className="rounded-lg bg-red-500/10 p-3 text-xs text-red-100">{error}</div>}
    </div>
  );
}
