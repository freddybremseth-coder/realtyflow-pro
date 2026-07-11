"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck2, CheckCircle2, ChevronRight, Clock3, ExternalLink, ListChecks,
  Loader2, Plus, RefreshCw, ShieldCheck, UserRound, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { ExecutionItem, ExecutionWorkspace } from "@/lib/revenue/execution";

type CalendarInfo = { id: string; summary: string; primary?: boolean };
type CalendarEvent = { id: string; calendarId: string; summary: string; start: string; end: string; htmlLink?: string; allDay?: boolean };
type CalendarDraft = { item: ExecutionItem; calendarId: string; date: string; startTime: string; endTime: string; title: string; description: string; location: string };

const BRANDS = [
  ["all", "Alle brands"], ["zeneco", "Zen Eco Homes"], ["soleada", "Soleada.no"],
  ["pinosoecolife", "Pinoso EcoLife"], ["keyholding", "Keyholding"],
] as const;

const URGENCY_LABELS: Record<string, string> = {
  OVERDUE: "Forfalt", TODAY: "I dag", THIS_WEEK: "Neste 7 dager", LATER: "Senere", UNSCHEDULED: "Mangler dato",
};
const KIND_LABELS: Record<string, string> = {
  CONTACT_FOLLOWUP: "Kundeoppfølging", VIEWING: "Visning", CLOSING: "Closing",
  AFTER_SALES: "Ettermarked", KEYHOLDING: "Keyholding", WORK_ITEM: "Intern oppgave",
};

function localDate(date = new Date()) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDate(value);
}

function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatDate(value: string | null) {
  if (!value) return "Ingen dato";
  return new Date(`${value}T12:00:00`).toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" });
}

function formatEventTime(event: CalendarEvent) {
  if (event.allDay || !event.start.includes("T")) return "Hele dagen";
  const start = new Date(event.start).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  const end = new Date(event.end).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  return `${start}–${end}`;
}

function priorityClass(priority: string) {
  if (priority === "CRITICAL") return "border-red-500/50 bg-red-500/10 text-red-300";
  if (priority === "HIGH") return "border-orange-500/50 bg-orange-500/10 text-orange-300";
  if (priority === "MEDIUM") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-slate-600 bg-slate-800 text-slate-300";
}

