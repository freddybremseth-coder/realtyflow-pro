"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CUSTOMER_PIPELINE_STATUSES,
  CUSTOMER_PIPELINE_STATUS_LABELS,
  normalizeCustomerPipelineStatus,
} from "@/lib/customer-updates";

interface CustomerPipelineControlProps {
  contactId: string;
  currentStatus: string | null | undefined;
  doNotContact?: boolean;
  onSaved?: () => void;
}

export function CustomerPipelineControl({
  contactId,
  currentStatus,
  doNotContact = false,
  onSaved,
}: CustomerPipelineControlProps) {
  const canonicalCurrent = normalizeCustomerPipelineStatus(currentStatus || "NEW");
  const [status, setStatus] = useState(canonicalCurrent);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setStatus(normalizeCustomerPipelineStatus(currentStatus || "NEW"));
    setNote("");
    setMessage("");
    setError("");
  }, [contactId, currentStatus]);

  const changed = status !== canonicalCurrent;

  async function save() {
    if (!changed) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(contactId)}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStatus: status, note: note || null }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Kunne ikke flytte kunden i pipeline.");
      const warning = body.warning ? ` ${body.warning}` : "";
      setMessage(`Pipeline oppdatert til ${CUSTOMER_PIPELINE_STATUS_LABELS[status]}.${warning}`);
      setNote("");
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke flytte kunden i pipeline.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <div className="min-w-56 flex-1">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-400">
            <Shuffle size={14} /> Flytt i pipeline
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(normalizeCustomerPipelineStatus(event.target.value))}
            className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/70"
          >
            {CUSTOMER_PIPELINE_STATUSES.map((item) => (
              <option key={item} value={item}>{CUSTOMER_PIPELINE_STATUS_LABELS[item]}</option>
            ))}
          </select>
        </div>
        <div className="min-w-64 flex-[2]">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Notat / årsak til flyttingen</label>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="F.eks. kunden vil vente, ny finansiering, kjøpt annet sted …"
            className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/70"
          />
        </div>
        <Button type="button" size="sm" onClick={save} disabled={!changed || saving}>
          {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Save size={15} className="mr-2" />}
          Lagre steg
        </Button>
      </div>
      {doNotContact && (
        <p className="mt-2 text-xs text-amber-300">Kunden har STOPP / do-not-contact. Pipeline kan endres manuelt, men e-postsperren beholdes.</p>
      )}
      {message && <p className="mt-2 text-xs text-emerald-300">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
