"use client";

import { useEffect, useState } from "react";

type PrivacyEvent = {
  id: string;
  session_id: string | null;
  event_type: "sensitive_context_permission_granted" | "sensitive_context_permission_denied";
  details: {
    requested_scope?: string;
    granted?: boolean;
    reason?: string;
    sensitive_content_recorded?: boolean;
  };
  created_at: string;
};

type PrivacyAuditResponse = {
  events: PrivacyEvent[];
  writesPerformed: 0;
  principles: { sensitiveContentRecorded: false; hiddenChainOfThoughtExposed: false };
};

async function loadAudit(): Promise<PrivacyAuditResponse> {
  const response = await fetch("/api/personal-intelligence/privacy-audit", { cache: "no-store", credentials: "same-origin" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Privacy audit failed (${response.status})`);
  return body as PrivacyAuditResponse;
}

export default function PrivacyAuditPage() {
  const [data, setData] = useState<PrivacyAuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadAudit().then(setData).catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)));
  }, []);

  return <main className="mx-auto max-w-[1100px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-rose-700">Privacy Audit</div>
      <h1 className="mt-2 text-3xl font-black text-slate-950">Sensitive context permission history.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This log shows whether sensitive or restricted context was explicitly permitted or denied. It records permission metadata only — never the sensitive message content and never hidden reasoning.</p>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><h2 className="text-lg font-black">Permission events</h2><span className="text-xs font-bold text-slate-400">{data?.events.length ?? 0}</span></div>
      <div className="mt-4 space-y-3">
        {!data && !error && <div className="text-sm text-slate-500">Loading…</div>}
        {data && data.events.length === 0 && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No sensitive-context permission events have been recorded.</div>}
        {data?.events.map((event) => <article key={event.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-slate-400">{event.details.requested_scope || "unknown scope"}</div>
              <div className="mt-1 text-sm font-black text-slate-900">{event.event_type === "sensitive_context_permission_granted" ? "Permission granted" : "Permission denied"}</div>
              <div className="mt-1 text-xs text-slate-500">Reason: {event.details.reason || "unknown"}</div>
              {event.session_id && <div className="mt-1 text-xs text-slate-400">Session {event.session_id}</div>}
            </div>
            <div className="text-xs text-slate-400">{new Date(event.created_at).toLocaleString()}</div>
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">Sensitive content recorded: no</div>
        </article>)}
      </div>
    </section>
  </main>;
}
