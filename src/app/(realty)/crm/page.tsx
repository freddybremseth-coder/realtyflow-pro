"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, Mail, Phone, User, Building2,
  MessageSquare, Calendar, Eye, Pencil,
  Users, Filter, ArrowUpDown, X, Send,
  ArrowRight, Bot, Clock, CheckCircle2,
  Sparkles, Loader2, Undo2, UserCheck,
  KeyRound, FileUp, Home, MapPinned, RefreshCw,
} from "lucide-react";

type CustomerStatus = "ACTIVE" | "VIP" | "INACTIVE";
type CustomerType = "BUYER" | "SELLER" | "INVESTOR";

interface Interaction {
  id: string;
  type: "email" | "call" | "meeting" | "note" | "ai";
  content: string;
  date: string;
  direction?: "in" | "out";
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  brandId?: string;
  status: CustomerStatus;
  type: CustomerType;
  preferredLocation: string;
  budget?: string;
  lastContact: string;
  notes: string;
  interactions: Interaction[];
  avatar: string;
  nextStep?: string;
}

interface PortalUser {
  id?: string;
  status?: string;
  invited_at?: string;
  last_login_at?: string | null;
  brand_id?: string;
}

interface PortalMessage {
  id: string;
  sender_type: "customer" | "admin" | "system";
  sender_name?: string | null;
  body: string;
  created_at: string;
  read_by_customer_at?: string | null;
}

interface PortalDocument {
  id: string;
  title: string;
  summary?: string;
  recipients?: string;
  sent_to?: string[];
  published_at?: string | null;
  generated_at?: string | null;
  created_at?: string | null;
}

interface PortalSuggestion {
  id: string;
  title?: string;
  title_no?: string;
  title_en?: string;
  name?: string;
  ref?: string;
  location?: string;
  town?: string;
  municipality?: string;
  price?: number;
  area?: number;
  bedrooms?: number;
  bathrooms?: number;
  match_score?: number;
}

interface PortalAdminData {
  portalUser: PortalUser | null;
  messages: PortalMessage[];
  documents: PortalDocument[];
  properties: PortalSuggestion[];
  plots: PortalSuggestion[];
  warnings?: string[];
}

const initialCustomers: Customer[] = [
  {
    id: "C001", name: "Erik Hansen", email: "erik.hansen@gmail.com", phone: "+47 912 34 567",
    status: "VIP", type: "BUYER", preferredLocation: "Altea, Costa Blanca", budget: "€300K - €500K",
    lastContact: "2024-03-14", notes: "Søker villa med havutsikt. Planlegger besøk i april.",
    avatar: "EH", nextStep: "Ring for å bekrefte visningsdato i april",
    interactions: [
      { id: "i1", type: "email", content: "Sendt 3 villaforslag i Altea-området", date: "2024-03-14", direction: "out" },
      { id: "i2", type: "call", content: "Diskuterte budsjett og preferanser. Ønsker havutsikt.", date: "2024-03-10", direction: "out" },
      { id: "i3", type: "email", content: "Første henvendelse via Soleada.no kontaktskjema", date: "2024-03-05", direction: "in" },
      { id: "i4", type: "ai", content: "AI-anbefaling: Erik har høy kjøpsintensjon (score 85). Anbefaler å booke visning innen 2 uker.", date: "2024-03-14" },
    ],
  },
  {
    id: "C002", name: "Ingrid Pedersen", email: "ingrid.p@outlook.no", phone: "+47 978 90 123",
    status: "ACTIVE", type: "INVESTOR", preferredLocation: "Torrevieja, Alicante", budget: "€150K - €250K",
    lastContact: "2024-03-10", notes: "Interessert i utleieeiendommer. Ønsker 2-3 leiligheter.",
    avatar: "IP", nextStep: "Send ROI-analyse for Torrevieja utleiemarked",
    interactions: [
      { id: "i5", type: "meeting", content: "Videomøte: Gikk gjennom 5 investeringsobjekter", date: "2024-03-10" },
      { id: "i6", type: "email", content: "Sendt markedsrapport for Torrevieja", date: "2024-03-05", direction: "out" },
      { id: "i7", type: "ai", content: "AI-anbefaling: Investor-profil. Fokuser på yield-tall og utleiepotensial.", date: "2024-03-10" },
    ],
  },
  {
    id: "C003", name: "Knut Eriksen", email: "knut.e@yahoo.no", phone: "+47 956 78 901",
    status: "ACTIVE", type: "BUYER", preferredLocation: "Benidorm, Costa Blanca", budget: "€200K - €350K",
    lastContact: "2024-03-08", notes: "Pensjonist. Søker leilighet nær strand for overvintring.",
    avatar: "KE", nextStep: "Følg opp med leilighetsvisning i Benidorm sentrum",
    interactions: [
      { id: "i8", type: "call", content: "Samtale om Benidorm vs Villajoyosa. Foretrekker Benidorm.", date: "2024-03-08", direction: "out" },
      { id: "i9", type: "email", content: "Sendt info om 4 leiligheter med strandnærhet", date: "2024-03-03", direction: "out" },
    ],
  },
  {
    id: "C004", name: "Maria Solberg", email: "maria.s@hotmail.com", phone: "+47 934 56 789",
    status: "VIP", type: "SELLER", preferredLocation: "Jávea, Costa Blanca",
    lastContact: "2024-03-12", notes: "Selger villa i Jávea. Estimert verdi €620K.",
    avatar: "MS", nextStep: "Bestill profesjonell fotograf for listing",
    interactions: [
      { id: "i10", type: "meeting", content: "Besøk på eiendommen. Tok bilder og mål.", date: "2024-03-12" },
      { id: "i11", type: "email", content: "Sendt vurderingsrapport med AI-analyse", date: "2024-03-08", direction: "out" },
      { id: "i12", type: "call", content: "Første samtale. Ønsker å selge innen sommeren.", date: "2024-03-01", direction: "in" },
    ],
  },
  {
    id: "C005", name: "Per Olsen", email: "per.o@telia.no", phone: "+47 478 90 123",
    status: "INACTIVE", type: "BUYER", preferredLocation: "Calpe, Costa Blanca", budget: "€180K - €280K",
    lastContact: "2024-01-20", notes: "Har ikke svart på henvendelser siden januar.",
    avatar: "PO", nextStep: "Send re-engagement e-post med nye listings",
    interactions: [
      { id: "i13", type: "email", content: "Oppfølgings-epost sendt (ingen svar)", date: "2024-02-15", direction: "out" },
      { id: "i14", type: "email", content: "Sendt nye leiligheter i Calpe", date: "2024-01-20", direction: "out" },
      { id: "i15", type: "ai", content: "AI-anbefaling: Kunden har vært inaktiv i 2 måneder. Anbefaler å sende personlig melding eller avslutte.", date: "2024-03-14" },
    ],
  },
];

