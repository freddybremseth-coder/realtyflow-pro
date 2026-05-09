"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Save,
} from "lucide-react";
import { BRANDS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type StatPoint = { value: number | null; trend: string | null; up: boolean; spark: number[] };

type BookingStats = {
  bookings: StatPoint;
  revenue: StatPoint;
  conversionRate: StatPoint;
  noShow: StatPoint;
};

type IntegrationStatus = {
  email: { configured: boolean; provider: string | null; lead: string };
  sms: { configured: boolean; provider: string | null; lead: string };
  calendarInvite: { configured: boolean; lead: string };
  googleCalendar: {
    configured: boolean;
    calendarId: string | null;
    lead: string;
    lastSyncedAt?: string | null;
    lastSyncedRelative?: string | null;
    syncCount?: number;
  };
};

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type Availability = {
  hours: { start: number; end: number };
  days: Record<DayKey, boolean>;
  lunchHour: number | null;
  tz: string;
};

type Attendance = "attended" | "no_show" | "cancelled" | null;

type BookingItem = {
  id?: string;
  date: string;
  type: string;
  customer: string;
  email?: string;
  status: "confirmed" | "pending";
  price: string;
  paid: boolean;
  attendance?: Attendance;
};

const ATTENDANCE_LABELS: Record<Exclude<Attendance, null>, string> = {
  attended: "Fremmøtt",
  no_show: "Ikke fremmøte",
  cancelled: "Avlyst",
};

type BookingConfig = {
  published: boolean;
  brandId: string;
  domain: string;
  siteName: string;
  bookingUrl: string;
  logoUrl?: string;
  accent: string;
  profile: { name: string; initials: string; role: string; location: string; tz: string; bio: string };
  page: { eyebrow: string; title: string; lead: string; intro: string[] };
  services: Array<{
    id: string;
    icon: string;
    iconStyle: string;
    title: string;
    subtitle: string;
    duration: number;
    durationLabel: string;
    price: string;
    priceNote: string;
    paid: boolean;
    format: string;
    blurb: string;
    cta: string;
    intakeTitle: string;
    intakeFields: Array<Record<string, unknown>>;
  }>;
  crossLinks: Array<Record<string, unknown>>;
  availability?: Availability;
  updatedAt?: string;
};

const DEFAULT_AVAILABILITY: Availability = {
  hours: { start: 9, end: 17 },
  days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  lunchHour: 12,
  tz: "Europa/Madrid (CET)",
};

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<DayKey, string> = { mon: "MAN", tue: "TIR", wed: "ONS", thu: "TOR", fri: "FRE", sat: "LØR", sun: "SØN" };

const inputClass = "border-slate-700 bg-slate-950/70";
const textAreaClass = "min-h-[92px] w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

function productionBase(value: string | undefined, fallback: string) {
  const clean = (value || "").trim().replace(/\/$/, "");
  if (!clean || /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(clean)) return fallback;
  return clean;
}

const PUBLIC_BASE = productionBase(process.env.NEXT_PUBLIC_REALTYFLOW_PUBLIC_URL, "https://realtyflow.chatgenius.pro");
const APPOINTMENT_BASE = productionBase(process.env.NEXT_PUBLIC_APPOINTMENT_PUBLIC_BASE_URL, "https://appointment.chatgenius.pro");

function brandToBookingParam(brandId: string) {
  if (brandId === "zeneco") return "zen";
  if (brandId === "pinosoecolife") return "pinoso";
  if (brandId === "chatgenius") return "chat";
  if (brandId === "freddyb") return "freddy";
  return brandId;
}

function serviceTemplate(config: BookingConfig) {
  return {
    id: `${config.brandId}-meeting-${config.services.length + 1}`,
    icon: "Phone",
    iconStyle: config.accent || "amber",
    title: "Ny møtetype",
    subtitle: "Kort beskrivelse",
    duration: 30,
    durationLabel: "30 min",
    price: "Gratis",
    priceNote: "uforpliktende",
    paid: false,
    format: "Google Meet / telefon",
    blurb: "Beskriv hvem møtet passer for og hva kunden får ut av samtalen.",
    cta: "Book møte",
    intakeTitle: "Hjelp oss forberede møtet",
    intakeFields: [
      { type: "text", id: "topic", label: "Hva ønsker du hjelp med?", placeholder: "Skriv kort.", required: true },
    ],
  };
}

const FALLBACK_STATS: BookingStats = {
  bookings: { value: 48, trend: "+20%", up: true, spark: [3, 5, 4, 6, 7, 8, 9] },
  revenue: { value: 6800, trend: "+32%", up: true, spark: [4, 3, 5, 6, 8, 9, 11] },
  conversionRate: { value: 68, trend: "+8%", up: true, spark: [5, 6, 5, 7, 8, 9, 10] },
  noShow: { value: 2, trend: "−1%", up: false, spark: [6, 4, 5, 3, 4, 3, 2] },
};

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "—";
  return `€${value.toLocaleString("nb-NO")}`;
}

