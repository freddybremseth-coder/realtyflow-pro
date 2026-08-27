"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileText, Loader2, ScanLine, Sparkles, UserPlus } from "lucide-react";
import { BRANDS } from "@/lib/constants";

interface ContactOption {
  id: string;
  name: string;
  email: string;
  pipeline_status?: string | null;
  brand_id?: string | null;
  brand?: string | null;
}

interface ExtractedLead {
  name?: string;
  email?: string;
  phone?: string;
  type?: string;
  budget?: number;
  source?: string;
  property_interest?: string;
  notes?: string;
  preferences?: {
    property_type?: string | null;
    location?: string | null;
    features?: string[];
    other?: string[];
  } | null;
}

interface BuyerIntelligence {
  lifestyleCandidates: Array<{
    key: string;
    strength: string;
    confidence: number;
    sourceText: string;
    customerConfirmed: boolean;
  }>;
  personaCandidates: Array<{
    id: string;
    confidence: number;
    evidence: string[];
  }>;
}

interface IntakeLead {
  id: string;
  lead: ExtractedLead;
  buyerIntelligence: BuyerIntelligence | null;
  selectedContactId: string;
  selectedBrandId: string;
  saving: boolean;
  savedMessage: string;
  error: string;
}

function money(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? new Intl.NumberFormat("nb-NO").format(number) : "Ikke satt";
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll(":", " · ");
}

