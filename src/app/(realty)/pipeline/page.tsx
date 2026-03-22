"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users, Mail, DollarSign, Search, Plus, GripVertical,
  ThumbsUp, ThumbsDown, Minus, Phone, Globe,
  X, Upload, FileSpreadsheet, UserPlus, ArrowRight,
  Crown, Trash2, Loader2,
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
  { id: "L001", name: "Erik Hansen", email: "erik.hansen@gmail.com", phone: "+47 912 34 567", budget: "€350 000", source: "Facebook", sentiment: 85, status: "NEW", property: "Villa i Altea", createdAt: "2024-03-14" },
  { id: "L002", name: "Maria Solberg", email: "maria.s@outlook.no", phone: "+47 934 56 789", budget: "€280 000", source: "Soleada.no", sentiment: 72, status: "NEW", property: "Leilighet i Benidorm", createdAt: "2024-03-13" },
  { id: "L003", name: "Knut Eriksen", email: "knut.e@yahoo.no", phone: "+47 956 78 901", budget: "€450 000", source: "Google Ads", sentiment: 90, status: "CONTACT", property: "Penthouse Alicante", createdAt: "2024-03-10" },
  { id: "L004", name: "Ingrid Pedersen", email: "ingrid.p@hotmail.com", phone: "+47 978 90 123", budget: "€200 000", source: "Instagram", sentiment: 60, status: "QUALIFIED", property: "Rekkehus i Torrevieja", createdAt: "2024-03-08" },
  { id: "L005", name: "Ole Andersen", email: "ole.a@gmail.com", phone: "+47 990 12 345", budget: "€520 000", source: "Henvisning", sentiment: 95, status: "VIEWING", property: "Luksusvilla Javea", createdAt: "2024-03-05" },
  { id: "L006", name: "Astrid Johansen", email: "astrid.j@icloud.com", phone: "+47 412 34 567", budget: "€310 000", source: "YouTube", sentiment: 78, status: "VIEWING", property: "Bungalow i La Nucia", createdAt: "2024-03-03" },
  { id: "L007", name: "Lars Kristiansen", email: "lars.k@online.no", phone: "+47 434 56 789", budget: "€600 000", source: "LinkedIn", sentiment: 88, status: "NEGOTIATION", property: "Villa med havutsikt, Moraira", createdAt: "2024-02-28" },
  { id: "L008", name: "Hilde Nilsen", email: "hilde.n@gmail.com", phone: "+47 456 78 901", budget: "€180 000", source: "Facebook", sentiment: 45, status: "WON", property: "Leilighet i Calpe", createdAt: "2024-02-20" },
  { id: "L009", name: "Per Olsen", email: "per.o@telia.no", phone: "+47 478 90 123", budget: "€420 000", source: "Google Ads", sentiment: 30, status: "LOST", notes: "Valgte annen megler", createdAt: "2024-02-15" },
  { id: "L010", name: "Silje Berg", email: "silje.b@proton.me", phone: "+47 490 12 345", budget: "€275 000", source: "Soleada.no", sentiment: 65, status: "CONTACT", property: "Toppleilighet Villajoyosa", createdAt: "2024-03-12" },
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

