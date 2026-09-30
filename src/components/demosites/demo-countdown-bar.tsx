"use client";

/**
 * Sticky conversion bar on the public demo preview: live countdown to
 * expiry, social proof (leads captured by THIS demo) and the order CTA.
 * The urgency is real — the demo actually expires — which is what makes
 * the countdown honest and effective.
 */
import { useEffect, useState } from "react";
import { ArrowRight, Clock, Inbox } from "lucide-react";
import { getDemoSiteUiText, type DemoSiteLanguage } from "@/lib/demosites-language";

type DemoCountdownBarProps = {
  expiresAt?: string | null;
  claimUrl?: string | null;
  leadCount?: number;
  language?: DemoSiteLanguage;
};

function formatRemaining(ms: number, language: DemoSiteLanguage) {
  const ui = getDemoSiteUiText(language);
  if (ms <= 0) return ui.countdownExpired;
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} ${ui.dayShort} ${hours} ${ui.hourShort}`;
  if (hours > 0) return `${hours} ${ui.hourShort} ${minutes} ${ui.minuteShort}`;
  return `${minutes} ${ui.minuteShort}`;
}

export function DemoCountdownBar({ expiresAt, claimUrl, leadCount = 0, language = "nb" }: DemoCountdownBarProps) {
  const ui = getDemoSiteUiText(language);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!expiresAt || !claimUrl) return null;
  const expiryMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryMs)) return null;
  const remaining = expiryMs - now;
  const expired = remaining <= 0;
  const urgent = !expired && remaining < 24 * 60 * 60 * 1000;

  return (
    <div className={`sticky top-0 z-40 border-b text-white ${urgent ? "border-red-900 bg-red-950" : "border-slate-800 bg-slate-950"}`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 text-xs sm:text-sm">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="inline-flex items-center gap-2 font-semibold">
            <Clock className={`h-4 w-4 ${urgent ? "text-red-400" : "text-amber-400"}`} />
            {expired
              ? ui.countdownExpired
              : ui.countdownActive(formatRemaining(remaining, language))}
          </span>
          {leadCount > 0 && (
            <span className="inline-flex items-center gap-2 text-emerald-300">
              <Inbox className="h-4 w-4" />
              {leadCount === 1 ? ui.countdownLeadOne : ui.countdownLeadMany(leadCount)}
            </span>
          )}
        </div>
        <a
          href={claimUrl}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-400 px-4 py-1.5 text-xs font-bold text-slate-950 transition-transform hover:scale-[1.03] sm:text-sm"
        >
          {ui.countdownBuy} <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