function statusVariant(status: CustomerStatus) {
  switch (status) { case "VIP": return "warning" as const; case "ACTIVE": return "success" as const; case "INACTIVE": return "secondary" as const; }
}
function typeLabel(type: CustomerType) {
  switch (type) { case "BUYER": return "Kjøper"; case "SELLER": return "Selger"; case "INVESTOR": return "Investor"; }
}
function typeVariant(type: CustomerType) {
  switch (type) { case "BUYER": return "default" as const; case "SELLER": return "success" as const; case "INVESTOR": return "warning" as const; }
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

type PipelineStage = "NEW" | "CONTACT" | "QUALIFIED" | "VIEWING" | "NEGOTIATION" | "CUSTOMER" | "VIP";

const PIPELINE_STAGES: { value: PipelineStage; label: string }[] = [
  { value: "CUSTOMER", label: "Kunde (CRM)" },
  { value: "VIP", label: "VIP-kunde" },
  { value: "NEW", label: "Ny lead (Pipeline)" },
  { value: "CONTACT", label: "Kontaktet (Pipeline)" },
  { value: "QUALIFIED", label: "Kvalifisert (Pipeline)" },
  { value: "VIEWING", label: "Visning (Pipeline)" },
  { value: "NEGOTIATION", label: "Forhandling (Pipeline)" },
];

const BRAND_OPTIONS = [
  { value: "zeneco", label: "Zen Eco Homes" },
  { value: "pinosoecolife", label: "Pinoso Eco Life" },
  { value: "soleada", label: "Soleada" },
];

function brandLabel(brandId?: string | null) {
  return BRAND_OPTIONS.find((brand) => brand.value === brandId)?.label || brandId || "Zen Eco Homes";
}

const emptyCustomer = { name: "", email: "", phone: "", brandId: "zeneco", type: "BUYER" as CustomerType, pipelineStage: "CUSTOMER" as PipelineStage, location: "", budget: "", notes: "" };

function formatDateTime(value?: string | null) {
  if (!value) return "Ikke registrert";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
}

function formatPrice(value?: unknown) {
  if (!value || !Number.isFinite(Number(value))) return "";
  return `€${Number(value).toLocaleString("nb-NO")}`;
}

function suggestionTitle(item: PortalSuggestion, fallback: string) {
  return item.title_no || item.title || item.title_en || item.name || item.ref || fallback;
}

function parseEmailDraft(value: string, customerName: string) {
  const lines = value.split(/\r?\n/);
  const subjectLine = lines.find((line) => /^subject|^emne/i.test(line.trim()));
  const subject = subjectLine
    ? subjectLine.replace(/^subject\s*:|^emne\s*:/i, "").trim()
    : `Oppfølging fra RealtyFlow`;
  const body = subjectLine
    ? lines.filter((line) => line !== subjectLine).join("\n").replace(/^body\s*:|^tekst\s*:/i, "").trim()
    : value.trim();

  return {
    subject: subject || `Oppfølging til ${customerName}`,
    bodyText: body || value.trim(),
  };
}

export default function CRMPage() {
  const [customers, setCustomers] = useState(initialCustomers);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alle");
  const [typeFilter, setTypeFilter] = useState("Alle");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState(emptyCustomer);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailContent, setEmailContent] = useState("");
  const [showCallLog, setShowCallLog] = useState(false);
  const [callNotes, setCallNotes] = useState("");
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingData, setMeetingData] = useState({ date: "", time: "", notes: "" });
  const [dbLoaded, setDbLoaded] = useState(false);
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", brandId: "zeneco", budget: "", preferredLocation: "", notes: "", status: "ACTIVE" as CustomerStatus, type: "BUYER" as CustomerType });
  const [portalAdmin, setPortalAdmin] = useState<PortalAdminData | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalActionLoading, setPortalActionLoading] = useState<string | null>(null);
  const [portalStatus, setPortalStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [portalTemporaryPassword, setPortalTemporaryPassword] = useState("");
  const [portalMessage, setPortalMessage] = useState("");
  const [portalDocTitle, setPortalDocTitle] = useState("Områdeguide og neste steg");
  const [portalDocPrompt, setPortalDocPrompt] = useState("");
  const [portalDocDraft, setPortalDocDraft] = useState("");
  const [portalDocApproved, setPortalDocApproved] = useState(false);
  const [portalDocGenerating, setPortalDocGenerating] = useState(false);

  // Load customers from database
  const loadCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts?view=crm');
      const { contacts } = await res.json();
      if (contacts && contacts.length > 0) {
        const mapped: Customer[] = contacts.map((c: any) => ({
          id: c.id,
          name: c.name || '',
          email: c.email || '',
          phone: c.phone || '',
          brandId: c.brand_id || c.brand || 'zeneco',
          status: mapPipelineToCustomerStatus(c.pipeline_status),
          type: ((c.type || 'buyer').toUpperCase() as CustomerType),
          preferredLocation: c.preferred_location || c.interested_in || '',
          budget: c.budget || undefined,
          lastContact: c.last_contact ? c.last_contact.split('T')[0] : c.updated_at?.split('T')[0] || '',
          notes: c.notes || '',
          interactions: c.interactions || [],
          avatar: (c.name || '').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase(),
          nextStep: c.next_step || undefined,
        }));
        setCustomers(mapped);
        setDbLoaded(true);
      }
    } catch {
      // Fallback to hardcoded data silently
    }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const loadPortalAdmin = useCallback(async (customer: Customer | null) => {
    if (!customer?.id || !customer.email) {
      setPortalAdmin(null);
      return;
    }
    setPortalLoading(true);
    try {
      const res = await fetch(`/api/crm/portal-admin?contactId=${encodeURIComponent(customer.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente Min side-data");
      setPortalAdmin({
        portalUser: data.portalUser || null,
        messages: data.messages || [],
        documents: data.documents || [],
        properties: data.properties || [],
        plots: data.plots || [],
        warnings: data.warnings || [],
      });
    } catch (err) {
      setPortalAdmin(null);
      setPortalStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Kunne ikke hente Min side-data",
      });
    } finally {
      setPortalLoading(false);
    }
  }, []);

  useEffect(() => {
    setPortalStatus(null);
    setPortalTemporaryPassword("");
    setPortalMessage("");
    setPortalDocDraft("");
    setPortalDocApproved(false);
    setEmailStatus(null);
    loadPortalAdmin(selectedCustomer);
  }, [loadPortalAdmin, selectedCustomer]);

  function mapPipelineToCustomerStatus(status: string): CustomerStatus {
    switch (status) {
      case 'VIP': return 'VIP';
      case 'LOST':
      case 'INACTIVE': return 'INACTIVE';
      default: return 'ACTIVE';
    }
  }

  const generateAiDraft = async () => {
    if (!selectedCustomer) return;
    setAiDraftLoading(true);
    try {
      const res = await fetch('/api/contacts/email-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: {
            name: selectedCustomer.name,
            email: selectedCustomer.email,
            status: selectedCustomer.status,
            type: selectedCustomer.type,
            property: selectedCustomer.preferredLocation,
            last_contact: selectedCustomer.lastContact,
            notes: selectedCustomer.notes,
          },
          context: selectedCustomer.nextStep || 'Generell oppfolging',
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

  const sendToPipeline = async (customerId: string) => {
    if (dbLoaded) {
      await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: customerId, pipeline_status: 'QUALIFIED' }),
      }).catch(() => {});
    }
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    if (selectedCustomer?.id === customerId) setSelectedCustomer(null);
  };

  const openEditModal = () => {
    if (!selectedCustomer) return;
    setEditForm({
      name: selectedCustomer.name,
      email: selectedCustomer.email,
      phone: selectedCustomer.phone,
      brandId: selectedCustomer.brandId || "zeneco",
      budget: selectedCustomer.budget || "",
      preferredLocation: selectedCustomer.preferredLocation,
      notes: selectedCustomer.notes,
      status: selectedCustomer.status,
      type: selectedCustomer.type,
    });
    setShowEditModal(true);
  };

  const saveEditedCustomer = async () => {
    if (!selectedCustomer || !editForm.name) return;
    const updated: Customer = {
      ...selectedCustomer,
      name: editForm.name,
      email: editForm.email,
      phone: editForm.phone,
      brandId: editForm.brandId,
      budget: editForm.budget || undefined,
      preferredLocation: editForm.preferredLocation,
      notes: editForm.notes,
      status: editForm.status,
      type: editForm.type,
      avatar: editForm.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2),
    };
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
    setSelectedCustomer(updated);
    setShowEditModal(false);
    if (dbLoaded) {
      await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: updated.id,
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          brand_id: updated.brandId,
          budget: updated.budget,
          preferred_location: updated.preferredLocation,
          notes: updated.notes,
          type: updated.type.toLowerCase(),
        }),
      }).catch(() => {});
    }
  };

  const filtered = customers.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "Alle" && c.status !== statusFilter) return false;
    if (typeFilter !== "Alle" && c.type !== typeFilter) return false;
    return true;
  });

  const addCustomer = async () => {
    if (!newCustomer.name) return;
    const now = new Date().toISOString();
    const pipelineStatus = newCustomer.pipelineStage || 'CUSTOMER';
    const contactPayload = {
      name: newCustomer.name,
      email: newCustomer.email,
      phone: newCustomer.phone,
      brand_id: newCustomer.brandId,
      type: newCustomer.type.toLowerCase(), // DB uses lowercase: buyer, seller, investor
      pipeline_status: pipelineStatus,
      preferred_location: newCustomer.location,
      budget: newCustomer.budget || null,
      notes: newCustomer.notes || null,
      created_at: now,
      updated_at: now,
    };

    let customerId = `C${String(customers.length + 1).padStart(3, "0")}`;
    let saveOk = false;
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactPayload),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('[CRM] Save failed:', data.error);
      } else if (data.contact?.id) {
        customerId = data.contact.id;
        saveOk = true;
      }
    } catch (err) {
      console.error('[CRM] Network error saving contact:', err);
    }

    // Only add to CRM view if pipeline_status is a CRM stage
    const isCrmStage = ['WON', 'CUSTOMER', 'VIP'].includes(pipelineStatus);

    if (isCrmStage) {
      const customer: Customer = {
        id: customerId,
        name: newCustomer.name, email: newCustomer.email, phone: newCustomer.phone,
        brandId: newCustomer.brandId,
        status: pipelineStatus === 'VIP' ? 'VIP' : 'ACTIVE',
        type: newCustomer.type, preferredLocation: newCustomer.location,
        budget: newCustomer.budget || undefined, lastContact: now.split("T")[0],
        notes: newCustomer.notes, avatar: newCustomer.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase(),
        interactions: [{ id: `i${Date.now()}`, type: "note", content: "Kunde opprettet", date: now.split("T")[0] }],
        nextStep: "Ta f\u00f8rste kontakt",
      };
      setCustomers((prev) => [customer, ...prev]);
    }

    setNewCustomer(emptyCustomer);
    setShowNewCustomer(false);

    if (!isCrmStage && saveOk) {
      alert(`${newCustomer.name} lagt til i Pipeline som "${PIPELINE_STAGES.find(s => s.value === pipelineStatus)?.label}". Gå til Pipeline for å se.`);
    }
  };

  const addInteraction = (type: "email" | "call" | "meeting", content: string) => {
    if (!selectedCustomer || !content) return;
    const interaction: Interaction = {
      id: `i${Date.now()}`, type, content, date: new Date().toISOString().split("T")[0],
      direction: type === "email" ? "out" : undefined,
    };
    const updatedInteractions = [interaction, ...selectedCustomer.interactions];
    setCustomers((prev) => prev.map((c) =>
      c.id === selectedCustomer.id ? { ...c, interactions: updatedInteractions, lastContact: interaction.date } : c
    ));
    setSelectedCustomer((prev) => prev ? { ...prev, interactions: updatedInteractions, lastContact: interaction.date } : null);
    // Persist to DB
    if (dbLoaded) {
      fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedCustomer.id,
          interactions: updatedInteractions,
          last_contact: interaction.date,
        }),
      }).catch(() => {});
    }
  };

  const sendEmail = async () => {
    if (!selectedCustomer || !emailContent.trim()) return;
    setEmailSending(true);
    setEmailStatus(null);
    const parsed = parseEmailDraft(emailContent, selectedCustomer.name);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: selectedCustomer.brandId || "zeneco",
          to: selectedCustomer.email,
          subject: parsed.subject,
          body_text: parsed.bodyText,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke sende e-post.");
      addInteraction("email", `E-post sendt: ${parsed.subject}\n${parsed.bodyText}`);
      setEmailContent("");
      setShowEmailModal(false);
      setEmailStatus({ type: "success", message: `E-post sendt til ${selectedCustomer.email}.` });
    } catch (err) {
      setEmailStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Kunne ikke sende e-post.",
      });
    } finally {
      setEmailSending(false);
    }
  };

  const inviteSelectedCustomerToPortal = async () => {
    if (!selectedCustomer) return;
    setPortalActionLoading("invite");
    setPortalStatus(null);
    setPortalTemporaryPassword("");
    try {
      const res = await fetch("/api/portal/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selectedCustomer.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke opprette portaltilgang.");
      setPortalTemporaryPassword(data.temporaryPassword || "");
      setPortalStatus({
        type: "success",
        message: "Portaltilgang er opprettet. Passordet er ikke sendt automatisk, så del det kontrollert med kunden.",
      });
      await loadPortalAdmin(selectedCustomer);
      await loadCustomers();
    } catch (err) {
      setPortalStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Kunne ikke opprette portaltilgang.",
      });
    } finally {
      setPortalActionLoading(null);
    }
  };

  const sendPortalMessage = async () => {
    if (!selectedCustomer || !portalMessage.trim()) return;
    setPortalActionLoading("message");
    setPortalStatus(null);
    try {
      const res = await fetch("/api/crm/portal-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "message",
          contactId: selectedCustomer.id,
          message: portalMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke sende melding til Min side.");
      setPortalMessage("");
      setPortalStatus({ type: "success", message: "Melding sendt til kundens Min side." });
      await loadPortalAdmin(selectedCustomer);
      await loadCustomers();
    } catch (err) {
      setPortalStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Kunne ikke sende melding til Min side.",
      });
    } finally {
      setPortalActionLoading(null);
    }
  };

  const generatePortalDocument = async () => {
    if (!selectedCustomer) return;
    setPortalDocGenerating(true);
    setPortalStatus(null);
    setPortalDocApproved(false);
    try {
      const title = portalDocTitle.trim() || "Kundedokument";
      const res = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          audience: `${selectedCustomer.name} (${typeLabel(selectedCustomer.type)})`,
          customPrompt: [
            `Kunde: ${selectedCustomer.name}`,
            `E-post: ${selectedCustomer.email}`,
            `Brand: ${brandLabel(selectedCustomer.brandId)}`,
            `Type: ${typeLabel(selectedCustomer.type)}`,
            `Område/interesse: ${selectedCustomer.preferredLocation || "Ikke spesifisert"}`,
            selectedCustomer.budget ? `Budsjett: ${selectedCustomer.budget}` : "",
            selectedCustomer.notes ? `CRM-notater: ${selectedCustomer.notes}` : "",
            portalDocPrompt ? `Ønsket vinkling: ${portalDocPrompt}` : "",
            "Dokumentet skal kunne publiseres direkte til kundens Min side.",
          ].filter(Boolean).join("\n"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke generere dokument.");
      setPortalDocDraft(String(data.markdown || ""));
    } catch (err) {
      setPortalStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Kunne ikke generere dokument.",
      });
    } finally {
      setPortalDocGenerating(false);
    }
  };

  const publishPortalDocument = async () => {
    if (!selectedCustomer || !portalDocDraft.trim()) return;
    if (!portalDocApproved) {
      setPortalStatus({ type: "error", message: "Kvalitetssjekk og godkjenn dokumentet før publisering." });
      return;
    }
    setPortalActionLoading("document");
    setPortalStatus(null);
    try {
      const res = await fetch("/api/crm/portal-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish_document",
          contactId: selectedCustomer.id,
          title: portalDocTitle || "Kundedokument",
          content: portalDocDraft,
          sourceTopic: "CRM kundedokument",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke publisere dokument.");
      setPortalStatus({ type: "success", message: "Dokument publisert til kundens Min side." });
      await loadPortalAdmin(selectedCustomer);
      await loadCustomers();
    } catch (err) {
      setPortalStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Kunne ikke publisere dokument.",
      });
    } finally {
      setPortalActionLoading(null);
    }
  };

  const sharePortalSuggestion = async (kind: "property" | "plot", itemId: string) => {
    if (!selectedCustomer) return;
    const action = kind === "property" ? "share_property" : "share_plot";
    setPortalActionLoading(`${action}:${itemId}`);
    setPortalStatus(null);
    try {
      const res = await fetch("/api/crm/portal-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, contactId: selectedCustomer.id, itemId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke publisere forslag.");
      setPortalStatus({
        type: "success",
        message: `${kind === "property" ? "Boligforslag" : "Tomteforslag"} publisert til kundens Min side.`,
      });
      await loadPortalAdmin(selectedCustomer);
      await loadCustomers();
    } catch (err) {
      setPortalStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Kunne ikke publisere forslag.",
      });
    } finally {
      setPortalActionLoading(null);
    }
  };

  const logCall = () => { addInteraction("call", callNotes); setCallNotes(""); setShowCallLog(false); };
  const bookMeeting = () => { addInteraction("meeting", `Møte ${meetingData.date} kl ${meetingData.time}: ${meetingData.notes}`); setMeetingData({ date: "", time: "", notes: "" }); setShowMeetingModal(false); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Kundebehandling (CRM)</h1>
          <p className="text-sm text-slate-400 mt-1">Administrer kunder, kjøpere, selgere og investorer</p>
        </div>
        <Button size="sm" onClick={() => setShowNewCustomer(true)}>
          <Plus size={16} className="mr-1" />
          Ny Kunde
        </Button>
      </div>

      {/* New Customer Modal */}
      {showNewCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNewCustomer(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2"><User size={20} className="text-primary-400" />Ny Kunde</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowNewCustomer(false)}><X size={18} /></Button>
              </div>
              <div className="space-y-3">
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Navn *</label><Input placeholder="Fullt navn" value={newCustomer.name} onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">E-post</label><Input placeholder="epost@example.com" value={newCustomer.email} onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))} /></div>
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">Telefon</label><Input placeholder="+47 xxx xx xxx" value={newCustomer.phone} onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))} /></div>
                </div>
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Brand</label>
                  <select value={newCustomer.brandId} onChange={(e) => setNewCustomer((p) => ({ ...p, brandId: e.target.value }))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    {BRAND_OPTIONS.map((brand) => <option key={brand.value} value={brand.value}>{brand.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">Type</label>
                    <select value={newCustomer.type} onChange={(e) => setNewCustomer((p) => ({ ...p, type: e.target.value as CustomerType }))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                      <option value="BUYER">Kjøper</option><option value="SELLER">Selger</option><option value="INVESTOR">Investor</option>
                    </select>
                  </div>
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">Budsjett</label><Input placeholder="€300K - €500K" value={newCustomer.budget} onChange={(e) => setNewCustomer((p) => ({ ...p, budget: e.target.value }))} /></div>
                </div>
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Status / Pipeline-steg</label>
                  <select value={newCustomer.pipelineStage} onChange={(e) => setNewCustomer((p) => ({ ...p, pipelineStage: e.target.value as PipelineStage }))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    {PIPELINE_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">Velg hvor i prosessen denne kontakten er</p>
                </div>
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Foretrukket lokasjon</label><Input placeholder="Altea, Costa Blanca" value={newCustomer.location} onChange={(e) => setNewCustomer((p) => ({ ...p, location: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Notater</label><textarea placeholder="Tilleggsinfo..." value={newCustomer.notes} onChange={(e) => setNewCustomer((p) => ({ ...p, notes: e.target.value }))} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-20 resize-none" /></div>
                <Button onClick={addCustomer} className="w-full" disabled={!newCustomer.name}><Plus size={16} className="mr-1" />Legg til kunde</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowEmailModal(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">E-post til {selectedCustomer.name}</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowEmailModal(false)}><X size={18} /></Button>
              </div>
              <p className="text-xs text-slate-400 mb-2">Til: {selectedCustomer.email} · Fra brand: {brandLabel(selectedCustomer.brandId)}</p>
              <textarea value={emailContent} onChange={(e) => setEmailContent(e.target.value)} placeholder="Skriv din melding..." className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-40 resize-none mb-3" />
              {emailStatus && (
                <p className={`mb-3 rounded-lg border p-2 text-xs ${emailStatus.type === "success" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-red-500/20 bg-red-500/10 text-red-300"}`}>
                  {emailStatus.message}
                </p>
              )}
              <div className="flex gap-2">
                <Button onClick={sendEmail} className="flex-1" disabled={!emailContent || emailSending}>
                  {emailSending ? <Loader2 size={16} className="mr-1 animate-spin" /> : <Send size={16} className="mr-1" />}
                  Send e-post
                </Button>
                <Button variant="outline" onClick={generateAiDraft} disabled={aiDraftLoading}>
                  {aiDraftLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Call Log Modal */}
      {showCallLog && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCallLog(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Ring {selectedCustomer.name}</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowCallLog(false)}><X size={18} /></Button>
              </div>
              <p className="text-xs text-slate-400 mb-2">Telefon: {selectedCustomer.phone}</p>
              <a href={`tel:${selectedCustomer.phone}`} className="block mb-3"><Button variant="outline" className="w-full"><Phone size={16} className="mr-1" />Ring nå</Button></a>
              <textarea value={callNotes} onChange={(e) => setCallNotes(e.target.value)} placeholder="Logg samtalenotater etter samtalen..." className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-24 resize-none mb-3" />
              <Button onClick={logCall} className="w-full" disabled={!callNotes}><CheckCircle2 size={16} className="mr-1" />Logg samtale</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Meeting Modal */}
      {showMeetingModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowMeetingModal(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Book møte med {selectedCustomer.name}</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowMeetingModal(false)}><X size={18} /></Button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Dato</label><Input type="date" value={meetingData.date} onChange={(e) => setMeetingData((p) => ({ ...p, date: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Tid</label><Input type="time" value={meetingData.time} onChange={(e) => setMeetingData((p) => ({ ...p, time: e.target.value }))} /></div>
              </div>
              <textarea value={meetingData.notes} onChange={(e) => setMeetingData((p) => ({ ...p, notes: e.target.value }))} placeholder="Møteagenda / notater..." className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-24 resize-none mb-3" />
              <Button onClick={bookMeeting} className="w-full" disabled={!meetingData.date}><Calendar size={16} className="mr-1" />Book møte</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Customer Modal */}
      {showEditModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowEditModal(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Rediger {selectedCustomer.name}</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowEditModal(false)}><X size={18} /></Button>
              </div>
              <div className="space-y-3">
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Navn</label><Input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">E-post</label><Input type="email" value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">Telefon</label><Input value={editForm.phone} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
                </div>
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Brand</label>
                  <select value={editForm.brandId} onChange={(e) => setEditForm(f => ({ ...f, brandId: e.target.value }))} className="w-full h-10 rounded-md border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    {BRAND_OPTIONS.map((brand) => <option key={brand.value} value={brand.value}>{brand.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">Budsjett</label><Input placeholder="€200K - €400K" value={editForm.budget} onChange={(e) => setEditForm(f => ({ ...f, budget: e.target.value }))} /></div>
                  <div><label className="text-xs font-medium text-slate-300 mb-1 block">Foretrukket lokasjon</label><Input value={editForm.preferredLocation} onChange={(e) => setEditForm(f => ({ ...f, preferredLocation: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Status</label>
                    <select value={editForm.status} onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value as CustomerStatus }))} className="w-full h-10 rounded-md border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                      <option value="ACTIVE">Aktiv</option>
                      <option value="VIP">VIP</option>
                      <option value="INACTIVE">Inaktiv</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Type</label>
                    <select value={editForm.type} onChange={(e) => setEditForm(f => ({ ...f, type: e.target.value as CustomerType }))} className="w-full h-10 rounded-md border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                      <option value="BUYER">Kjøper</option>
                      <option value="SELLER">Selger</option>
                      <option value="INVESTOR">Investor</option>
                    </select>
                  </div>
                </div>
                <div><label className="text-xs font-medium text-slate-300 mb-1 block">Notater</label><textarea value={editForm.notes} onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-24 resize-none" /></div>
                <Button onClick={saveEditedCustomer} className="w-full" disabled={!editForm.name}><CheckCircle2 size={16} className="mr-1" />Lagre endringer</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Totalt kunder", value: customers.length, icon: Users, color: "text-primary-400" },
          { label: "VIP kunder", value: customers.filter((c) => c.status === "VIP").length, icon: User, color: "text-amber-400" },
          { label: "Aktive", value: customers.filter((c) => c.status === "ACTIVE").length, icon: Building2, color: "text-emerald-400" },
          { label: "Investorer", value: customers.filter((c) => c.type === "INVESTOR").length, icon: Building2, color: "text-purple-400" },
        ].map((stat) => (
          <Card key={stat.label}><CardContent className="p-3"><div className="flex items-center justify-between"><div><p className="text-[10px] text-slate-500 uppercase tracking-wider">{stat.label}</p><p className="text-xl font-bold text-white mt-0.5">{stat.value}</p></div><stat.icon size={20} className={`${stat.color} opacity-60`} /></div></CardContent></Card>
        ))}
      </div>

      {/* Search & Filter */}
      <Card><CardContent className="p-4"><div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><Input placeholder="Søk etter kunde..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
        <div className="flex items-center gap-2"><Filter size={14} className="text-slate-400" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"><option value="Alle">Alle statuser</option><option value="VIP">VIP</option><option value="ACTIVE">Aktiv</option><option value="INACTIVE">Inaktiv</option></select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"><option value="Alle">Alle typer</option><option value="BUYER">Kjøper</option><option value="SELLER">Selger</option><option value="INVESTOR">Investor</option></select>
        </div>
      </div></CardContent></Card>

      {/* Customer Table + Detail */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-slate-700/50">
            <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider"><button className="flex items-center gap-1 hover:text-slate-200">Kunde <ArrowUpDown size={12} /></button></th>
            <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Kontakt</th>
            <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
            <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
            <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Sist kontakt</th>
          </tr></thead><tbody>
            {filtered.map((customer) => (
              <tr key={customer.id} onClick={() => setSelectedCustomer(customer)} className={`border-b border-slate-700/30 hover:bg-slate-800/50 cursor-pointer transition-colors ${selectedCustomer?.id === customer.id ? "bg-slate-800/70" : ""}`}>
                <td className="p-4"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500/30 to-purple-500/30 flex items-center justify-center text-xs font-semibold text-slate-200">{customer.avatar}</div><div><p className="text-sm font-medium text-slate-100">{customer.name}</p><p className="text-xs text-slate-500">{customer.preferredLocation}</p></div></div></td>
                <td className="p-4"><div className="space-y-1"><div className="flex items-center gap-1 text-xs text-slate-400"><Mail size={10} /><span>{customer.email}</span></div><div className="flex items-center gap-1 text-xs text-slate-400"><Phone size={10} /><span>{customer.phone}</span></div></div></td>
                <td className="p-4"><Badge variant={statusVariant(customer.status)}>{customer.status}</Badge></td>
                <td className="p-4"><Badge variant={typeVariant(customer.type)}>{typeLabel(customer.type)}</Badge></td>
                <td className="p-4 text-xs text-slate-400">{customer.lastContact}</td>
              </tr>
            ))}
          </tbody></table></div></CardContent></Card>
        </div>

        {/* Detail Panel with Dialog History */}
        <div>
          {selectedCustomer ? (
            <div className="space-y-4">
              <Card className="sticky top-6">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500/30 to-purple-500/30 flex items-center justify-center text-base font-semibold text-slate-200">{selectedCustomer.avatar}</div>
                    <div><CardTitle>{selectedCustomer.name}</CardTitle><div className="flex items-center gap-2 mt-1"><Badge variant={statusVariant(selectedCustomer.status)} className="text-[10px]">{selectedCustomer.status}</Badge><Badge variant={typeVariant(selectedCustomer.type)} className="text-[10px]">{typeLabel(selectedCustomer.type)}</Badge></div></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-300"><Mail size={14} className="text-slate-500" />{selectedCustomer.email}</div>
                    <div className="flex items-center gap-2 text-sm text-slate-300"><Phone size={14} className="text-slate-500" />{selectedCustomer.phone}</div>
                    <div className="flex items-center gap-2 text-sm text-slate-300"><Building2 size={14} className="text-slate-500" />Brand: {brandLabel(selectedCustomer.brandId)}</div>
                    <div className="flex items-center gap-2 text-sm text-slate-300"><Building2 size={14} className="text-slate-500" />{selectedCustomer.preferredLocation}</div>
                    <div className="flex items-center gap-2 text-sm text-amber-300"><Clock size={14} className="text-slate-500" />Siste kontakt: {selectedCustomer.lastContact || "Ikke logget"}</div>
                    {selectedCustomer.budget && <div className="flex items-center gap-2 text-sm text-emerald-400"><span className="text-slate-500 text-xs">Budsjett:</span>{selectedCustomer.budget}</div>}
                  </div>

                  {/* Next Step - AI proactive */}
                  {selectedCustomer.nextStep && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <ArrowRight size={14} className="text-amber-400" />
                        <p className="text-xs font-semibold text-amber-300">Neste steg (AI-anbefalt)</p>
                      </div>
                      <p className="text-sm text-slate-200">{selectedCustomer.nextStep}</p>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
                    <p className="text-xs text-slate-500 mb-1">Notater</p>
                    <p className="text-sm text-slate-300">{selectedCustomer.notes}</p>
                  </div>

                  {/* Action Buttons */}
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
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" size="sm" className="text-xs" onClick={generateAiDraft} disabled={aiDraftLoading}>
                      {aiDraftLoading ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Sparkles size={12} className="mr-1" />}
                      AI Utkast
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs text-blue-400 hover:text-blue-300" onClick={openEditModal}>
                      <Pencil size={12} className="mr-1" />Rediger
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs text-amber-400 hover:text-amber-300" onClick={() => selectedCustomer && sendToPipeline(selectedCustomer.id)}>
                      <Undo2 size={12} className="mr-1" />Pipeline
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Min side admin */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <KeyRound size={14} className="text-emerald-400" />
                      Min side-admin
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => loadPortalAdmin(selectedCustomer)} disabled={portalLoading}>
                      {portalLoading ? <Loader2 size={12} className="mr-1 animate-spin" /> : <RefreshCw size={12} className="mr-1" />}
                      Oppdater
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!selectedCustomer.email ? (
                    <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                      Kunden må ha e-postadresse før Min side kan brukes.
                    </p>
                  ) : (
                    <>
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold text-emerald-300">Portaltilgang</p>
                            <p className="mt-1 text-[11px] leading-5 text-slate-400">
                              {portalAdmin?.portalUser
                                ? `Status: ${portalAdmin.portalUser.status || "ukjent"} · Invitert ${formatDateTime(portalAdmin.portalUser.invited_at)} · Sist innlogget ${formatDateTime(portalAdmin.portalUser.last_login_at)}`
                                : "Ikke opprettet ennå."}
                            </p>
                            <p className="mt-1 text-[11px] leading-5 text-slate-500">
                              Knappen lager eller nullstiller passordet. Det sendes ikke automatisk til kunden.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            className="bg-emerald-600 text-xs hover:bg-emerald-500"
                            onClick={inviteSelectedCustomerToPortal}
                            disabled={portalActionLoading === "invite"}
                          >
                            {portalActionLoading === "invite" ? <Loader2 size={12} className="mr-1 animate-spin" /> : <UserCheck size={12} className="mr-1" />}
                            {portalAdmin?.portalUser ? "Nytt passord" : "Lag passord"}
                          </Button>
                        </div>
                        {portalTemporaryPassword && (
                          <div className="mt-3 rounded-md border border-emerald-500/20 bg-slate-950/50 p-2">
                            <p className="text-[10px] text-slate-400">Midlertidig passord som må deles manuelt og byttes ved første innlogging:</p>
                            <code className="break-all text-xs text-emerald-200">{portalTemporaryPassword}</code>
                          </div>
                        )}
                      </div>

                      {portalStatus && (
                        <p className={`rounded-lg border p-3 text-xs ${portalStatus.type === "success" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-red-500/20 bg-red-500/10 text-red-300"}`}>
                          {portalStatus.message}
                        </p>
                      )}

                      {portalAdmin?.warnings && portalAdmin.warnings.length > 0 && (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100">
                          {portalAdmin.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-3">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500">Dokumenter</p>
                          <p className="mt-1 text-lg font-semibold text-white">{portalAdmin?.documents.length || 0}</p>
                        </div>
                        <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-3">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500">Meldinger</p>
                          <p className="mt-1 text-lg font-semibold text-white">{portalAdmin?.messages.length || 0}</p>
                        </div>
                        <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-3">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500">Forslag</p>
                          <p className="mt-1 text-lg font-semibold text-white">{(portalAdmin?.properties.length || 0) + (portalAdmin?.plots.length || 0)}</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-300">Send melding til Min side</p>
                        <textarea
                          value={portalMessage}
                          onChange={(e) => setPortalMessage(e.target.value)}
                          placeholder="Skriv en kort melding kunden ser inne på Min side..."
                          className="h-24 w-full resize-none rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-sm text-slate-100 outline-none focus:border-emerald-500"
                        />
                        <Button size="sm" onClick={sendPortalMessage} disabled={!portalMessage.trim() || portalActionLoading === "message"} className="w-full bg-emerald-600 hover:bg-emerald-500">
                          {portalActionLoading === "message" ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Send size={12} className="mr-1" />}
                          Send til Min side
                        </Button>
                      </div>

                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-slate-300">Forslag til kunden</p>
                        <div className="space-y-2">
                          {(portalAdmin?.properties || []).slice(0, 4).map((property) => (
                            <div key={property.id} className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-3">
                              <div className="flex items-start gap-2">
                                <Home size={14} className="mt-0.5 shrink-0 text-cyan-400" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium leading-5 text-white">{suggestionTitle(property, "Boligforslag")}</p>
                                  <p className="text-[11px] text-slate-500">
                                    {[property.location || property.town || property.municipality, formatPrice(property.price), property.bedrooms ? `${property.bedrooms} sov.` : ""].filter(Boolean).join(" · ")}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 shrink-0 text-[11px]"
                                  onClick={() => sharePortalSuggestion("property", property.id)}
                                  disabled={portalActionLoading === `share_property:${property.id}`}
                                >
                                  {portalActionLoading === `share_property:${property.id}` ? <Loader2 size={11} className="mr-1 animate-spin" /> : <FileUp size={11} className="mr-1" />}
                                  Send
                                </Button>
                              </div>
                            </div>
                          ))}
                          {(portalAdmin?.plots || []).slice(0, 3).map((plot) => (
                            <div key={plot.id} className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-3">
                              <div className="flex items-start gap-2">
                                <MapPinned size={14} className="mt-0.5 shrink-0 text-lime-400" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium leading-5 text-white">{suggestionTitle(plot, "Tomteforslag")}</p>
                                  <p className="text-[11px] text-slate-500">
                                    {[plot.municipality || plot.location, formatPrice(plot.price), plot.area ? `${Number(plot.area).toLocaleString("nb-NO")} m²` : ""].filter(Boolean).join(" · ")}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 shrink-0 text-[11px]"
                                  onClick={() => sharePortalSuggestion("plot", plot.id)}
                                  disabled={portalActionLoading === `share_plot:${plot.id}`}
                                >
                                  {portalActionLoading === `share_plot:${plot.id}` ? <Loader2 size={11} className="mr-1 animate-spin" /> : <FileUp size={11} className="mr-1" />}
                                  Send
                                </Button>
                              </div>
                            </div>
                          ))}
                          {!portalLoading && (!portalAdmin || (portalAdmin.properties.length === 0 && portalAdmin.plots.length === 0)) && (
                            <p className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-3 text-xs text-slate-500">
                              Ingen boliger eller tomter funnet å foreslå ennå.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 rounded-lg border border-slate-700/40 bg-slate-900/30 p-3">
                        <p className="text-xs font-semibold text-slate-300">Generer dokument til Min side</p>
                        <Input value={portalDocTitle} onChange={(e) => setPortalDocTitle(e.target.value)} placeholder="Tittel, f.eks. Områdeguide for Pinoso" />
                        <textarea
                          value={portalDocPrompt}
                          onChange={(e) => setPortalDocPrompt(e.target.value)}
                          placeholder="Vinkling, område, boliger/tomter eller spørsmål dokumentet skal svare på..."
                          className="h-24 w-full resize-y rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-sm text-slate-100 outline-none focus:border-emerald-500"
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Button size="sm" variant="outline" onClick={generatePortalDocument} disabled={portalDocGenerating}>
                            {portalDocGenerating ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Sparkles size={12} className="mr-1" />}
                            Generer
                          </Button>
                          <Button size="sm" onClick={publishPortalDocument} disabled={!portalDocDraft.trim() || portalActionLoading === "document"} className="bg-emerald-600 hover:bg-emerald-500">
                            {portalActionLoading === "document" ? <Loader2 size={12} className="mr-1 animate-spin" /> : <FileUp size={12} className="mr-1" />}
                            Publiser
                          </Button>
                        </div>
                        {portalDocDraft && (
                          <>
                            <textarea
                              value={portalDocDraft}
                              onChange={(e) => { setPortalDocDraft(e.target.value); setPortalDocApproved(false); }}
                              className="max-h-80 min-h-48 w-full resize-y whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-xs leading-6 text-slate-200 outline-none focus:border-emerald-500"
                            />
                            <label className="flex items-start gap-2 text-xs text-slate-300">
                              <input type="checkbox" checked={portalDocApproved} onChange={(e) => setPortalDocApproved(e.target.checked)} />
                              <span>Jeg har lest gjennom og godkjent dokumentet for denne kunden.</span>
                            </label>
                          </>
                        )}
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="mb-2 text-xs font-semibold text-slate-300">Siste meldinger</p>
                          <div className="space-y-2">
                            {(portalAdmin?.messages || []).slice(0, 4).map((message) => (
                              <div key={message.id} className="rounded-lg bg-slate-900/40 p-2">
                                <p className="text-[11px] text-slate-500">{message.sender_type === "customer" ? "Kunde" : "Admin"} · {formatDateTime(message.created_at)}</p>
                                <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-300">{message.body}</p>
                              </div>
                            ))}
                            {(!portalAdmin || portalAdmin.messages.length === 0) && <p className="text-xs text-slate-500">Ingen meldinger ennå.</p>}
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-semibold text-slate-300">Dokumenter på Min side</p>
                          <div className="space-y-2">
                            {(portalAdmin?.documents || []).slice(0, 4).map((doc) => (
                              <div key={doc.id} className="rounded-lg bg-slate-900/40 p-2">
                                <p className="text-xs font-medium leading-5 text-white">{doc.title}</p>
                                <p className="text-[11px] text-slate-500">{formatDateTime(doc.published_at || doc.generated_at || doc.created_at)}</p>
                              </div>
                            ))}
                            {(!portalAdmin || portalAdmin.documents.length === 0) && <p className="text-xs text-slate-500">Ingen dokumenter publisert ennå.</p>}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Interaction History */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock size={14} className="text-slate-400" />
                    Dialoghistorikk ({selectedCustomer.interactions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {selectedCustomer.interactions.map((interaction) => (
                      <div key={interaction.id} className={`flex gap-3 p-3 rounded-lg ${interaction.type === "ai" ? "bg-amber-500/5 border border-amber-500/10" : "bg-slate-900/30"}`}>
                        <div className="mt-0.5">{interactionIcon(interaction.type)}</div>
                        <div className="flex-1">
                          <p className="text-sm text-slate-200">{interaction.content}</p>
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
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="flex items-center justify-center min-h-[300px]">
              <div className="text-center p-6">
                <Eye size={32} className="mx-auto text-slate-600 mb-2" />
                <p className="text-sm text-slate-500">Velg en kunde for å se detaljer og dialoghistorikk</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
