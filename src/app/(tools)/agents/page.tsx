"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Bot, Send, Loader2, Sparkles } from "lucide-react";

const agents = [
  { id: "marketing", name: "Alex Marketing Pro", role: "Marketing Strategist", color: "#ec4899", expertise: ["viral content", "social media", "campaigns"] },
  { id: "sales", name: "Jordan Sales Master", role: "Sales & Conversion", color: "#f59e0b", expertise: ["sales copy", "funnels", "conversion"] },
  { id: "seo", name: "Sam SEO Expert", role: "SEO & Organic Growth", color: "#10b981", expertise: ["keywords", "on-page SEO", "link building"] },
  { id: "business", name: "Morgan Business Strategist", role: "Business Strategy", color: "#8b5cf6", expertise: ["growth", "positioning", "partnerships"] },
  { id: "multi-domain", name: "Freddy Business Navigator", role: "Multi-Domain Expert", color: "#3b82f6", expertise: ["real estate", "SaaS", "agriculture", "personal brand", "music"] },
  { id: "youtube", name: "Nova YouTube Creator", role: "YouTube Content & Growth", color: "#ef4444", expertise: ["scripts", "SEO", "thumbnails", "Shorts"] },
];

export default function AgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleExecute = async () => {
    if (!selectedAgent || !command.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: selectedAgent, command }),
      });
      const data = await res.json();
      setResult(data.result || data.output || "Kommando utført.");
    } catch {
      setResult("Feil ved utføring. Sjekk API-konfigurasjon.");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Bot className="text-primary-400" size={28} />
          AI Agenter
        </h1>
        <p className="text-sm text-slate-400 mt-1">6 spesialiserte Claude-agenter klar til bruk</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <Card
            key={agent.id}
            className={`cursor-pointer transition-all ${
              selectedAgent === agent.id ? "ring-2" : ""
            }`}
            style={selectedAgent === agent.id ? { borderColor: agent.color } : {}}
            onClick={() => setSelectedAgent(agent.id)}
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: agent.color + "22", color: agent.color }}
                >
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">{agent.name}</h3>
                  <p className="text-xs text-slate-400">{agent.role}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-3">
                {agent.expertise.map((e) => (
                  <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>
                ))}
              </div>
              <Badge
                variant="success"
                className="mt-3 text-[10px]"
              >
                Online
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Command Input */}
      <Card>
        <CardHeader>
          <CardTitle>Utfør kommando</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder={selectedAgent ? `Skriv kommando til ${agents.find(a => a.id === selectedAgent)?.name}...` : "Velg en agent først..."}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={!selectedAgent}
              onKeyDown={(e) => e.key === "Enter" && handleExecute()}
            />
            <Button onClick={handleExecute} disabled={loading || !selectedAgent || !command.trim()}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </div>

          {result && (
            <div className="mt-4 bg-slate-800 rounded-lg p-4 text-sm text-slate-200 whitespace-pre-wrap animate-fade-in">
              {result}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