const SAMPLE_BOOKINGS: BookingItem[] = [
  { date: "13. mai · 09:00", type: "Første boligsamtale", customer: "Lars Hagen", status: "confirmed", price: "Gratis", paid: false },
  { date: "13. mai · 10:30", type: "Første Pinoso-samtale", customer: "Anne Vik", status: "confirmed", price: "Gratis", paid: false },
  { date: "13. mai · 11:30", type: "Uavhengig boligråd", customer: "Marit Dahl", status: "confirmed", price: "€195", paid: true },
  { date: "13. mai · 14:00", type: "AI-mulighetssamtale", customer: "Roar Andersen", status: "confirmed", price: "Gratis", paid: false },
  { date: "14. mai · 10:00", type: "Strategisamtale", customer: "Camilla Bjørnerud", status: "pending", price: "€195", paid: true },
  { date: "14. mai · 15:30", type: "Første boligsamtale", customer: "Tom Eriksen", status: "confirmed", price: "Gratis", paid: false },
  { date: "15. mai · 09:30", type: "Uavhengig boligråd", customer: "Hanne Solberg", status: "confirmed", price: "€195", paid: true },
  { date: "15. mai · 13:00", type: "AI-mulighetssamtale", customer: "Tech Nordic AS", status: "pending", price: "Gratis", paid: false },
];

function reminderRows(integrations?: IntegrationStatus | null) {
  return [
    {
      Icon: Mail,
      title: "E-postpåminnelse",
      sub: "24 timer før",
      configured: integrations?.email.configured ?? false,
      lead: integrations?.email.lead || null,
    },
    {
      Icon: Phone,
      title: "SMS-påminnelse",
      sub: "1 time før",
      configured: integrations?.sms.configured ?? false,
      lead: integrations?.sms.lead || null,
    },
    {
      Icon: Calendar,
      title: "Kalenderinvitasjon",
      sub: "Umiddelbart",
      configured: integrations?.calendarInvite.configured ?? false,
      lead: integrations?.calendarInvite.lead || null,
    },
  ];
}

function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const w = 100;
  const h = 28;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / (max - min || 1)) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const color = up ? "#10b981" : "#ef4444";
  return (
    <svg width="100%" height="28" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block">
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill={color} opacity="0.12" />
    </svg>
  );
}