export default function BuyerIntakePage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [items, setItems] = useState<IntakeLead[]>([]);
  const [rawText, setRawText] = useState("");
  const [formType, setFormType] = useState("other");
  const [confidence, setConfidence] = useState("unknown");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/contacts?view=pipeline")
      .then((response) => response.json())
      .then((body) => setContacts(Array.isArray(body?.contacts) ? body.contacts : []))
      .catch(() => setContacts([]));
  }, []);

  const contactsByEmail = useMemo(() => {
    const map = new Map<string, ContactOption>();
    for (const contact of contacts) {
      const email = String(contact.email || "").trim().toLowerCase();
      if (email) map.set(email, contact);
    }
    return map;
  }, [contacts]);

  const selectFile = (selected: File | null) => {
    if (!selected) return;
    setFile(selected);
    setItems([]);
    setError("");
    setRawText("");
  };

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    setError("");
    setItems([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const extractionResponse = await fetch("/api/contacts/import-document", { method: "POST", body: formData });
      const extraction = await extractionResponse.json().catch(() => ({}));
      if (!extractionResponse.ok || extraction?.error) throw new Error(extraction?.error || "Dokumentanalysen feilet");

      const leads: ExtractedLead[] = Array.isArray(extraction?.leads) ? extraction.leads : [];
      setRawText(String(extraction?.rawText || ""));
      setFormType(String(extraction?.formType || "other"));
      setConfidence(String(extraction?.confidence || "unknown"));

      const analyzed = await Promise.all(leads.map(async (lead, index) => {
        let buyerIntelligence: BuyerIntelligence | null = null;
        try {
          const response = await fetch("/api/nexus/buyer-intelligence/import-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lead }),
          });
          const body = await response.json().catch(() => ({}));
          if (response.ok) buyerIntelligence = body?.buyerIntelligence || null;
        } catch {
          buyerIntelligence = null;
        }
        const exact = contactsByEmail.get(String(lead.email || "").trim().toLowerCase());
        return {
          id: `intake-${index}-${Date.now()}`,
          lead,
          buyerIntelligence,
          selectedContactId: exact?.id || "",
          selectedBrandId: exact?.brand_id || exact?.brand || BRANDS[0]?.id || "",
          saving: false,
          savedMessage: "",
          error: "",
        } satisfies IntakeLead;
      }));
      setItems(analyzed);
      if (!analyzed.length) setError("Ingen leads ble funnet i dokumentet. Kontroller bildet eller PDF-en.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analyse feilet");
    } finally {
      setAnalyzing(false);
    }
  };

  const patchItem = (id: string, patch: Partial<IntakeLead>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const attach = async (item: IntakeLead, createNew: boolean) => {
    patchItem(item.id, { saving: true, error: "", savedMessage: "" });
    try {
      let contactId = item.selectedContactId;
      if (createNew) {
        if (!item.selectedBrandId) throw new Error("Velg brand før du oppretter ny lead.");
        const contactResponse = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: item.lead.name || "Ukjent lead",
            email: item.lead.email || "",
            phone: item.lead.phone || "",
            brand: item.selectedBrandId,
            brand_id: item.selectedBrandId,
            pipeline_status: "NEW",
            pipeline_value: Number(item.lead.budget || 0),
            source: item.lead.source || "Form/Document Import",
            property_interest: item.lead.property_interest || "",
            notes: item.lead.notes || "",
          }),
        });
        const contactBody = await contactResponse.json().catch(() => ({}));
        if (!contactResponse.ok || !contactBody?.contact?.id) throw new Error(contactBody?.error || "Kunne ikke opprette lead");
        contactId = String(contactBody.contact.id);
        setContacts((current) => [contactBody.contact, ...current]);
      }

      if (!contactId) throw new Error("Velg en eksisterende lead eller opprett en ny.");
      const attachResponse = await fetch("/api/nexus/buyer-intake/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          lead: item.lead,
          rawText,
          formType,
          confidence,
        }),
      });
      const attachBody = await attachResponse.json().catch(() => ({}));
      if (!attachResponse.ok) throw new Error(attachBody?.error || "Kunne ikke knytte Buyer Intake");
      patchItem(item.id, {
        selectedContactId: contactId,
        savedMessage: attachBody?.duplicate ? "Intake var allerede knyttet til denne leaden." : "Buyer Intake er knyttet og lagt til for review.",
      });
    } catch (cause) {
      patchItem(item.id, { error: cause instanceof Error ? cause.message : "Lagring feilet" });
    } finally {
      patchItem(item.id, { saving: false });
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">Nexus Buyer Intelligence</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Buyer Intake fra skjema, bilde eller PDF</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Les håndskrevne skjema, finn kjøpskrav og livsstilssignaler, og knytt resultatet til riktig CRM-lead. Persona/livsstil blir et review-artefakt først — ikke automatisk kundesannhet.</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">Ingen e-post sendes · ingen Buyer Profile oppdateres automatisk</div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => selectFile(event.target.files?.[0] || null)} />
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" className="hidden" onChange={(event) => selectFile(event.target.files?.[0] || null)} />
          <button onClick={() => cameraRef.current?.click()} className="rounded-2xl border border-cyan-200 bg-cyan-50 p-6 text-left transition hover:border-cyan-400">
            <Camera className="mb-3 h-7 w-7 text-cyan-700" />
            <div className="font-black text-slate-950">Ta bilde av skjema</div>
            <div className="mt-1 text-sm text-slate-600">Bruk mobilkamera direkte.</div>
          </button>
          <button onClick={() => fileRef.current?.click()} className="rounded-2xl border border-violet-200 bg-violet-50 p-6 text-left transition hover:border-violet-400">
            <FileText className="mb-3 h-7 w-7 text-violet-700" />
            <div className="font-black text-slate-950">Last opp bilde eller PDF</div>
            <div className="mt-1 text-sm text-slate-600">Eksisterende OCR-/AI-kjede brukes.</div>
          </button>
        </div>

        {file && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm"><ScanLine className="h-4 w-4 text-slate-500" /><span className="font-bold text-slate-900">{file.name}</span><span className="text-slate-500">{Math.round(file.size / 1024)} KB</span></div>
          <button disabled={analyzing} onClick={analyze} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Analyser
          </button>
        </div>}
        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div>}
      </section>

      {items.map((item) => {
        const intelligence = item.buyerIntelligence;
        return <section key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-950">{item.lead.name || "Ukjent lead"}</h3>
              <div className="mt-1 text-sm text-slate-500">{item.lead.email || "Ingen e-post"} · {item.lead.phone || "Ingen telefon"} · Budsjett: {money(item.lead.budget)}</div>
              {item.lead.property_interest && <div className="mt-2 text-sm font-semibold text-slate-700">Interesse: {item.lead.property_interest}</div>}
            </div>
            <div className="text-right text-xs text-slate-500">OCR: {confidence} · {formType}</div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-wider text-slate-500">Persona candidates</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {intelligence?.personaCandidates?.length ? intelligence.personaCandidates.map((persona) => <span key={persona.id} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-800">{humanize(persona.id)} · {Math.round(persona.confidence * 100)}%</span>) : <span className="text-sm text-slate-500">Ingen tydelig persona funnet.</span>}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-wider text-slate-500">Lifestyle evidence</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {intelligence?.lifestyleCandidates?.length ? intelligence.lifestyleCandidates.map((candidate) => <span key={candidate.key} title={candidate.sourceText} className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">{humanize(candidate.key)} · {candidate.strength}</span>) : <span className="text-sm text-slate-500">Ingen eksplisitte livsstilssignaler funnet.</span>}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs font-black uppercase tracking-wider text-amber-800">Knytt til CRM</div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
              <select value={item.selectedContactId} onChange={(event) => patchItem(item.id, { selectedContactId: event.target.value })} className="h-10 rounded-xl border border-amber-200 bg-white px-3 text-sm text-slate-900">
                <option value="">Velg eksisterende lead …</option>
                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.email || "uten e-post"} · {contact.pipeline_status || "NEW"}</option>)}
              </select>
              <button disabled={!item.selectedContactId || item.saving} onClick={() => attach(item, false)} className="rounded-xl bg-amber-900 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Knytt til valgt lead</button>
            </div>

            <div className="my-4 border-t border-amber-200" />
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <select value={item.selectedBrandId} onChange={(event) => patchItem(item.id, { selectedBrandId: event.target.value })} className="h-10 rounded-xl border border-amber-200 bg-white px-3 text-sm text-slate-900">
                <option value="">Velg brand for ny lead …</option>
                {BRANDS.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
              <button disabled={!item.selectedBrandId || item.saving} onClick={() => attach(item, true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-700 bg-white px-4 py-2 text-sm font-black text-amber-900 disabled:opacity-40"><UserPlus className="h-4 w-4" />Opprett ny lead + knytt</button>
            </div>
            {item.saving && <div className="mt-3 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Lagrer …</div>}
            {item.savedMessage && <div className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800">{item.savedMessage}</div>}
            {item.error && <div className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm font-bold text-red-800">{item.error}</div>}
          </div>
        </section>;
      })}
    </main>
  );
}
