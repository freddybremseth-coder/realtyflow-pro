"use client";

import { useState } from "react";

type ReplyIntent = "reactivate_now" | "update_preferences" | "follow_up_later" | "stop" | "unclear";

type ReplyPreview = {
  matchedReply: {
    revenueEventId: string;
    occurredAt: string;
    subject: string;
    bodyPreview: string;
    fromAddress: string;
  } | null;
  classification: {
    intent: ReplyIntent;
    confidence: number;
    reasons: string[];
    suggestedPipelineAction: string;
    requiresHumanReview: boolean;
  } | null;
  contact?: {
    pipelineStatus?: string | null;
    nurtureStatus?: string | null;
  };
};

const writable = new Set<ReplyIntent>(["reactivate_now", "update_preferences", "stop"]);

function intentLabel(intent: ReplyIntent) {
  if (intent === "reactivate_now") return "Aktiv interesse";
  if (intent === "update_preferences") return "Behovene har endret seg";
  if (intent === "follow_up_later") return "Følg opp senere";
  if (intent === "stop") return "Stopp kontakt";
  return "Uklart svar";
}

function intentClass(intent: ReplyIntent) {
  if (intent === "reactivate_now") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (intent === "update_preferences") return "border-cyan-200 bg-cyan-50 text-cyan-800";
  if (intent === "follow_up_later") return "border-amber-200 bg-amber-50 text-amber-800";
  if (intent === "stop") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function ReactivationReplyControl({ contactId, onApplied }: { contactId: string; onApplied?: () => void }) {
  const [preview, setPreview] = useState<ReplyPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const check = async () => {
    setChecking(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/nexus/reactivation/reply-preview?contactId=${encodeURIComponent(contactId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setPreview(body as ReplyPreview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke kontrollere kundesvar");
    } finally {
      setChecking(false);
    }
  };

  const apply = async () => {
    if (!preview?.classification || !writable.has(preview.classification.intent)) return;
    setApplying(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/nexus/reactivation/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      const message = body?.classification?.intent === "stop"
        ? "Kundens stopp-svar er brukt. Nurture er pauset."
        : body?.classification?.intent === "update_preferences"
          ? "Lead er reaktivert og Buyer Profile-refresh er lagt til som oppgave."
          : "Lead er reaktivert fra det dokumenterte kundesvaret.";
      setSuccess(message);
      await check();
      onApplied?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke bruke kundesvaret");
    } finally {
      setApplying(false);
    }
  };

  const classification = preview?.classification;
  const canApply = classification ? writable.has(classification.intent) : false;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-indigo-700">Reply Intelligence</div>
          <div className="mt-1 text-sm text-slate-700">Kontroller om denne CRM-kontakten har svart fra sin eksakte e-postadresse.</div>
        </div>
        <button onClick={check} disabled={checking || applying} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-black text-indigo-800 disabled:opacity-50">
          {checking ? "Kontrollerer …" : "Kontroller svar"}
        </button>
      </div>

      {preview && !preview.matchedReply ? <div className="mt-3 text-sm font-semibold text-slate-600">Ingen CRM-matchet inbound e-post funnet.</div> : null}

      {preview?.matchedReply && classification ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${intentClass(classification.intent)}`}>{intentLabel(classification.intent)}</span>
            <span className="text-xs font-bold text-slate-500">Confidence {Math.round(classification.confidence * 100)}%</span>
            <span className="text-xs text-slate-500">{new Date(preview.matchedReply.occurredAt).toLocaleString("nb-NO")}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-black text-slate-800">{preview.matchedReply.subject || "Uten emne"}</div>
            <div className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-slate-600">{preview.matchedReply.bodyPreview}</div>
          </div>
          <div className="text-xs text-slate-600">{classification.reasons.map((reason) => <div key={reason}>• {reason}</div>)}</div>
          {canApply ? (
            <button onClick={apply} disabled={applying} className="rounded-lg bg-indigo-800 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
              {applying ? "Bruker svar …" : "Bruk kundesvaret"}
            </button>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Dette svaret endrer ikke CRM automatisk i v1. Beholdes for menneskelig oppfølging.</div>
          )}
        </div>
      ) : null}

      {success ? <div className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800">{success}</div> : null}
      {error ? <div className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-xs font-bold text-rose-800">{error}</div> : null}
    </div>
  );
}
