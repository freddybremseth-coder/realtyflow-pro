"use client";

import { useState } from "react";
import { Bot, CalendarClock, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CustomerSalesAssistantNote({ contactId, onSaved }: { contactId: string; onSaved?: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    if (note.trim().length < 3) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(contactId)}/sales-assistant-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Kunne ikke behandle notatet.");
      const followup = body.followupApplied ? ` Oppfølging: ${new Date(body.analysis.nextFollowup).toLocaleString("nb-NO")}.` : "";
      const calendar = body.calendar?.created ? " Kalenderavtale opprettet." : body.calendar?.error && body.followupApplied ? " Oppfølgingen er lagret i CRM, men kalenderavtalen ble ikke opprettet." : "";
      setMessage(`AI har strukturert og lagret notatet.${followup}${calendar}`);
      setNote("");
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke behandle notatet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-violet-400/30 bg-violet-500/10 p-2 text-violet-200"><Bot size={19} /></div>
        <div>
          <h3 className="font-semibold text-white">AI salgsassistent</h3>
          <p className="mt-1 text-sm text-slate-400">Skriv naturlig hva som skjedde og hva du vil gjøre. RealtyFlow beholder originalen, finpusser CRM-notatet og setter trygg oppfølging automatisk.</p>
        </div>
      </div>
      <textarea
        className="mt-4 min-h-32 w-full resize-y rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/10"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="F.eks. Snakket med kunden. Fortsatt interessert, men er i Norge de neste to ukene. Jeg ringer når han er tilbake og går gjennom nye alternativer."
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500"><CalendarClock size={14} />Tydelig oppfølgingstid kan legges i CRM og Google Calendar.</div>
        <Button type="button" onClick={save} disabled={saving || note.trim().length < 3}>
          {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}Tolk og lagre
        </Button>
      </div>
      {error && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
      {message && <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</div>}
    </section>
  );
}
