"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CircleDollarSign,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Target,
  Users,
} from "lucide-react";
import {
  CORPORATE_GOOGLE_SEARCH,
  CORPORATE_HOMES_LANDING_URL,
  CORPORATE_LINKEDIN,
  CORPORATE_OUTBOUND,
  CORPORATE_SUCCESS_METRICS,
} from "@/lib/corporate-homes-growth";

type Contact = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  stage: string;
  pipelineValue: number;
  propertyInterest?: string | null;
  nextFollowup?: string | null;
  lastContact?: string | null;
  updatedAt?: string | null;
  source?: string | null;
};

type Overview = {
  generatedAt: string;
  summary: {
    totalLeads: number;
    activeLeads: number;
    new30d: number;
    dueNow: number;
    openWorkItems: number;
    pipelineValue: number;
  };
  stages: Record<string, number>;
  contacts: Contact[];
  workItems: Array<Record<string, unknown>>;
};

const stageLabel: Record<string, string> = {
  NEW: "Ny",
  CONTACT: "Kontakt",
  QUALIFIED: "Kvalifisert",
  MATCHING: "Boligmatching",
  VIEWING: "Visning",
  NEGOTIATION: "Forhandling",
  RESERVED: "Reservert",
  WON: "Gjennomført",
  ON_HOLD: "På vent",
  LOST: "Tapt",
};

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: value >= 1_000_000 ? "compact" : "standard",
  }).format(value || 0);
}

