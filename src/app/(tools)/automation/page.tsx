"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Clock, CheckCircle, XCircle } from "lucide-react";

const logs = [
  { id: "1", action: "Neural Beat Pipeline", agent: "System", status: "success", time: "14:32", details: "Midnight Pulse processed and uploaded" },
  { id: "2", action: "Market Pulse Report", agent: "Marketing Agent", status: "success", time: "09:00", details: "Weekly Costa Blanca report generated" },
  { id: "3", action: "Social Sync", agent: "System", status: "failed", time: "08:45", details: "Instagram API rate limit hit" },
  { id: "4", action: "Lead Nurture Email", agent: "Sales Agent", status: "success", time: "08:00", details: "Follow-up sent to 3 leads" },
  { id: "5", action: "Airtable Sync", agent: "System", status: "success", time: "07:30", details: "12 new songs imported" },
];

export default function AutomationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Zap className="text-amber-400" size={28} />
          Automasjon
        </h1>
        <p className="text-sm text-slate-400 mt-1">Pipeline-historikk og automatiserte oppgaver</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Kjørt i dag", value: "12", icon: Zap },
          { label: "Vellykket", value: "10", icon: CheckCircle },
          { label: "Feilet", value: "2", icon: XCircle },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon size={24} className="text-slate-400" />
              <div>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock size={18} />
            Siste aktiviteter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg">
                {log.status === "success" ? (
                  <CheckCircle size={18} className="text-emerald-400 shrink-0" />
                ) : (
                  <XCircle size={18} className="text-red-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-200">{log.action}</p>
                    <Badge variant="secondary" className="text-[10px]">{log.agent}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{log.details}</p>
                </div>
                <span className="text-xs text-slate-500 shrink-0">{log.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
