"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users, Mail, DollarSign, Search, Plus, GripVertical,
  ThumbsUp, ThumbsDown, Minus, Phone, Globe,
  X, Upload, FileSpreadsheet, UserPlus, ArrowRight,
  Crown, Trash2, Loader2, Calendar, Send, Bot,
  Clock, CheckCircle2, Sparkles, MessageSquare, ChevronDown,
  Save, Building2, Camera, FileText, Image, ScanLine,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────

type LeadStatus = "NEW" | "CONTACT" | "QUALIFIED" | "VIEWING" | "NEGOTIATION" | "WON" | "LOST";

interface Interaction {
  id: string;
  type: "email" | "call" | "meeting" | "note" | "ai";
  content: string;
  date: string;
  direction?: "in" | "out";
}

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
  interactions: Interaction[];
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

const initialLeads: Lead[] = [];

// ── Helpers ────────────────────────────────────────────

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

function interactionIcon(type: string) {
  switch (type) {
    case "email": return <Mail size={14} className="text-blue-400" />;
    case "call": return <Phone size={14} className="text-emerald-400" />;
    case "meeting": return <Calendar size={14} className="text-purple-400" />;
    case "ai": return <Bot size={14} className="text-amber-400" />;
    default: return <MessageSquare size={14} className="text-slate-400" />;
  }
}

function statusColor(status: LeadStatus) {
  return columns.find((c) => c.key === status)?.color || "bg-slate-500";
}

function statusLabel(status: LeadStatus) {
  return columns.find((c) => c.key === status)?.label || status;
}

const emptyLead = {
  name: "", email: "", phone: "", budget: "", source: "", property: "", notes: "",
};

