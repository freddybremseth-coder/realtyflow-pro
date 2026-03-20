"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  type: "VIEWING" | "MEETING" | "CALL" | "post" | "campaign";
  date: string;
  time?: string;
  color: string;
}

const mockEvents: CalendarEvent[] = [
  { id: "1", title: "Visning - Villa Altea", type: "VIEWING", date: "2026-03-20", time: "10:00", color: "#06b6d4" },
  { id: "2", title: "Instagram post - Soleada", type: "post", date: "2026-03-20", time: "14:00", color: "#ec4899" },
  { id: "3", title: "Kundemøte - Erik H.", type: "MEETING", date: "2026-03-22", time: "11:00", color: "#f59e0b" },
  { id: "4", title: "LinkedIn kampanje launch", type: "campaign", date: "2026-03-24", color: "#3b82f6" },
  { id: "5", title: "Telefon - Maria S.", type: "CALL", date: "2026-03-25", time: "09:00", color: "#10b981" },
];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 1)); // March 2026

  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const numDays = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];

    // Adjust for Monday start (0=Mon..6=Sun)
    const startDay = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= numDays; i++) days.push(i);

    return days;
  }, [currentDate]);

  const monthName = currentDate.toLocaleDateString("no-NO", { month: "long", year: "numeric" });

  const getEventsForDay = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return mockEvents.filter((e) => e.date === dateStr);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <CalendarIcon className="text-primary-400" size={28} />
            Kalender
          </h1>
          <p className="text-sm text-slate-400 mt-1">Visninger, møter og planlagt innhold</p>
        </div>
        <Button>
          <Plus size={16} className="mr-2" />
          Ny hendelse
        </Button>
      </div>

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
          <div className="grid grid-cols-7 gap-px">
            {["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>
            ))}
            {daysInMonth.map((day, i) => {
              const events = day ? getEventsForDay(day) : [];
              const isToday = day === 20; // Mock today
              return (
                <div
                  key={i}
                  className={`min-h-[80px] p-1 border border-slate-800 rounded ${
                    day ? "bg-slate-800/30" : ""
                  } ${isToday ? "ring-1 ring-primary-400" : ""}`}
                >
                  {day && (
                    <>
                      <span className={`text-xs ${isToday ? "text-primary-400 font-bold" : "text-slate-400"}`}>
                        {day}
                      </span>
                      <div className="space-y-0.5 mt-1">
                        {events.map((ev) => (
                          <div
                            key={ev.id}
                            className="text-[10px] px-1 py-0.5 rounded truncate text-white"
                            style={{ backgroundColor: ev.color + "44", color: ev.color }}
                          >
                            {ev.time && <span className="opacity-70">{ev.time} </span>}
                            {ev.title}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Visning", color: "#06b6d4" },
          { label: "Møte", color: "#f59e0b" },
          { label: "Samtale", color: "#10b981" },
          { label: "Innlegg", color: "#ec4899" },
          { label: "Kampanje", color: "#3b82f6" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-slate-400">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
