"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle2, Code2, Copy, ExternalLink, Globe, Loader2, Save } from "lucide-react";
import { BRANDS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type BookingConfig = {
  published: boolean;
  brandId: string;
  domain: string;
  siteName: string;
  bookingUrl: string;
  accent: string;
  profile: { name: string; initials: string; role: string; location: string; tz: string; bio: string };
  page: { eyebrow: string; title: string; lead: string; intro: string[] };
  services: Array<{
    id: string;
    icon: string;
    iconStyle: string;
    title: string;
    subtitle: string;
    duration: number;
    durationLabel: string;
    price: string;
    priceNote: string;
    paid: boolean;
    format: string;
    blurb: string;
    cta: string;
    intakeTitle: string;
    intakeFields: Array<Record<string, unknown>>;
  }>;
  crossLinks: Array<Record<string, unknown>>;
  updatedAt?: string;
};

const inputClass = "border-slate-700 bg-slate-950/70";
const textAreaClass = "min-h-[92px] w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
const PUBLIC_BASE = process.env.NEXT_PUBLIC_REALTYFLOW_PUBLIC_URL || "https://realtyflow.chatgenius.pro";
const APPOINTMENT_BASE = process.env.NEXT_PUBLIC_APPOINTMENT_PUBLIC_BASE_URL || "https://appointment.chatgenius.pro";

function brandToBookingParam(brandId: string) {
  if (brandId === "zeneco") return "zen";
  if (brandId === "pinosoecolife") return "pinoso";
  if (brandId === "chatgenius") return "chat";
  if (brandId === "freddyb") return "freddy";
  return brandId;
}

function serviceTemplate(config: BookingConfig) {
  return {
    id: `${config.brandId}-meeting-${config.services.length + 1}`,
    icon: "Phone",
    iconStyle: config.accent || "amber",
    title: "Ny møtetype",
    subtitle: "Kort beskrivelse",
    duration: 30,
    durationLabel: "30 min",
    price: "Gratis",
    priceNote: "uforpliktende",
    paid: false,
    format: "Google Meet / telefon",
    blurb: "Beskriv hvem møtet passer for og hva kunden får ut av samtalen.",
    cta: "Book møte",
    intakeTitle: "Hjelp oss forberede møtet",
    intakeFields: [
      { type: "text", id: "topic", label: "Hva ønsker du hjelp med?", placeholder: "Skriv kort.", required: true },
    ],
  };
}

export default function BookingAdminPage() {
  const [brandId, setBrandId] = useState("zeneco");
  const [config, setConfig] = useState<BookingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const publicConfigUrl = `${PUBLIC_BASE}/api/public/booking-config?brand_id=${encodeURIComponent(brandId)}`;
  const bookingUrl = `${APPOINTMENT_BASE}/booking.html?brand=${encodeURIComponent(brandToBookingParam(brandId))}&configUrl=${encodeURIComponent(publicConfigUrl)}`;
  const iframeCode = `<iframe src="${bookingUrl}" style="width:100%;min-height:860px;border:0;border-radius:8px;" loading="lazy"></iframe>`;
  const scriptCode = `<script src="${APPOINTMENT_BASE}/embed.js" data-brand="${brandToBookingParam(brandId)}" data-config-url="${publicConfigUrl}" async></script>`;

  const selectedBrand = useMemo(() => BRANDS.find((brand) => brand.id === brandId), [brandId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/booking-config?brand_id=${brandId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setConfig(data.config);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Kunne ikke hente bookingoppsett"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [brandId]);

  const update = (patch: Partial<BookingConfig>) => {
    if (!config) return;
    setConfig({ ...config, ...patch });
  };

  const updateProfile = (field: keyof BookingConfig["profile"], value: string) => {
    if (!config) return;
    update({ profile: { ...config.profile, [field]: value } });
  };

  const updatePage = (field: keyof BookingConfig["page"], value: string | string[]) => {
    if (!config) return;
    update({ page: { ...config.page, [field]: value } });
  };

  const updateService = (index: number, field: string, value: string | number | boolean | Array<Record<string, unknown>>) => {
    if (!config) return;
    const services = config.services.map((service, serviceIndex) => serviceIndex === index ? { ...service, [field]: value } : service);
    update({ services });
  };

  const save = async (publishState?: boolean) => {
    if (!config) return;
    setSaving(true);
    setError("");
    const nextConfig = { ...config, published: typeof publishState === "boolean" ? publishState : config.published };
    try {
      const res = await fetch("/api/booking-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, booking: nextConfig }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lagring feilet");
      setConfig(data.config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lagring feilet");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1800);
  };

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-slate-500">
            <Calendar size={16} />
            Booking
          </div>
          <h1 className="mt-1 text-3xl font-semibold text-white">Booking under hvert brand</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Rediger bookingtekst, møtevalg, priser og skjema ett sted. Når du publiserer, kan nettsiden bruke embed-koden eller hente konfig direkte fra Realtyflow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300"><CheckCircle2 size={13} /> Lagret</Badge>}
          <Button variant="outline" onClick={() => save(false)} disabled={saving || !config}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Lagre utkast
          </Button>
          <Button onClick={() => save(true)} disabled={saving || !config}>
            <Globe className="mr-2 h-4 w-4" />
            Publiser
          </Button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Brand</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {BRANDS.map((brand) => (
              <button
                key={brand.id}
                onClick={() => setBrandId(brand.id)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${brandId === brand.id ? "border-primary-500 bg-primary-500/10 text-white" : "border-slate-700 bg-slate-900/40 text-slate-300 hover:bg-slate-800"}`}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: brand.color }} />
                <span className="flex-1">{brand.name}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        {loading || !config ? (
          <Card><CardContent className="flex min-h-[420px] items-center justify-center text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Laster bookingoppsett...</CardContent></Card>
        ) : (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{selectedBrand?.name || config.siteName}</CardTitle>
                  <Badge className={config.published ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" : "border-amber-500/30 bg-amber-500/15 text-amber-300"}>
                    {config.published ? "Publisert" : "Utkast"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-slate-400">Sidenavn</span>
                  <Input className={inputClass} value={config.siteName} onChange={(e) => update({ siteName: e.target.value })} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-400">Booking-URL vist på siden</span>
                  <Input className={inputClass} value={config.bookingUrl} onChange={(e) => update({ bookingUrl: e.target.value })} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-400">Profilnavn</span>
                  <Input className={inputClass} value={config.profile.name} onChange={(e) => updateProfile("name", e.target.value)} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-400">Rolle</span>
                  <Input className={inputClass} value={config.profile.role} onChange={(e) => updateProfile("role", e.target.value)} />
                </label>
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="text-slate-400">Profiltekst</span>
                  <textarea className={textAreaClass} value={config.profile.bio} onChange={(e) => updateProfile("bio", e.target.value)} />
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Booking-side tekst</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <Input className={inputClass} value={config.page.eyebrow} onChange={(e) => updatePage("eyebrow", e.target.value)} placeholder="Kategori / eyebrow" />
                <Input className={inputClass} value={config.page.title} onChange={(e) => updatePage("title", e.target.value)} placeholder="Sidetittel" />
                <textarea className={textAreaClass} value={config.page.lead} onChange={(e) => updatePage("lead", e.target.value)} placeholder="Undertittel" />
                <textarea className={textAreaClass} value={config.page.intro.join("\n")} onChange={(e) => updatePage("intro", e.target.value.split("\n").filter(Boolean))} placeholder="Intro, én linje per avsnitt" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Møtevalg og skjema</CardTitle>
                  <Button size="sm" variant="secondary" onClick={() => update({ services: [...config.services, serviceTemplate(config)] })}>+ Ny møtetype</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {config.services.map((service, index) => (
                  <div key={service.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="font-medium text-white">{service.title || "Møtetype"}</div>
                      <Button size="sm" variant="ghost" onClick={() => update({ services: config.services.filter((_, i) => i !== index) })}>Fjern</Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input className={inputClass} value={service.title} onChange={(e) => updateService(index, "title", e.target.value)} placeholder="Tittel" />
                      <Input className={inputClass} value={service.subtitle} onChange={(e) => updateService(index, "subtitle", e.target.value)} placeholder="Undertittel" />
                      <Input className={inputClass} value={service.durationLabel} onChange={(e) => updateService(index, "durationLabel", e.target.value)} placeholder="30 min" />
                      <Input className={inputClass} type="number" value={service.duration} onChange={(e) => updateService(index, "duration", Number(e.target.value || 0))} placeholder="Varighet minutter" />
                      <Input className={inputClass} value={service.price} onChange={(e) => updateService(index, "price", e.target.value)} placeholder="Pris" />
                      <Input className={inputClass} value={service.cta} onChange={(e) => updateService(index, "cta", e.target.value)} placeholder="Knappetekst" />
                      <textarea className={`${textAreaClass} md:col-span-2`} value={service.blurb} onChange={(e) => updateService(index, "blurb", e.target.value)} placeholder="Kort tekst ved bookingknapp" />
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input type="checkbox" checked={service.paid} onChange={(e) => updateService(index, "paid", e.target.checked)} />
                        Betalt møte
                      </label>
                      <Input className={inputClass} value={service.intakeTitle} onChange={(e) => updateService(index, "intakeTitle", e.target.value)} placeholder="Skjematittel" />
                      <label className="space-y-1 text-sm md:col-span-2">
                        <span className="text-slate-400">Skjemafelt JSON</span>
                        <textarea
                          className="min-h-[170px] w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-100 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          value={JSON.stringify(service.intakeFields || [], null, 2)}
                          onChange={(e) => {
                            try {
                              updateService(index, "intakeFields", JSON.parse(e.target.value));
                              setError("");
                            } catch {
                              setError("Skjemafelt må være gyldig JSON før du lagrer.");
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Code2 size={18} /> Publisering og embed</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-200">Iframe-kode</span>
                    <Button size="sm" variant="outline" onClick={() => copy("iframe", iframeCode)}><Copy size={14} className="mr-2" />{copied === "iframe" ? "Kopiert" : "Kopier"}</Button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-400">{iframeCode}</pre>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-200">Script-kode</span>
                    <Button size="sm" variant="outline" onClick={() => copy("script", scriptCode)}><Copy size={14} className="mr-2" />{copied === "script" ? "Kopiert" : "Kopier"}</Button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-400">{scriptCode}</pre>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={publicConfigUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
                    Åpne publisert JSON <ExternalLink size={14} />
                  </a>
                  <a href={bookingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
                    Forhåndsvis booking <ExternalLink size={14} />
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
