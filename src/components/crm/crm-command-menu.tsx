"use client";

import { useMemo, useState } from "react";
import { Bot, CheckCircle2, Filter, Loader2, Mail, Play, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

type CommandId =
  | "send_first_email_safe"
  | "show_ready"
  | "show_replied"
  | "show_stopped"
  | "show_action"
  | "show_pipeline"
  | "show_closed"
  | "show_no_email";

type Preview = {
  candidateCount: number;
  byBrand: Record<string, number>;
  batchSize: number;
  sample: Array<{ id: string; name: string; email: string; brandId: string | null }>;
};

type ExecuteResult = Preview & {
  attempted: number;
  sent: number;
  failed: number;
  remaining: number;
  note?: string;
};

const COMMANDS: Array<{ id: CommandId; label: string; description: string; destructive?: boolean }> = [
  {
    id: "send_first_email_safe",
    label: "Send første e-post til alle trygge som ikke har fått mail",
    description: "Forhåndsviser først. Ekskluderer STOPP, suppression, WON/LOST, kunder som har svart, ugyldige adresser og duplikater. Sender maks 25 per manuell batch; resten blir liggende i nurture-køen.",
    destructive: true,
  },
  { id: "show_ready", label: "Vis Klar – ikke sendt", description: "Vis bare kunder som kan kontaktes og som ikke har en registrert reell utsendelse." },
  { id: "show_replied", label: "Vis kunder som har svart", description: "Vis kundene som har svart og trenger CRM-vurdering eller oppfølging." },
  { id: "show_stopped", label: "Vis STOPP / blokkert", description: "Vis kunder som ikke skal motta flere e-poster." },
  { id: "show_action", label: "Vis kunder som trenger handling", description: "Filtrer CRM til kunder som systemet mener har en åpen salgsoppgave." },
  { id: "show_pipeline", label: "Vis aktive kunder i pipeline", description: "Vis bare aktive pipeline-steg fra kontakt til closing." },
  { id: "show_closed", label: "Vis vunnet og tapt", description: "Vis avsluttede saker for kontroll og historikk." },
  { id: "show_no_email", label: "Vis kunder uten e-post", description: "Finn kontakter som må få e-postadresse eller annen kontaktkanal." },
];

export function CrmCommandMenu({
  brands,
  onShowReady,
  onShowReplied,
  onShowStopped,
  onShowAction,
  onShowPipeline,
  onShowClosed,
  onShowNoEmail,
  onRefresh,
}: {
  brands: Array<{ id: string; label: string }>;
  onShowReady: () => void;
  onShowReplied: () => void;
  onShowStopped: () => void;
  onShowAction: () => void;
  onShowPipeline: () => void;
  onShowClosed: () => void;
  onShowNoEmail: () => void;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<CommandId>("show_ready");
  const [brandId, setBrandId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [executed, setExecuted] = useState<ExecuteResult | null>(null);

  const command = useMemo(() => COMMANDS.find((item) => item.id === selected) || COMMANDS[0], [selected]);

  function runLocalCommand() {
    const actions: Record<Exclude<CommandId, "send_first_email_safe">, () => void> = {
      show_ready: onShowReady,
      show_replied: onShowReplied,
      show_stopped: onShowStopped,
      show_action: onShowAction,
      show_pipeline: onShowPipeline,
      show_closed: onShowClosed,
      show_no_email: onShowNoEmail,
    };
    if (selected !== "send_first_email_safe") actions[selected]();
  }

  async function callSendCommand(mode: "preview" | "execute") {
    setLoading(true);
    setError("");
    if (mode === "preview") setExecuted(null);
    try {
      const response = await fetch("/api/customers/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "send_first_email_safe",
          mode,
          brandId: brandId || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kommandoen kunne ikke kjøres.");
      if (mode === "preview") setPreview(data as Preview);
      else {
        setExecuted(data as ExecuteResult);
        setPreview(data as Preview);
        onRefresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kommandoen kunne ikke kjøres.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-cyan-500/20 bg-slate-900/80 p-4 sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300"><Bot size={17} /> RealtyFlow-kommandoer</div>
          <h2 className="mt-1 text-lg font-semibold text-white">Velg hva systemet skal gjøre</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">Du trenger ikke skrive en prompt. Velg en vanlig handling, kontroller hva den gjør og trykk utfør.</p>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
          <ShieldCheck className="mr-1 inline h-4 w-4" /> Masseutsendelser krever forhåndsvisning først
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
        <label className="space-y-1 text-sm text-slate-300">
          <span>Kommando</span>
          <select
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value as CommandId);
              setPreview(null);
              setExecuted(null);
              setError("");
            }}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white"
          >
            {COMMANDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>

        <label className="space-y-1 text-sm text-slate-300">
          <span>Merkevare</span>
          <select
            value={brandId}
            onChange={(event) => { setBrandId(event.target.value); setPreview(null); setExecuted(null); }}
            disabled={selected !== "send_first_email_safe"}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white disabled:opacity-50"
          >
            <option value="">Alle merkevarer</option>
            {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.label}</option>)}
          </select>
        </label>

        <div className="flex items-end gap-2">
          {selected === "send_first_email_safe" ? (
            <Button onClick={() => void callSendCommand("preview")} disabled={loading} variant="outline">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}Forhåndsvis
            </Button>
          ) : (
            <Button onClick={runLocalCommand}><Filter className="mr-2 h-4 w-4" />Utfør</Button>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-400">{command.description}</p>
      {error ? <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

      {selected === "send_first_email_safe" && preview ? (
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">{preview.candidateCount} trygge kandidater</div>
              <div className="mt-1 text-xs text-slate-400">
                {Object.entries(preview.byBrand).map(([brand, count]) => `${brand}: ${count}`).join(" · ") || "Ingen kandidater"}
              </div>
            </div>
            <Button
              onClick={() => void callSendCommand("execute")}
              disabled={loading || preview.candidateCount === 0}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Send trygg batch nå
            </Button>
          </div>
          {preview.sample.length ? (
            <div className="mt-3 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
              {preview.sample.map((item) => <div key={item.id}>{item.name} · {item.email}</div>)}
            </div>
          ) : null}
        </div>
      ) : null}

      {executed ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-100">
          <CheckCircle2 className="h-5 w-5" />
          <span>Forsøkt: {executed.attempted}</span>
          <span>Sendt: {executed.sent}</span>
          <span>Feil: {executed.failed}</span>
          <span>Gjenstår: {executed.remaining}</span>
          {executed.note ? <span className="w-full text-xs text-emerald-200/80">{executed.note}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
