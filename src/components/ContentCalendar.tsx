"use client"

import { useEffect, useState } from "react"
import { Calendar, momentLocalizer } from "react-big-calendar"
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop"
import moment from "moment"
import "react-big-calendar/lib/css/react-big-calendar.css"

const localizer = momentLocalizer(moment)
const DnDCalendar = withDragAndDrop(Calendar)

export default function ContentCalendar() {
  const [events, setEvents] = useState([])
  const [view, setView] = useState("week")

  // 🔹 Fetch events
  useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
    const start = new Date()
    const end = new Date()
    end.setMonth(end.getMonth() + 1)

    const res = await fetch(
      `/api/calendar?start=${start.toISOString()}&end=${end.toISOString()}`
    )

    const data = await res.json()

    const mapped = data.events.map((e: any) => ({
      id: e.id,
      title: e.summary,
      start: new Date(e.start),
      end: new Date(e.end),
    }))

    setEvents(mapped)
  }

  // 🔥 DRAG & DROP
  const handleEventDrop = async ({ event, start, end }: any) => {
    const updated = { ...event, start, end }

    // UI update
    setEvents(prev =>
      prev.map(e => (e.id === event.id ? updated : e))
    )

    // API update
    await fetch("/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        start,
        end,
      }),
    })
  }

  // 🔥 RESIZE
  const handleEventResize = async ({ event, start, end }: any) => {
    const updated = { ...event, start, end }

    setEvents(prev =>
      prev.map(e => (e.id === event.id ? updated : e))
    )

    await fetch("/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        start,
        end,
      }),
    })
  }

  return (
    <div style={{ height: "80vh" }}>
      <DnDCalendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        view={view}
        onView={setView}
        draggableAccessor={() => view !== "month"} // 🔥 FIX
        onEventDrop={handleEventDrop}
        onEventResize={handleEventResize}
        resizable
        selectable
      />
    </div>
  )
}
