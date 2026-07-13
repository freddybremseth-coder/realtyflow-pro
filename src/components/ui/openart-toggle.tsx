"use client";

/**
 * "Bruk OpenArt" opt-in toggle.
 *
 * Drop-in control for every place in the app that can generate images or
 * video. OpenArt is more expensive than the default backends (it spends
 * credits from the connected OpenArt account), so it is always an explicit
 * per-generation opt-in:
 *
 *   - Not connected  → shows a "Koble til OpenArt" button (starts OAuth).
 *   - Connected      → shows the switch, account e-mail and credit balance.
 *
 * The parent owns the enabled-state and passes `provider: "openart"` to its
 * generation endpoint when the switch is on.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Palette, Unplug } from "lucide-react";

interface OpenArtStatus {
  connected: boolean;
  email?: string;
  plan?: string;
  credits?: number;
}

interface OpenArtToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  /** Path to return to after the OAuth roundtrip, e.g. "/image-studio". */
  returnTo: string;
  className?: string;
}

export function OpenArtToggle({ enabled, onChange, returnTo, className = "" }: OpenArtToggleProps) {
  const [status, setStatus] = useState<OpenArtStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/oauth/openart/status");
      const data = (await res.json()) as OpenArtStatus;
      setStatus(data);
      if (!data.connected) onChange(false);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDisconnect = async () => {
    if (!window.confirm("Koble fra OpenArt-kontoen?")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/oauth/openart/status", { method: "DELETE" });
      onChange(false);
      await loadStatus();
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-xs text-slate-500 ${className}`}>
        <Loader2 size={12} className="animate-spin" /> Sjekker OpenArt...
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-700 bg-slate-800/50 ${className}`}>
        <div className="flex items-center gap-2 min-w-0">
          <Palette size={16} className="text-fuchsia-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-200">Bruk OpenArt</p>
            <p className="text-[10px] text-slate-500">Premium bilde- og videomodeller. Krever OpenArt-konto.</p>
          </div>
        </div>
        <a
          href={`/api/oauth/openart?return_to=${encodeURIComponent(returnTo)}`}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-fuchsia-600 hover:bg-fuchsia-500 text-white transition-colors"
        >
          Koble til OpenArt
        </a>
      </div>
    );
  }

  return (
    <div className={`p-3 rounded-lg border ${enabled ? "border-fuchsia-500/40 bg-fuchsia-500/5" : "border-slate-700 bg-slate-800/50"} ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Palette size={16} className="text-fuchsia-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-200">Bruk OpenArt</p>
            <p className="text-[10px] text-slate-500 truncate">
              {status.email || "Tilkoblet"}
              {typeof status.credits === "number" ? ` · ${Math.round(status.credits)} kreditter` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            title="Koble fra OpenArt"
            className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700/50 transition-colors"
          >
            {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unplug size={12} />}
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => onChange(!enabled)}
            className={`w-10 h-5 rounded-full p-0.5 transition-colors ${enabled ? "bg-fuchsia-500" : "bg-slate-600"}`}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
      </div>
      {enabled && (
        <p className="text-[10px] text-fuchsia-300/80 mt-2">
          OpenArt bruker kreditter fra kontoen din og er dyrere enn standard-generering.
        </p>
      )}
    </div>
  );
}
