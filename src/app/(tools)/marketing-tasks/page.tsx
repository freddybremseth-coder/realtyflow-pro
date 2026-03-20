"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Plus, GripVertical } from "lucide-react";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "REVIEW" | "DONE";

interface Task {
  id: string;
  title: string;
  platform: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: TaskStatus;
  dueDate?: string;
}

const initialTasks: Task[] = [
  { id: "1", title: "Skriv Instagram post - ny villa", platform: "Instagram", priority: "HIGH", status: "TO_DO", dueDate: "2026-03-22" },
  { id: "2", title: "LinkedIn artikkel - markedstrender", platform: "LinkedIn", priority: "MEDIUM", status: "IN_PROGRESS" },
  { id: "3", title: "Facebook kampanje - Dona Anna olje", platform: "Facebook", priority: "MEDIUM", status: "REVIEW" },
  { id: "4", title: "YouTube Short - eiendomstips", platform: "YouTube", priority: "LOW", status: "TO_DO" },
  { id: "5", title: "TikTok video - dag i livet", platform: "TikTok", priority: "LOW", status: "DONE" },
  { id: "6", title: "Email nyhetsbrev - Q1 oppsummering", platform: "Email", priority: "HIGH", status: "IN_PROGRESS" },
];

const columns: { key: TaskStatus; label: string; color: string }[] = [
  { key: "TO_DO", label: "Å gjøre", color: "text-slate-400" },
  { key: "IN_PROGRESS", label: "Pågår", color: "text-blue-400" },
  { key: "REVIEW", label: "Gjennomgang", color: "text-amber-400" },
  { key: "DONE", label: "Ferdig", color: "text-emerald-400" },
];

const priorityColors = { HIGH: "destructive" as const, MEDIUM: "warning" as const, LOW: "secondary" as const };

export default function MarketingTasksPage() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  const moveTask = (taskId: string, newStatus: TaskStatus) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <CheckSquare className="text-primary-400" size={28} />
            Marketing Tasks
          </h1>
          <p className="text-sm text-slate-400 mt-1">Kanban-board for markedsføringsoppgaver</p>
        </div>
        <Button>
          <Plus size={16} className="mr-2" />
          Ny oppgave
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className={`text-sm font-semibold ${col.color}`}>{col.label}</h3>
                <Badge variant="secondary" className="text-[10px]">{colTasks.length}</Badge>
              </div>
              <div className="space-y-2">
                {colTasks.map((task) => (
                  <Card key={task.id} className="cursor-grab">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <GripVertical size={14} className="text-slate-600 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 font-medium">{task.title}</p>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{task.platform}</Badge>
                            <Badge variant={priorityColors[task.priority]} className="text-[10px]">
                              {task.priority}
                            </Badge>
                          </div>
                          {task.dueDate && (
                            <p className="text-[10px] text-slate-500 mt-1">{task.dueDate}</p>
                          )}
                          {/* Quick move buttons */}
                          <div className="flex gap-1 mt-2">
                            {columns
                              .filter((c) => c.key !== task.status)
                              .map((c) => (
                                <button
                                  key={c.key}
                                  onClick={() => moveTask(task.id, c.key)}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                                >
                                  → {c.label}
                                </button>
                              ))}
                          </div>
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
