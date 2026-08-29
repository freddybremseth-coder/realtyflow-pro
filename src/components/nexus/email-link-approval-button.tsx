"use client";

import { useState } from "react";
import { CheckCircle2, Link2, Loader2 } from "lucide-react";

export function EmailLinkApprovalButton({
  messageId,
  contactId,
  contactName,
  onApproved,
}: {
  messageId: string;
  contactId: string;
  contactName: string;
  onApproved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);

  async function approve() {
    if (saving || approved) return;
    const confirmed = window.confirm(`Koble denne e-posten til ${contactName}?\n\nSystemet validerer eksakt e-postmatch på nytt før koblingen skrives.`);
    if (!confirmed) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/nexus/email-link-health/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, contactId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke godkjenne koblingen.");
      setApproved(true);
      onApproved();
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Kunne ikke godkjenne koblingen.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="flex flex-col items-start gap-1 sm:items-end">
    <button
      type="button"
      onClick={() => void approve()}
      disabled={saving || approved}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-700 px-3 py-2 text-xs font-black text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : approved ? <CheckCircle2 className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
      {approved ? "Koblet" : saving ? "Validerer …" : "Godkjenn kobling"}
    </button>
    {error ? <span className="max-w-sm text-left text-[11px] font-bold text-red-700 sm:text-right">{error}</span> : null}
  </div>;
}
