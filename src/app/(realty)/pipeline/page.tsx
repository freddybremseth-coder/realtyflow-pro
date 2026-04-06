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
  Banknote, TrendingUp, UserCheck,
} from "lucide-react";
import { BRANDS } from "@/lib/constants";

// ── Types ──────────────────────────────────────────────

type LeadStatus = "NEW" | "CONTACT" | "QUALIFIED" | "VIEWING" | "NEGOTIATION" | "WON" | "LOST";
type CrmTab = "leads" | "pipeline" | "kunder";

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
  sale_price?: number;
  commission_amount?: number;
  commission_percent?: number;
  commission_paid_date?: string;
  brand_id?: string;
}

const TAB_COLUMNS: Record<CrmTab, LeadStatus[]> = {
  leads: ["NEW"],
  pipeline: ["CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION"],
  kunder: ["WON", "LOST"],
};

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
  const [activeTab, setActiveTab] = useState<CrmTab>("pipeline");

  // Commission modal state
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [commissionLeadId, setCommissionLeadId] = useState<string | null>(null);
  const [commissionData, setCommissionData] = useState({
    sale_price: "", commission_percent: "3", commission_amount: "", commission_paid_date: "", brand_id: "soleada",
  });
  const [csvData, setCsvData] = useState<Lead[]>([]);
  const [csvRaw, setCsvRaw] = useState("");
  const [dbLoaded, setDbLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Document/image import state
  const [showDocImport, setShowDocImport] = useState(false);
  const [docFiles, setDocFiles] = useState<{ file: File; preview: string | null; status: "queued" | "analyzing" | "done" | "error"; leads: Lead[]; rawText: string; confidence: string; error?: string }[]>([]);
  const [docParsing, setDocParsing] = useState(false);
  const [docAllLeads, setDocAllLeads] = useState<Lead[]>([]);
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
  const [editingCommission, setEditingCommission] = useState(false);
  const [editCommissionData, setEditCommissionData] = useState({ sale_price: "", commission_percent: "", commission_amount: "", commission_paid_date: "", brand_id: "" });
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
          sale_price: c.sale_price || undefined,
          commission_amount: c.commission_amount || undefined,
          commission_percent: c.commission_percent || undefined,
          commission_paid_date: c.commission_paid_date ? c.commission_paid_date.split('T')[0] : undefined,
          brand_id: c.brand_id || c.brand || undefined,
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
    if (newStatus === "WON") {
      setCommissionLeadId(draggedLead);
      setShowCommissionModal(true);
      setDraggedLead(null);
      return;
    }
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
    if (newStatus === "WON") {
      setCommissionLeadId(leadId);
      setShowCommissionModal(true);
      return;
    }
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)));
    if (dbLoaded) {
      fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId, pipeline_status: newStatus }),
      }).catch(() => {});
    }
  };

  const confirmCommission = async () => {
    if (!commissionLeadId) return;
    const salePrice = parseFloat(commissionData.sale_price) || 0;
    const pct = parseFloat(commissionData.commission_percent) || 0;
    const amount = commissionData.commission_amount ? parseFloat(commissionData.commission_amount) : salePrice * (pct / 100);
    const updates = {
      id: commissionLeadId,
      pipeline_status: "WON",
      sale_price: salePrice,
      commission_amount: amount,
      commission_percent: pct,
      commission_paid_date: commissionData.commission_paid_date || null,
      brand_id: commissionData.brand_id,
    };
    setLeads((prev) => prev.map((l) => l.id === commissionLeadId ? {
      ...l, status: "WON" as LeadStatus, sale_price: salePrice, commission_amount: amount,
      commission_percent: pct, commission_paid_date: commissionData.commission_paid_date || undefined,
      brand_id: commissionData.brand_id,
    } : l));
    if (dbLoaded) {
      fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).catch(() => {});
    }
    setShowCommissionModal(false);
    setCommissionLeadId(null);
    setCommissionData({ sale_price: "", commission_percent: "3", commission_amount: "", commission_paid_date: "", brand_id: "soleada" });
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
    setActiveTab("leads");
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
    setCsvData([]); setCsvRaw(""); setShowCSVUpload(false); setSaving(false); setActiveTab("leads");
  };

  // ── Document/Image Import ─────────────────────────

  const handleDocFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files).map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      status: "queued" as const,
      leads: [] as Lead[],
      rawText: "",
      confidence: "",
    }));
    setDocFiles((prev) => [...prev, ...newFiles]);
    // Reset file input so the same files can be re-selected
    if (e.target) e.target.value = '';
  };

  const analyzeDocQueue = async () => {
    setDocParsing(true);
    const updated = [...docFiles];
    const allLeads: Lead[] = [];
    let leadCounter = 0;

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status !== "queued") continue;
      updated[i] = { ...updated[i], status: "analyzing" };
      setDocFiles([...updated]);

      try {
        const formData = new FormData();
        formData.append('file', updated[i].file);
        const res = await fetch('/api/contacts/import-document', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const mapped: Lead[] = (data.leads || []).map((l: any) => {
          leadCounter++;
          return {
            id: `DOC${String(leadCounter).padStart(3, '0')}`,
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
            createdAt: new Date().toISOString().split('T')[0],
            interactions: [],
          };
        });
        updated[i] = { ...updated[i], status: "done", leads: mapped, rawText: data.rawText || '', confidence: data.confidence || '' };
        allLeads.push(...mapped);
      } catch (err) {
        updated[i] = { ...updated[i], status: "error", error: err instanceof Error ? err.message : 'Analyse feilet' };
      }
      setDocFiles([...updated]);
    }
    setDocAllLeads(allLeads);
    setDocParsing(false);
  };

  const importDocLeads = async () => {
    const leadsToImport = docAllLeads.length > 0 ? docAllLeads : docFiles.flatMap((f) => f.leads);
    if (leadsToImport.length === 0) return;
    setSaving(true);
    const savedLeads: Lead[] = [];
    for (const lead of leadsToImport) {
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
    setDocFiles([]); setDocAllLeads([]); setShowDocImport(false);
    setSaving(false); setActiveTab("leads");
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
          <h1 className="text-2xl font-bold text-white">CRM</h1>
          <p className="text-sm text-slate-400 mt-1">
            Leads, pipeline og kunder samlet
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-slate-400">
            Total verdi:{" "}
            <span className="text-emerald-400 font-semibold">
              €{(totalValue / 1000).toFixed(0)}K
            </span>
          </div>
          {leads.filter((l) => l.status === "WON" && l.commission_amount).length > 0 && (
            <div className="text-sm text-slate-400">
              Kommisjon:{" "}
              <span className="text-amber-400 font-semibold">
                €{leads.filter((l) => l.status === "WON").reduce((s, l) => s + (l.commission_amount || 0), 0).toLocaleString()}
              </span>
            </div>
          )}
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

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900/50 rounded-lg p-1 w-fit">
        {([
          { key: "leads" as CrmTab, label: "Leads", icon: <UserPlus size={14} />, count: leads.filter((l) => l.status === "NEW").length },
          { key: "pipeline" as CrmTab, label: "Pipeline", icon: <TrendingUp size={14} />, count: leads.filter((l) => ["CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION"].includes(l.status)).length },
          { key: "kunder" as CrmTab, label: "Kunder", icon: <UserCheck size={14} />, count: leads.filter((l) => ["WON", "LOST"].includes(l.status)).length },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-primary-600 text-white shadow-lg"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            {tab.icon}
            {tab.label}
            <Badge variant={activeTab === tab.key ? "default" : "secondary"} className="text-[10px] ml-1">{tab.count}</Badge>
          </button>
        ))}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowDocImport(false); setDocFiles([]); setDocAllLeads([]); }}>
          <Card className="w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <ScanLine size={20} className="text-cyan-400" />Importer fra dokument eller bilde
                </h2>
                <Button variant="ghost" size="icon" onClick={() => { setShowDocImport(false); setDocFiles([]); setDocAllLeads([]); }}><X size={18} /></Button>
              </div>

              <div className="space-y-4">
                {/* Upload area - always visible so user can add more files */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input ref={docFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" multiple onChange={handleDocFiles} className="hidden" />
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleDocFiles} className="hidden" />

                  <button
                    onClick={() => cameraRef.current?.click()}
                    className="p-6 rounded-lg bg-slate-900/50 border border-dashed border-cyan-500/40 text-center hover:bg-cyan-500/5 transition-colors"
                  >
                    <Camera size={32} className="mx-auto text-cyan-400 mb-2" />
                    <p className="text-sm font-medium text-white">Ta bilde</p>
                    <p className="text-[10px] text-slate-500 mt-1">Kamera / mobilkamera</p>
                  </button>

                  <button
                    onClick={() => { if (docFileRef.current) { docFileRef.current.accept = 'image/*,.pdf'; docFileRef.current.click(); } }}
                    className="p-6 rounded-lg bg-slate-900/50 border border-dashed border-purple-500/40 text-center hover:bg-purple-500/5 transition-colors"
                  >
                    <Image size={32} className="mx-auto text-purple-400 mb-2" />
                    <p className="text-sm font-medium text-white">Velg filer</p>
                    <p className="text-[10px] text-slate-500 mt-1">Flere bilder / PDF-er</p>
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

                {/* File queue */}
                {docFiles.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-300">{docFiles.length} fil{docFiles.length !== 1 ? 'er' : ''} i kø</p>
                      {!docParsing && docFiles.some((f) => f.status === "queued") && (
                        <Button size="sm" onClick={analyzeDocQueue} className="gap-1.5">
                          <Sparkles size={14} />Analyser alle
                        </Button>
                      )}
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1.5">
                      {docFiles.map((df, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/50 border border-slate-700">
                          {df.preview ? (
                            <img src={df.preview} alt="" className="h-10 w-10 rounded border border-slate-600 object-cover" />
                          ) : (
                            <div className="h-10 w-10 rounded bg-slate-700 flex items-center justify-center shrink-0">
                              <FileText size={16} className="text-red-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{df.file.name}</p>
                            <p className="text-[10px] text-slate-500">{(df.file.size / 1024).toFixed(0)} KB</p>
                          </div>
                          <div className="shrink-0">
                            {df.status === "queued" && <Badge variant="outline" className="text-[10px]">Venter</Badge>}
                            {df.status === "analyzing" && <Loader2 size={14} className="animate-spin text-cyan-400" />}
                            {df.status === "done" && <Badge variant="default" className="text-[10px] bg-emerald-600">{df.leads.length} leads</Badge>}
                            {df.status === "error" && <Badge variant="destructive" className="text-[10px]">Feil</Badge>}
                          </div>
                          {!docParsing && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDocFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                              <X size={12} />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Parsing indicator */}
                {docParsing && (
                  <div className="flex items-center gap-3 py-3 px-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <Loader2 className="h-5 w-5 animate-spin text-cyan-400 shrink-0" />
                    <div>
                      <p className="text-sm text-slate-300">AI analyserer filer...</p>
                      <p className="text-xs text-slate-500">
                        {docFiles.filter((f) => f.status === "done").length} av {docFiles.length} ferdig
                      </p>
                    </div>
                  </div>
                )}

                {/* Errors */}
                {docFiles.some((f) => f.status === "error") && (
                  <div className="space-y-1">
                    {docFiles.filter((f) => f.status === "error").map((f, i) => (
                      <div key={i} className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-xs text-red-300"><span className="font-medium">{f.file.name}:</span> {f.error}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Results - all leads from all files */}
                {(() => {
                  const allLeads = docAllLeads.length > 0 ? docAllLeads : docFiles.flatMap((f) => f.leads);
                  return allLeads.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-emerald-400 font-medium">
                          {allLeads.length} lead{allLeads.length !== 1 ? 's' : ''} funnet totalt
                        </p>
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-2">
                        {allLeads.map((l, i) => (
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
                        Importer {allLeads.length} leads til pipeline
                      </Button>
                    </div>
                  ) : null;
                })()}

                {docFiles.length === 0 && (
                  <p className="text-[10px] text-slate-500 text-center">
                    Velg flere filer samtidig - AI analyserer de i kø og trekker ut kontaktinfo, avkrysninger og notater
                  </p>
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

      {/* ── Commission Modal (WON) ──────────────────── */}
      {showCommissionModal && commissionLeadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowCommissionModal(false); setCommissionLeadId(null); }}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Banknote size={20} className="text-amber-400" />Registrer salg
                </h2>
                <Button variant="ghost" size="icon" onClick={() => { setShowCommissionModal(false); setCommissionLeadId(null); }}><X size={18} /></Button>
              </div>
              <p className="text-sm text-slate-400 mb-4">
                Kontakt: <span className="text-white font-medium">{leads.find((l) => l.id === commissionLeadId)?.name}</span>
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Salgspris (€)</label>
                  <Input type="number" placeholder="350000" value={commissionData.sale_price}
                    onChange={(e) => {
                      const sp = e.target.value;
                      const pct = parseFloat(commissionData.commission_percent) || 0;
                      setCommissionData((p) => ({ ...p, sale_price: sp, commission_amount: sp ? String(Math.round(parseFloat(sp) * (pct / 100))) : "" }));
                    }} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Kommisjon %</label>
                    <Input type="number" step="0.5" placeholder="3" value={commissionData.commission_percent}
                      onChange={(e) => {
                        const pct = e.target.value;
                        const sp = parseFloat(commissionData.sale_price) || 0;
                        setCommissionData((p) => ({ ...p, commission_percent: pct, commission_amount: sp ? String(Math.round(sp * (parseFloat(pct) / 100))) : "" }));
                      }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Kommisjon (€)</label>
                    <Input type="number" placeholder="10500" value={commissionData.commission_amount}
                      onChange={(e) => setCommissionData((p) => ({ ...p, commission_amount: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Utbetalingsdato</label>
                    <Input type="date" value={commissionData.commission_paid_date}
                      onChange={(e) => setCommissionData((p) => ({ ...p, commission_paid_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Brand</label>
                    <select value={commissionData.brand_id}
                      onChange={(e) => setCommissionData((p) => ({ ...p, brand_id: e.target.value }))}
                      className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                      {BRANDS.filter((b) => b.type === "real_estate").map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button onClick={confirmCommission} className="w-full" disabled={!commissionData.sale_price}>
                  <CheckCircle2 size={16} className="mr-1" />Registrer som solgt
                </Button>
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

      {/* ── Main Layout: Kanban + Detail Panel ──────── */}
      <div className="flex gap-4">

        {/* Kanban Board */}
        <div className={`flex gap-3 overflow-x-auto pb-4 transition-all ${selectedLead ? "flex-1 min-w-0" : "w-full"}`}>
          {columns.filter((col) => TAB_COLUMNS[activeTab].includes(col.key)).map((col) => {
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
                        {lead.status === "WON" && lead.commission_amount ? (
                          <div className="mt-2 pt-1.5 border-t border-slate-700/50 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-500">Salg</span>
                              <span className="text-xs text-emerald-400 font-medium">€{(lead.sale_price || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-500">Kommisjon</span>
                              <span className="text-xs text-amber-400 font-semibold">€{lead.commission_amount.toLocaleString()}</span>
                            </div>
                            {lead.commission_paid_date && (
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500">Utbetalt</span>
                                <span className="text-[10px] text-slate-400">{lead.commission_paid_date}</span>
                              </div>
                            )}
                            {lead.brand_id && (
                              <Badge variant="outline" className="text-[10px]">{BRANDS.find((b) => b.id === lead.brand_id)?.name || lead.brand_id}</Badge>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-700/50">
                            <Badge variant="outline" className="text-[10px]"><Globe size={8} className="mr-1" />{lead.source}</Badge>
                            {lead.interactions.length > 0 && (
                              <Badge variant="secondary" className="text-[10px]"><MessageSquare size={8} className="mr-1" />{lead.interactions.length}</Badge>
                            )}
                          </div>
                        )}
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

                {/* Commission info for WON — editable */}
                {selectedLead.status === "WON" && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                        <Banknote size={14} />Salgsdetaljer
                      </div>
                      <div className="flex gap-1">
                        {!editingCommission ? (
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] text-slate-400 hover:text-white" onClick={() => {
                            setEditingCommission(true);
                            setEditCommissionData({
                              sale_price: String(selectedLead.sale_price || ""),
                              commission_percent: String(selectedLead.commission_percent || "3"),
                              commission_amount: String(selectedLead.commission_amount || ""),
                              commission_paid_date: selectedLead.commission_paid_date || "",
                              brand_id: selectedLead.brand_id || "soleada",
                            });
                          }}>Rediger</Button>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] text-slate-400" onClick={() => setEditingCommission(false)}>Avbryt</Button>
                            <Button size="sm" className="h-6 text-[10px] bg-amber-600 hover:bg-amber-700" onClick={async () => {
                              const sp = parseFloat(editCommissionData.sale_price) || 0;
                              const pct = parseFloat(editCommissionData.commission_percent) || 0;
                              const amt = editCommissionData.commission_amount ? parseFloat(editCommissionData.commission_amount) : sp * (pct / 100);
                              await fetch("/api/contacts", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  id: selectedLead.id,
                                  sale_price: sp || null,
                                  commission_amount: amt || null,
                                  commission_percent: pct || null,
                                  commission_paid_date: editCommissionData.commission_paid_date || null,
                                  brand_id: editCommissionData.brand_id || null,
                                }),
                              });
                              setLeads((prev) => prev.map((l) => l.id === selectedLead.id ? {
                                ...l, sale_price: sp, commission_amount: amt, commission_percent: pct,
                                commission_paid_date: editCommissionData.commission_paid_date || undefined,
                                brand_id: editCommissionData.brand_id,
                              } : l));
                              setSelectedLead((prev) => prev ? {
                                ...prev, sale_price: sp, commission_amount: amt, commission_percent: pct,
                                commission_paid_date: editCommissionData.commission_paid_date || undefined,
                                brand_id: editCommissionData.brand_id,
                              } : prev);
                              setEditingCommission(false);
                            }}>Lagre</Button>
                          </>
                        )}
                      </div>
                    </div>
                    {editingCommission ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500">Salgspris (€)</label>
                          <Input type="number" className="h-7 text-xs" value={editCommissionData.sale_price}
                            onChange={(e) => {
                              const sp = e.target.value;
                              const pct = parseFloat(editCommissionData.commission_percent) || 0;
                              setEditCommissionData((p) => ({ ...p, sale_price: sp, commission_amount: sp ? String(Math.round(parseFloat(sp) * (pct / 100))) : "" }));
                            }} />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500">Kommisjon %</label>
                          <Input type="number" step="0.5" className="h-7 text-xs" value={editCommissionData.commission_percent}
                            onChange={(e) => {
                              const pct = e.target.value;
                              const sp = parseFloat(editCommissionData.sale_price) || 0;
                              setEditCommissionData((p) => ({ ...p, commission_percent: pct, commission_amount: sp ? String(Math.round(sp * (parseFloat(pct) / 100))) : "" }));
                            }} />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500">Kommisjon (€)</label>
                          <Input type="number" className="h-7 text-xs" value={editCommissionData.commission_amount}
                            onChange={(e) => setEditCommissionData((p) => ({ ...p, commission_amount: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500">Utbetalingsdato</label>
                          <Input type="date" className="h-7 text-xs" value={editCommissionData.commission_paid_date}
                            onChange={(e) => setEditCommissionData((p) => ({ ...p, commission_paid_date: e.target.value }))} />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] text-slate-500">Brand</label>
                          <select className="w-full h-7 rounded border border-slate-600 bg-slate-800 px-2 text-xs text-slate-100"
                            value={editCommissionData.brand_id} onChange={(e) => setEditCommissionData((p) => ({ ...p, brand_id: e.target.value }))}>
                            {BRANDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <Button size="sm" variant="destructive" className="h-6 text-[10px] w-full" onClick={async () => {
                            if (!confirm("Fjerne salgsdata og sette tilbake til Forhandling?")) return;
                            await fetch("/api/contacts", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                id: selectedLead.id,
                                pipeline_status: "NEGOTIATION",
                                sale_price: null,
                                commission_amount: null,
                                commission_percent: null,
                                commission_paid_date: null,
                                brand_id: null,
                              }),
                            });
                            setLeads((prev) => prev.map((l) => l.id === selectedLead.id ? {
                              ...l, status: "NEGOTIATION" as LeadStatus, sale_price: undefined, commission_amount: undefined,
                              commission_percent: undefined, commission_paid_date: undefined, brand_id: undefined,
                            } : l));
                            setSelectedLead(null);
                            setEditingCommission(false);
                          }}>
                            <Trash2 size={10} className="mr-1" />Fjern salg og sett tilbake til Forhandling
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-slate-500 text-xs">Salgspris:</span> <span className="text-slate-200">€{(selectedLead.sale_price || 0).toLocaleString()}</span></div>
                        <div><span className="text-slate-500 text-xs">Kommisjon:</span> <span className="text-amber-400 font-semibold">€{(selectedLead.commission_amount || 0).toLocaleString()}</span></div>
                        {selectedLead.commission_paid_date && (
                          <div><span className="text-slate-500 text-xs">Utbetalt:</span> <span className="text-slate-200">{selectedLead.commission_paid_date}</span></div>
                        )}
                        {selectedLead.brand_id && (
                          <div><span className="text-slate-500 text-xs">Brand:</span> <span className="text-slate-200">{BRANDS.find((b) => b.id === selectedLead.brand_id)?.name || selectedLead.brand_id}</span></div>
                        )}
                        {!selectedLead.commission_paid_date && selectedLead.commission_amount && (
                          <div className="col-span-2"><Badge className="bg-orange-500/20 text-orange-400 text-[10px]">Venter på utbetaling</Badge></div>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
