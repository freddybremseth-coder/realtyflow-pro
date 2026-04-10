"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X, Flag,
  Loader2, RefreshCw, MapPin, Clock, Trash2, Edit2, ExternalLink, Eye, EyeOff,
} from "lucide-react";

interface CalendarEvent {
  id: string;
  calendarId: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  status: string;
  htmlLink: string;
  colorId: string;
  creator: string;
  attendees: { email: string; displayName: string; responseStatus: string }[];
  isHoliday?: boolean;
  holidayColor?: string;
}

interface CalendarInfo {
  id: string;
  summary: string;
  description: string;
  backgroundColor: string;
  foregroundColor: string;
  primary: boolean;
  accessRole: string;
}

const spanishHolidays: CalendarEvent[] = [
  { id: "h01", calendarId: "holidays", summary: "Año Nuevo", description: "", location: "", start: "2026-01-01", end: "2026-01-01", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#ef4444" },
  { id: "h02", calendarId: "holidays", summary: "Día de Reyes", description: "", location: "", start: "2026-01-06", end: "2026-01-06", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#ef4444" },
  { id: "h03", calendarId: "holidays", summary: "San José (Valencia)", description: "", location: "", start: "2026-03-19", end: "2026-03-19", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#f97316" },
  { id: "h04", calendarId: "holidays", summary: "Jueves Santo", description: "", location: "", start: "2026-04-02", end: "2026-04-02", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#ef4444" },
  { id: "h05", calendarId: "holidays", summary: "Viernes Santo", description: "", location: "", start: "2026-04-03", end: "2026-04-03", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#ef4444" },
  { id: "h06", calendarId: "holidays", summary: "Lunes de Pascua (Valencia)", description: "", location: "", start: "2026-04-06", end: "2026-04-06", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#f97316" },
  { id: "h07", calendarId: "holidays", summary: "Día del Trabajo", description: "", location: "", start: "2026-05-01", end: "2026-05-01", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#ef4444" },
  { id: "h08", calendarId: "holidays", summary: "Asunción de la Virgen", description: "", location: "", start: "2026-08-15", end: "2026-08-15", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#ef4444" },
  { id: "h09", calendarId: "holidays", summary: "Día de la Hispanidad", description: "", location: "", start: "2026-10-12", end: "2026-10-12", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#ef4444" },
  { id: "h10", calendarId: "holidays", summary: "Todos los Santos", description: "", location: "", start: "2026-11-01", end: "2026-11-01", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#ef4444" },
  { id: "h11", calendarId: "holidays", summary: "Día de la Constitución", description: "", location: "", start: "2026-12-06", end: "2026-12-06", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#ef4444" },
  { id: "h12", calendarId: "holidays", summary: "Inmaculada Concepción", description: "", location: "", start: "2026-12-08", end: "2026-12-08", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#ef4444" },
  { id: "h13", calendarId: "holidays", summary: "Navidad", description: "", location: "", start: "2026-12-25", end: "2026-12-25", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#ef4444" },
  { id: "h14", calendarId: "holidays", summary: "Comunidad Valenciana", description: "", location: "", start: "2026-10-09", end: "2026-10-09", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#f97316" },
  { id: "h15", calendarId: "holidays", summary: "San Juan (Alicante)", description: "", location: "", start: "2026-06-24", end: "2026-06-24", allDay: true, status: "", htmlLink: "", colorId: "", creator: "", attendees: [], isHoliday: true, holidayColor: "#f97316" },
];

function getEventDate(ev: CalendarEvent): string {
  const s = ev.start || "";
  return s.length >= 10 ? s.substring(0, 10) : s;
}

function getEventTime(ev: CalendarEvent): string {
  if (ev.allDay || ev.isHoliday) return "";
  const s = ev.start || "";
  if (s.includes("T")) {
    const t = s.split("T")[1];
    return t ? t.substring(0, 5) : "";
  }
  return "";
}

function getEventEndTime(ev: CalendarEvent): string {
  if (ev.allDay || ev.isHoliday) return "";
  const e = ev.end || "";
  if (e.includes("T")) {
    const t = e.split("T")[1];
    return t ? t.substring(0, 5) : "";
  }
  return "";
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [hiddenCalendars, setHiddenCalendars] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());

  // Modal states
  const [showNew, setShowNew] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [newEv, setNewEv] = useState({
    summary: "", description: "", location: "", date: "", startTime: "", endTime: "", calendarId: "primary", allDay: false,
  });
  const [saving, setSaving] = useState(false);

  const fetchCalendars = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar?action=list_calendars");
      const data = await res.json();
      if (!data.configured) {
        setConfigured(false);
        return;
      }
      setCalendars(data.calendars || []);
    } catch (err) {
      console.error("Failed to fetch calendars:", err);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth();
      const start = new Date(y, m, 1).toISOString();
      const end = new Date(y, m + 1, 0, 23, 59, 59).toISOString();

      const res = await fetch(`/api/calendar?start=${start}&end=${end}`);
      const data = await res.json();

      if (!data.configured) {
        setConfigured(false);
        setLoading(false);
        return;
      }

      const apiEvents: CalendarEvent[] = (data.events || []).map((ev: Record<string, unknown>) => ({
        id: ev.id as string,
        calendarId: ev.calendarId as string,
        summary: (ev.summary as string) || "(Uten tittel)",
        description: (ev.description as string) || "",
        location: (ev.location as string) || "",
        start: (ev.start as string) || "",
        end: (ev.end as string) || "",
        allDay: ev.allDay as boolean,
        status: (ev.status as string) || "",
        htmlLink: (ev.htmlLink as string) || "",
        colorId: (ev.colorId as string) || "",
        creator: (ev.creator as string) || "",
        attendees: (ev.attendees as CalendarEvent["attendees"]) || [],
      }));

      // Merge with Spanish holidays for current month
      const monthHolidays = spanishHolidays.filter((h) => {
        const d = new Date(h.start);
        return d.getFullYear() === y && d.getMonth() === m;
      });

      setEvents([...apiEvents, ...monthHolidays]);
    } catch (err) {
      console.error("Failed to fetch events:", err);
    }
    setLoading(false);
  }, [currentDate]);

  useEffect(() => {
    fetchCalendars();
  }, [fetchCalendars]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const getCalendarColor = useCallback((calId: string): string => {
    const cal = calendars.find((c) => c.id === calId);
    return cal?.backgroundColor || "#06b6d4";
  }, [calendars]);

  const daysInMonth = useMemo(() => {
    const y = currentDate.getFullYear(), m = currentDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const numDays = new Date(y, m + 1, 0).getDate();
    const days: (number | null)[] = [];
    const startDay = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= numDays; i++) days.push(i);
    return days;
  }, [currentDate]);

  const monthName = currentDate.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });

  const getEventsForDay = useCallback((day: number): CalendarEvent[] => {
    const ds = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => {
      if (hiddenCalendars.has(e.calendarId) && !e.isHoliday) return false;
      return getEventDate(e) === ds;
    });
  }, [events, currentDate, hiddenCalendars]);

  const today = new Date();
  const isToday = (d: number) =>
    currentDate.getFullYear() === today.getFullYear() &&
    currentDate.getMonth() === today.getMonth() &&
    d === today.getDate();

  const goToToday = () => {
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDay(today.getDate());
  };

  const dayEvents = selectedDay ? getEventsForDay(selectedDay) : [];

  const createEvent = async () => {
    if (!newEv.summary || !newEv.date) return;
    setSaving(true);
    try {
      let start: string, end: string;
      if (newEv.allDay) {
        start = newEv.date;
        end = newEv.date;
      } else {
        start = `${newEv.date}T${newEv.startTime || "09:00"}:00`;
        end = `${newEv.date}T${newEv.endTime || "10:00"}:00`;
      }

      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarId: newEv.calendarId || "primary",
          summary: newEv.summary,
          description: newEv.description,
          location: newEv.location,
          start,
          end,
          allDay: newEv.allDay,
        }),
      });

      if (res.ok) {
        setShowNew(false);
        setNewEv({ summary: "", description: "", location: "", date: "", startTime: "", endTime: "", calendarId: "primary", allDay: false });
        fetchEvents();
      }
    } catch (err) {
      console.error("Failed to create event:", err);
    }
    setSaving(false);
  };

  const updateEvent = async () => {
    if (!editingEvent) return;
    setSaving(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: editingEvent.id,
          calendarId: editingEvent.calendarId,
          summary: newEv.summary,
          description: newEv.description,
          location: newEv.location,
          start: newEv.allDay ? newEv.date : `${newEv.date}T${newEv.startTime || "09:00"}:00`,
          end: newEv.allDay ? newEv.date : `${newEv.date}T${newEv.endTime || "10:00"}:00`,
          allDay: newEv.allDay,
        }),
      });
      if (res.ok) {
        setEditingEvent(null);
        fetchEvents();
      }
    } catch (err) {
      console.error("Failed to update event:", err);
    }
    setSaving(false);
  };

  const deleteEvent = async (ev: CalendarEvent) => {
    if (ev.isHoliday) return;
    try {
      const res = await fetch("/api/calendar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: ev.id, calendarId: ev.calendarId }),
      });
      if (res.ok) fetchEvents();
    } catch (err) {
      console.error("Failed to delete event:", err);
    }
  };

  const openEdit = (ev: CalendarEvent) => {
    if (ev.isHoliday) return;
    setEditingEvent(ev);
    setNewEv({
      summary: ev.summary,
      description: ev.description,
      location: ev.location,
      date: getEventDate(ev),
      startTime: getEventTime(ev) || "09:00",
      endTime: getEventEndTime(ev) || "10:00",
      calendarId: ev.calendarId,
      allDay: ev.allDay,
    });
  };

  const openNew = (day?: number) => {
    const d = day || selectedDay || today.getDate();
    const ds = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    setNewEv({ summary: "", description: "", location: "", date: ds, startTime: "09:00", endTime: "10:00", calendarId: calendars.find((c) => c.primary)?.id || "primary", allDay: false });
    setShowNew(true);
  };

  const toggleCalendar = (calId: string) => {
    setHiddenCalendars((prev) => {
      const next = new Set(prev);
      if (next.has(calId)) next.delete(calId);
      else next.add(calId);
      return next;
    });
  };

  // Event modal (shared between create and edit)
  const renderEventModal = () => {
    const isEdit = !!editingEvent;
    const title = isEdit ? "Rediger hendelse" : "Ny hendelse";
    const onSave = isEdit ? updateEvent : createEvent;
    const onClose = () => { setShowNew(false); setEditingEvent(null); };

    if (!showNew && !editingEvent) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
        <Card className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <Button variant="ghost" size="icon" onClick={onClose}><X size={18} /></Button>
            </div>
            <div className="space-y-3">
              <Input
                placeholder="Tittel *"
                value={newEv.summary}
                onChange={(e) => setNewEv((p) => ({ ...p, summary: e.target.value }))}
              />
              <Input
                placeholder="Beskrivelse"
                value={newEv.description}
                onChange={(e) => setNewEv((p) => ({ ...p, description: e.target.value }))}
              />
              <Input
                placeholder="Sted"
                value={newEv.location}
                onChange={(e) => setNewEv((p) => ({ ...p, location: e.target.value }))}
              />
              {calendars.length > 0 && (
                <select
                  value={newEv.calendarId}
                  onChange={(e) => setNewEv((p) => ({ ...p, calendarId: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                >
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>{c.summary}</option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={newEv.allDay}
                  onChange={(e) => setNewEv((p) => ({ ...p, allDay: e.target.checked }))}
                  className="rounded"
                />
                Heldagshendelse
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Dato</label>
                  <Input type="date" value={newEv.date} onChange={(e) => setNewEv((p) => ({ ...p, date: e.target.value }))} />
                </div>
                {!newEv.allDay && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Fra</label>
                      <Input type="time" value={newEv.startTime} onChange={(e) => setNewEv((p) => ({ ...p, startTime: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Til</label>
                      <Input type="time" value={newEv.endTime} onChange={(e) => setNewEv((p) => ({ ...p, endTime: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>
              <Button onClick={onSave} className="w-full" disabled={!newEv.summary || !newEv.date || saving}>
                {saving ? <Loader2 size={16} className="mr-1 animate-spin" /> : <Plus size={16} className="mr-1" />}
                {isEdit ? "Lagre endringer" : "Opprett hendelse"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <CalendarIcon className="text-primary-400" size={28} />
            Kalender
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {configured ? "Google Calendar synkronisert" : "Visninger, møter, innhold og spanske helligdager"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>I dag</Button>
          <Button variant="outline" size="sm" onClick={fetchEvents} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
          <Button onClick={() => openNew()}>
            <Plus size={16} className="mr-2" />
            Ny hendelse
          </Button>
        </div>
      </div>

      {!configured && (
        <Card className="border-amber-500/30">
          <CardContent className="p-4 text-sm text-amber-300">
            Google Calendar er ikke konfigurert. Legg til GOOGLE_CALENDAR_REFRESH_TOKEN i miljøvariabler for å synkronisere. Kalenderen viser lokale hendelser og spanske helligdager.
          </CardContent>
        </Card>
      )}

      {renderEventModal()}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}>
                  <ChevronLeft size={18} />
                </Button>
                <CardTitle className="capitalize">{monthName}</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}>
                  <ChevronRight size={18} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={24} className="text-primary-400 animate-spin mr-2" />
                  <span className="text-sm text-slate-400">Henter hendelser...</span>
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-px">
                  {["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"].map((d) => (
                    <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>
                  ))}
                  {daysInMonth.map((day, i) => {
                    const evts = day ? getEventsForDay(day) : [];
                    const hasH = evts.some((e) => e.isHoliday);
                    return (
                      <div
                        key={i}
                        onClick={() => day && setSelectedDay(day)}
                        onDoubleClick={() => day && openNew(day)}
                        className={`min-h-[80px] p-1 border border-slate-800 rounded cursor-pointer transition-colors ${
                          day ? "bg-slate-800/30 hover:bg-slate-800/60" : ""
                        } ${isToday(day || 0) ? "ring-1 ring-primary-400" : ""} ${
                          selectedDay === day ? "ring-1 ring-amber-400" : ""
                        } ${hasH ? "bg-red-900/10" : ""}`}
                      >
                        {day && (
                          <>
                            <div className="flex items-center gap-1">
                              <span className={`text-xs ${isToday(day) ? "text-primary-400 font-bold" : "text-slate-400"}`}>{day}</span>
                              {hasH && <Flag size={8} className="text-red-400" />}
                              {evts.filter((e) => !e.isHoliday).length > 0 && (
                                <span className="text-[9px] text-slate-500 ml-auto">{evts.filter((e) => !e.isHoliday).length}</span>
                              )}
                            </div>
                            <div className="space-y-0.5 mt-1">
                              {evts.slice(0, 2).map((ev) => {
                                const color = ev.isHoliday ? (ev.holidayColor || "#ef4444") : getCalendarColor(ev.calendarId);
                                return (
                                  <div
                                    key={ev.id}
                                    className="text-[10px] px-1 py-0.5 rounded truncate"
                                    style={{ backgroundColor: color + "33", color }}
                                  >
                                    {getEventTime(ev) && <span className="opacity-70">{getEventTime(ev)} </span>}
                                    {ev.summary}
                                  </div>
                                );
                              })}
                              {evts.length > 2 && <p className="text-[9px] text-slate-500">+{evts.length - 2} til</p>}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Selected Day Events */}
          <Card className="sticky top-6">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  {selectedDay
                    ? `${selectedDay}. ${currentDate.toLocaleDateString("nb-NO", { month: "long" })}`
                    : "Velg en dag"}
                </CardTitle>
                {selectedDay && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openNew(selectedDay)}>
                    <Plus size={12} />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {selectedDay && dayEvents.length > 0 ? (
                <div className="space-y-2">
                  {dayEvents.map((ev) => {
                    const color = ev.isHoliday ? (ev.holidayColor || "#ef4444") : getCalendarColor(ev.calendarId);
                    return (
                      <div
                        key={ev.id}
                        className={`p-3 rounded-lg border ${
                          ev.isHoliday ? "bg-red-900/10 border-red-500/20" : "bg-slate-900/30 border-slate-700/30"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-slate-200">{ev.summary}</span>
                            {getEventTime(ev) && (
                              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                <Clock size={10} />
                                {getEventTime(ev)}{getEventEndTime(ev) && ` – ${getEventEndTime(ev)}`}
                              </p>
                            )}
                            {ev.location && (
                              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                <MapPin size={10} />
                                {ev.location}
                              </p>
                            )}
                            {ev.isHoliday && <Badge variant="destructive" className="text-[10px] mt-1">Helligdag</Badge>}
                          </div>
                          {!ev.isHoliday && (
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={() => openEdit(ev)} className="p-1 hover:text-cyan-400 text-slate-500 transition-colors">
                                <Edit2 size={12} />
                              </button>
                              <button onClick={() => deleteEvent(ev)} className="p-1 hover:text-red-400 text-slate-500 transition-colors">
                                <Trash2 size={12} />
                              </button>
                              {ev.htmlLink && (
                                <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" className="p-1 hover:text-blue-400 text-slate-500 transition-colors">
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">{selectedDay ? "Ingen hendelser" : "Klikk på en dag"}</p>
              )}
            </CardContent>
          </Card>

          {/* Calendars list */}
          {calendars.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Mine kalendere</p>
                <div className="space-y-1.5">
                  {calendars.map((cal) => (
                    <button
                      key={cal.id}
                      onClick={() => toggleCalendar(cal.id)}
                      className="flex items-center gap-2 text-xs text-slate-400 w-full text-left hover:text-slate-200 transition-colors py-0.5"
                    >
                      {hiddenCalendars.has(cal.id) ? (
                        <EyeOff size={10} className="text-slate-600" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cal.backgroundColor }} />
                      )}
                      <span className={hiddenCalendars.has(cal.id) ? "line-through text-slate-600" : ""}>{cal.summary}</span>
                      {cal.primary && <span className="text-[9px] text-slate-600">(hoved)</span>}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Color legend */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Helligdager (Spania)</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                  Nasjonal helligdag
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#f97316" }} />
                  Regional (Valencia/Alicante)
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
