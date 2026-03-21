"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X, Flag } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  time?: string;
  color: string;
  isHoliday?: boolean;
}

const spanishHolidays: CalendarEvent[] = [
  { id: "h01", title: "Ano Nuevo", type: "holiday", date: "2026-01-01", color: "#ef4444", isHoliday: true },
  { id: "h02", title: "Dia de Reyes", type: "holiday", date: "2026-01-06", color: "#ef4444", isHoliday: true },
  { id: "h03", title: "Dia de San Jose (Valencia)", type: "holiday", date: "2026-03-19", color: "#f97316", isHoliday: true },
  { id: "h04", title: "Jueves Santo", type: "holiday", date: "2026-04-02", color: "#ef4444", isHoliday: true },
  { id: "h05", title: "Viernes Santo", type: "holiday", date: "2026-04-03", color: "#ef4444", isHoliday: true },
  { id: "h06", title: "Lunes de Pascua (Valencia)", type: "holiday", date: "2026-04-06", color: "#f97316", isHoliday: true },
  { id: "h07", title: "Dia del Trabajo", type: "holiday", date: "2026-05-01", color: "#ef4444", isHoliday: true },
  { id: "h08", title: "Asuncion de la Virgen", type: "holiday", date: "2026-08-15", color: "#ef4444", isHoliday: true },
  { id: "h09", title: "Dia de la Hispanidad", type: "holiday", date: "2026-10-12", color: "#ef4444", isHoliday: true },
  { id: "h10", title: "Dia de Todos los Santos", type: "holiday", date: "2026-11-01", color: "#ef4444", isHoliday: true },
  { id: "h11", title: "Dia de la Constitucion", type: "holiday", date: "2026-12-06", color: "#ef4444", isHoliday: true },
  { id: "h12", title: "Inmaculada Concepcion", type: "holiday", date: "2026-12-08", color: "#ef4444", isHoliday: true },
  { id: "h13", title: "Navidad", type: "holiday", date: "2026-12-25", color: "#ef4444", isHoliday: true },
  { id: "h14", title: "Dia de la Comunidad Valenciana", type: "holiday", date: "2026-10-09", color: "#f97316", isHoliday: true },
  { id: "h15", title: "San Juan (Alicante)", type: "holiday", date: "2026-06-24", color: "#f97316", isHoliday: true },
];

const mockEvents: CalendarEvent[] = [
  { id: "1", title: "Visning - Villa Altea", type: "VIEWING", date: "2026-03-20", time: "10:00", color: "#06b6d4" },
  { id: "2", title: "Instagram post - Soleada", type: "post", date: "2026-03-20", time: "14:00", color: "#ec4899" },
  { id: "3", title: "Kundemote - Erik H.", type: "MEETING", date: "2026-03-22", time: "11:00", color: "#f59e0b" },
  { id: "4", title: "LinkedIn kampanje launch", type: "campaign", date: "2026-03-24", color: "#3b82f6" },
  { id: "5", title: "Telefon - Maria S.", type: "CALL", date: "2026-03-25", time: "09:00", color: "#10b981" },
];

