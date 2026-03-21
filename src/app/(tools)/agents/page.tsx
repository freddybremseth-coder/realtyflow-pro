"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Bot, MessageSquare, Zap, Brain, Plus, Send, X } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  description: string;
  status: "active" | "idle";
  capabilities: string[];
  lastRun: string;
  color: string;
}

interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

const initialAgents: Agent[] = [
  {
    id: "marketing",
    name: "Marketing Agent",
    description: "Genererer kampanjer, sosiale medier-innlegg og markedsstrategier for alle brands.",
    status: "active",
    capabilities: ["Kampanjegenerering", "SoMe-innlegg", "E-postkopier", "A/B-testing"],
    lastRun: "12 min siden",
    color: "#ec4899",
  },
  {
    id: "sales",
    name: "Sales Agent",
    description: "Håndterer lead-scoring, oppfølging og salgsstrategier automatisk.",
    status: "active",
    capabilities: ["Lead-scoring", "Oppfølgingssekvenser", "Salgskopier", "CRM-oppdatering"],
    lastRun: "34 min siden",
    color: "#f59e0b",
  },
  {
    id: "seo",
    name: "SEO Agent",
    description: "Analyserer søkeord, optimaliserer innhold og bygger organisk synlighet.",
    status: "idle",
    capabilities: ["Søkeordanalyse", "On-page SEO", "Lenkestrategi", "Konkurrentanalyse"],
    lastRun: "2 timer siden",
    color: "#10b981",
  },
  {
    id: "business",
    name: "Business Agent",
    description: "Strategisk rådgivning, markedsanalyse og forretningsutvikling.",
    status: "idle",
    capabilities: ["Markedsanalyse", "Vekststrategi", "Partnerskap", "Budsjettoptimalisering"],
    lastRun: "5 timer siden",
    color: "#8b5cf6",
  },
  {
    id: "youtube",
    name: "YouTube Agent",
    description: "Lager manus, optimaliserer titler, thumbnails og YouTube-strategi.",
    status: "active",
    capabilities: ["Manusskrivning", "Titteloptimalisering", "Thumbnail-ideer", "Shorts-strategi"],
    lastRun: "1 time siden",
    color: "#ef4444",
  },
  {
    id: "multi-domain",
    name: "Multi-Domain Expert",
    description: "Tverrfaglig ekspert som koordinerer mellom eiendom, SaaS, landbruk og musikk.",
    status: "active",
    capabilities: ["Kryss-brand strategi", "Synergianalyse", "Ressursallokering", "Helhetlig planlegging"],
    lastRun: "20 min siden",
    color: "#3b82f6",
  },
  {
    id: "realty",
    name: "Realty Agent",
    description: "Spesialisert på eiendomsmarkedet i Spania - vurdering, prospekter og markedsdata.",
    status: "idle",
    capabilities: ["Eiendomsvurdering", "Markedsrapporter", "Prospektgenerering", "Prisanalyse"],
    lastRun: "3 timer siden",
    color: "#06b6d4",
  },
];

const mockResponses: Record<string, string[]> = {
  marketing: [
    "Jeg har analysert de siste kampanjene. Anbefaler å øke Instagram Reels-frekvensen med 40% for Soleada.",
    "Ny kampanjeidé: 'Solkysten venter' - en 3-ukers kampanje rettet mot norske pensjonister. Estimert rekkevidde: 15K.",
  ],
  sales: [
    "3 leads med score over 80 trenger oppfølging i dag. Jeg har satt opp e-postsekvenser.",
    "Konverteringsraten økte 12% forrige uke etter at vi justerte oppfølgingstidspunktet.",
  ],
  seo: [
    "Søkeordet 'bolig spania' har økt 23% i volum. Anbefaler ny bloggartikkel.",
    "Konkurrentanalyse viser at vi mangler innhold om 'bærekraftige hus costa blanca'.",
  ],
  business: [
    "Q1 viser 18% vekst totalt. Dona Anna har størst vekstpotensial med 45% margin.",
    "Anbefaler strategisk partnerskap med lokal bank for boliglånsformidling.",
  ],
  youtube: [
    "Trending tema: 'Flytte til Spania 2026' - anbefaler video innen 48 timer. Manus er klart.",
    "Siste Short fikk 12K visninger. Algoritmen favoriserer 45-60 sek formatet nå.",
  ],
  "multi-domain": [
    "Synergirapport: Soleada-leads som også følger Freddy Bremseth har 3x høyere konvertering.",
    "Neural Beat-innhold kan brukes som bakgrunnsmusikk i Soleada-videoer. Kryssmarkedsføring anbefalt.",
  ],
  realty: [
    "Markedsrapport: Prisene i Altea steg 8% siste kvartal. 14 nye eiendommer matcher våre kriterier.",
    "Vurdering utført: Villa i Moraira estimert til €485.000 basert på 12 sammenlignbare salg.",
  ],
};

