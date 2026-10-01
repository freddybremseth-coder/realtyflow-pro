"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Loader2,
  RefreshCw,
} from "lucide-react";

type EventSummary = {
  eventId: string;
  eventName: string;
  registered: number;
  attended: number;
  noShow: number;
  ctaClicks: number;
  assessmentRequests: number;
  attendanceRate: number;
  attendeeToAssessmentRate: number;
};

type Registration = {
  key: string;
  contactId?: string | null;
  name?: string | null;
  email: string;
  organizationName?: string | null;
  contactRole?: string | null;
  eventId: string;
  eventName: string;
  registeredAt?: string | null;
  attendanceStatus: "REGISTERED" | "ATTENDED" | "CTA_CLICKED" | "ASSESSMENT_REQUESTED" | "NO_SHOW" | "CANCELLED";
  attendanceAt?: string | null;
  ctaClicked: boolean;
  assessmentRequested: boolean;
  salesQualifiedByEvent: boolean;
};

type EventData = {
  generatedAt: string;
  events: EventSummary[];
  registrations: Registration[];
  guardrails: {
    registrationIsLead: boolean;
    attendanceQualifiesAutomatically: boolean;
    automaticOutreach: boolean;
    automaticPipelineChange: boolean;
  };
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("nb-NO");
}

function statusLabel(value: Registration["attendanceStatus"]) {
  if (value === "ATTENDED") return "Møtt";
  if (value === "CTA_CLICKED") return "Møtt · CTA-klikk";
  if (value === "ASSESSMENT_REQUESTED") return "Møtt · vurdering";
  if (value === "NO_SHOW") return "No-show";
  if (value === "CANCELLED") return "Avlyst";
  return "Påmeldt";
}

function statusClass(value: Registration["attendanceStatus"]) {
  if (["ATTENDED", "CTA_CLICKED", "ASSESSMENT_REQUESTED"].includes(value)) return "bg-emerald-100 text-emerald-900";
  if (value === "NO_SHOW") return "bg-rose-100 text-rose-900";
  if (value === "CANCELLED") return "bg-amber-100 text-amber-950";
  return "bg-slate-100 text-slate-700";
}