function dateLabel(value?: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ikke satt";
  return date.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CorporateHomesGrowthPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/overview", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Corporate Homes-data.");
      setData(body?.corporateHomes || null);
      setWarnings(body?.warnings || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente Corporate Homes-data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleContacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data?.contacts || [];
    return (data?.contacts || []).filter((contact) =>
      [contact.name, contact.email, contact.phone, contact.stage, contact.propertyInterest]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [data?.contacts, query]);

  return (
    <div className="mx-auto max-w-[1650px] space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-[0.13em] text-teal-800">
              <BriefcaseBusiness size={18} /> Zen Corporate Homes
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">B2B Growth & Pipeline</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
              Ett arbeidsområde for bedrifter, foreninger og medlemsorganisasjoner som vurderer bolig i Spania.
              Leads fra Corporate Homes-siden merkes som høyprioritert B2B og beholdes i den ordinære Zen Eco Homes-pipelinen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/corporate-homes/prospects"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700"
            >
              Prospektmotor <Target size={15} />
            </Link>
            <a
              href={CORPORATE_HOMES_LANDING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              Åpne landingssiden <ExternalLink size={15} />
            </a>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Oppdater
            </button>
          </div>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
      {warnings.map((warning) => (
        <div key={warning} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{warning}</div>
      ))}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric icon={<Users size={18} />} label="Corporate leads" value={data?.summary.totalLeads ?? "—"} />
        <Metric icon={<Target size={18} />} label="Aktive" value={data?.summary.activeLeads ?? "—"} />
        <Metric icon={<CalendarClock size={18} />} label="Nye 30 dager" value={data?.summary.new30d ?? "—"} />
        <Metric icon={<RefreshCw size={18} />} label="Må følges opp" value={data?.summary.dueNow ?? "—"} />
        <Metric icon={<BriefcaseBusiness size={18} />} label="Åpne oppgaver" value={data?.summary.openWorkItems ?? "—"} />
        <Metric icon={<CircleDollarSign size={18} />} label="Aktiv pipeline" value={data ? money(data.summary.pipelineValue) : "—"} />
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">Corporate pipeline</h2>
              <p className="mt-1 text-sm text-slate-500">Samme CRM-kontakter, men filtrert til Corporate Homes.</p>
            </div>
            <label className="relative block min-w-[250px]">
              <Search size={15} className="absolute left-3 top-3 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Søk navn, e-post, fase ..."
                className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900"
              />
            </label>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {Object.entries(data?.stages || {}).map(([stage, count]) => (
              <span key={stage} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                {stageLabel[stage] || stage}: {count}
              </span>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Kontakt</th>
                  <th className="px-3 py-3">Fase</th>
                  <th className="px-3 py-3">Pipeline</th>
                  <th className="px-3 py-3">Neste oppfølging</th>
                  <th className="px-3 py-3">Interesse</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleContacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-slate-50">
                    <td className="px-3 py-4">
                      <div className="font-bold text-slate-900">{contact.name || "Ukjent"}</div>
                      <div className="text-xs text-slate-500">{contact.email || "Ingen e-post"}</div>
                    </td>
                    <td className="px-3 py-4">
                      <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
                        {stageLabel[contact.stage] || contact.stage}
                      </span>
                    </td>
                    <td className="px-3 py-4 font-bold text-slate-800">{money(contact.pipelineValue)}</td>
                    <td className="px-3 py-4 text-slate-600">{dateLabel(contact.nextFollowup)}</td>
                    <td className="max-w-[260px] px-3 py-4 text-slate-600">{contact.propertyInterest || "Corporate Homes"}</td>
                    <td className="px-3 py-4 text-right">
                      <Link href={`/customers?contactId=${encodeURIComponent(contact.id)}&tab=all`} className="inline-flex items-center gap-1 font-bold text-cyan-800 hover:underline">
                        Customer 360 <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!loading && visibleContacts.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-500">Ingen Corporate Homes-leads ennå.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-300">Sales motion</p>
          <h2 className="mt-2 text-2xl font-black">Kvalifiser før boligmatch</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Corporate leads skal ikke behandles som en vanlig privat kjøper. Første mål er å forstå beslutningsprosessen og bygge et styre-/ledelsesklart case.
          </p>
          <ol className="mt-6 space-y-4 text-sm">
            {CORPORATE_OUTBOUND.qualificationQuestions.map((question, index) => (
              <li key={question} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-300 font-black text-slate-950">{index + 1}</span>
                <span className="pt-1 text-slate-200">{question}</span>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <CampaignCard
          title={CORPORATE_GOOGLE_SEARCH.name}
          eyebrow="Google Search · klargjort"
          objective={CORPORATE_GOOGLE_SEARCH.objective}
          bullets={[
            `Marked: ${CORPORATE_GOOGLE_SEARCH.market}`,
            `${CORPORATE_GOOGLE_SEARCH.keywords.length} high-intent søkeord`,
            `${CORPORATE_GOOGLE_SEARCH.adGroups.length} annonsegrupper`,
            `Landing: /bedriftshytte-spania`,
          ]}
        >
          <div className="mt-4 flex flex-wrap gap-2">
            {CORPORATE_GOOGLE_SEARCH.keywords.map((keyword) => (
              <span key={keyword} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{keyword}</span>
            ))}
          </div>
        </CampaignCard>

        <CampaignCard
          title={CORPORATE_LINKEDIN.name}
          eyebrow="LinkedIn · klargjort"
          objective={CORPORATE_LINKEDIN.objective}
          bullets={[
            `Marked: ${CORPORATE_LINKEDIN.market}`,
            `Company size: ${CORPORATE_LINKEDIN.companySizes.join(", ")}`,
            `${CORPORATE_LINKEDIN.roles.length} beslutningstaker-roller`,
            `${CORPORATE_LINKEDIN.creativeAngles.length} kreative vinkler`,
          ]}
        >
          <div className="mt-4 space-y-3">
            {CORPORATE_LINKEDIN.creativeAngles.map((angle) => (
              <div key={angle.headline} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="font-bold text-slate-900">{angle.headline}</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{angle.body}</p>
              </div>
            ))}
          </div>
        </CampaignCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Outbound</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">{CORPORATE_OUTBOUND.weeklyTarget} nye prospekter per uke</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Start smalt og personlig. Målet er ikke masseutsendelse, men kvalifiserte samtaler.</p>
          <div className="mt-5 space-y-2">
            {CORPORATE_OUTBOUND.initialSegments.map((segment) => (
              <div key={segment} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">{segment}</div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Hva vi måler</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">Optimaliser mot salgssignaler — ikke klikk</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CORPORATE_SUCCESS_METRICS.map((metric, index) => (
              <div key={metric} className="rounded-2xl border border-slate-200 p-4">
                <span className="text-xs font-black text-amber-700">0{index + 1}</span>
                <div className="mt-1 font-bold text-slate-900">{metric}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/ad-campaigns/new" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
              Åpne Ad Campaigns <ArrowRight size={15} />
            </Link>
            <Link href="/attribution" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-800">
              Attribution
            </Link>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Kampanjene er klargjort som strategi og copy. Dette dashboardet kjøper ikke annonser eller flytter annonsebudsjett automatisk.
          </p>
        </div>
      </section>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">{icon}{label}</div>
      <div className="mt-3 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function CampaignCard({
  title,
  eyebrow,
  objective,
  bullets,
  children,
}: {
  title: string;
  eyebrow: string;
  objective: string;
  bullets: string[];
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">{eyebrow}</p>
      <div className="mt-2 flex items-start gap-3">
        <Building2 size={22} className="mt-1 text-amber-700" />
        <div>
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">Mål: {objective}</p>
        </div>
      </div>
      <ul className="mt-5 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        {bullets.map((item) => <li key={item} className="rounded-xl bg-slate-50 px-3 py-2.5 font-semibold">{item}</li>)}
      </ul>
      {children}
    </article>
  );
}