const emptyLead = {
  name: "", email: "", phone: "", budget: "", source: "", property: "", notes: "",
};

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [search, setSearch] = useState("");
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const [showNewLead, setShowNewLead] = useState(false);
  const [showCSVUpload, setShowCSVUpload] = useState(false);
  const [newLead, setNewLead] = useState(emptyLead);
  const [csvData, setCsvData] = useState<Lead[]>([]);
  const [csvRaw, setCsvRaw] = useState("");
  const [dbLoaded, setDbLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load leads from database
  const loadLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts?view=pipeline');
      const { contacts } = await res.json();
      if (contacts && contacts.length > 0) {
        const mapped: Lead[] = contacts.map((c: any) => ({
          id: c.id,
          name: c.name || '',
          email: c.email || '',
          phone: c.phone || '',
          budget: c.budget || '\u20AC0',
          source: c.source || 'Manuell',
          sentiment: c.sentiment ?? 50,
          status: (c.pipeline_status || 'NEW') as LeadStatus,
          property: c.interested_in || c.property || undefined,
          notes: c.notes || undefined,
          createdAt: c.created_at ? c.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
        }));
        setLeads(mapped);
        setDbLoaded(true);
      }
    } catch {
      // Fallback to hardcoded data silently
    }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const filteredLeads = leads.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.email.toLowerCase().includes(search.toLowerCase()) ||
      (l.property && l.property.toLowerCase().includes(search.toLowerCase()))
  );

  const handleDragStart = (leadId: string) => setDraggedLead(leadId);
  const handleDrop = (newStatus: LeadStatus) => {
    if (!draggedLead) return;
    setLeads((prev) => prev.map((l) => (l.id === draggedLead ? { ...l, status: newStatus } : l)));
    // Persist status change to DB
    if (dbLoaded) {
      fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draggedLead, pipeline_status: newStatus }),
      }).catch(() => {});
    }
    setDraggedLead(null);
  };

  const upgradeToCustomer = async (leadId: string) => {
    setSaving(true);
    try {
      await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId, pipeline_status: 'CUSTOMER' }),
      });
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } catch {
      // silent fail
    }
    setSaving(false);
  };

  const deleteLead = async (leadId: string) => {
    if (dbLoaded) {
      await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId }),
      }).catch(() => {});
    }
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
  };

  const totalValue = leads
    .filter((l) => l.status !== "LOST")
    .reduce((sum, l) => {
      const num = parseInt(l.budget.replace(/[^0-9]/g, ""));
      return sum + (isNaN(num) ? 0 : num);
    }, 0);

  const addNewLead = async () => {
    if (!newLead.name) return;
    const now = new Date().toISOString();
    const contactPayload = {
      name: newLead.name,
      email: newLead.email || "",
      phone: newLead.phone || "",
      budget: newLead.budget ? `\u20AC${newLead.budget}` : "\u20AC0",
      source: newLead.source || "Manuell",
      sentiment: 50,
      pipeline_status: "NEW",
      interested_in: newLead.property || null,
      notes: newLead.notes || null,
      created_at: now,
      updated_at: now,
    };

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactPayload),
      });
      const { contact } = await res.json();
      const lead: Lead = {
        id: contact?.id || `L${String(leads.length + 1).padStart(3, "0")}`,
        name: newLead.name,
        email: newLead.email || "",
        phone: newLead.phone || "",
        budget: newLead.budget ? `\u20AC${newLead.budget}` : "\u20AC0",
        source: newLead.source || "Manuell",
        sentiment: 50,
        status: "NEW",
        property: newLead.property || undefined,
        notes: newLead.notes || undefined,
        createdAt: now.split("T")[0],
      };
      setLeads((prev) => [lead, ...prev]);
    } catch {
      // Fallback: add locally
      const lead: Lead = {
        id: `L${String(leads.length + 1).padStart(3, "0")}`,
        name: newLead.name,
        email: newLead.email || "",
        phone: newLead.phone || "",
        budget: newLead.budget ? `\u20AC${newLead.budget}` : "\u20AC0",
        source: newLead.source || "Manuell",
        sentiment: 50,
        status: "NEW",
        property: newLead.property || undefined,
        notes: newLead.notes || undefined,
        createdAt: now.split("T")[0],
      };
      setLeads((prev) => [lead, ...prev]);
    }
    setNewLead(emptyLead);
    setShowNewLead(false);
  };

  const parseCSV = (text: string) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return;
    const headers = lines[0].toLowerCase().split(/[;,\t]/);

    const findCol = (keywords: string[]) =>
      headers.findIndex((h) => keywords.some((k) => h.trim().includes(k)));

    const nameIdx = findCol(["name", "navn", "fullt navn", "full name"]);
    const emailIdx = findCol(["email", "epost", "e-post", "mail"]);
    const phoneIdx = findCol(["phone", "telefon", "tlf", "mobil"]);
    const budgetIdx = findCol(["budget", "budsjett", "price", "pris"]);
    const sourceIdx = findCol(["source", "kilde", "kanal"]);
    const propertyIdx = findCol(["property", "eiendom", "bolig", "interest"]);
    const notesIdx = findCol(["notes", "notater", "kommentar", "comment"]);

    const parsed: Lead[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[;,\t]/);
      if (cols.length < 2) continue;
      const name = nameIdx >= 0 ? cols[nameIdx]?.trim() : cols[0]?.trim();
      if (!name) continue;

      parsed.push({
        id: `CSV${String(i).padStart(3, "0")}`,
        name,
        email: emailIdx >= 0 ? cols[emailIdx]?.trim() || "" : "",
        phone: phoneIdx >= 0 ? cols[phoneIdx]?.trim() || "" : "",
        budget: budgetIdx >= 0 ? `€${cols[budgetIdx]?.trim().replace(/[^0-9]/g, "") || "0"}` : "€0",
        source: sourceIdx >= 0 ? cols[sourceIdx]?.trim() || "CSV Import" : "CSV Import",
        sentiment: 50,
        status: "NEW",
        property: propertyIdx >= 0 ? cols[propertyIdx]?.trim() : undefined,
        notes: notesIdx >= 0 ? cols[notesIdx]?.trim() : undefined,
        createdAt: new Date().toISOString().split("T")[0],
      });
    }
    setCsvData(parsed);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvRaw(text);
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const importCSVLeads = () => {
    if (csvData.length === 0) return;
    const maxId = leads.length;
    const withIds = csvData.map((l, i) => ({
      ...l,
      id: `L${String(maxId + i + 1).padStart(3, "0")}`,
    }));
    setLeads((prev) => [...withIds, ...prev]);
    setCsvData([]);
    setCsvRaw("");
    setShowCSVUpload(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead Pipeline</h1>
          <p className="text-sm text-slate-400 mt-1">
            Dra og slipp leads mellom kolonnene for å oppdatere status
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-slate-400">
            Total verdi:{" "}
            <span className="text-emerald-400 font-semibold">
              €{(totalValue / 1000).toFixed(0)}K
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowCSVUpload(true)}>
            <Upload size={16} className="mr-1" />
            CSV Import
          </Button>
          <Button size="sm" onClick={() => setShowNewLead(true)}>
            <Plus size={16} className="mr-1" />
            Ny Lead
          </Button>
        </div>
      </div>

      {/* New Lead Modal */}
      {showNewLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNewLead(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <UserPlus size={20} className="text-primary-400" />
                  Ny Lead
                </h2>
                <Button variant="ghost" size="icon" onClick={() => setShowNewLead(false)}>
                  <X size={18} />
                </Button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Navn *</label>
                  <Input placeholder="Fullt navn" value={newLead.name} onChange={(e) => setNewLead((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">E-post</label>
                    <Input placeholder="epost@example.com" value={newLead.email} onChange={(e) => setNewLead((p) => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Telefon</label>
                    <Input placeholder="+47 xxx xx xxx" value={newLead.phone} onChange={(e) => setNewLead((p) => ({ ...p, phone: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Budsjett (€)</label>
                    <Input type="number" placeholder="350000" value={newLead.budget} onChange={(e) => setNewLead((p) => ({ ...p, budget: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Kilde</label>
                    <select value={newLead.source} onChange={(e) => setNewLead((p) => ({ ...p, source: e.target.value }))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                      <option value="">Velg kilde</option>
                      <option value="Facebook">Facebook</option>
                      <option value="Instagram">Instagram</option>
                      <option value="LinkedIn">LinkedIn</option>
                      <option value="Google Ads">Google Ads</option>
                      <option value="YouTube">YouTube</option>
                      <option value="Soleada.no">Soleada.no</option>
                      <option value="Henvisning">Henvisning</option>
                      <option value="Manuell">Manuell</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Eiendomsinteresse</label>
                  <Input placeholder="F.eks. Villa i Altea" value={newLead.property} onChange={(e) => setNewLead((p) => ({ ...p, property: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Notater</label>
                  <textarea placeholder="Tilleggsinfo..." value={newLead.notes} onChange={(e) => setNewLead((p) => ({ ...p, notes: e.target.value }))} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-20 resize-none" />
                </div>
                <Button onClick={addNewLead} className="w-full" disabled={!newLead.name}>
                  <Plus size={16} className="mr-1" />
                  Legg til lead
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CSV Upload Modal */}
      {showCSVUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowCSVUpload(false); setCsvData([]); setCsvRaw(""); }}>
          <Card className="w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FileSpreadsheet size={20} className="text-emerald-400" />
                  Importer leads fra CSV
                </h2>
                <Button variant="ghost" size="icon" onClick={() => { setShowCSVUpload(false); setCsvData([]); setCsvRaw(""); }}>
                  <X size={18} />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-slate-900/50 border border-dashed border-slate-600 text-center">
                  <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} className="hidden" />
                  <Upload size={32} className="mx-auto text-slate-500 mb-2" />
                  <p className="text-sm text-slate-300 mb-2">Dra og slipp CSV-fil eller klikk for å velge</p>
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    Velg CSV-fil
                  </Button>
                  <p className="text-[10px] text-slate-500 mt-2">
                    Kolonner: Navn, E-post, Telefon, Budsjett, Kilde, Eiendom, Notater
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Eller lim inn CSV-data</label>
                  <textarea
                    placeholder={"Navn;Epost;Telefon;Budsjett;Kilde;Eiendom\nOla Nordmann;ola@test.no;+47 123 45 678;300000;Facebook;Villa i Altea"}
                    value={csvRaw}
                    onChange={(e) => { setCsvRaw(e.target.value); parseCSV(e.target.value); }}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 font-mono h-32 resize-none"
                  />
                </div>

                {csvData.length > 0 && (
                  <div>
                    <p className="text-sm text-emerald-400 font-medium mb-2">
                      {csvData.length} leads funnet i filen:
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {csvData.map((l, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 rounded bg-slate-900/50 text-sm">
                          <span className="text-slate-200 font-medium">{l.name}</span>
                          <span className="text-slate-500">{l.email}</span>
                          <span className="text-slate-500">{l.phone}</span>
                          <span className="text-emerald-400 ml-auto">{l.budget}</span>
                        </div>
                      ))}
                    </div>
                    <Button onClick={importCSVLeads} className="w-full mt-3">
                      <ArrowRight size={16} className="mr-1" />
                      Importer {csvData.length} leads til pipeline
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <Input placeholder="Søk etter leads..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Kanban Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colLeads = filteredLeads.filter((l) => l.status === col.key);
          return (
            <div key={col.key} className="min-w-[240px] flex-1" onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(col.key)}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-3 h-3 rounded-full ${col.color}`} />
                <span className="text-sm font-semibold text-slate-200">{col.label}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">{colLeads.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[200px] rounded-lg bg-slate-900/50 border border-slate-700/30 p-2">
                {colLeads.map((lead) => (
                  <Card key={lead.id} draggable onDragStart={() => handleDragStart(lead.id)} className="cursor-grab active:cursor-grabbing hover:border-slate-500 transition-all">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <GripVertical size={12} className="text-slate-600" />
                          <span className="text-sm font-medium text-slate-100">{lead.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <SentimentIcon score={lead.sentiment} />
                          <span className={`text-xs font-medium ${sentimentColor(lead.sentiment)}`}>{lead.sentiment}%</span>
                        </div>
                      </div>
                      {lead.property && <p className="text-xs text-slate-400 mb-2 truncate">{lead.property}</p>}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400"><Mail size={10} /><span className="truncate">{lead.email}</span></div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400"><Phone size={10} /><span>{lead.phone}</span></div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400"><DollarSign size={10} /><span className="text-emerald-400 font-medium">{lead.budget}</span></div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
                        <Badge variant="outline" className="text-[10px]"><Globe size={8} className="mr-1" />{lead.source}</Badge>
                        <span className="text-[10px] text-slate-500">{lead.createdAt}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); upgradeToCustomer(lead.id); }}
                          disabled={saving}
                          className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
                          title="Oppgrader til kunde"
                        >
                          {saving ? <Loader2 size={10} className="animate-spin" /> : <Crown size={10} />}
                          <span>Kunde</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteLead(lead.id); }}
                          className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors ml-auto"
                          title="Slett lead"
                        >
                          <Trash2 size={10} />
                        </button>
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