export default function ExecutionPage() {
  const [workspace, setWorkspace] = useState<ExecutionWorkspace | null>(null);
  const [brand, setBrand] = useState("all");
  const [urgency, setUrgency] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendarConfigured, setCalendarConfigured] = useState(true);
  const [calendarDraft, setCalendarDraft] = useState<CalendarDraft | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/revenue/execution?brand=${encodeURIComponent(brand)}`, { cache: "no-store" });
    const data = await response.json();
    setWorkspace(data.workspace || null);
    if (!response.ok) setMessage(data.error || "Kunne ikke hente arbeidsplanen.");
    setLoading(false);
  }, [brand]);

  const loadCalendar = useCallback(async () => {
    const startDate = localDate();
    const endDate = addDays(startDate, 8);
    const [calendarResponse, eventResponse] = await Promise.all([
      fetch("/api/calendar?action=list_calendars", { cache: "no-store" }),
      fetch(`/api/calendar?start=${encodeURIComponent(`${startDate}T00:00:00+02:00`)}&end=${encodeURIComponent(`${endDate}T00:00:00+02:00`)}`, { cache: "no-store" }),
    ]);
    const calendarData = await calendarResponse.json();
    const eventData = await eventResponse.json();
    setCalendarConfigured(calendarData.configured !== false && eventData.configured !== false);
    setCalendars(calendarData.calendars || []);
    setEvents(eventData.events || []);
  }, []);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  const filtered = useMemo(() => (workspace?.items || []).filter((item) =>
    (urgency === "ALL" || item.urgency === urgency) && (kind === "ALL" || item.kind === kind),
  ), [workspace, urgency, kind]);

  const action = async (item: ExecutionItem, actionName: string, dueDate?: string) => {
    const key = `${actionName}:${item.id}`;
    setBusy(key);
    setMessage("");
    const body: Record<string, unknown> = { action: actionName };
    if (item.contactId) body.contactId = item.contactId;
    if (item.workItemId) body.workItemId = item.workItemId;
    if (dueDate) body.dueDate = dueDate;
    const response = await fetch("/api/revenue/execution", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json();
    setMessage(response.ok ? actionName === "complete_task" ? "Oppgaven er markert ferdig." : "Arbeidsplanen er oppdatert." : data.error || "Handlingen feilet.");
    if (response.ok) await loadWorkspace();
    setBusy(null);
  };

  const openCalendarDraft = (item: ExecutionItem) => {
    const date = item.dueDate || localDate();
    const startTime = "10:00";
    setCalendarDraft({
      item, calendarId: calendars.find((row) => row.primary)?.id || calendars[0]?.id || "primary",
      date, startTime, endTime: addMinutes(startTime, item.calendar.durationMinutes),
      title: item.calendar.title, description: item.calendar.description, location: "",
    });
  };

  const createCalendarEvent = async () => {
    if (!calendarDraft) return;
    setBusy(`calendar:${calendarDraft.item.id}`);
    const response = await fetch("/api/calendar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calendarId: calendarDraft.calendarId, summary: calendarDraft.title,
        description: calendarDraft.description, location: calendarDraft.location,
        start: `${calendarDraft.date}T${calendarDraft.startTime}:00+02:00`,
        end: `${calendarDraft.date}T${calendarDraft.endTime}:00+02:00`, allDay: false,
      }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Kalenderavtalen er opprettet etter din bekreftelse." : data.error || "Kalenderavtalen kunne ikke opprettes.");
    if (response.ok) { setCalendarDraft(null); await loadCalendar(); }
    setBusy(null);
  };

  const stats = workspace?.summary;
  const today = localDate();
  const weekEvents = events.filter((event) => event.start.slice(0, 10) >= today).slice(0, 20);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-cyan-300"><CalendarCheck2 size={17} /> Freddy Revenue OS</div>
          <h1 className="text-3xl font-bold text-white">Calendar & Execution</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Gjør CRM-oppfølging og interne oppgaver om til en kontrollert ukeplan. Ingen oppgave eller kalenderavtale opprettes automatisk.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={brand} onChange={(event) => setBrand(event.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
            {BRANDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <Button variant="outline" onClick={() => { loadWorkspace(); loadCalendar(); }}><RefreshCw size={15} className="mr-2" />Oppdater</Button>
          <Button asChild variant="outline"><Link href="/calendar">Full kalender <ExternalLink size={14} className="ml-2" /></Link></Button>
        </div>
      </div>

      {message && <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">{message}</div>}
      {workspace?.warnings.map((warning) => <div key={warning} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{warning}</div>)}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          ["Forfalt", stats?.overdue || 0], ["I dag", stats?.today || 0], ["Neste 7 dager", stats?.thisWeek || 0],
          ["Mangler dato", stats?.unscheduled || 0], ["Kritiske", stats?.critical || 0], ["Åpne oppgaver", stats?.workItems || 0],
        ].map(([label, value]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-white">{value}</p></CardContent></Card>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        {(workspace?.days || []).map((day) => <Card key={day.date} className={day.date === today ? "border-cyan-500/50" : ""}><CardContent className="p-3"><p className="text-xs font-medium text-slate-400">{day.label}</p><p className="mt-2 text-xl font-bold text-white">{day.count}</p>{day.critical > 0 && <p className="text-xs text-red-300">{day.critical} kritisk</p>}</CardContent></Card>)}
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={urgency} onChange={(event) => setUrgency(event.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
          <option value="ALL">Alle tidsfrister</option>{Object.entries(URGENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={kind} onChange={(event) => setKind(event.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
          <option value="ALL">Alle arbeidstyper</option>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {loading && <div className="flex items-center gap-2 py-12 text-slate-400"><Loader2 className="animate-spin" /> Henter arbeidsplan…</div>}
          {!loading && filtered.length === 0 && <Card><CardContent className="p-8 text-center text-slate-400">Ingen handlinger matcher filtrene.</CardContent></Card>}
          {filtered.map((item) => (
            <Card key={item.id} className={item.priority === "CRITICAL" ? "border-red-500/40" : ""}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={priorityClass(item.priority)}>{item.priority}</Badge>
                      <Badge variant="outline">{URGENCY_LABELS[item.urgency]}</Badge>
                      <Badge variant="outline">{KIND_LABELS[item.kind]}</Badge>
                      {item.brandId && <Badge variant="secondary">{item.brandId}</Badge>}
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-white">{item.title}</h2>
                    <p className="mt-1 text-sm text-slate-400">{item.detail}</p>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500"><span className="flex items-center gap-1"><Clock3 size={13} />{formatDate(item.dueDate)}</span><span>Score {Math.round(item.score)}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:max-w-[430px] lg:justify-end">
                    {item.customerHref && <Button asChild size="sm" variant="outline"><Link href={item.customerHref}><UserRound size={14} className="mr-1" />Kunde</Link></Button>}
                    <Button asChild size="sm" variant="outline"><Link href={item.workspaceHref}>Arbeidsflate <ChevronRight size={14} className="ml-1" /></Link></Button>
                    {item.canCreateTask && <Button size="sm" variant="outline" disabled={busy === `create_task:${item.id}`} onClick={() => action(item, "create_task", item.dueDate || today)}><Plus size={14} className="mr-1" />Oppgave</Button>}
                    {item.canScheduleFollowup && [1, 7, 30].map((days) => <Button key={days} size="sm" variant="outline" disabled={busy === `set_followup:${item.id}`} onClick={() => action(item, "set_followup", addDays(today, days))}>+{days}d</Button>)}
                    {!item.canScheduleFollowup && item.workItemId && <Button size="sm" variant="outline" onClick={() => action(item, "postpone_task", addDays(today, 7))}>Utsett 7d</Button>}
                    {item.canCompleteTask && <Button size="sm" variant="outline" disabled={busy === `complete_task:${item.id}`} onClick={() => action(item, "complete_task")}><CheckCircle2 size={14} className="mr-1" />Ferdig</Button>}
                    <Button size="sm" disabled={!calendarConfigured} onClick={() => openCalendarDraft(item)}><CalendarCheck2 size={14} className="mr-1" />Kalender</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ListChecks size={17} />Neste kalenderavtaler</CardTitle></CardHeader><CardContent className="space-y-3">
            {!calendarConfigured && <p className="text-sm text-amber-300">Google Calendar er ikke konfigurert. Arbeidsplanen fungerer fortsatt.</p>}
            {calendarConfigured && weekEvents.length === 0 && <p className="text-sm text-slate-500">Ingen kalenderavtaler de neste dagene.</p>}
            {weekEvents.map((event) => <div key={`${event.calendarId}:${event.id}`} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"><p className="text-xs text-slate-500">{new Date(event.start).toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" })} · {formatEventTime(event)}</p><p className="mt-1 text-sm font-medium text-slate-200">{event.summary}</p>{event.htmlLink && <a href={event.htmlLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center text-xs text-cyan-300">Åpne <ExternalLink size={12} className="ml-1" /></a>}</div>)}
          </CardContent></Card>
          <Card className="border-emerald-500/20"><CardContent className="p-4 text-sm text-slate-400"><div className="mb-2 flex items-center gap-2 font-medium text-emerald-300"><ShieldCheck size={16} />Kontrollert utførelse</div>Ingen oppgaver, kundedatoer eller kalenderavtaler opprettes automatisk. Kalenderhendelser opprettes uten deltakere eller invitasjoner.</CardContent></Card>
        </div>
      </div>

      {calendarDraft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><Card className="w-full max-w-xl"><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Opprett kalenderavtale</CardTitle><Button size="icon" variant="ghost" onClick={() => setCalendarDraft(null)}><X size={18} /></Button></CardHeader><CardContent className="space-y-4">
        <p className="text-sm text-slate-400">Kontroller dato, klokkeslett og tekst. Avtalen opprettes først når du trykker knappen nederst.</p>
        <select value={calendarDraft.calendarId} onChange={(event) => setCalendarDraft({ ...calendarDraft, calendarId: event.target.value })} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"><option value="primary">Primærkalender</option>{calendars.filter((row) => row.id !== "primary").map((row) => <option key={row.id} value={row.id}>{row.summary}</option>)}</select>
        <Input value={calendarDraft.title} maxLength={200} onChange={(event) => setCalendarDraft({ ...calendarDraft, title: event.target.value })} />
        <div className="grid grid-cols-3 gap-3"><Input type="date" value={calendarDraft.date} onChange={(event) => setCalendarDraft({ ...calendarDraft, date: event.target.value })} /><Input type="time" value={calendarDraft.startTime} onChange={(event) => setCalendarDraft({ ...calendarDraft, startTime: event.target.value })} /><Input type="time" value={calendarDraft.endTime} onChange={(event) => setCalendarDraft({ ...calendarDraft, endTime: event.target.value })} /></div>
        <Input placeholder="Sted, valgfritt" value={calendarDraft.location} maxLength={500} onChange={(event) => setCalendarDraft({ ...calendarDraft, location: event.target.value })} />
        <textarea value={calendarDraft.description} maxLength={4000} onChange={(event) => setCalendarDraft({ ...calendarDraft, description: event.target.value })} className="min-h-32 w-full rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200" />
        <Button className="w-full" disabled={!calendarDraft.title.trim() || !calendarDraft.date || calendarDraft.endTime <= calendarDraft.startTime || busy === `calendar:${calendarDraft.item.id}`} onClick={createCalendarEvent}>{busy === `calendar:${calendarDraft.item.id}` ? <Loader2 className="mr-2 animate-spin" size={16} /> : <CalendarCheck2 className="mr-2" size={16} />}Opprett etter bekreftelse</Button>
      </CardContent></Card></div>}
    </div>
  );
}
