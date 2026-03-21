"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckSquare, Plus, GripVertical, X } from "lucide-react";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "REVIEW" | "DONE";
type TaskPriority = "HIGH" | "MEDIUM" | "LOW";

interface Task {
  id: string;
  title: string;
  description?: string;
  platform: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  brand?: string;
}

const initialTasks: Task[] = [
  { id: "1", title: "Skriv Instagram post - ny villa", description: "Lag engasjerende post med bilder av ny villa i Altea", platform: "Instagram", priority: "HIGH", status: "TO_DO", dueDate: "2026-03-22", brand: "Soleada" },
  { id: "2", title: "LinkedIn artikkel - markedstrender", description: "Skriv om Q1 2026 eiendomstrender Costa Blanca", platform: "LinkedIn", priority: "MEDIUM", status: "IN_PROGRESS", brand: "Freddy Bremseth" },
  { id: "3", title: "Facebook kampanje - Dona Anna olje", description: "Lanser vårkampanje for ny olivenolje-sesong", platform: "Facebook", priority: "MEDIUM", status: "REVIEW", brand: "Dona Anna" },
  { id: "4", title: "YouTube Short - eiendomstips", description: "3 tips for kjøp av bolig i Spania", platform: "YouTube", priority: "LOW", status: "TO_DO", brand: "Soleada" },
  { id: "5", title: "TikTok video - dag i livet", description: "En dag som eiendomsmegler i Spania", platform: "TikTok", priority: "LOW", status: "DONE", brand: "Freddy Bremseth" },
  { id: "6", title: "Email nyhetsbrev - Q1 oppsummering", description: "Kvartalsvis oppdatering til alle abonnenter", platform: "Email", priority: "HIGH", status: "IN_PROGRESS", brand: "Soleada" },
];

const cols: { key: TaskStatus; label: string; color: string }[] = [
  { key: "TO_DO", label: "Å gjøre", color: "text-slate-400" },
  { key: "IN_PROGRESS", label: "Pågår", color: "text-blue-400" },
  { key: "REVIEW", label: "Gjennomgang", color: "text-amber-400" },
  { key: "DONE", label: "Ferdig", color: "text-emerald-400" },
];

const priorityColors = { HIGH: "destructive" as const, MEDIUM: "warning" as const, LOW: "secondary" as const };
const platforms = ["Instagram", "Facebook", "LinkedIn", "YouTube", "TikTok", "Email", "Twitter", "Website"];

export default function MarketingTasksPage() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState({ title: "", description: "", platform: "Instagram", priority: "MEDIUM" as TaskPriority, dueDate: "", brand: "" });

  const moveTask = (taskId: string, newStatus: TaskStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
  };

  const handleDrop = (newStatus: TaskStatus) => {
    if (!draggedTask) return;
    moveTask(draggedTask, newStatus);
    setDraggedTask(null);
  };

  const addTask = () => {
    if (!newTask.title) return;
    const task: Task = {
      id: String(tasks.length + 1),
      title: newTask.title,
      description: newTask.description || undefined,
      platform: newTask.platform,
      priority: newTask.priority,
      status: "TO_DO",
      dueDate: newTask.dueDate || undefined,
      brand: newTask.brand || undefined,
    };
    setTasks((prev) => [task, ...prev]);
    setNewTask({ title: "", description: "", platform: "Instagram", priority: "MEDIUM", dueDate: "", brand: "" });
    setShowNew(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <CheckSquare className="text-primary-400" size={28} />
            Marketing Tasks
          </h1>
          <p className="text-sm text-slate-400 mt-1">Dra oppgaver mellom kolonnene eller bruk hurtigknappene</p>
        </div>
        <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-2" />Ny oppgave</Button>
      </div>

      {/* New Task Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNew(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Ny oppgave</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowNew(false)}><X size={18} /></Button>
              </div>
              <div className="space-y-3">
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Tittel *</label><Input placeholder="Oppgavetittel" value={newTask.title} onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Beskrivelse</label><textarea placeholder="Detaljer..." value={newTask.description} onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-20 resize-none" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">Plattform</label>
                    <select value={newTask.platform} onChange={(e) => setNewTask((p) => ({ ...p, platform: e.target.value }))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                      {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select></div>
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">Prioritet</label>
                    <select value={newTask.priority} onChange={(e) => setNewTask((p) => ({ ...p, priority: e.target.value as TaskPriority }))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                      <option value="HIGH">Høy</option><option value="MEDIUM">Medium</option><option value="LOW">Lav</option>
                    </select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">Frist</label><Input type="date" value={newTask.dueDate} onChange={(e) => setNewTask((p) => ({ ...p, dueDate: e.target.value }))} /></div>
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">Brand</label><Input placeholder="F.eks. Soleada" value={newTask.brand} onChange={(e) => setNewTask((p) => ({ ...p, brand: e.target.value }))} /></div>
                </div>
                <Button onClick={addTask} className="w-full" disabled={!newTask.title}><Plus size={16} className="mr-1" />Opprett oppgave</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedTask(null)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">{selectedTask.title}</h2>
                <Button variant="ghost" size="icon" onClick={() => setSelectedTask(null)}><X size={18} /></Button>
              </div>
              {selectedTask.description && <p className="text-sm text-slate-300 mb-4">{selectedTask.description}</p>}
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="outline">{selectedTask.platform}</Badge>
                <Badge variant={priorityColors[selectedTask.priority]}>{selectedTask.priority}</Badge>
                {selectedTask.brand && <Badge variant="secondary">{selectedTask.brand}</Badge>}
                {selectedTask.dueDate && <Badge variant="outline">Frist: {selectedTask.dueDate}</Badge>}
              </div>
              <p className="text-xs text-slate-400 mb-3">Flytt til:</p>
              <div className="grid grid-cols-2 gap-2">
                {cols.filter((c) => c.key !== selectedTask.status).map((c) => (
                  <Button key={c.key} variant="outline" size="sm" onClick={() => { moveTask(selectedTask.id, c.key); setSelectedTask({ ...selectedTask, status: c.key }); }}>
                    → {c.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Kanban Board with Drag & Drop */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cols.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(col.key)}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className={`text-sm font-semibold ${col.color}`}>{col.label}</h3>
                <Badge variant="secondary" className="text-[10px]">{colTasks.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[200px] rounded-lg bg-slate-900/30 border border-slate-700/20 p-2">
                {colTasks.map((task) => (
                  <Card key={task.id} draggable onDragStart={() => setDraggedTask(task.id)} onClick={() => setSelectedTask(task)} className="cursor-grab active:cursor-grabbing hover:border-slate-500 transition-all">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <GripVertical size={14} className="text-slate-600 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 font-medium">{task.title}</p>
                          {task.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</p>}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{task.platform}</Badge>
                            <Badge variant={priorityColors[task.priority]} className="text-[10px]">{task.priority}</Badge>
                            {task.brand && <Badge variant="secondary" className="text-[10px]">{task.brand}</Badge>}
                          </div>
                          {task.dueDate && <p className="text-[10px] text-slate-500 mt-1">Frist: {task.dueDate}</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
