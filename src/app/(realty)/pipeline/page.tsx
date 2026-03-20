"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users, Mail, DollarSign, Search, Plus, GripVertical,
  ThumbsUp, ThumbsDown, Minus, Phone, Globe,
} from "lucide-react";

type LeadStatus = "NEW" | "CONTACT" | "QUALIFIED" | "VIEWING" | "NEGOTIATION" | "WON" | "LOST";

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  budget: string;
  source: string;
  sentiment: number;
  status: LeadStatus;
  property?: string;
  notes?: string;
  createdAt: string;
}

const columns: { key: LeadStatus; label: string; color: string }[] = [
  { key: "NEW", label: "Ny", color: "bg-blue-500" },
  { key: "CONTACT", label: "Kontaktet", color: "bg-indigo-500" },
  { key: "QUALIFIED", label: "Kvalifisert", color: "bg-purple-500" },
  { key: "VIEWING", label: "Visning", color: "bg-amber-500" },
  { key: "NEGOTIATION", label: "Forhandling", color: "bg-orange-500" },
  { key: "WON", label: "Vunnet", color: "bg-emerald-500" },
  { key: "LOST", label: "Tapt", color: "bg-red-500" },
];

const initialLeads: Lead[] = [
  {
    id: "L001",
    name: "Erik Hansen",
    email: "erik.hansen@gmail.com",
    phone: "+47 912 34 567",
    budget: "€350 000",
    source: "Facebook",
    sentiment: 85,
    status: "NEW",
    property: "Villa i Altea",
    createdAt: "2024-03-14",
  },
  {
    id: "L002",
    name: "Maria Solberg",
    email: "maria.s@outlook.no",
    phone: "+47 934 56 789",
    budget: "€280 000",
    source: "Soleada.no",
    sentiment: 72,
    status: "NEW",
    property: "Leilighet i Benidorm",
    createdAt: "2024-03-13",
  },
  {
    id: "L003",
    name: "Knut Eriksen",
    email: "knut.e@yahoo.no",
    phone: "+47 956 78 901",
    budget: "€450 000",
    source: "Google Ads",
    sentiment: 90,
    status: "CONTACT",
    property: "Penthouse Alicante",
    createdAt: "2024-03-10",
  },
  {
    id: "L004",
    name: "Ingrid Pedersen",
    email: "ingrid.p@hotmail.com",
    phone: "+47 978 90 123",
    budget: "€200 000",
    source: "Instagram",
    sentiment: 60,
    status: "QUALIFIED",
    property: "Rekkehus i Torrevieja",
    createdAt: "2024-03-08",
  },
  {
    id: "L005",
    name: "Ole Andersen",
    email: "ole.a@gmail.com",
    phone: "+47 990 12 345",
    budget: "€520 000",
    source: "Henvisning",
    sentiment: 95,
    status: "VIEWING",
    property: "Luksusvilla Jávea",
    createdAt: "2024-03-05",
  },
  {
    id: "L006",
    name: "Astrid Johansen",
    email: "astrid.j@icloud.com",
    phone: "+47 412 34 567",
    budget: "€310 000",
    source: "YouTube",
    sentiment: 78,
    status: "VIEWING",
    property: "Bungalow i La Nucia",
    createdAt: "2024-03-03",
  },
  {
    id: "L007",
    name: "Lars Kristiansen",
    email: "lars.k@online.no",
    phone: "+47 434 56 789",
    budget: "€600 000",
    source: "LinkedIn",
    sentiment: 88,
    status: "NEGOTIATION",
    property: "Villa med havutsikt, Moraira",
    createdAt: "2024-02-28",
  },
  {
    id: "L008",
    name: "Hilde Nilsen",
    email: "hilde.n@gmail.com",
    phone: "+47 456 78 901",
    budget: "€180 000",
    source: "Facebook",
    sentiment: 45,
    status: "WON",
    property: "Leilighet i Calpe",
    createdAt: "2024-02-20",
  },
  {
    id: "L009",
    name: "Per Olsen",
    email: "per.o@telia.no",
    phone: "+47 478 90 123",
    budget: "€420 000",
    source: "Google Ads",
    sentiment: 30,
    status: "LOST",
    notes: "Valgte annen megler",
    createdAt: "2024-02-15",
  },
  {
    id: "L010",
    name: "Silje Berg",
    email: "silje.b@proton.me",
    phone: "+47 490 12 345",
    budget: "€275 000",
    source: "Soleada.no",
    sentiment: 65,
    status: "CONTACT",
    property: "Toppleilighet Villajoyosa",
    createdAt: "2024-03-12",
  },
];