export default function AgentsPage() {
  const [agents] = useState<Agent[]>(initialAgents);
  const [chatAgent, setChatAgent] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [chatInput, setChatInput] = useState("");
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: "", description: "", capabilities: "" });

  const totalAgents = agents.length;
  const activeTasks = agents.filter((a) => a.status === "active").length;
  const completedThisWeek = 23;

  const handleSendMessage = (agentId: string) => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: "user", text: chatInput };
    const responses = mockResponses[agentId] || ["Forstått. Jeg jobber med forespørselen din."];
    const agentMsg: ChatMessage = { role: "agent", text: responses[Math.floor(Math.random() * responses.length)] };
    setChatMessages((prev) => ({
      ...prev,
      [agentId]: [...(prev[agentId] || []), userMsg, agentMsg],
    }));
    setChatInput("");
  };

  const handleAddAgent = () => {
    if (!newAgent.name) return;
    setNewAgent({ name: "", description: "", capabilities: "" });
    setShowNewAgent(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Bot className="text-primary-400" size={28} />
            AI Agenter
          </h1>
          <p className="text-sm text-slate-400 mt-1">7 spesialiserte AI-agenter klare til bruk</p>
        </div>
        <Button onClick={() => setShowNewAgent(true)}>
          <Plus size={16} className="mr-2" />
          Foreslå ny agent
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Totalt agenter", value: totalAgents, icon: Bot },
          { label: "Aktive oppgaver", value: activeTasks, icon: Zap },
          { label: "Fullført denne uken", value: completedThisWeek, icon: Brain },
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

      {/* New Agent Modal */}
      {showNewAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNewAgent(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Foreslå ny agent</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowNewAgent(false)}>
                  <X size={18} />
                </Button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Navn *</label>
                  <Input placeholder="F.eks. PR Agent" value={newAgent.name} onChange={(e) => setNewAgent((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Beskrivelse</label>
                  <Input placeholder="Hva skal agenten gjøre?" value={newAgent.description} onChange={(e) => setNewAgent((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Kapabiliteter</label>
                  <textarea
                    placeholder="Liste over ting agenten kan gjøre, en per linje..."
                    value={newAgent.capabilities}
                    onChange={(e) => setNewAgent((p) => ({ ...p, capabilities: e.target.value }))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-24 resize-none"
                  />
                </div>
                <Button onClick={handleAddAgent} className="w-full" disabled={!newAgent.name}>
                  <Plus size={16} className="mr-1" />
                  Send forslag
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chat Modal */}
      {chatAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setChatAgent(null)}>
          <Card className="w-full max-w-xl mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare size={18} />
                  Chat med {agents.find((a) => a.id === chatAgent)?.name}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setChatAgent(null)}>
                  <X size={18} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-3 pb-3">
              {(chatMessages[chatAgent] || []).length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">Start en samtale med agenten...</p>
              )}
              {(chatMessages[chatAgent] || []).map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${msg.role === "user" ? "bg-primary-600 text-white" : "bg-slate-800 text-slate-200"}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </CardContent>
            <div className="p-4 border-t border-slate-700">
              <div className="flex gap-2">
                <Input
                  placeholder="Skriv en melding..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage(chatAgent)}
                />
                <Button onClick={() => handleSendMessage(chatAgent)} disabled={!chatInput.trim()}>
                  <Send size={16} />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <Card key={agent.id} className="hover:border-slate-500 transition-all">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: agent.color + "22", color: agent.color }}
                >
                  <Bot size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white text-sm">{agent.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant={agent.status === "active" ? "success" : "secondary"} className="text-[10px]">
                      {agent.status === "active" ? "Aktiv" : "Inaktiv"}
                    </Badge>
                    <span className="text-[10px] text-slate-500">{agent.lastRun}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-3">{agent.description}</p>
              <div className="flex flex-wrap gap-1 mb-4">
                {agent.capabilities.map((cap) => (
                  <Badge key={cap} variant="outline" className="text-[10px]">
                    {cap}
                  </Badge>
                ))}
              </div>
              <Button size="sm" className="w-full" onClick={() => setChatAgent(agent.id)}>
                <MessageSquare size={14} className="mr-1" />
                Chat med agent
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