// ── Main Component ─────────────────────────────────────

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

  // Document/image import state
  const [showDocImport, setShowDocImport] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docPreview, setDocPreview] = useState<string | null>(null);
  const [docParsing, setDocParsing] = useState(false);
  const [docLeads, setDocLeads] = useState<Lead[]>([]);
  const [docRawText, setDocRawText] = useState("");
  const [docConfidence, setDocConfidence] = useState("");
  const docFileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Detail panel state
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailContent, setEmailContent] = useState("");
  const [showCallLog, setShowCallLog] = useState(false);
  const [callNotes, setCallNotes] = useState("");
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingData, setMeetingData] = useState({ date: "", time: "", notes: "" });
  const [aiDraftLoading, setAiDraftLoading] = useState(false);

  // ── Load leads from database ───────────────────────

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
          budget: c.pipeline_value ? `€${c.pipeline_value.toLocaleString()}` : '€0',
          source: c.source || 'Manuell',
          sentiment: typeof c.sentiment === 'number' ? c.sentiment : 50,
          status: (c.pipeline_status || 'NEW') as LeadStatus,
          property: c.property_interest || undefined,
          notes: c.notes || undefined,
          createdAt: c.created_at ? c.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
          interactions: c.interactions || [],
        }));
        setLeads(mapped);
        setDbLoaded(true);
      }
    } catch {
      // Fallback to hardcoded data silently
    }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Keep selectedLead in sync with leads state
  useEffect(() => {
    if (selectedLead) {
      const updated = leads.find((l) => l.id === selectedLead.id);
      if (updated) setSelectedLead(updated);
    }
  }, [leads, selectedLead?.id]);

  const filteredLeads = leads.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.email.toLowerCase().includes(search.toLowerCase()) ||
      (l.property && l.property.toLowerCase().includes(search.toLowerCase()))
  );

  // ── Drag & drop ────────────────────────────────────

  const handleDragStart = (leadId: string) => setDraggedLead(leadId);
  const handleDrop = (newStatus: LeadStatus) => {
    if (!draggedLead) return;
    setLeads((prev) => prev.map((l) => (l.id === draggedLead ? { ...l, status: newStatus } : l)));
    if (dbLoaded) {
      fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draggedLead, pipeline_status: newStatus }),
      }).catch(() => {});
    }
    setDraggedLead(null);
  };

  // ── CRUD operations ────────────────────────────────

  const changeStatus = async (leadId: string, newStatus: LeadStatus) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)));
    if (dbLoaded) {
      fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId, pipeline_status: newStatus }),
      }).catch(() => {});
    }
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
    if (selectedLead?.id === leadId) setSelectedLead(null);
  };

  const saveNotes = async (leadId: string, notes: string) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, notes } : l)));
    if (dbLoaded) {
      fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId, notes }),
      }).catch(() => {});
    }
  };

  // ── Interactions ───────────────────────────────────

  const addInteraction = (type: "email" | "call" | "meeting", content: string) => {
    if (!selectedLead || !content) return;
    const interaction: Interaction = {
      id: `i${Date.now()}`, type, content, date: new Date().toISOString().split("T")[0],
      direction: type === "email" ? "out" : undefined,
    };
    const updatedInteractions = [interaction, ...selectedLead.interactions];
    setLeads((prev) => prev.map((c) =>
      c.id === selectedLead.id ? { ...c, interactions: updatedInteractions } : c
    ));
    if (dbLoaded) {
      fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedLead.id,
          interactions: updatedInteractions,
          last_contact: interaction.date,
        }),
      }).catch(() => {});
    }
  };

  const sendEmail = () => { addInteraction("email", emailContent); setEmailContent(""); setShowEmailModal(false); };
  const logCall = () => { addInteraction("call", callNotes); setCallNotes(""); setShowCallLog(false); };
  const bookMeeting = () => { addInteraction("meeting", `Møte ${meetingData.date} kl ${meetingData.time}: ${meetingData.notes}`); setMeetingData({ date: "", time: "", notes: "" }); setShowMeetingModal(false); };

  const generateAiDraft = async () => {
    if (!selectedLead) return;
    setAiDraftLoading(true);
    try {
      const res = await fetch('/api/contacts/email-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: {
            name: selectedLead.name, email: selectedLead.email,
            property: selectedLead.property, notes: selectedLead.notes,
          },
          context: 'Oppfølging av lead',
        }),
      });
      const { draft } = await res.json();
      setEmailContent(draft || '');
      setShowEmailModal(true);
    } catch {
      setEmailContent('Kunne ikke generere AI-utkast. Skriv e-posten manuelt.');
      setShowEmailModal(true);
    }
    setAiDraftLoading(false);
  };

  // ── Add lead / CSV ─────────────────────────────────

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
      pipeline_value: parseInt(String(newLead.budget).replace(/[^0-9]/g, '')) || 0,
      source: newLead.source || "Manuell",
      pipeline_status: "NEW",
      property_interest: newLead.property || "",
      notes: newLead.notes || "",
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
        name: newLead.name, email: newLead.email || "", phone: newLead.phone || "",
        budget: newLead.budget ? `€${newLead.budget}` : "€0",
        source: newLead.source || "Manuell", sentiment: 50, status: "NEW",
        property: newLead.property || undefined, notes: newLead.notes || undefined,
        createdAt: now.split("T")[0], interactions: [],
      };
      setLeads((prev) => [lead, ...prev]);
    } catch {
      const lead: Lead = {
        id: `L${String(leads.length + 1).padStart(3, "0")}`,
        name: newLead.name, email: newLead.email || "", phone: newLead.phone || "",
        budget: newLead.budget ? `€${newLead.budget}` : "€0",
        source: newLead.source || "Manuell", sentiment: 50, status: "NEW",
        property: newLead.property || undefined, notes: newLead.notes || undefined,
        createdAt: now.split("T")[0], interactions: [],
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
        id: `CSV${String(i).padStart(3, "0")}`, name,
        email: emailIdx >= 0 ? cols[emailIdx]?.trim() || "" : "",
        phone: phoneIdx >= 0 ? cols[phoneIdx]?.trim() || "" : "",
        budget: budgetIdx >= 0 ? `€${cols[budgetIdx]?.trim().replace(/[^0-9]/g, "") || "0"}` : "€0",
        source: sourceIdx >= 0 ? cols[sourceIdx]?.trim() || "CSV Import" : "CSV Import",
        sentiment: 50, status: "NEW",
        property: propertyIdx >= 0 ? cols[propertyIdx]?.trim() : undefined,
        notes: notesIdx >= 0 ? cols[notesIdx]?.trim() : undefined,
        createdAt: new Date().toISOString().split("T")[0], interactions: [],
      });
    }
    setCsvData(parsed);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { const text = ev.target?.result as string; setCsvRaw(text); parseCSV(text); };
    reader.readAsText(file);
  };

  const importCSVLeads = async () => {
    if (csvData.length === 0) return;
    setSaving(true);
    const savedLeads: Lead[] = [];
    for (const lead of csvData) {
      try {
        const now = new Date().toISOString();
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: lead.name, email: lead.email || '', phone: lead.phone || '',
            pipeline_status: 'NEW',
            pipeline_value: parseInt(String(lead.budget).replace(/[^0-9]/g, '')) || 0,
            source: lead.source || 'CSV Import', property_interest: lead.property || '',
            notes: lead.notes || '', created_at: now, updated_at: now,
          }),
        });
        const data = await res.json();
        savedLeads.push({ ...lead, id: data.contact?.id || lead.id });
      } catch {
        savedLeads.push(lead);
      }
    }
    setLeads((prev) => [...savedLeads, ...prev]);
    setCsvData([]); setCsvRaw(""); setShowCSVUpload(false); setSaving(false);
  };

  // ── Document/Image Import ─────────────────────────

  const handleDocFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocFile(file);
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setDocPreview(url);
    } else {
      setDocPreview(null);
    }
    setDocLeads([]);
    setDocRawText("");
    setDocConfidence("");
  };

  const analyzeDocument = async () => {
    if (!docFile) return;
    setDocParsing(true);
    setDocLeads([]);
    setDocRawText("");
    try {
      const formData = new FormData();
      formData.append('file', docFile);
      const res = await fetch('/api/contacts/import-document', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setDocConfidence(data.confidence || '');
      setDocRawText(data.rawText || '');

      // Map AI-extracted leads to our Lead format
      const mapped: Lead[] = (data.leads || []).map((l: any, i: number) => ({
        id: `DOC${String(i + 1).padStart(3, '0')}`,
        name: l.name || 'Ukjent',
        email: l.email || '',
        phone: l.phone || '',
        budget: l.budget ? `€${l.budget.toLocaleString()}` : '€0',
        source: l.source || 'Document Import',
        property: l.property_interest || '',
        notes: [
          l.notes || '',
          l.preferences?.features?.length ? `Ønsker: ${l.preferences.features.join(', ')}` : '',
          l.preferences?.property_type ? `Type: ${l.preferences.property_type}` : '',
          l.preferences?.location ? `Sted: ${l.preferences.location}` : '',
        ].filter(Boolean).join('\n'),
        sentiment: l.sentiment === 'hot' ? 90 : l.sentiment === 'warm' ? 70 : l.sentiment === 'cold' ? 20 : 50,
        status: 'NEW' as LeadStatus,
      }));
      setDocLeads(mapped);
    } catch (err) {
      console.error('Document analysis failed:', err);
      setDocRawText(`Feil: ${err instanceof Error ? err.message : 'Kunne ikke analysere dokumentet'}`);
    } finally {
      setDocParsing(false);
    }
  };

  const importDocLeads = async () => {
    if (docLeads.length === 0) return;
    setSaving(true);
    const savedLeads: Lead[] = [];
    for (const lead of docLeads) {
      try {
        const now = new Date().toISOString();
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: lead.name, email: lead.email || '', phone: lead.phone || '',
            pipeline_status: 'NEW',
            pipeline_value: parseInt(String(lead.budget).replace(/[^0-9]/g, '')) || 0,
            source: lead.source || 'Document Import', property_interest: lead.property || '',
            notes: lead.notes || '', created_at: now, updated_at: now,
          }),
        });
        const data = await res.json();
        savedLeads.push({ ...lead, id: data.contact?.id || lead.id });
      } catch {
        savedLeads.push(lead);
      }
    }
    setLeads((prev) => [...savedLeads, ...prev]);
    setDocLeads([]); setDocFile(null); setDocPreview(null);
    setDocRawText(""); setDocConfidence(""); setShowDocImport(false);
    setSaving(false);
  };

  // ── Select lead & open detail ──────────────────────

  const openDetail = (lead: Lead) => {
    setSelectedLead(lead);
    setEditNotes(lead.notes || "");
  };

  // ── RENDER ─────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead Pipeline</h1>
          <p className="text-sm text-slate-400 mt-1">
            Dra og slipp leads mellom kolonnene · Klikk for detaljer
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
            <Upload size={16} className="mr-1" />CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowDocImport(true)}>
            <ScanLine size={16} className="mr-1" />Skann / PDF
          </Button>
          <Button size="sm" onClick={() => setShowNewLead(true)}>
            <Plus size={16} className="mr-1" />Ny Lead
          </Button>
        </div>
      </div>

      {/* ── New Lead Modal ──────────────────────────── */}
      {showNewLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNewLead(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <UserPlus size={20} className="text-primary-400" />Ny Lead
                </h2>
                <Button variant="ghost" size="icon" onClick={() => setShowNewLead(false)}><X size={18} /></Button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Navn *</label>
                  <Input placeholder="Fullt navn" value={newLead.name} onChange={(e) => setNewLead((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">E-post</label>
                    <Input placeholder="epost@example.com" value={newLead.email} onChange={(e) => setNewLead((p) => ({ ...p, email: e.target.value }))} /></div>
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">Telefon</label>
                    <Input placeholder="+47 xxx xx xxx" value={newLead.phone} onChange={(e) => setNewLead((p) => ({ ...p, phone: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">Budsjett (€)</label>
                    <Input type="number" placeholder="350000" value={newLead.budget} onChange={(e) => setNewLead((p) => ({ ...p, budget: e.target.value }))} /></div>
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">Kilde</label>
                    <select value={newLead.source} onChange={(e) => setNewLead((p) => ({ ...p, source: e.target.value }))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                      <option value="">Velg kilde</option>
                      <option value="Facebook">Facebook</option><option value="Instagram">Instagram</option>
                      <option value="LinkedIn">LinkedIn</option><option value="Google Ads">Google Ads</option>
                      <option value="YouTube">YouTube</option><option value="Soleada.no">Soleada.no</option>
                      <option value="Henvisning">Henvisning</option><option value="Kommo Event">Kommo Event</option>
                      <option value="Manuell">Manuell</option>
                    </select></div>
                </div>
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Eiendomsinteresse</label>
                  <Input placeholder="F.eks. Villa i Altea" value={newLead.property} onChange={(e) => setNewLead((p) => ({ ...p, property: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Notater</label>
                  <textarea placeholder="Tilleggsinfo..." value={newLead.notes} onChange={(e) => setNewLead((p) => ({ ...p, notes: e.target.value }))} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-20 resize-none" /></div>
                <Button onClick={addNewLead} className="w-full" disabled={!newLead.name}>
                  <Plus size={16} className="mr-1" />Legg til lead
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── CSV Upload Modal ────────────────────────── */}
      {showCSVUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowCSVUpload(false); setCsvData([]); setCsvRaw(""); }}>
          <Card className="w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FileSpreadsheet size={20} className="text-emerald-400" />Importer leads fra CSV
                </h2>
                <Button variant="ghost" size="icon" onClick={() => { setShowCSVUpload(false); setCsvData([]); setCsvRaw(""); }}><X size={18} /></Button>
              </div>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-slate-900/50 border border-dashed border-slate-600 text-center">
                  <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} className="hidden" />
                  <Upload size={32} className="mx-auto text-slate-500 mb-2" />
                  <p className="text-sm text-slate-300 mb-2">Dra og slipp CSV-fil eller klikk for å velge</p>
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Velg CSV-fil</Button>
                  <p className="text-[10px] text-slate-500 mt-2">Kolonner: Navn, E-post, Telefon, Budsjett, Kilde, Eiendom, Notater</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Eller lim inn CSV-data</label>
                  <textarea
                    placeholder={"Navn;Epost;Telefon;Budsjett;Kilde;Eiendom\nOla Nordmann;ola@test.no;+47 123 45 678;300000;Facebook;Villa i Altea"}
                    value={csvRaw} onChange={(e) => { setCsvRaw(e.target.value); parseCSV(e.target.value); }}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 font-mono h-32 resize-none"
                  />
                </div>
                {csvData.length > 0 && (
                  <div>
                    <p className="text-sm text-emerald-400 font-medium mb-2">{csvData.length} leads funnet i filen:</p>
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
                    <Button onClick={importCSVLeads} className="w-full mt-3" disabled={saving}>
                      {saving ? <Loader2 size={16} className="mr-1 animate-spin" /> : <ArrowRight size={16} className="mr-1" />}
                      Importer {csvData.length} leads til pipeline
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Document/Image Import Modal ─────────────── */}
      {showDocImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowDocImport(false); setDocFile(null); setDocPreview(null); setDocLeads([]); setDocRawText(""); }}>
          <Card className="w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <ScanLine size={20} className="text-cyan-400" />Importer fra dokument eller bilde
                </h2>
                <Button variant="ghost" size="icon" onClick={() => { setShowDocImport(false); setDocFile(null); setDocPreview(null); setDocLeads([]); setDocRawText(""); }}><X size={18} /></Button>
              </div>

              <div className="space-y-4">
                {/* Upload area */}
                {!docFile && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input ref={docFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={handleDocFile} className="hidden" />
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleDocFile} className="hidden" />

                    <button
                      onClick={() => cameraRef.current?.click()}
                      className="p-6 rounded-lg bg-slate-900/50 border border-dashed border-cyan-500/40 text-center hover:bg-cyan-500/5 transition-colors"
                    >
                      <Camera size={32} className="mx-auto text-cyan-400 mb-2" />
                      <p className="text-sm font-medium text-white">Ta bilde</p>
                      <p className="text-[10px] text-slate-500 mt-1">Kamera / mobilkamera</p>
                    </button>

                    <button
                      onClick={() => { if (docFileRef.current) { docFileRef.current.accept = 'image/*'; docFileRef.current.click(); } }}
                      className="p-6 rounded-lg bg-slate-900/50 border border-dashed border-purple-500/40 text-center hover:bg-purple-500/5 transition-colors"
                    >
                      <Image size={32} className="mx-auto text-purple-400 mb-2" />
                      <p className="text-sm font-medium text-white">Last opp bilde</p>
                      <p className="text-[10px] text-slate-500 mt-1">JPG, PNG, WebP, HEIC</p>
                    </button>

                    <button
                      onClick={() => { if (docFileRef.current) { docFileRef.current.accept = '.pdf'; docFileRef.current.click(); } }}
                      className="p-6 rounded-lg bg-slate-900/50 border border-dashed border-red-500/40 text-center hover:bg-red-500/5 transition-colors"
                    >
                      <FileText size={32} className="mx-auto text-red-400 mb-2" />
                      <p className="text-sm font-medium text-white">Last opp PDF</p>
                      <p className="text-[10px] text-slate-500 mt-1">PDF-dokumenter</p>
                    </button>
                  </div>
                )}

                {/* File selected - preview & analyze */}
                {docFile && !docParsing && docLeads.length === 0 && !docRawText && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-600">
                      <div className="flex items-center gap-3">
                        {docPreview ? (
                          <img src={docPreview} alt="Preview" className="h-24 w-auto rounded border border-slate-600 object-contain" />
                        ) : (
                          <div className="h-24 w-20 rounded bg-slate-700 flex items-center justify-center">
                            <FileText size={24} className="text-red-400" />
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">{docFile.name}</p>
                          <p className="text-xs text-slate-500">{(docFile.size / 1024).toFixed(0)} KB · {docFile.type}</p>
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" onClick={analyzeDocument} className="gap-1.5">
                              <Sparkles size={14} />AI Analyser
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setDocFile(null); setDocPreview(null); }}>
                              Bytt fil
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 text-center">
                      AI leser dokumentet og trekker ut kontaktinfo, avkrysninger og notater automatisk
                    </p>
                  </div>
                )}

                {/* Parsing indicator */}
                {docParsing && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                    <p className="text-sm text-slate-300">AI analyserer dokumentet...</p>
                    <p className="text-xs text-slate-500">Leser tekst, avkrysninger og felter</p>
                  </div>
                )}

                {/* Results */}
                {docLeads.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-emerald-400 font-medium">
                        {docLeads.length} lead{docLeads.length !== 1 ? 's' : ''} funnet
                      </p>
                      {docConfidence && (
                        <Badge variant={docConfidence === 'high' ? 'success' : docConfidence === 'medium' ? 'warning' : 'destructive'} className="text-[10px]">
                          Sikkerhet: {docConfidence === 'high' ? 'Høy' : docConfidence === 'medium' ? 'Medium' : 'Lav'}
                        </Badge>
                      )}
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {docLeads.map((l, i) => (
                        <div key={i} className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="text-sm font-medium text-white">{l.name}</span>
                            <span className="text-xs text-slate-500">{l.email}</span>
                            <span className="text-xs text-slate-500">{l.phone}</span>
                            <span className="text-xs text-emerald-400 ml-auto">{l.budget}</span>
                          </div>
                          {l.notes && (
                            <p className="text-[11px] text-slate-400 whitespace-pre-line mt-1 pl-2 border-l-2 border-slate-700">{l.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button onClick={importDocLeads} className="w-full" disabled={saving}>
                      {saving ? <Loader2 size={16} className="mr-1 animate-spin" /> : <ArrowRight size={16} className="mr-1" />}
                      Importer {docLeads.length} leads til pipeline
                    </Button>
                  </div>
                )}

                {/* Error or raw text fallback */}
                {docRawText && docLeads.length === 0 && !docParsing && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-sm text-red-300 whitespace-pre-wrap">{docRawText}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Email Modal ─────────────────────────────── */}
      {showEmailModal && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowEmailModal(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">E-post til {selectedLead.name}</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowEmailModal(false)}><X size={18} /></Button>
              </div>
              <p className="text-xs text-slate-400 mb-2">Til: {selectedLead.email}</p>
              <textarea value={emailContent} onChange={(e) => setEmailContent(e.target.value)} placeholder="Skriv din melding..."
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-40 resize-none mb-3" />
              <div className="flex gap-2">
                <Button onClick={sendEmail} className="flex-1" disabled={!emailContent}><Send size={16} className="mr-1" />Send e-post</Button>
                <Button variant="outline" onClick={generateAiDraft} disabled={aiDraftLoading}>
                  {aiDraftLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Call Log Modal ──────────────────────────── */}
      {showCallLog && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCallLog(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Ring {selectedLead.name}</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowCallLog(false)}><X size={18} /></Button>
              </div>
              <p className="text-xs text-slate-400 mb-2">Telefon: {selectedLead.phone}</p>
              <a href={`tel:${selectedLead.phone}`} className="block mb-3"><Button variant="outline" className="w-full"><Phone size={16} className="mr-1" />Ring nå</Button></a>
              <textarea value={callNotes} onChange={(e) => setCallNotes(e.target.value)} placeholder="Logg samtalenotater etter samtalen..."
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-24 resize-none mb-3" />
              <Button onClick={logCall} className="w-full" disabled={!callNotes}><CheckCircle2 size={16} className="mr-1" />Logg samtale</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Meeting Modal ───────────────────────────── */}
      {showMeetingModal && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowMeetingModal(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Book møte med {selectedLead.name}</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowMeetingModal(false)}><X size={18} /></Button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Dato</label>
                  <Input type="date" value={meetingData.date} onChange={(e) => setMeetingData((p) => ({ ...p, date: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Tid</label>
                  <Input type="time" value={meetingData.time} onChange={(e) => setMeetingData((p) => ({ ...p, time: e.target.value }))} /></div>
              </div>
              <textarea value={meetingData.notes} onChange={(e) => setMeetingData((p) => ({ ...p, notes: e.target.value }))} placeholder="Møteagenda / notater..."
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-24 resize-none mb-3" />
              <Button onClick={bookMeeting} className="w-full" disabled={!meetingData.date}><Calendar size={16} className="mr-1" />Book møte</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <Input placeholder="Søk etter leads..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* ── Main Layout: Kanban + Detail Panel ──────── */}
      <div className="flex gap-4">

        {/* Kanban Board */}
        <div className={`flex gap-3 overflow-x-auto pb-4 transition-all ${selectedLead ? "flex-1 min-w-0" : "w-full"}`}>
          {columns.map((col) => {
            const colLeads = filteredLeads.filter((l) => l.status === col.key);
            return (
              <div key={col.key} className="min-w-[200px] flex-1" onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(col.key)}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-3 h-3 rounded-full ${col.color}`} />
                  <span className="text-sm font-semibold text-slate-200">{col.label}</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">{colLeads.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[200px] rounded-lg bg-slate-900/50 border border-slate-700/30 p-2">
                  {colLeads.map((lead) => (
                    <Card
                      key={lead.id}
                      draggable
                      onDragStart={() => handleDragStart(lead.id)}
                      onClick={() => openDetail(lead)}
                      className={`cursor-pointer hover:border-slate-500 transition-all ${selectedLead?.id === lead.id ? "ring-2 ring-primary-500 border-primary-500" : ""}`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <GripVertical size={12} className="text-slate-600 cursor-grab" />
                            <span className="text-sm font-medium text-slate-100 truncate max-w-[140px]">{lead.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <SentimentIcon score={lead.sentiment} />
                            <span className={`text-xs font-medium ${sentimentColor(lead.sentiment)}`}>{lead.sentiment}%</span>
                          </div>
                        </div>
                        {lead.property && <p className="text-xs text-slate-400 mb-1.5 truncate">{lead.property}</p>}
                        <div className="space-y-0.5">
                          {lead.email && <div className="flex items-center gap-1.5 text-xs text-slate-400"><Mail size={10} /><span className="truncate">{lead.email}</span></div>}
                          {lead.phone && <div className="flex items-center gap-1.5 text-xs text-slate-400"><Phone size={10} /><span>{lead.phone}</span></div>}
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-700/50">
                          <Badge variant="outline" className="text-[10px]"><Globe size={8} className="mr-1" />{lead.source}</Badge>
                          {lead.interactions.length > 0 && (
                            <Badge variant="secondary" className="text-[10px]"><MessageSquare size={8} className="mr-1" />{lead.interactions.length}</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Detail Panel (slide-over) ─────────────── */}
        {selectedLead && (
          <div className="w-[380px] min-w-[380px] flex-shrink-0 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            {/* Header */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-500/30 to-purple-500/30 flex items-center justify-center text-sm font-semibold text-slate-200">
                      {selectedLead.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <CardTitle className="text-base">{selectedLead.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2 h-2 rounded-full ${statusColor(selectedLead.status)}`} />
                        <span className="text-xs text-slate-400">{statusLabel(selectedLead.status)}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedLead(null)}><X size={16} /></Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Contact info */}
                <div className="space-y-2">
                  {selectedLead.email && (
                    <div className="flex items-center gap-2 text-sm text-slate-300"><Mail size={14} className="text-slate-500" />{selectedLead.email}</div>
                  )}
                  {selectedLead.phone && (
                    <div className="flex items-center gap-2 text-sm text-slate-300"><Phone size={14} className="text-slate-500" />{selectedLead.phone}</div>
                  )}
                  {selectedLead.property && (
                    <div className="flex items-center gap-2 text-sm text-slate-300"><Building2 size={14} className="text-slate-500" />{selectedLead.property}</div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <DollarSign size={14} className="text-slate-500" />{selectedLead.budget}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Globe size={14} className="text-slate-500" />{selectedLead.source}
                  </div>
                </div>

                {/* Status dropdown */}
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">Endre status</label>
                  <select
                    value={selectedLead.status}
                    onChange={(e) => changeStatus(selectedLead.id, e.target.value as LeadStatus)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                  >
                    {columns.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">Notater</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Skriv notater om denne kontakten..."
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-20 resize-none"
                  />
                  {editNotes !== (selectedLead.notes || "") && (
                    <Button size="sm" variant="outline" className="mt-1 text-xs" onClick={() => saveNotes(selectedLead.id, editNotes)}>
                      <Save size={12} className="mr-1" />Lagre notater
                    </Button>
                  )}
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowEmailModal(true)}>
                    <Mail size={12} className="mr-1" />E-post
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowCallLog(true)}>
                    <Phone size={12} className="mr-1" />Ring
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowMeetingModal(true)}>
                    <Calendar size={12} className="mr-1" />Møte
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={generateAiDraft} disabled={aiDraftLoading}>
                    {aiDraftLoading ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Sparkles size={12} className="mr-1" />}
                    AI Utkast
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs text-red-400 hover:text-red-300" onClick={() => deleteLead(selectedLead.id)}>
                    <Trash2 size={12} className="mr-1" />Slett
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Interaction History */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock size={14} className="text-slate-400" />
                  Aktivitetslogg ({selectedLead.interactions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedLead.interactions.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">
                    Ingen aktiviteter ennå. Bruk knappene over for å logge e-post, samtale eller møte.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {selectedLead.interactions.map((interaction) => (
                      <div key={interaction.id} className={`flex gap-3 p-3 rounded-lg ${interaction.type === "ai" ? "bg-amber-500/5 border border-amber-500/10" : "bg-slate-900/30"}`}>
                        <div className="mt-0.5">{interactionIcon(interaction.type)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 break-words">{interaction.content}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-slate-500">{interaction.date}</span>
                            {interaction.direction && (
                              <Badge variant="outline" className="text-[10px]">{interaction.direction === "in" ? "Innkommende" : "Utgående"}</Badge>
                            )}
                            {interaction.type === "ai" && <Badge variant="warning" className="text-[10px]">AI</Badge>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Meta info */}
            <div className="text-[10px] text-slate-600 px-2">
              Opprettet: {selectedLead.createdAt} · ID: {selectedLead.id.substring(0, 8)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
