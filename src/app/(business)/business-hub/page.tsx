"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Briefcase, Database, Bot, Link, CheckCircle, XCircle, RefreshCw, X } from "lucide-react";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: "database" | "bot" | "link";
  status: "connected" | "disconnected";
  lastSync: string;
  dataCount: string;
  color: string;
}

const initialIntegrations: Integration[] = [
  { id: "supabase", name: "Supabase", description: "PostgreSQL-database for leads, eiendommer og innhold", icon: "database", status: "connected", lastSync: "5 min siden", dataCount: "2,847 rader", color: "#3ecf8e" },
  { id: "claude", name: "Claude AI", description: "AI-agenter for innhold, analyse og automatisering", icon: "bot", status: "connected", lastSync: "Aktiv nå", dataCount: "7 agenter", color: "#d4a574" },
  { id: "gemini", name: "Gemini", description: "Bildegenerering og eiendomsvurdering med Google AI", icon: "bot", status: "connected", lastSync: "1 time siden", dataCount: "142 bilder", color: "#4285f4" },
  { id: "youtube", name: "YouTube API", description: "Videohåndtering, analytics og automatisk publisering", icon: "link", status: "connected", lastSync: "30 min siden", dataCount: "24 videoer", color: "#ff0000" },
  { id: "facebook", name: "Facebook API", description: "Side-administrasjon, annonser og innlegg", icon: "link", status: "disconnected", lastSync: "3 dager siden", dataCount: "89 innlegg", color: "#1877f2" },
  { id: "linkedin", name: "LinkedIn API", description: "Profesjonell nettverking og innholdspublisering", icon: "link", status: "connected", lastSync: "2 timer siden", dataCount: "56 innlegg", color: "#0a66c2" },
  { id: "resend", name: "Resend", description: "Transaksjonell e-post og nyhetsbrev", icon: "link", status: "connected", lastSync: "15 min siden", dataCount: "1,203 e-poster", color: "#000000" },
  { id: "airtable", name: "Airtable (Neural Beat)", description: "Musikkbibliotek og produksjonsdata for Neural Beat", icon: "database", status: "connected", lastSync: "45 min siden", dataCount: "312 spor", color: "#18bfff" },
];

const iconMap = {
  database: Database,
  bot: Bot,
  link: Link,
};

export default function BusinessHubPage() {
  const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrations);
  const [testing, setTesting] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [newConnection, setNewConnection] = useState({ name: "", apiKey: "", endpoint: "" });

  const connectedCount = integrations.filter((i) => i.status === "connected").length;
  const disconnectedCount = integrations.filter((i) => i.status === "disconnected").length;

  const handleTestConnection = async (id: string) => {
    setTesting(id);
    await new Promise((r) => setTimeout(r, 1500));
    setIntegrations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "connected", lastSync: "Akkurat nå" } : i))
    );
    setTesting(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Briefcase className="text-primary-400" size={28} />
            Business Hub
          </h1>
          <p className="text-sm text-slate-400 mt-1">Oversikt over alle tilkoblinger og integrasjoner</p>
        </div>
        <Button onClick={() => { setShowSetup(true); setSetupStep(0); }}>
          <Link size={16} className="mr-2" />
          Ny tilkobling
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Tilkoblede", value: connectedCount, icon: CheckCircle, color: "text-emerald-400" },
          { label: "Frakoblede", value: disconnectedCount, icon: XCircle, color: "text-red-400" },
          { label: "Totalt integrasjoner", value: integrations.length, icon: Link, color: "text-slate-400" },
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

      {/* Setup Wizard Modal */}
      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowSetup(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Ny tilkobling - Steg {setupStep + 1}/3</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowSetup(false)}><X size={18} /></Button>
              </div>
              {setupStep === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300">Velg tjenestetype eller skriv inn navnet på integrasjonen.</p>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Tjenestenavn *</label>
                    <Input placeholder="F.eks. Stripe, Zapier, Custom API..." value={newConnection.name} onChange={(e) => setNewConnection((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <Button onClick={() => setSetupStep(1)} disabled={!newConnection.name} className="w-full">Neste</Button>
                </div>
              )}
              {setupStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300">Legg inn API-nøkkel og endepunkt for {newConnection.name}.</p>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">API-nøkkel</label>
                    <Input type="password" placeholder="sk_live_..." value={newConnection.apiKey} onChange={(e) => setNewConnection((p) => ({ ...p, apiKey: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Endepunkt (URL)</label>
                    <Input placeholder="https://api.example.com/v1" value={newConnection.endpoint} onChange={(e) => setNewConnection((p) => ({ ...p, endpoint: e.target.value }))} />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSetupStep(0)} className="flex-1">Tilbake</Button>
                    <Button onClick={() => setSetupStep(2)} className="flex-1">Neste</Button>
                  </div>
                </div>
              )}
              {setupStep === 2 && (
                <div className="space-y-3">
                  <div className="bg-slate-800 rounded-lg p-4 space-y-2">
                    <p className="text-sm text-slate-300"><span className="text-slate-500">Tjeneste:</span> {newConnection.name}</p>
                    <p className="text-sm text-slate-300"><span className="text-slate-500">API-nøkkel:</span> {newConnection.apiKey ? "••••••••" : "Ikke satt"}</p>
                    <p className="text-sm text-slate-300"><span className="text-slate-500">Endepunkt:</span> {newConnection.endpoint || "Standard"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSetupStep(1)} className="flex-1">Tilbake</Button>
                    <Button onClick={() => { setShowSetup(false); setNewConnection({ name: "", apiKey: "", endpoint: "" }); }} className="flex-1">
                      <CheckCircle size={16} className="mr-1" />
                      Fullfør
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {integrations.map((integration) => {
          const IconComponent = iconMap[integration.icon];
          const isTesting = testing === integration.id;
          return (
            <Card key={integration.id} className="hover:border-slate-500 transition-all">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: integration.color + "22", color: integration.color }}
                  >
                    <IconComponent size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-sm">{integration.name}</h3>
                    <Badge
                      variant={integration.status === "connected" ? "success" : "destructive"}
                      className="text-[10px] mt-0.5"
                    >
                      {integration.status === "connected" ? "Tilkoblet" : "Frakoblet"}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-3">{integration.description}</p>
                <div className="space-y-1 mb-3 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Siste synk:</span>
                    <span className="text-slate-300">{integration.lastSync}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Data:</span>
                    <span className="text-slate-300">{integration.dataCount}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleTestConnection(integration.id)}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <RefreshCw size={14} className="mr-1 animate-spin" />
                  ) : (
                    <RefreshCw size={14} className="mr-1" />
                  )}
                  {isTesting ? "Tester..." : "Test tilkobling"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
