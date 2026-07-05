"use client";

type PropertyMatchSummaryStat = {
  label: string;
  value: number | string;
};

interface LeadIntelligencePropertyMatchSummaryProps {
  stats: PropertyMatchSummaryStat[];
  className?: string;
}

export function LeadIntelligencePropertyMatchSummary({
  stats,
  className = "md:grid-cols-4",
}: LeadIntelligencePropertyMatchSummaryProps) {
  return (
    <div className={`grid gap-3 ${className}`}>
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{stat.label}</p>
          <p className="mt-1 text-lg font-semibold text-slate-100">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