const typeColors: Record<string, string> = {
  VIEWING: "#06b6d4", MEETING: "#f59e0b", CALL: "#10b981", post: "#ec4899", campaign: "#3b82f6", holiday: "#ef4444",
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 1));
  const [showNew, setShowNew] = useState(false);
  const [events, setEvents] = useState([...spanishHolidays, ...mockEvents]);
  const [newEv, setNewEv] = useState({ title: "", type: "MEETING", date: "", time: "" });
  const [selectedDay, setSelectedDay] = useState<number | null>(20);

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

  const monthName = currentDate.toLocaleDateString("no-NO", { month: "long", year: "numeric" });
  const getEvts = (day: number) => {
    const ds = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => e.date === ds);
  };
  const today = new Date();
  const isTdy = (d: number) => currentDate.getFullYear() === today.getFullYear() && currentDate.getMonth() === today.getMonth() && d === today.getDate();

  const addEv = () => {
    if (!newEv.title || !newEv.date) return;
    setEvents((p) => [...p, { id: `e${Date.now()}`, title: newEv.title, type: newEv.type, date: newEv.date, time: newEv.time || undefined, color: typeColors[newEv.type] || "#06b6d4" }]);
    setNewEv({ title: "", type: "MEETING", date: "", time: "" });
    setShowNew(false);
  };

  const dayEvts = selectedDay ? getEvts(selectedDay) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3"><CalendarIcon className="text-primary-400" size={28} />Kalender</h1>
          <p className="text-sm text-slate-400 mt-1">Visninger, moter, innhold og spanske helligdager</p>
        </div>
        <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-2" />Ny hendelse</Button>
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNew(false)}>
          <Card className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold text-white">Ny hendelse</h2><Button variant="ghost" size="icon" onClick={() => setShowNew(false)}><X size={18} /></Button></div>
              <div className="space-y-3">
                <Input placeholder="Tittel *" value={newEv.title} onChange={(e) => setNewEv((p) => ({ ...p, title: e.target.value }))} />
                <select value={newEv.type} onChange={(e) => setNewEv((p) => ({ ...p, type: e.target.value }))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                  <option value="VIEWING">Visning</option><option value="MEETING">Mote</option><option value="CALL">Samtale</option><option value="post">Innlegg</option><option value="campaign">Kampanje</option>
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="date" value={newEv.date} onChange={(e) => setNewEv((p) => ({ ...p, date: e.target.value }))} />
                  <Input type="time" value={newEv.time} onChange={(e) => setNewEv((p) => ({ ...p, time: e.target.value }))} />
                </div>
                <Button onClick={addEv} className="w-full" disabled={!newEv.title || !newEv.date}><Plus size={16} className="mr-1" />Opprett</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader><div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}><ChevronLeft size={18} /></Button>
              <CardTitle className="capitalize">{monthName}</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}><ChevronRight size={18} /></Button>
            </div></CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px">
                {["Ma", "Ti", "On", "To", "Fr", "Lo", "So"].map((d) => (<div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>))}
                {daysInMonth.map((day, i) => {
                  const evts = day ? getEvts(day) : [];
                  const hasH = evts.some((e) => e.isHoliday);
                  return (
                    <div key={i} onClick={() => day && setSelectedDay(day)} className={`min-h-[80px] p-1 border border-slate-800 rounded cursor-pointer transition-colors ${day ? "bg-slate-800/30 hover:bg-slate-800/60" : ""} ${isTdy(day || 0) ? "ring-1 ring-primary-400" : ""} ${selectedDay === day ? "ring-1 ring-amber-400" : ""} ${hasH ? "bg-red-900/10" : ""}`}>
                      {day && (<>
                        <div className="flex items-center gap-1"><span className={`text-xs ${isTdy(day) ? "text-primary-400 font-bold" : "text-slate-400"}`}>{day}</span>{hasH && <Flag size={8} className="text-red-400" />}</div>
                        <div className="space-y-0.5 mt-1">
                          {evts.slice(0, 2).map((ev) => (<div key={ev.id} className="text-[10px] px-1 py-0.5 rounded truncate" style={{ backgroundColor: ev.color + "33", color: ev.color }}>{ev.time && <span className="opacity-70">{ev.time} </span>}{ev.title}</div>))}
                          {evts.length > 2 && <p className="text-[9px] text-slate-500">+{evts.length - 2} til</p>}
                        </div>
                      </>)}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-6">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{selectedDay ? `${selectedDay}. ${currentDate.toLocaleDateString("no-NO", { month: "long" })}` : "Velg en dag"}</CardTitle></CardHeader>
            <CardContent>
              {selectedDay && dayEvts.length > 0 ? (
                <div className="space-y-2">{dayEvts.map((ev) => (
                  <div key={ev.id} className={`p-3 rounded-lg border ${ev.isHoliday ? "bg-red-900/10 border-red-500/20" : "bg-slate-900/30 border-slate-700/30"}`}>
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: ev.color }} /><span className="text-sm font-medium text-slate-200">{ev.title}</span></div>
                    {ev.time && <p className="text-xs text-slate-400 ml-4 mt-1">{ev.time}</p>}
                    {ev.isHoliday && <Badge variant="destructive" className="text-[10px] ml-4 mt-1">Helligdag</Badge>}
                  </div>
                ))}</div>
              ) : (<p className="text-sm text-slate-500">{selectedDay ? "Ingen hendelser" : "Klikk pa en dag"}</p>)}
            </CardContent>
          </Card>
          <Card className="mt-4"><CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Fargeforklaring</p>
            <div className="space-y-1.5">
              {[{ l: "Visning", c: "#06b6d4" }, { l: "Mote", c: "#f59e0b" }, { l: "Samtale", c: "#10b981" }, { l: "Innlegg", c: "#ec4899" }, { l: "Kampanje", c: "#3b82f6" }, { l: "Helligdag (ES)", c: "#ef4444" }, { l: "Regional (Valencia)", c: "#f97316" }].map((item) => (
                <div key={item.l} className="flex items-center gap-2 text-xs text-slate-400"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.c }} />{item.l}</div>
              ))}
            </div>
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}
