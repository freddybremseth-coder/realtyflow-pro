"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckSquare, Plus, GripVertical, X, Loader2, AlertTriangle } from "lucide-react";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "REVIEW" | "DONE";
type TaskPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

interface Task {
  id: string;
  title: string;
  description?: string;
  platform: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  brand?: string;
  sourceType?: string;
  nextAction?: string;
  aiScore?: number;
  synthetic?: boolean;
}

const cols: { key: TaskStatus; label: string; color: string }[] = [
  { key: "TO_DO", label: "Å gjøre", color: "text-slate-400" },
  { key: "IN_PROGRESS", label: "Pågår", color: "text-blue-400" },
  { key: "REVIEW", label: "Gjennomgang", color: "text-amber-400" },
  { key: "DONE", label: "Ferdig", color: "text-emerald-400" },
];

const priorityColors = { CRITICAL: "destructive" as const, HIGH: "destructive" as const, MEDIUM: "warning" as const, LOW: "secondary" as const };
const platforms = ["Instagram", "Facebook", "LinkedIn", "YouTube", "TikTok", "Email", "Twitter", "Website"];

function mapWorkItem(item: any): Task {
  return {
    id: item.id,
    title: item.title,
    description: item.description || undefined,
    platform: item.assigned_agent || item.metadata?.platform || item.source_type || "HUB",
    priority: item.priority || "MEDIUM",
    status: ["TO_DO", "IN_PROGRESS", "REVIEW", "DONE"].includes(item.status) ? item.status : "TO_DO",
    dueDate: item.due_date || undefined,
    brand: item.brand_id || undefined,
    sourceType: item.source_type,
    nextAction: item.next_action || undefined,
    aiScore: item.ai_score || 0,
    synthetic: Boolean(item.metadata?.synthetic || String(item.id).includes("-")),
  };
}

export default function MarketingTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState({ title: "", description: "", platform: "Instagram", priority: "MEDIUM" as TaskPriority, dueDate: "", brand: "" });
  const [loading, setLoading] = useState(true);
  const [tableNotReady, setTableNotReady] = useState(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/work-items?limit=100");
      const data = await res.json();
      setTasks((data.work_items || []).map(mapWorkItem));
      setTableNotReady(Boolean(data.tableNotReady));
    } catch (err) {
      console.error("Failed to load work items:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const moveTask = async (taskId: string, newStatus: TaskStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    try {
      const res = await fetch("/api/work-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      if (!res.ok) await loadTasks();
    } catch {
      await loadTasks();
    }
  };

  const handleDrop = (newStatus: TaskStatus) => {
    if (!draggedTask) return;
    moveTask(draggedTask, newStatus);
    setDraggedTask(null);
  };

  const addTask = async () => {
    if (!newTask.title) return;
    try {
      const res = await fetch("/api/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTask.title,
          description: newTask.description,
          assigned_agent: newTask.platform,
          platform: newTask.platform,
          priority: newTask.priority,
          due_date: newTask.dueDate || null,
          brand_id: newTask.brand || null,
          source_type: "manual",
          ai_score: newTask.priority === "CRITICAL" ? 95 : newTask.priority === "HIGH" ? 80 : newTask.priority === "MEDIUM" ? 50 : 25,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks((prev) => [mapWorkItem(data.work_item), ...prev]);
        setNewTask({ title: "", description: "", platform: "Instagram", priority: "MEDIUM", dueDate: "", brand: "" });
        setShowNew(false);
        setTableNotReady(false);
      }
    } catch (err) {
      console.error("Failed to create work item:", err);
    }
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

      {tableNotReady && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Viser prioriteringer generert fra CRM, publiseringsfeil og automasjonsfeil. Kjør migrasjonen `20260501090000_work_items_hub.sql` for å lagre manuelle oppgaver permanent.</span>
        </div>
      )}

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
                      <option value="CRITICAL">Kritisk</option><option value="HIGH">Høy</option><option value="MEDIUM">Medium</option><option value="LOW">Lav</option>
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
                  <Button key={c.key} variant="outline" size="sm" onClick={() => { void moveTask(selectedTask.id, c.key); setSelectedTask({ ...selectedTask, status: c.key }); }}>
                    → {c.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Kanban Board with Drag & Drop */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      ) : (
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
                            {task.sourceType && <Badge variant="outline" className="text-[10px]">{task.sourceType}</Badge>}
                            {task.aiScore ? <Badge variant="secondary" className="text-[10px]">{task.aiScore}/100</Badge> : null}
                          </div>
                          {task.nextAction && <p className="text-[10px] text-cyan-300 mt-1">{task.nextAction}</p>}
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
      )}
    </div>
  );
}