function SentimentIcon({ score }: { score: number }) {
  if (score >= 70) return <ThumbsUp size={14} className="text-emerald-400" />;
  if (score >= 40) return <Minus size={14} className="text-amber-400" />;
  return <ThumbsDown size={14} className="text-red-400" />;
}

function sentimentColor(score: number) {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [search, setSearch] = useState("");
  const [draggedLead, setDraggedLead] = useState<string | null>(null);

  const filteredLeads = leads.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.email.toLowerCase().includes(search.toLowerCase()) ||
      (l.property && l.property.toLowerCase().includes(search.toLowerCase()))
  );

  const handleDragStart = (leadId: string) => {
    setDraggedLead(leadId);
  };

  const handleDrop = (newStatus: LeadStatus) => {
    if (!draggedLead) return;
    setLeads((prev) =>
      prev.map((l) => (l.id === draggedLead ? { ...l, status: newStatus } : l))
    );
    setDraggedLead(null);
  };

  const totalValue = leads
    .filter((l) => l.status !== "LOST")
    .reduce((sum, l) => {
      const num = parseInt(l.budget.replace(/[^0-9]/g, ""));
      return sum + (isNaN(num) ? 0 : num);
    }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead Pipeline</h1>
          <p className="text-sm text-slate-400 mt-1">
            Dra og slipp leads mellom kolonnene for a oppdatere status
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-slate-400">
            Total verdi:{" "}
            <span className="text-emerald-400 font-semibold">
              {"\u20AC"}{(totalValue / 1000).toFixed(0)}K
            </span>
          </div>
          <Button size="sm">
            <Plus size={16} className="mr-1" />
            Ny Lead
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <Input
          placeholder="Sok etter leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Kanban Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colLeads = filteredLeads.filter((l) => l.status === col.key);
          return (
            <div
              key={col.key}
              className="min-w-[240px] flex-1"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(col.key)}
            >
              {/* Column Header */}
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-3 h-3 rounded-full ${col.color}`} />
                <span className="text-sm font-semibold text-slate-200">{col.label}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">
                  {colLeads.length}
                </Badge>
              </div>

              {/* Column Cards */}
              <div className="space-y-2 min-h-[200px] rounded-lg bg-slate-900/50 border border-slate-700/30 p-2">
                {colLeads.map((lead) => (
                  <Card
                    key={lead.id}
                    draggable
                    onDragStart={() => handleDragStart(lead.id)}
                    className="cursor-grab active:cursor-grabbing hover:border-slate-500 transition-all"
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <GripVertical size={12} className="text-slate-600" />
                          <span className="text-sm font-medium text-slate-100">
                            {lead.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <SentimentIcon score={lead.sentiment} />
                          <span className={`text-xs font-medium ${sentimentColor(lead.sentiment)}`}>
                            {lead.sentiment}%
                          </span>
                        </div>
                      </div>

                      {lead.property && (
                        <p className="text-xs text-slate-400 mb-2 truncate">
                          {lead.property}
                        </p>
                      )}

                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Mail size={10} />
                          <span className="truncate">{lead.email}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Phone size={10} />
                          <span>{lead.phone}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <DollarSign size={10} />
                          <span className="text-emerald-400 font-medium">{lead.budget}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
                        <Badge variant="outline" className="text-[10px]">
                          <Globe size={8} className="mr-1" />
                          {lead.source}
                        </Badge>
                        <span className="text-[10px] text-slate-500">{lead.createdAt}</span>
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
