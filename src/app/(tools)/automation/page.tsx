"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Zap, Play, Pause, Plus, Clock, CheckCircle, AlertCircle, X } from "lucide-react";

interface Automation {
  id: string;
  name: string;
  trigger: string;
  action: string;
  status: "active" | "paused";
  lastTriggered: string;
}

interface LogEntry {
  id: string;
  automation: string;
  status: "success" | "error";
  time: string;
  details: string;
}

const initialAutomations: Automation[] = [
  { id: "1", name: "Ny lead → Send velkomst-epost", trigger: "Ny lead opprettet", action: "Send e-post via Resend", status: "active", lastTriggered: "12 min siden" },
  { id: "2", name: "Listing publisert → Generer SoMe-innlegg", trigger: "Ny eiendom lagt til", action: "Generer og publiser SoMe-innlegg", status: "active", lastTriggered: "2 timer siden" },
  { id: "3", name: "Lead score > 80 → Varsle salgsagent", trigger: "Lead score oppdatert", action: "Send varsling til Sales Agent", status: "active", lastTriggered: "45 min siden" },
  { id: "4", name: "Ny YouTube-video → Post til sosiale medier", trigger: "YouTube-video publisert", action: "Del på Facebook, LinkedIn, Instagram", status: "paused", lastTriggered: "1 dag siden" },
  { id: "5", name: "Ukentlig → Generer markedsrapport", trigger: "Hver mandag kl. 08:00", action: "Generer og send markedsrapport", status: "active", lastTriggered: "3 dager siden" },
];

const executionLog: LogEntry[] = [
  { id: "1", automation: "Ny lead → Send velkomst-epost", status: "success", time: "14:32", details: "Velkomst-epost sendt til erik.hansen@gmail.com" },
  { id: "2", automation: "Lead score > 80 → Varsle salgsagent", status: "success", time: "13:45", details: "Sales Agent varslet om lead #142 (score: 87)" },
  { id: "3", automation: "Listing publisert → Generer SoMe-innlegg", status: "success", time: "12:10", details: "Instagram, Facebook og LinkedIn-innlegg generert for Villa Altea" },
  { id: "4", automation: "Ny YouTube-video → Post til sosiale medier", status: "error", time: "11:30", details: "Facebook API feil: Rate limit overskredet" },
  { id: "5", automation: "Ukentlig → Generer markedsrapport", status: "success", time: "08:00", details: "Markedsrapport Q1 uke 12 sendt til 3 mottakere" },
  { id: "6", automation: "Ny lead → Send velkomst-epost", status: "success", time: "07:22", details: "Velkomst-epost sendt til maria.berg@outlook.com" },
];

const triggerTypes = ["Ny lead opprettet", "Ny eiendom lagt til", "Lead score oppdatert", "YouTube-video publisert", "Tidsbasert (cron)", "Manuell"];
const actionTypes = ["Send e-post via Resend", "Generer SoMe-innlegg", "Send varsling til agent", "Del på sosiale medier", "Generer rapport", "Oppdater CRM"];

export default function AutomationPage() {
  const [automations, setAutomations] = useState<Automation[]>(initialAutomations);
  const [showNew, setShowNew] = useState(false);
  const [newAuto, setNewAuto] = useState({ name: "", trigger: triggerTypes[0], action: actionTypes[0], conditions: "" });

  const toggleStatus = (id: string) => {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: a.status === "active" ? "paused" : "active" } : a))
    );
  };

  const handleAdd = () => {
    if (!newAuto.name) return;
    const auto: Automation = {
      id: String(automations.length + 1),
      name: newAuto.name,
      trigger: newAuto.trigger,
      action: newAuto.action,
      status: "paused",
      lastTriggered: "Aldri",
    };
    setAutomations((prev) => [auto, ...prev]);
    setNewAuto({ name: "", trigger: triggerTypes[0], action: actionTypes[0], conditions: "" });
    setShowNew(false);
  };

  const activeCount = automations.filter((a) => a.status === "active").length;
  const successCount = executionLog.filter((l) => l.status === "success").length;
  const errorCount = executionLog.filter((l) => l.status === "error").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Zap className="text-amber-400" size={28} />
            Automasjon
          </h1>
          <p className="text-sm text-slate-400 mt-1">Automatiser arbeidsflyter mellom verktøy og agenter</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} className="mr-2" />
          Ny automasjon
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Aktive regler", value: activeCount, icon: Play, color: "text-emerald-400" },
          { label: "Vellykket i dag", value: successCount, icon: CheckCircle, color: "text-emerald-400" },
          { label: "Feilet i dag", value: errorCount, icon: AlertCircle, color: "text-red-400" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon size={24} className={stat.color} />
              <div>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New Automation Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNew(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Ny automasjon</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowNew(false)}>
                  <X size={18} />
                </Button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Navn *</label>
                  <Input placeholder="F.eks. Ny lead → Send velkomst" value={newAuto.name} onChange={(e) => setNewAuto((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Trigger</label>
                  <select value={newAuto.trigger} onChange={(e) => setNewAuto((p) => ({ ...p, trigger: e.target.value }))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    {triggerTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Handling</label>
                  <select value={newAuto.action} onChange={(e) => setNewAuto((p) => ({ ...p, action: e.target.value }))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    {actionTypes.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Betingelser (valgfritt)</label>
                  <textarea
                    placeholder="F.eks. Kun for brand Soleada, eller lead score > 50..."
                    value={newAuto.conditions}
                    onChange={(e) => setNewAuto((p) => ({ ...p, conditions: e.target.value }))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-20 resize-none"
                  />
                </div>
                <Button onClick={handleAdd} className="w-full" disabled={!newAuto.name}>
                  <Plus size={16} className="mr-1" />
                  Opprett automasjon
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Automation Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap size={18} />
            Automasjonsregler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {automations.map((auto) => (
            <div key={auto.id} className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-lg">
              <button
                onClick={() => toggleStatus(auto.id)}
                className={`w-12 h-6 rounded-full relative transition-colors ${auto.status === "active" ? "bg-emerald-500" : "bg-slate-600"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${auto.status === "active" ? "left-6" : "left-0.5"}`} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-slate-200">{auto.name}</p>
                  <Badge variant={auto.status === "active" ? "success" : "secondary"} className="text-[10px]">
                    {auto.status === "active" ? "Aktiv" : "Pauset"}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>Trigger: {auto.trigger}</span>
                  <span>|</span>
                  <span>Handling: {auto.action}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                <Clock size={12} />
                {auto.lastTriggered}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Execution Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock size={18} />
            Kjøringslogg
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {executionLog.map((log) => (
            <div key={log.id} className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg">
              {log.status === "success" ? (
                <CheckCircle size={18} className="text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle size={18} className="text-red-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200">{log.automation}</p>
                <p className="text-xs text-slate-500 truncate">{log.details}</p>
              </div>
              <span className="text-xs text-slate-500 shrink-0">{log.time}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
