"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";

type Template = {
  version: 1;
  report_title: string;
  report_subtitle: string;
  board_questions: string[];
  recommended_next_steps: string[];
  next_practical_step: string;
  disclaimer: string;
  updated_at?: string | null;
};

type Sample = {
  companyName: string;
  contactName: string;
  contactRole: string;
  propertyPrice: number;
  users: number;
  employeeWeeks: number;
  annualOperating: number;
  acquisitionPct: number;
  capitalPct: number;
  valuePct: number;
  holdingYears: number;
  needs: string;
};

const initialSample: Sample = {
  companyName: "Nordic Example AS",
  contactName: "Kari Nordmann",
  contactRole: "Daglig leder",
  propertyPrice: 650000,
  users: 80,
  employeeWeeks: 18,
  annualOperating: 16000,
  acquisitionPct: 12,
  capitalPct: 4,
  valuePct: 3,
  holdingYears: 10,
  needs: "Vi ønsker en bolig som kan brukes til ledersamlinger, mindre teamsamlinger og som ansattgode gjennom året.",
};

const euro = new Intl.NumberFormat("nb-NO", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function textLines(value: string[]) {
  return value.join("\n");
}

export default function CorporateDecisionNoteEditorPage() {
  const [template, setTemplate] = useState<Template | null>(null);
  const [savedTemplate, setSavedTemplate] = useState<Template | null>(null);
  const [sample, setSample] = useState<Sample>(initialSample);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/decision-note-template", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente rapportmalen.");
      setTemplate(body.template);
      setSavedTemplate(body.template);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente rapportmalen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const calculation = useMemo(() => {
    const acquisitionCost = sample.propertyPrice * sample.acquisitionPct / 100;
    const capitalBase = sample.propertyPrice + acquisitionCost;
    const annualCapital = capitalBase * sample.capitalPct / 100;
    const annualizedAcquisition = acquisitionCost / Math.max(1, sample.holdingYears);
    const annualCost = sample.annualOperating + annualCapital + annualizedAcquisition;
    const hotelAlternative = (2 * 8 * 4 * 180) + (3 * 12 * 3 * 160);
    const futureValue = sample.propertyPrice * Math.pow(1 + sample.valuePct / 100, sample.holdingYears);
    return { acquisitionCost, annualCapital, annualizedAcquisition, annualCost, hotelAlternative, futureValue };
  }, [sample]);

  async function save() {
    if (!template) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/decision-note-template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke lagre rapportmalen.");
      setTemplate(body.template);
      setSavedTemplate(body.template);
      setNotice("Rapportmalen er lagret. Nye kunderapporter bruker denne versjonen.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre rapportmalen.");
    } finally {
      setSaving(false);
    }
  }

  async function openPdfPreview() {
    if (!template) return;
    setPreviewing(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/decision-note-template/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, sample }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Kunne ikke lage test-PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const popup = window.open(url, "_blank", "noopener,noreferrer");
      if (!popup) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice("Test-PDF generert lokalt i RealtyFlow. Ingen e-post ble sendt og ingen kunde ble opprettet.");
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Kunne ikke lage test-PDF.");
    } finally {
      setPreviewing(false);
    }
  }

  if (loading || !template) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
          <Loader2 className="animate-spin text-teal-800" size={30} />
        </div>
      </div>
    );
  }

  const executiveSummary =
    `Med de valgte forutsetningene er kjøpesummen ${euro.format(sample.propertyPrice)} og beregnet årlig kostnad før verdiendring ${euro.format(calculation.annualCost)}. De konkrete bedriftsoppholdene som er lagt inn tilsvarer ${euro.format(calculation.hotelAlternative)} i alternativ hotellovernatting per år. Hotellbeløpet er ikke behandlet som en automatisk besparelse, og verdiutviklingen er et scenario - ikke en prognose.`;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <Link href="/corporate-homes" className="mb-3 inline-flex items-center gap-1 text-xs font-black text-cyan-800 hover:underline">
          <ArrowLeft size={14} /> Corporate Homes
        </Link>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.13em] text-teal-800">
              <FileText size={18} /> Beslutningsgrunnlag
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Rapportmal & test</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
              Rediger rådgiverteksten og se hvordan rapporten blir før den brukes mot kunder. Tallmotoren er låst:
              test og mal kan ikke endre beregningsformlene.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => savedTemplate && setTemplate(savedTemplate)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              <RefreshCw size={16} /> Tilbakestill utkast
            </button>
            <button
              type="button"
              onClick={() => void openPdfPreview()}
              disabled={previewing}
              className="inline-flex items-center gap-2 rounded-xl border border-teal-700 px-4 py-2.5 text-sm font-bold text-teal-900 disabled:opacity-60"
            >
              {previewing ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
              Åpne test-PDF
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Lagre mal
            </button>
          </div>
        </div>
      </header>

      {notice && <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{notice}</div>}
      {error && <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[.92fr_1.08fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 text-emerald-700" size={20} />
              <div>
                <h2 className="text-xl font-black text-slate-950">Hva kan endres?</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Tittel, undertittel, styrespørsmål, anbefalte neste steg, praktisk CTA og forbehold. Kjøpskostnad,
                  kapitalkostnad, drift, hotellalternativ og verdiscenario beregnes fortsatt av RealtyFlow.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-1.5 text-sm font-bold text-slate-800">
                Rapporttittel
                <input
                  value={template.report_title}
                  onChange={(event) => setTemplate({ ...template, report_title: event.target.value })}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-slate-800">
                Undertittel
                <input
                  value={template.report_subtitle}
                  onChange={(event) => setTemplate({ ...template, report_subtitle: event.target.value })}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-slate-800">
                Spørsmål styret bør avklare - ett per linje
                <textarea
                  rows={8}
                  value={textLines(template.board_questions)}
                  onChange={(event) => setTemplate({ ...template, board_questions: lines(event.target.value) })}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal leading-6"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-slate-800">
                Anbefalt vei videre - ett punkt per linje
                <textarea
                  rows={8}
                  value={textLines(template.recommended_next_steps)}
                  onChange={(event) => setTemplate({ ...template, recommended_next_steps: lines(event.target.value) })}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal leading-6"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-slate-800">
                Neste praktiske steg
                <textarea
                  rows={4}
                  value={template.next_practical_step}
                  onChange={(event) => setTemplate({ ...template, next_practical_step: event.target.value })}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal leading-6"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-slate-800">
                Forbehold
                <textarea
                  rows={5}
                  value={template.disclaimer}
                  onChange={(event) => setTemplate({ ...template, disclaimer: event.target.value })}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal leading-6"
                />
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-black text-slate-950">Testdata</h2>
            <p className="mt-1 text-sm text-slate-500">Endre tallene for å se et annet eksempel. Testen oppretter ingen CRM-kontakt.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <SampleInput label="Firma" value={sample.companyName} onChange={(value) => setSample({ ...sample, companyName: value })} />
              <SampleInput label="Kontakt" value={sample.contactName} onChange={(value) => setSample({ ...sample, contactName: value })} />
              <SampleInput label="Kjøpesum €" type="number" value={sample.propertyPrice} onChange={(value) => setSample({ ...sample, propertyPrice: Number(value) || 0 })} />
              <SampleInput label="Ansatte / medlemmer" type="number" value={sample.users} onChange={(value) => setSample({ ...sample, users: Number(value) || 0 })} />
              <SampleInput label="Ferie-/medlemsuker" type="number" value={sample.employeeWeeks} onChange={(value) => setSample({ ...sample, employeeWeeks: Number(value) || 0 })} />
              <SampleInput label="Årlig drift €" type="number" value={sample.annualOperating} onChange={(value) => setSample({ ...sample, annualOperating: Number(value) || 0 })} />
              <SampleInput label="Kjøpskostnad %" type="number" value={sample.acquisitionPct} onChange={(value) => setSample({ ...sample, acquisitionPct: Number(value) || 0 })} />
              <SampleInput label="Kapitalkostnad %" type="number" value={sample.capitalPct} onChange={(value) => setSample({ ...sample, capitalPct: Number(value) || 0 })} />
              <SampleInput label="Verdiscenario %" type="number" value={sample.valuePct} onChange={(value) => setSample({ ...sample, valuePct: Number(value) || 0 })} />
              <SampleInput label="Eierhorisont år" type="number" value={sample.holdingYears} onChange={(value) => setSample({ ...sample, holdingYears: Number(value) || 1 })} />
            </div>
          </section>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-[#fbfaf7] p-5 shadow-sm sm:p-7">
          <div className="text-xs font-black uppercase tracking-[0.15em] text-amber-700">Zen Eco Homes · Corporate Homes</div>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{template.report_title}</h2>
          <p className="mt-1 text-sm text-slate-500">{sample.companyName} · {template.report_subtitle} · test</p>

          <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm leading-6 text-slate-800">{executiveSummary}</div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Meta label="Modell" value="Ansattbolig / bedriftshytte" />
            <Meta label="Budsjett" value="€500 000–€750 000" />
            <Meta label="Kontakt" value={sample.contactName + " · " + sample.contactRole} />
            <Meta label="Tidslinje" value="3–12 måneder" />
          </div>

          <h3 className="mt-7 text-lg font-black text-slate-950">Tallene i kortform</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Kpi label="Kjøpesum" value={euro.format(sample.propertyPrice)} note="Valgt i kalkulatoren" />
            <Kpi label="Årlig kostnad før verdiendring" value={euro.format(calculation.annualCost)} note="Drift + kapital + periodiserte kjøpskostnader" />
            <Kpi label="Alternativ hotellovernatting" value={euro.format(calculation.hotelAlternative)} note="172 personnetter per år i testcaset" />
            <Kpi label={"Scenarioverdi etter " + sample.holdingYears + " år"} value={euro.format(calculation.futureValue)} note={sample.valuePct + " % årlig verdiendring · scenario"} />
          </div>

          <PreviewList title="Spørsmål styret bør avklare" items={template.board_questions} />
          <PreviewList title="Anbefalt vei videre" items={template.recommended_next_steps} />

          <div className="mt-6 rounded-xl bg-amber-50 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-amber-900">Neste praktiske steg</div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{template.next_practical_step}</p>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-black text-slate-950">Forbehold</h3>
            <p className="mt-2 text-xs leading-5 text-slate-500">{template.disclaimer}</p>
          </div>

          <div className="mt-7 border-t border-slate-200 pt-3 text-xs text-slate-400">
            Live forhåndsvisning. «Åpne test-PDF» bruker den samme PDF-rendereren som kunderapporten.
          </div>
        </section>
      </div>
    </div>
  );
}

function SampleInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <label className="grid gap-1 text-xs font-bold text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal text-slate-900"
      />
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-900">{value}</div>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-bold text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-teal-950">{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-slate-400">{note}</div>
    </div>
  );
}

function PreviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-7">
      <h3 className="text-lg font-black text-slate-950">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2 text-sm leading-6 text-slate-700">
            <span className="font-black text-amber-700">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
