"use client";

/**
 * Working contact form on public demo previews. Submissions become
 * `demo_inquiry` events and are forwarded to the demo owner's inbox —
 * the demo captures real leads during the trial period.
 */
import { FormEvent, useState } from "react";
import { CheckCircle, Loader2, Send } from "lucide-react";
import { getDemoSiteUiText, type DemoSiteLanguage } from "@/lib/demosites-language";

type DemoLeadFormProps = {
  token: string;
  companyName: string;
  accentColor: string;
  accentTextColor: string;
  language?: DemoSiteLanguage;
};

export function DemoLeadForm({ token, companyName, accentColor, accentTextColor, language = "nb" }: DemoLeadFormProps) {
  const ui = getDemoSiteUiText(language);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setError("");
    if (!name.trim() || (!email.trim() && !phone.trim())) {
      setError(ui.leadValidation);
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/public/demo-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, email, phone, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ui.leadError);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.leadError);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-lg border border-emerald-300/40 bg-emerald-50 p-8 text-center text-slate-900">
        <CheckCircle className="h-10 w-10 text-emerald-600" />
        <h3 className="mt-4 text-xl font-bold">{ui.leadSuccessTitle}</h3>
        <p className="mt-2 max-w-sm text-sm text-slate-600">
          {ui.leadSuccessText(companyName)}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-white/10 bg-white p-5 text-slate-950">
      <h3 className="text-lg font-bold">{ui.leadTitle}</h3>
      <p className="mt-1 text-xs text-slate-500">{ui.leadIntro}</p>
      <div className="mt-4 grid grid-cols-1 gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={ui.leadName}
          className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500"
          autoComplete="name"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={ui.leadPhone}
            type="tel"
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500"
            autoComplete="tel"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={ui.leadEmail}
            type="email"
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500"
            autoComplete="email"
          />
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={ui.leadMessage}
          rows={4}
          className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
        />
      </div>
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={sending}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3.5 text-sm font-bold transition-transform hover:scale-[1.01] disabled:opacity-60"
        style={{ backgroundColor: accentColor, color: accentTextColor }}
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {sending ? ui.leadSending : ui.leadSend}
      </button>
      <p className="mt-2 text-center text-[10px] text-slate-400">{ui.leadDirect}</p>
    </form>
  );
}