export default function CorporateEventsPage() {
  const [data, setData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState("all");
  const [busyKey, setBusyKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/events", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Kunne ikke hente Corporate events.");
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente Corporate events.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const registrations = useMemo(
    () => selectedEvent === "all"
      ? data?.registrations || []
      : (data?.registrations || []).filter((row) => row.eventId === selectedEvent),
    [data?.registrations, selectedEvent],
  );

  async function recordAttendance(row: Registration, signal: "ATTENDED" | "NO_SHOW" | "CANCELLED") {
    const key = row.key + ":" + signal;
    setBusyKey(key);
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/events/participants/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: row.eventId,
          email: row.email,
          signal,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Kunne ikke registrere event-signal.");
      await load();
    } catch (attendanceError) {
      setError(attendanceError instanceof Error ? attendanceError.message : "Kunne ikke registrere event-signal.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <Link href="/corporate-homes" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950">
            <ArrowLeft size={16} /> Corporate Homes
          </Link>
          <div className="mt-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-900">
            <CalendarClock size={17} /> Event Operations
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Webinar og event — enkelt å følge opp</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            Se hvem som er påmeldt, registrer faktisk oppmøte og følg hvilke deltakere som selv går videre til bedriftsvurdering.
            Påmelding og oppmøte endrer ikke salgsstatus, oppretter ikke pipeline og sender ingenting automatisk.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Oppdater
        </button>
      </div>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">Events</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{data?.events.length ?? "—"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">Påmeldinger</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{data?.registrations.length ?? "—"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">Faktisk møtt</div>
          <div className="mt-2 text-3xl font-black text-slate-950">
            {data?.events.reduce((sum, event) => sum + event.attended, 0) ?? "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">Bedt om vurdering</div>
          <div className="mt-2 text-3xl font-black text-slate-950">
            {data?.events.reduce((sum, event) => sum + event.assessmentRequests, 0) ?? "—"}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-cyan-200 bg-cyan-50/60 p-5">
        <div className="grid gap-3 lg:grid-cols-3">
          {(data?.events || []).map((event) => (
            <button
              key={event.eventId}
              onClick={() => setSelectedEvent(event.eventId)}
              className={`rounded-2xl border p-4 text-left transition ${
                selectedEvent === event.eventId
                  ? "border-cyan-700 bg-white shadow-sm"
                  : "border-cyan-200 bg-white/80 hover:border-cyan-400"
              }`}
            >
              <div className="font-black text-slate-950">{event.eventName}</div>
              <div className="mt-1 text-xs text-slate-500">{event.eventId}</div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div><span className="font-black text-slate-950">{event.registered}</span> påmeldt</div>
                <div><span className="font-black text-slate-950">{event.attended}</span> møtt</div>
                <div><span className="font-black text-slate-950">{event.attendanceRate}%</span> oppmøte</div>
                <div><span className="font-black text-slate-950">{event.assessmentRequests}</span> vurdering</div>
              </div>
            </button>
          ))}
          {!loading && !(data?.events || []).length && (
            <div className="rounded-2xl border border-dashed border-cyan-300 bg-white/70 p-6 text-sm text-slate-600">
              Ingen Corporate event-påmeldinger er registrert ennå.
            </div>
          )}
        </div>
        {selectedEvent !== "all" && (
          <button onClick={() => setSelectedEvent("all")} className="mt-3 text-xs font-black text-cyan-900 hover:underline">
            Vis alle events
          </button>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-xl font-black text-slate-950">Deltakere</h2>
          <p className="mt-1 text-sm text-slate-600">
            Eventstatus registreres av et menneske i event-ledgeren. Knappene under endrer kun event-signalet — ikke CRM-stage eller Corporate-prospekt.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Deltaker</th>
                <th className="px-5 py-3">Event</th>
                <th className="px-5 py-3">Påmeldt</th>
                <th className="px-5 py-3">Eventstatus</th>
                <th className="px-5 py-3">Videre signal</th>
                <th className="px-5 py-3">Registrer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registrations.map((row) => (
                <tr key={row.key} className="align-top">
                  <td className="px-5 py-4">
                    <div className="font-black text-slate-950">{row.organizationName || row.name || "Ukjent"}</div>
                    {row.organizationName && row.name && <div className="mt-1 text-xs text-slate-600">{row.name}</div>}
                    <div className="mt-1 text-xs text-slate-500">{row.email || "—"}{row.contactRole ? ` · ${row.contactRole}` : ""}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-bold text-slate-900">{row.eventName}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.eventId}</div>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-600">{formatDate(row.registeredAt)}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusClass(row.attendanceStatus)}`}>
                      {statusLabel(row.attendanceStatus)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1 text-xs">
                      <div className={row.ctaClicked ? "font-bold text-cyan-900" : "text-slate-400"}>
                        CTA {row.ctaClicked ? "klikket" : "ikke registrert"}
                      </div>
                      <div className={row.assessmentRequested ? "font-black text-emerald-800" : "text-slate-400"}>
                        {row.assessmentRequested ? "Bedriftsvurdering mottatt" : "Ingen salgsforespørsel"}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex min-w-[260px] flex-wrap gap-2">
                      {([
                        ["ATTENDED", "Møtt"],
                        ["NO_SHOW", "No-show"],
                        ["CANCELLED", "Avlyst"],
                      ] as const).map(([status, label]) => {
                        const key = `${row.key}:${status}`;
                        return (
                          <button
                            key={status}
                            onClick={() => void recordAttendance(row, status)}
                            disabled={Boolean(busyKey)}
                            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {busyKey === key ? <Loader2 size={13} className="animate-spin" /> : label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && registrations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500">Ingen deltakere i dette utvalget.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
