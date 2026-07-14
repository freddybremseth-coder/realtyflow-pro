"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardEdit, Loader2, PlusCircle, Save, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CUSTOMER_PIPELINE_STATUSES,
  CUSTOMER_UPDATE_OUTCOMES,
  CUSTOMER_UPDATE_OUTCOME_LABELS,
  CUSTOMER_UPDATE_TYPES,
  CUSTOMER_UPDATE_TYPE_LABELS,
} from "@/lib/customer-updates";

interface CustomerUpdatePanelProps {
  contactId: string;
  defaultExpanded?: boolean;
  defaultTab?: "details" | "update";
  onSaved?: () => void;
}

const STAGE_LABELS: Record<string, string> = {
  NEW: "Ny",
  CONTACT: "Kontaktet",
  QUALIFIED: "Kvalifisert",
  VIEWING: "Visning",
  NEGOTIATION: "Forhandling",
  WON: "Kunde / vunnet",
  LOST: "Tapt",
  ON_HOLD: "På vent",
};

const fieldClass = "w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-500/70";
const labelClass = "space-y-1 text-xs font-medium text-slate-400";

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function isoFromLocal(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function CustomerUpdatePanel({
  contactId,
  defaultExpanded = false,
  defaultTab = "update",
  onSaved,
}: CustomerUpdatePanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [tab, setTab] = useState<"details" | "update">(defaultTab);
  const [contact, setContact] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [details, setDetails] = useState({
    name: "",
    email: "",
    phone: "",
    country: "",
    language: "",
    preferredLocation: "",
    propertyInterest: "",
    pipelineValue: "",
    pipelineStatus: "NEW",
  });

  const [update, setUpdate] = useState({
    updateType: "general_note",
    occurredAt: localDateTimeValue(),
    title: "",
    details: "",
    propertyReference: "",
    outcome: "",
    nextAction: "",
    nextFollowup: "",
    direction: "internal",
  });

  useEffect(() => {
    setExpanded(defaultExpanded);
    setTab(defaultTab);
    setContact(null);
    setMessage("");
    setError("");
  }, [contactId, defaultExpanded, defaultTab]);

  async function loadContact() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(contactId)}/360`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente kundedetaljer.");
      const next = body?.contact || null;
      setContact(next);
      setDetails({
        name: String(next?.name || ""),
        email: String(next?.email || ""),
        phone: String(next?.phone || ""),
        country: String(next?.country || ""),
        language: String(next?.language || ""),
        preferredLocation: String(next?.preferred_location || ""),
        propertyInterest: String(next?.property_interest || ""),
        pipelineValue: next?.pipeline_value === null || next?.pipeline_value === undefined ? "" : String(next.pipeline_value),
        pipelineStatus: String(next?.pipeline_status || "NEW").toUpperCase(),
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente kundedetaljer.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (expanded && !contact && !loading) void loadContact();
  }, [expanded, contact, loading]);

  const isViewing = update.updateType === "viewing";
  const canSaveUpdate = update.details.trim().length > 0 && Boolean(isoFromLocal(update.occurredAt));
  const customerLabel = useMemo(() => contact?.name || contact?.email || "kunden", [contact]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch(`/api/customers/${encodeURIComponent(contactId)}/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.error || "Kunne ikke lagre kundeoppdateringen.");
    return result;
  }

  async function saveDetails() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await post({
        action: "UPDATE_DETAILS",
        details: {
          ...details,
          pipelineValue: details.pipelineValue === "" ? null : Number(details.pipelineValue),
        },
      });
      setMessage(result.changedFields?.length ? `Kundedetaljene for ${customerLabel} er oppdatert.` : "Ingen felter var endret.");
      await loadContact();
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre kundedetaljene.");
    } finally {
      setSaving(false);
    }
  }

  async function saveUpdate() {
    const occurredAt = isoFromLocal(update.occurredAt);
    const nextFollowup = update.nextFollowup ? isoFromLocal(update.nextFollowup) : null;
    if (!occurredAt) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await post({
        action: "ADD_UPDATE",
        update: {
          updateType: update.updateType,
          occurredAt,
          title: update.title || null,
          details: update.details,
          propertyReference: update.propertyReference || null,
          outcome: update.outcome || null,
          nextAction: update.nextAction || null,
          nextFollowup,
          direction: update.direction,
        },
      });
      setMessage(`${CUSTOMER_UPDATE_TYPE_LABELS[update.updateType as keyof typeof CUSTOMER_UPDATE_TYPE_LABELS]} er lagret i kundens tidslinje.`);
      setUpdate({
        updateType: "general_note",
        occurredAt: localDateTimeValue(),
        title: "",
        details: "",
        propertyReference: "",
        outcome: "",
        nextAction: "",
        nextFollowup: "",
        direction: "internal",
      });
      await loadContact();
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre kundeoppdateringen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="w-full rounded-xl border border-cyan-500/25 bg-slate-900/75 shadow-lg shadow-slate-950/20">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2 text-cyan-300"><ClipboardEdit size={19} /></div>
          <div>
            <p className="font-semibold text-white">Kundedetaljer og ny oppdatering</p>
            <p className="text-xs text-slate-500">Registrer informasjon fra samtaler, møter, visninger, tilbud og videre prosess.</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-700/70 p-5">
          <div className="mb-5 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={tab === "update" ? "default" : "outline"} onClick={() => setTab("update")}>
              <PlusCircle size={15} className="mr-2" />Ny oppdatering
            </Button>
            <Button type="button" size="sm" variant={tab === "details" ? "default" : "outline"} onClick={() => setTab("details")}>
              <UserRound size={15} className="mr-2" />Rediger detaljer
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={loadContact} disabled={loading}>
              {loading && <Loader2 size={14} className="mr-2 animate-spin" />}Hent på nytt
            </Button>
          </div>

          {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
          {message && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</div>}

          {loading && !contact ? (
            <div className="flex items-center py-8 text-sm text-slate-400"><Loader2 size={17} className="mr-2 animate-spin" />Laster kunde …</div>
          ) : tab === "details" ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className={labelClass}>Navn<input className={fieldClass} value={details.name} onChange={(event) => setDetails({ ...details, name: event.target.value })} /></label>
                <label className={labelClass}>E-post<input className={fieldClass} type="email" value={details.email} onChange={(event) => setDetails({ ...details, email: event.target.value })} /></label>
                <label className={labelClass}>Telefon<input className={fieldClass} value={details.phone} onChange={(event) => setDetails({ ...details, phone: event.target.value })} /></label>
                <label className={labelClass}>Land<input className={fieldClass} value={details.country} onChange={(event) => setDetails({ ...details, country: event.target.value })} /></label>
                <label className={labelClass}>Språk<input className={fieldClass} value={details.language} onChange={(event) => setDetails({ ...details, language: event.target.value })} placeholder="Norsk, engelsk …" /></label>
                <label className={labelClass}>Ønsket område<input className={fieldClass} value={details.preferredLocation} onChange={(event) => setDetails({ ...details, preferredLocation: event.target.value })} /></label>
                <label className={labelClass}>Budsjett / pipeline-verdi (€)<input className={fieldClass} type="number" min="0" value={details.pipelineValue} onChange={(event) => setDetails({ ...details, pipelineValue: event.target.value })} /></label>
                <label className={labelClass}>Pipeline-steg<select className={fieldClass} value={details.pipelineStatus} onChange={(event) => setDetails({ ...details, pipelineStatus: event.target.value })}>{CUSTOMER_PIPELINE_STATUSES.map((status) => <option key={status} value={status}>{STAGE_LABELS[status]}</option>)}</select></label>
              </div>
              <label className={labelClass}>Boliginteresse / detaljer<textarea className={`${fieldClass} min-h-28 resize-y`} value={details.propertyInterest} onChange={(event) => setDetails({ ...details, propertyInterest: event.target.value })} placeholder="Type bolig, størrelse, områder, behov, tidslinje og andre viktige detaljer …" /></label>
              <div className="flex justify-end"><Button type="button" onClick={saveDetails} disabled={saving || loading}>{saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}Lagre kundedetaljer</Button></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className={labelClass}>Type oppdatering<select className={fieldClass} value={update.updateType} onChange={(event) => setUpdate({ ...update, updateType: event.target.value })}>{CUSTOMER_UPDATE_TYPES.map((type) => <option key={type} value={type}>{CUSTOMER_UPDATE_TYPE_LABELS[type]}</option>)}</select></label>
                <label className={labelClass}>Dato og tidspunkt<input className={fieldClass} type="datetime-local" value={update.occurredAt} onChange={(event) => setUpdate({ ...update, occurredAt: event.target.value })} /></label>
                <label className={labelClass}>Retning<select className={fieldClass} value={update.direction} onChange={(event) => setUpdate({ ...update, direction: event.target.value })}><option value="internal">Internt notat</option><option value="in">Informasjon fra kunden</option><option value="out">Informasjon gitt til kunden</option></select></label>
                <label className={labelClass}>Kort overskrift<input className={fieldClass} value={update.title} onChange={(event) => setUpdate({ ...update, title: event.target.value })} placeholder="F.eks. Visning i Albir" /></label>
              </div>

              <label className={labelClass}>Hva fikk du vite? *<textarea className={`${fieldClass} min-h-32 resize-y`} value={update.details} onChange={(event) => setUpdate({ ...update, details: event.target.value })} placeholder="Skriv hva kunden sa, reaksjoner, innvendinger, nye behov og annen relevant informasjon …" /></label>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className={labelClass}>Bolig / referanse<input className={fieldClass} value={update.propertyReference} onChange={(event) => setUpdate({ ...update, propertyReference: event.target.value })} placeholder="Referanse, adresse eller prosjektnavn" /></label>
                <label className={labelClass}>Resultat<select className={fieldClass} value={update.outcome} onChange={(event) => setUpdate({ ...update, outcome: event.target.value })}><option value="">Ikke satt</option>{CUSTOMER_UPDATE_OUTCOMES.map((outcome) => <option key={outcome} value={outcome}>{CUSTOMER_UPDATE_OUTCOME_LABELS[outcome]}</option>)}</select></label>
                <label className={labelClass}>Neste oppfølging<input className={fieldClass} type="datetime-local" value={update.nextFollowup} onChange={(event) => setUpdate({ ...update, nextFollowup: event.target.value })} /></label>
                <label className={labelClass}>Neste handling<input className={fieldClass} value={update.nextAction} onChange={(event) => setUpdate({ ...update, nextAction: event.target.value })} placeholder="Ring, send dokumenter, book ny visning …" /></label>
              </div>

              {isViewing && <p className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-200">For visninger bør du registrere boligreferanse, kundens reaksjon/resultat, innvendinger og avtalt neste steg.</p>}
              <div className="flex justify-end"><Button type="button" onClick={saveUpdate} disabled={saving || !canSaveUpdate}>{saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <PlusCircle size={16} className="mr-2" />}Lagre i kundens tidslinje</Button></div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