function AnalyticsCard({ stats, isDemo, loading }: { stats: BookingStats; isDemo: boolean; loading: boolean }) {
  const tiles = [
    { label: "Bookinger", display: stats.bookings.value === null ? "—" : String(stats.bookings.value), stat: stats.bookings },
    { label: "Inntekt", display: formatCurrency(stats.revenue.value), stat: stats.revenue, accent: true },
    { label: "Konverteringsrate", display: stats.conversionRate.value === null ? "—" : `${stats.conversionRate.value}%`, stat: stats.conversionRate },
    { label: "Ikke-fremmøte", display: stats.noShow.value === null ? "—" : `${stats.noShow.value}%`, stat: stats.noShow, muted: stats.noShow.value === null },
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Analyse <span className="ml-1 text-sm font-normal text-slate-500">(denne måneden)</span>
            {isDemo && !loading && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">Demo</span>
            )}
            {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
          </CardTitle>
          <a href="#" className="text-xs text-slate-400 hover:text-white">Se rapport →</a>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{t.label}</div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <div className={`text-2xl font-semibold ${t.muted ? "text-slate-500" : t.accent ? "text-amber-300" : "text-white"}`}>{t.display}</div>
                {t.stat.trend && (
                  <div className={`flex items-center gap-1 text-xs font-medium ${t.stat.up ? "text-emerald-400" : "text-red-400"}`}>
                    {t.stat.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {t.stat.trend}
                  </div>
                )}
              </div>
              <div className="mt-3"><Sparkline points={t.stat.spark.length ? t.stat.spark : [0, 0, 0, 0, 0, 0, 0]} up={t.stat.up} /></div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BookingsListCard({
  bookings,
  isDemo,
  loading,
  onMarkAttendance,
}: {
  bookings: BookingItem[];
  isDemo: boolean;
  loading: boolean;
  onMarkAttendance?: (id: string, attendance: Attendance) => Promise<void> | void;
}) {
  const [filter, setFilter] = useState<"all" | "free" | "paid">("all");
  const filtered = filter === "all" ? bookings : bookings.filter((b) => (filter === "paid" ? b.paid : !b.paid));
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            Kommende bookinger
            {isDemo && !loading && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">Demo</span>
            )}
            {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
          </CardTitle>
          <div className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/40 p-1">
            {(["all", "free", "paid"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs transition ${filter === f ? "bg-primary-500/20 text-primary-300" : "text-slate-400 hover:text-white"}`}
              >
                {f === "all" ? "Alle" : f === "free" ? "Gratis" : "Betalt"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 text-left font-medium">Dato &amp; tid</th>
                <th className="px-3 py-2 text-left font-medium">Tjeneste</th>
                <th className="px-3 py-2 text-left font-medium">Kunde</th>
                <th className="px-3 py-2 text-left font-medium">Beløp</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Fremmøte</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                    Ingen bookinger ennå for dette filteret.
                  </td>
                </tr>
              )}
              {filtered.map((b, i) => (
                <tr key={b.id || `${b.date}-${i}`} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-3 py-3 text-slate-300">{b.date}</td>
                  <td className="px-3 py-3 text-slate-200">{b.type}</td>
                  <td className="px-3 py-3 text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-700 text-[10px] font-semibold text-slate-200">
                        {b.customer.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                      </span>
                      <span>{b.customer}</span>
                    </div>
                  </td>
                  <td className={`px-3 py-3 ${b.paid ? "text-amber-300" : "text-slate-400"}`}>{b.price}</td>
                  <td className="px-3 py-3">
                    <Badge className={b.status === "confirmed" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" : "border-amber-500/30 bg-amber-500/15 text-amber-300"}>
                      {b.status === "confirmed" ? "Bekreftet" : "Venter"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    {b.id && onMarkAttendance ? (
                      <select
                        value={b.attendance || ""}
                        onChange={(e) => onMarkAttendance(b.id as string, (e.target.value || null) as Attendance)}
                        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:border-primary-500 focus:outline-none"
                      >
                        <option value="">— Ikke registrert</option>
                        <option value="attended">Fremmøtt</option>
                        <option value="no_show">Ikke fremmøte</option>
                        <option value="cancelled">Avlyst</option>
                      </select>
                    ) : (
                      <span className="text-xs text-slate-500">{b.attendance ? ATTENDANCE_LABELS[b.attendance] : "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AvailabilityCard({ availability, onChange }: { availability: Availability; onChange: (next: Availability) => void }) {
  const [editing, setEditing] = useState(false);
  const startHour = Math.max(0, Math.min(23, availability.hours.start));
  const endHour = Math.max(startHour + 1, Math.min(24, availability.hours.end));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const isCellOpen = (hour: number, day: DayKey) => availability.days[day] && availability.lunchHour !== hour;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Tilgjengelighet</CardTitle>
          <button onClick={() => setEditing((v) => !v)} className="text-xs text-slate-400 hover:text-white">
            {editing ? "Ferdig" : "Rediger"}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {editing && (
          <div className="mb-4 grid gap-3 rounded-lg border border-slate-700 bg-slate-900/40 p-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-400">
              <span>Start (time)</span>
              <Input
                className={inputClass}
                type="number"
                min={0}
                max={23}
                value={startHour}
                onChange={(e) => onChange({ ...availability, hours: { ...availability.hours, start: Number(e.target.value || 0) } })}
              />
            </label>
            <label className="space-y-1 text-xs text-slate-400">
              <span>Slutt (time)</span>
              <Input
                className={inputClass}
                type="number"
                min={1}
                max={24}
                value={endHour}
                onChange={(e) => onChange({ ...availability, hours: { ...availability.hours, end: Number(e.target.value || 0) } })}
              />
            </label>
            <label className="space-y-1 text-xs text-slate-400">
              <span>Lunsjpause (time, tom for ingen)</span>
              <Input
                className={inputClass}
                type="number"
                min={0}
                max={23}
                value={availability.lunchHour ?? ""}
                onChange={(e) => onChange({ ...availability, lunchHour: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </label>
            <label className="space-y-1 text-xs text-slate-400">
              <span>Tidssone</span>
              <Input
                className={inputClass}
                value={availability.tz}
                onChange={(e) => onChange({ ...availability, tz: e.target.value })}
              />
            </label>
            <div className="sm:col-span-2">
              <div className="mb-2 text-xs text-slate-400">Dager</div>
              <div className="flex flex-wrap gap-2">
                {DAY_KEYS.map((d) => (
                  <button
                    key={d}
                    onClick={() => onChange({ ...availability, days: { ...availability.days, [d]: !availability.days[d] } })}
                    className={`rounded-full border px-3 py-1 text-xs transition ${availability.days[d] ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border-slate-700 bg-slate-900/60 text-slate-500"}`}
                  >
                    {DAY_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <div
            className="inline-grid min-w-full gap-px overflow-hidden rounded-lg border border-slate-700 bg-slate-700/60"
            style={{ gridTemplateColumns: "auto repeat(7, minmax(48px, 1fr))" }}
          >
            <div className="bg-slate-900 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500">Tid</div>
            {DAY_KEYS.map((d) => (
              <div key={d} className="bg-slate-900 px-3 py-2 text-center text-[10px] uppercase tracking-wider text-slate-400">{DAY_LABELS[d]}</div>
            ))}
            {hours.map((h) => (
              <Fragment key={h}>
                <div className="bg-slate-900 px-3 py-2 text-xs text-slate-400">{String(h).padStart(2, "0")}:00</div>
                {DAY_KEYS.map((d) => (
                  <div
                    key={d}
                    className={`flex items-center justify-center px-3 py-2 text-xs ${isCellOpen(h, d) ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-900/70 text-slate-700"}`}
                  >
                    {isCellOpen(h, d) ? "✓" : "—"}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Globe size={14} /> Tidssone: {availability.tz}
        </div>
      </CardContent>
    </Card>
  );
}

function RemindersCard({ integrations, loading }: { integrations: IntegrationStatus | null; loading: boolean }) {
  const rows = reminderRows(integrations);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Påminnelser
            {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
          </CardTitle>
          <a href="#" className="text-xs text-slate-400 hover:text-white">Rediger</a>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => {
          const I = r.Icon;
          return (
            <div key={r.title} className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-800 text-slate-300"><I size={16} /></span>
              <div className="flex-1">
                <div className="text-sm text-white">{r.title}</div>
                <div className="text-xs text-slate-500">{r.lead || r.sub}</div>
              </div>
              <Badge
                className={r.configured
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                  : "border-slate-600 bg-slate-700/40 text-slate-400"}
              >
                {r.configured ? "På" : "Av"}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function BookingLinkCard({ url, onCopy, copied }: { url: string; onCopy: () => void; copied: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bookingside</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-400">Din side er publisert og klar for deling.</p>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
          <span className="flex-1 truncate text-xs text-slate-300">{url}</span>
          <Button size="sm" variant="outline" onClick={onCopy}>
            <Copy size={12} className="mr-1" />
            {copied ? "Kopiert" : "Kopier"}
          </Button>
        </div>
        <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
          Åpne side <ExternalLink size={12} />
        </a>
      </CardContent>
    </Card>
  );
}

function BrandingPreviewCard({ config, brandColor }: { config: BookingConfig; brandColor?: string }) {
  const initials = config.profile.initials || config.profile.name?.split(/\s+/).map((p) => p[0]).slice(0, 2).join("") || "?";
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Merkevare</CardTitle>
          <span className="text-xs text-slate-500">Forhåndsvisning</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          {config.logoUrl ? (
            <img src={config.logoUrl} alt={config.siteName} className="h-12 w-12 rounded-lg object-cover" />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-lg text-base font-semibold text-white" style={{ background: brandColor || "#1e293b" }}>{initials}</span>
          )}
          <div>
            <div className="text-sm font-medium text-white">{config.siteName}</div>
            <div className="text-xs text-slate-500">{config.profile.role}</div>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs">
          <span className="text-slate-400">Primærfarge</span>
          <span className="flex items-center gap-2"><span className="h-4 w-4 rounded" style={{ background: brandColor || "#1e293b" }} /><span className="text-slate-300">{brandColor || "—"}</span></span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs">
          <span className="text-slate-400">Aksent</span>
          <span className="text-slate-300">{config.accent}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function EmbedSnippetCard({ snippet, onCopy, copied }: { snippet: string; onCopy: () => void; copied: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Innebygd widget</CardTitle>
          <Button size="sm" variant="outline" onClick={onCopy}>
            <Copy size={12} className="mr-1" />
            {copied ? "Kopiert" : "Kopier"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-400">Lim inn på nettsiden din for å la besøkende booke uten å forlate siden.</p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-300">
          <code>{snippet}</code>
        </pre>
      </CardContent>
    </Card>
  );
}

function CalendarSyncCard({ integrations, loading }: { integrations: IntegrationStatus | null; loading: boolean }) {
  const gc = integrations?.googleCalendar;
  const configured = Boolean(gc?.configured);
  const subtitle = gc?.calendarId || gc?.lead || "Token mangler";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Kalendersynkronisering
          {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-800 text-slate-300"><Calendar size={16} /></span>
          <div className="flex-1">
            <div className="text-sm text-white">Google Calendar</div>
            <div className="text-xs text-slate-500">{subtitle}</div>
          </div>
          <Badge
            className={configured
              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
              : "border-amber-500/30 bg-amber-500/15 text-amber-300"}
          >
            {configured ? "Tilkoblet" : "Mangler token"}
          </Badge>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            {configured
              ? gc?.lastSyncedRelative
                ? `Sist synket: ${gc.lastSyncedRelative}`
                : "Henter free/busy live"
              : "Sett GOOGLE_CALENDAR_REFRESH_TOKEN i .env"}
          </span>
          {configured && <Button size="sm" variant="outline"><RefreshCw size={12} className="mr-1" /> Synk nå</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function BookingAdminPage() {
  const [brandId, setBrandId] = useState("zeneco");
  const [config, setConfig] = useState<BookingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [liveBookings, setLiveBookings] = useState<BookingItem[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [stats, setStats] = useState<BookingStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);

  const publicConfigUrl = `${PUBLIC_BASE}/api/public/booking-config?brand_id=${encodeURIComponent(brandId)}`;
  const bookingUrl = `${APPOINTMENT_BASE}/booking.html?brand=${encodeURIComponent(brandToBookingParam(brandId))}&configUrl=${encodeURIComponent(publicConfigUrl)}`;
  const iframeCode = `<iframe src="${bookingUrl}" style="width:100%;min-height:860px;border:0;border-radius:8px;" loading="lazy"></iframe>`;
  const scriptCode = `<script src="${APPOINTMENT_BASE}/embed.js" data-brand="${brandToBookingParam(brandId)}" data-config-url="${publicConfigUrl}" async></script>`;

  const selectedBrand = useMemo(() => BRANDS.find((brand) => brand.id === brandId), [brandId]);
  const availability = config?.availability || DEFAULT_AVAILABILITY;
  const todayLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const text = formatter.format(new Date());
    return text.charAt(0).toUpperCase() + text.slice(1);
  }, []);
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 10) return "God morgen";
    if (hour < 17) return "God dag";
    return "God kveld";
  }, []);
  const todaysBookings = useMemo(() => {
    const today = new Date();
    const months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
    const stamp = `${today.getDate()}. ${months[today.getMonth()]}`;
    return liveBookings.filter((b) => b.date.startsWith(stamp)).length;
  }, [liveBookings]);
  const bookingsForCard = liveBookings.length > 0 ? liveBookings : SAMPLE_BOOKINGS;
  const isDemoBookings = liveBookings.length === 0 && !bookingsLoading;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/booking-config?brand_id=${brandId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setConfig(data.config);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Kunne ikke hente bookingoppsett"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [brandId]);

  useEffect(() => {
    let cancelled = false;
    setBookingsLoading(true);
    fetch(`/api/booking-leads?brand_id=${encodeURIComponent(brandId)}`)
      .then((res) => res.ok ? res.json() : { bookings: [] })
      .then((data) => {
        if (!cancelled) setLiveBookings(Array.isArray(data.bookings) ? data.bookings : []);
      })
      .catch(() => !cancelled && setLiveBookings([]))
      .finally(() => !cancelled && setBookingsLoading(false));
    return () => { cancelled = true; };
  }, [brandId]);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    fetch(`/api/booking-stats?brand_id=${encodeURIComponent(brandId)}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data: BookingStats | null) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => !cancelled && setStats(null))
      .finally(() => !cancelled && setStatsLoading(false));
    return () => { cancelled = true; };
  }, [brandId]);

  useEffect(() => {
    let cancelled = false;
    setIntegrationsLoading(true);
    fetch(`/api/booking-integrations`)
      .then((res) => res.ok ? res.json() : null)
      .then((data: IntegrationStatus | null) => {
        if (!cancelled) setIntegrations(data);
      })
      .catch(() => !cancelled && setIntegrations(null))
      .finally(() => !cancelled && setIntegrationsLoading(false));
    return () => { cancelled = true; };
  }, []);

  const statsForCard = stats || FALLBACK_STATS;
  const isStatsDemo = !stats || (stats.bookings.value === 0 && (!stats.bookings.spark || stats.bookings.spark.every((n) => n === 0)));

  const update = (patch: Partial<BookingConfig>) => {
    if (!config) return;
    setConfig({ ...config, ...patch });
  };

  const updateProfile = (field: keyof BookingConfig["profile"], value: string) => {
    if (!config) return;
    update({ profile: { ...config.profile, [field]: value } });
  };

  const updatePage = (field: keyof BookingConfig["page"], value: string | string[]) => {
    if (!config) return;
    update({ page: { ...config.page, [field]: value } });
  };

  const updateService = (index: number, field: string, value: string | number | boolean | Array<Record<string, unknown>>) => {
    if (!config) return;
    const services = config.services.map((service, serviceIndex) => serviceIndex === index ? { ...service, [field]: value } : service);
    update({ services });
  };

  const save = async (publishState?: boolean) => {
    if (!config) return;
    setSaving(true);
    setError("");
    const nextConfig = { ...config, published: typeof publishState === "boolean" ? publishState : config.published };
    try {
      const res = await fetch("/api/booking-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, booking: nextConfig }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lagring feilet");
      setConfig(data.config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lagring feilet");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1800);
  };

  const markAttendance = async (id: string, attendance: Attendance) => {
    setLiveBookings((prev) => prev.map((b) => (b.id === id ? { ...b, attendance } : b)));
    try {
      const res = await fetch(`/api/booking-leads/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendance }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Kunne ikke oppdatere fremmøte");
      }
      fetch(`/api/booking-stats?brand_id=${encodeURIComponent(brandId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: BookingStats | null) => data && setStats(data))
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke oppdatere fremmøte");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            <Calendar size={14} />
            {todayLabel}
          </div>
          <h1 className="mt-1 text-3xl font-semibold text-white">{greeting}, {selectedBrand?.name?.split(" ")[0] || "Freddy"}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Du har <span className="font-semibold text-white">{todaysBookings} booking{todaysBookings === 1 ? "" : "er"}</span> i dag for {selectedBrand?.name || config?.siteName || "merkevaren"}. Rediger tekst, møtevalg og tilgjengelighet ett sted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300"><CheckCircle2 size={13} /> Lagret</Badge>}
          <Button variant="outline" onClick={() => save(false)} disabled={saving || !config}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Lagre utkast
          </Button>
          <Button onClick={() => save(true)} disabled={saving || !config}>
            <Globe className="mr-2 h-4 w-4" />
            Publiser
          </Button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Brand</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {BRANDS.map((brand) => (
              <button
                key={brand.id}
                onClick={() => setBrandId(brand.id)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${brandId === brand.id ? "border-primary-500 bg-primary-500/10 text-white" : "border-slate-700 bg-slate-900/40 text-slate-300 hover:bg-slate-800"}`}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: brand.color }} />
                <span className="flex-1">{brand.name}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        {loading || !config ? (
          <Card><CardContent className="flex min-h-[420px] items-center justify-center text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Laster bookingoppsett...</CardContent></Card>
        ) : (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{selectedBrand?.name || config.siteName}</CardTitle>
                  <Badge className={config.published ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" : "border-amber-500/30 bg-amber-500/15 text-amber-300"}>
                    {config.published ? "Publisert" : "Utkast"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-slate-400">Sidenavn</span>
                  <Input className={inputClass} value={config.siteName} onChange={(e) => update({ siteName: e.target.value })} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-400">Booking-URL vist på siden</span>
                  <Input className={inputClass} value={config.bookingUrl} onChange={(e) => update({ bookingUrl: e.target.value })} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-400">Brand-logo URL</span>
                  <Input className={inputClass} value={config.logoUrl || ""} onChange={(e) => update({ logoUrl: e.target.value })} placeholder="https://.../logo.png" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-400">Profilnavn</span>
                  <Input className={inputClass} value={config.profile.name} onChange={(e) => updateProfile("name", e.target.value)} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-400">Rolle</span>
                  <Input className={inputClass} value={config.profile.role} onChange={(e) => updateProfile("role", e.target.value)} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-400">Område / visningssted</span>
                  <Input className={inputClass} value={config.profile.location} onChange={(e) => updateProfile("location", e.target.value)} placeholder="Costa Blanca" />
                </label>
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="text-slate-400">Profiltekst</span>
                  <textarea className={textAreaClass} value={config.profile.bio} onChange={(e) => updateProfile("bio", e.target.value)} />
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Booking-side tekst</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <Input className={inputClass} value={config.page.eyebrow} onChange={(e) => updatePage("eyebrow", e.target.value)} placeholder="Kategori / eyebrow" />
                <Input className={inputClass} value={config.page.title} onChange={(e) => updatePage("title", e.target.value)} placeholder="Sidetittel" />
                <textarea className={textAreaClass} value={config.page.lead} onChange={(e) => updatePage("lead", e.target.value)} placeholder="Undertittel" />
                <textarea className={textAreaClass} value={config.page.intro.join("\n")} onChange={(e) => updatePage("intro", e.target.value.split("\n").filter(Boolean))} placeholder="Intro, én linje per avsnitt" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Møtevalg og skjema</CardTitle>
                  <Button size="sm" variant="secondary" onClick={() => update({ services: [...config.services, serviceTemplate(config)] })}>+ Ny møtetype</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {config.services.map((service, index) => (
                  <div key={service.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="font-medium text-white">{service.title || "Møtetype"}</div>
                      <Button size="sm" variant="ghost" onClick={() => update({ services: config.services.filter((_, i) => i !== index) })}>Fjern</Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input className={inputClass} value={service.title} onChange={(e) => updateService(index, "title", e.target.value)} placeholder="Tittel" />
                      <Input className={inputClass} value={service.subtitle} onChange={(e) => updateService(index, "subtitle", e.target.value)} placeholder="Undertittel" />
                      <Input className={inputClass} value={service.durationLabel} onChange={(e) => updateService(index, "durationLabel", e.target.value)} placeholder="30 min" />
                      <Input className={inputClass} type="number" value={service.duration} onChange={(e) => updateService(index, "duration", Number(e.target.value || 0))} placeholder="Varighet minutter" />
                      <Input className={inputClass} value={service.price} onChange={(e) => updateService(index, "price", e.target.value)} placeholder="Pris" />
                      <Input className={inputClass} value={service.cta} onChange={(e) => updateService(index, "cta", e.target.value)} placeholder="Knappetekst" />
                      <textarea className={`${textAreaClass} md:col-span-2`} value={service.blurb} onChange={(e) => updateService(index, "blurb", e.target.value)} placeholder="Kort tekst ved bookingknapp" />
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input type="checkbox" checked={service.paid} onChange={(e) => updateService(index, "paid", e.target.checked)} />
                        Betalt møte
                      </label>
                      <Input className={inputClass} value={service.intakeTitle} onChange={(e) => updateService(index, "intakeTitle", e.target.value)} placeholder="Skjematittel" />
                      <label className="space-y-1 text-sm md:col-span-2">
                        <span className="text-slate-400">Skjemafelt JSON</span>
                        <textarea
                          className="min-h-[170px] w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-100 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          value={JSON.stringify(service.intakeFields || [], null, 2)}
                          onChange={(e) => {
                            try {
                              updateService(index, "intakeFields", JSON.parse(e.target.value));
                              setError("");
                            } catch {
                              setError("Skjemafelt må være gyldig JSON før du lagrer.");
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Code2 size={18} /> Publisering og embed</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-200">Iframe-kode</span>
                    <Button size="sm" variant="outline" onClick={() => copy("iframe", iframeCode)}><Copy size={14} className="mr-2" />{copied === "iframe" ? "Kopiert" : "Kopier"}</Button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-400">{iframeCode}</pre>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-200">Script-kode</span>
                    <Button size="sm" variant="outline" onClick={() => copy("script", scriptCode)}><Copy size={14} className="mr-2" />{copied === "script" ? "Kopiert" : "Kopier"}</Button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-400">{scriptCode}</pre>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={publicConfigUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
                    Åpne publisert JSON <ExternalLink size={14} />
                  </a>
                  <a href={bookingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
                    Forhåndsvis booking <ExternalLink size={14} />
                  </a>
                </div>
              </CardContent>
            </Card>

            <AnalyticsCard stats={statsForCard} isDemo={isStatsDemo} loading={statsLoading} />
            <BookingsListCard
              bookings={bookingsForCard}
              isDemo={isDemoBookings}
              loading={bookingsLoading}
              onMarkAttendance={markAttendance}
            />
            <AvailabilityCard
              availability={availability}
              onChange={(next) => update({ availability: next })}
            />
            <div className="grid gap-5 md:grid-cols-2">
              <RemindersCard integrations={integrations} loading={integrationsLoading} />
              <CalendarSyncCard integrations={integrations} loading={integrationsLoading} />
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              <BookingLinkCard
                url={config.bookingUrl?.startsWith("http") ? config.bookingUrl : `https://${config.bookingUrl || bookingUrl}`}
                onCopy={() => copy("link", config.bookingUrl?.startsWith("http") ? config.bookingUrl : `https://${config.bookingUrl || bookingUrl}`)}
                copied={copied === "link"}
              />
              <BrandingPreviewCard config={config} brandColor={selectedBrand?.color} />
              <EmbedSnippetCard
                snippet={iframeCode}
                onCopy={() => copy("embed-mini", iframeCode)}
                copied={copied === "embed-mini"}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
