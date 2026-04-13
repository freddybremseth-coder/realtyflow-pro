"use client";

import { useEffect, useState } from "react";
import { Calendar, momentLocalizer, View, SlotInfo } from "react-big-calendar";
import withDragAndDrop, { EventInteractionArgs } from "react-big-calendar/lib/addons/dragAndDrop";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(Calendar);

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
}

export default function ContentCalendar() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [view, setView] = useState<View>("week");

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    const start = new Date();
    const end = new Date();
    end.setMonth(end.getMonth() + 1);

    try {
      const res = await fetch(
        `/api/calendar?start=${start.toISOString()}&end=${end.toISOString()}`
      );
      const data = await res.json();
      if (!data.events) return;
      const mapped: CalEvent[] = data.events.map((e: Record<string, string>) => ({
        id: e.id,
        title: e.summary || "Uten tittel",
        start: new Date(e.start),
        end: new Date(e.end),
      }));
      setEvents(mapped);
    } catch {
      // Calendar not connected — show empty
    }
  };

  const handleEventDrop = async ({ event, start, end }: EventInteractionArgs<CalEvent>) => {
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    setEvents((prev) =>
      prev.map((e) => (e.id === event.id ? { ...e, start: startDate, end: endDate } : e))
    );
    await fetch("/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id, start: startDate, end: endDate }),
    });
  };

  const handleEventResize = async ({ event, start, end }: EventInteractionArgs<CalEvent>) => {
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    setEvents((prev) =>
      prev.map((e) => (e.id === event.id ? { ...e, start: startDate, end: endDate } : e))
    );
    await fetch("/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id, start: startDate, end: endDate }),
    });
  };

  const handleSelectSlot = async ({ start, end }: SlotInfo) => {
    const title = window.prompt("Tittel på hendelse:");
    if (!title) return;
    const res = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, start, end }),
    });
    const data = await res.json();
    if (data.id) {
      setEvents((prev) => [...prev, { id: data.id, title, start: new Date(start), end: new Date(end) }]);
    }
  };

  return (
    <div style={{ height: "80vh" }} className="text-slate-900">
      <DnDCalendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        view={view}
        onView={setView}
        draggableAccessor={() => view !== "month"}
        onEventDrop={handleEventDrop as (args: unknown) => void}
        onEventResize={handleEventResize as (args: unknown) => void}
        onSelectSlot={handleSelectSlot}
        resizable
        selectable
      />
    </div>
  );
}
