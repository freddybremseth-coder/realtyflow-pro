"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Archive,
  Bot,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Globe,
  Mail,
  Newspaper,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Templates ───────────────────────────────────────────────────────────

const templates = [
  {
    title: "Kjøpsprosess i Spania",
    audience: "Norsk boligkjøper som vurderer Spania",
    sections: [
      "Kort oversikt: fra behovsavklaring til overtakelse",
      "Reservasjon, depositum og kontraktsløp",
      "NIE, bank, notar, advokat og fullmakter",
      "Kostnader, skatt og anbefalte kontrollpunkter",
      "Neste steg for kunden og oppfølging i RealtyFlow",
    ],
  },
  {
    title: "Sjekkliste før reservasjon",
    audience: "Kunde som vurderer å reservere bolig eller tomt",
    sections: [
      "Kundens kjøpskriterier og budsjett",
      "Dokumenter som må sjekkes før reservasjon",
      "Risiko og forbehold som skal avklares skriftlig",
      "Spørsmål til utbygger/megler/advokat",
      "Beslutningsgrunnlag: anbefal, vent eller avklar mer",
    ],
  },
  {
    title: "Guide til tomtekjøp og bygging",
    audience: "Kunde som vurderer tomt og nybygg i Spania",
    sections: [
      "Hva kunden må forstå før tomtekjøp",
      "Regulering, byggbarhet, vann, strøm og adkomst",
      "Kostnadsbilde fra tomt til ferdig bolig",
      "Arkitekt, entreprenør, lisens og tidslinje",
      "Anbefalt due diligence før bud/reservasjon",
    ],
  },
  {
    title: "Områdeguide for kunde",
    audience: "Norsk kjøper som sammenligner områder i Spania",
    sections: [
      "Hvem området passer for",
      "Boligtyper, prisnivå og typiske kjøpere",
      "Avstand til strand, flyplass, golf, skole og service",
      "Fordeler, ulemper og sesongvariasjoner",
      "Anbefalte boliger/tomter og neste steg",
    ],
  },
  {
    title: "Finansiering, notar og NIE",
    audience: "Norsk kunde som skal forstå kostnader og praktiske steg",
    sections: [
      "Finansieringsvalg: Norge, Spania eller egenkapital",
      "Omtrentlige kjøpskostnader og valutarisiko",
      "NIE, notar, bankkonto og betalingsflyt",
      "Dokumentasjon banken ofte ber om",
      "Forbehold: kunden må kontrollere med bank/advokat",
    ],
  },
  {
    title: "ChatGenius salgsbrev",
    audience: "Bedriftseier som vurderer AI-app eller spesialsoftware",
    sections: [
      "Problem: tid, manuelle prosesser og tapte leads",
      "Løsning: skreddersydd AI-app fra ChatGenius.pro",
      "Eksempler: CRM, kundeservice, dokumentflyt, innhold og automasjon",
      "Effekt: raskere responstid, bedre kontroll og mer salg",
      "Tydelig call-to-action: kartleggingssamtale eller demo",
    ],
  },
  {
    title: "Om ChatGenius.pro",
    audience: "Potensiell B2B-kunde eller samarbeidspartner",
    sections: [
      "Hvem vi er og hva vi bygger",
      "Hva som gjør oss annerledes: praktiske AI-systemer som brukes i drift",
      "Case: RealtyFlow som hub for eiendom, CRM, innhold og kundeportal",
      "Arbeidsmetode: analyse, prototype, integrasjon, opplæring og videreutvikling",
      "Neste steg for kunden",
    ],
  },
  {
    title: "Tilbud: spesiallaget AI-app/software",
    audience: "Kunde som har bedt om pris på utvikling",
    sections: [
      "Sammendrag av behov og mål",
      "Anbefalt løsning og moduler",
      "Leveranser, avgrensninger og milepæler",
      "Pris, betalingsplan og drift/support",
      "Forutsetninger, kundens ansvar og godkjenning",
    ],
  },
  {
    title: "Utviklingskontrakt for AI/software",
    audience: "Kunde som skal signere utviklingsprosjekt",
    sections: [
      "Parter, prosjektbeskrivelse og definisjoner",
      "Leveranser, endringshåndtering og akseptanse",
      "Rettigheter, lisens, tredjepartsverktøy og kildekode",
      "Betaling, forsinkelse, oppsigelse og support",
      "Ansvar, konfidensialitet og juridisk kontroll før signering",
    ],
  },
  {
    title: "GDPR og databehandleravtale",
    audience: "B2B-kunde som bruker ChatGenius/AI-systemer",
    sections: [
      "Roller: behandlingsansvarlig og databehandler",
      "Hvilke data som behandles og hvorfor",
      "Underleverandører, lagring, sikkerhet og sletting",
      "AI-bruk, logging, tilgangsstyring og kundens instruks",
      "Avvik, revisjon og krav om juridisk kvalitetssikring",
    ],
  },
  {
    title: "Nyhetsbrevkampanje",
    audience: "Kunder/leads som følger Zen Eco Homes eller ChatGenius",
    sections: [
      "Målgruppe og kjøps-/beslutningssignal",
      "Emnelinje, preheader og hovedbudskap",
      "3-5 innholdsblokker med klar CTA",
      "Segmentering: alle, varme leads, kunder eller valgt liste",
      "Måling: åpning, klikk, svar og oppfølgingsoppgaver",
    ],
  },
];

const CUSTOM_KEY = "__custom__";

// ─── Types ────────────────────────────────────────────────────────────────

type DocStatus = "draft" | "published" | "archived";
type DocChannel = "portal" | "email" | "newsletter" | "knowledge_base" | "attachment";

type WebsiteCmsDestination = {
  id: string;
  label: string;
  path: string;
  contentType: string;
};

type WebsiteCmsTarget = {
  id: string;
  name: string;
  website: string;
  webhookConfigured: boolean;
  publishingMode: "direct" | "queue";
  defaultDestinationId: string;
  destinations: WebsiteCmsDestination[];
};

type ArchiveDoc = {
  id: string;
  title: string;
  audience: string;
  summary: string;
  content: string;
  status: DocStatus;
  channel: DocChannel;
  scheduledFor: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  sentTo: string[];
  sourceTopic: string | null;
  aiModel: string | null;
  generatedAt: string;
};

const channelLabel: Record<DocChannel, string> = {
  portal: "Min side",
  email: "E-post",
  newsletter: "Nyhetsbrev",
  knowledge_base: "Kunnskapsbase",
  attachment: "Vedlegg",
};

const channelIcon: Record<DocChannel, typeof Mail> = {
  portal: FileText,
  email: Mail,
  newsletter: Newspaper,
  knowledge_base: Archive,
  attachment: FileText,
};

const statusLabel: Record<DocStatus, string> = {
  draft: "Utkast",
  published: "Publisert",
  archived: "Arkivert",
};

const statusBadge: Record<DocStatus, string> = {
  draft: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  published: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  archived: "bg-slate-600/20 text-slate-300 border-slate-500/40",
};

// ─── Page ─────────────────────────────────────────────────────────────────

export default function DocumentHubPage() {
  const [tab, setTab] = useState("editor");

  // Editor state
  const [topic, setTopic] = useState(templates[0].title);
  const [title, setTitle] = useState(templates[0].title);
  const [audience, setAudience] = useState(templates[0].audience);
  const [customPrompt, setCustomPrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  // Publish controls
  const [channel, setChannel] = useState<DocChannel>("portal");
  const [recipients, setRecipients] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [savingStatus, setSavingStatus] = useState<DocStatus | null>(null);
  const [savingError, setSavingError] = useState<string | null>(null);
  const [savingSuccess, setSavingSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cmsTargets, setCmsTargets] = useState<WebsiteCmsTarget[]>([]);
  const [cmsBrandId, setCmsBrandId] = useState("");
  const [cmsDestinationId, setCmsDestinationId] = useState("");
  const [websitePublishing, setWebsitePublishing] = useState(false);
  const [websiteResult, setWebsiteResult] = useState<string | null>(null);

  // Archive
  const [docs, setDocs] = useState<ArchiveDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | DocStatus>("all");

  const isCustom = topic === CUSTOM_KEY;
  const selectedCmsTarget = useMemo(
    () => cmsTargets.find((target) => target.id === cmsBrandId) || cmsTargets[0] || null,
    [cmsBrandId, cmsTargets],
  );
  const selectedCmsDestination = useMemo(() => {
    if (!selectedCmsTarget) return null;
    return (
      selectedCmsTarget.destinations.find((destination) => destination.id === cmsDestinationId) ||
      selectedCmsTarget.destinations.find((destination) => destination.id === selectedCmsTarget.defaultDestinationId) ||
      selectedCmsTarget.destinations[0] ||
      null
    );
  }, [cmsDestinationId, selectedCmsTarget]);

  function selectTemplate(value: string) {
    setTopic(value);
    if (value === CUSTOM_KEY) {
      setTitle("");
      setAudience("");
      setCustomPrompt("");
    } else {
      const tpl = templates.find((t) => t.title === value);
      if (tpl) {
        setTitle(tpl.title);
        setAudience(tpl.audience);
        setCustomPrompt("");
      }
    }
    setDraft("");
    setApproved(false);
    setEditingId(null);
    setSavingError(null);
    setSavingSuccess(null);
    setGenerateError(null);
    setWebsiteResult(null);
  }

  async function generate() {
    if (!title.trim() || !audience.trim()) {
      setGenerateError("Fyll inn både tittel og målgruppe.");
      return;
    }
    if (isCustom && !customPrompt.trim()) {
      setGenerateError("Skriv inn hva dokumentet skal handle om.");
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    setApproved(false);
    try {
      const tpl = templates.find((t) => t.title === topic);
      const res = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          audience,
          sections: isCustom ? undefined : tpl?.sections,
          customPrompt: isCustom ? customPrompt : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke generere dokument");
      setDraft(String(data.markdown || ""));
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : "Ukjent feil");
    } finally {
      setGenerating(false);
    }
  }

  const fetchDocs = useCallback(async () => {
    setDocsLoading(true);
    setDocsError(null);
    try {
      const res = await fetch("/api/documents/list");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente dokumenter");
      setDocs(data.documents || []);
    } catch (err: unknown) {
      setDocsError(err instanceof Error ? err.message : "Ukjent feil");
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/website-cms/targets")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const targets = Array.isArray(data.targets) ? data.targets : [];
        setCmsTargets(targets);
        if (targets.length > 0) {
          setCmsBrandId((current) => current || targets[0].id);
          setCmsDestinationId((current) => current || targets[0].defaultDestinationId || targets[0].destinations?.[0]?.id || "");
        }
      })
      .catch(() => {
        if (!cancelled) setCmsTargets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCmsTarget) return;
    const exists = selectedCmsTarget.destinations.some((destination) => destination.id === cmsDestinationId);
    if (!exists) {
      setCmsDestinationId(selectedCmsTarget.defaultDestinationId || selectedCmsTarget.destinations[0]?.id || "");
    }
  }, [cmsDestinationId, selectedCmsTarget]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const template = params.get("template");
    const incomingTitle = params.get("title");
    const incomingPrompt = params.get("prompt");
    if (!template && !incomingTitle && !incomingPrompt) return;

    const matchedTemplate = template && templates.some((item) => item.title === template)
      ? template
      : template === CUSTOM_KEY
        ? CUSTOM_KEY
        : CUSTOM_KEY;

    selectTemplate(matchedTemplate);
    if (incomingTitle) setTitle(incomingTitle);
    if (incomingPrompt) {
      setCustomPrompt(incomingPrompt);
      if (!template || template === CUSTOM_KEY) setTopic(CUSTOM_KEY);
    }
    setTab("editor");
  }, []);

  async function save(status: DocStatus) {
    if (!draft.trim()) {
      setSavingError("Generer eller skriv et dokument først.");
      return;
    }
    if (status === "published" && !approved) {
      setSavingError("Du må kvalitetssikre dokumentet før publisering.");
      return;
    }
    setSavingStatus(status);
    setSavingError(null);
    setSavingSuccess(null);
    try {
      const sentTo = recipients
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        title,
        content: draft,
        audience,
        status,
        channel,
        scheduledFor: scheduledFor || null,
        sentTo,
        sourceTopic: topic === CUSTOM_KEY ? "custom" : topic,
        aiModel: "claude-sonnet-4",
      };

      let res: Response;
      if (editingId) {
        res = await fetch("/api/documents/publish", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
      } else {
        res = await fetch("/api/documents/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke lagre");

      const message =
        status === "published"
          ? `Dokumentet er publisert på ${channelLabel[channel]}.`
          : status === "archived"
            ? "Dokumentet er arkivert."
            : "Dokumentet er lagret som utkast.";
      setSavingSuccess(message);
      setEditingId(data.document?.id ?? editingId);
      fetchDocs();
    } catch (err: unknown) {
      setSavingError(err instanceof Error ? err.message : "Ukjent feil");
    } finally {
      setSavingStatus(null);
    }
  }

  async function publishToWebsite() {
    if (!draft.trim()) {
      setSavingError("Generer eller skriv innhold først.");
      return;
    }
    if (!approved) {
      setSavingError("Du må kvalitetssikre innholdet før publisering til nettside.");
      return;
    }
    if (!selectedCmsTarget || !selectedCmsDestination) {
      setSavingError("Velg brand og publiseringsmål for nettside.");
      return;
    }

    setWebsitePublishing(true);
    setSavingError(null);
    setSavingSuccess(null);
    setWebsiteResult(null);
    try {
      const res = await fetch("/api/website-cms/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: selectedCmsTarget.id,
          destination_id: selectedCmsDestination.id,
          title,
          content: draft,
          audience,
          status: "published",
          source_type: "document",
          source_id: editingId,
          ai_generated: true,
          tags: [topic === CUSTOM_KEY ? "custom" : topic],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke publisere til nettside");

      const targetText = `${selectedCmsTarget.name} → ${selectedCmsDestination.label}`;
      if (data.websitePublished) {
        setSavingSuccess(`Publisert til ${targetText}.`);
        setWebsiteResult(data.externalUrl ? `Live: ${data.externalUrl}` : "Nettsiden bekreftet publisering.");
      } else {
        setSavingSuccess(`Klargjort for ${targetText} i Content Hub.`);
        setWebsiteResult(data.warning || "Webhook mangler, så innholdet ligger klart som website-draft.");
      }
    } catch (err: unknown) {
      setSavingError(err instanceof Error ? err.message : "Ukjent feil");
    } finally {
      setWebsitePublishing(false);
    }
  }

  function loadIntoEditor(doc: ArchiveDoc) {
    setEditingId(doc.id);
    setTitle(doc.title);
    setAudience(doc.audience);
    setDraft(doc.content);
    setChannel(doc.channel);
    setRecipients(doc.sentTo.join(", "));
    setScheduledFor(doc.scheduledFor ? doc.scheduledFor.slice(0, 16) : "");
    setApproved(doc.status === "published");
    setTopic(CUSTOM_KEY);
    setCustomPrompt(doc.sourceTopic && doc.sourceTopic !== "custom" ? doc.sourceTopic : "");
    setSavingError(null);
    setSavingSuccess(null);
    setWebsiteResult(null);
    setTab("editor");
  }

  async function quickStatus(id: string, status: DocStatus) {
    try {
      const res = await fetch("/api/documents/publish", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kunne ikke oppdatere");
      }
      fetchDocs();
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "Ukjent feil");
    }
  }

  async function remove(id: string) {
    if (!confirm("Slette dokumentet permanent?")) return;
    try {
      const res = await fetch(`/api/documents/publish?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kunne ikke slette");
      }
      fetchDocs();
      if (editingId === id) {
        setEditingId(null);
        setDraft("");
      }
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "Ukjent feil");
    }
  }

  function newDocument() {
    setEditingId(null);
    setDraft("");
    setApproved(false);
    setRecipients("");
    setScheduledFor("");
    setSavingError(null);
    setSavingSuccess(null);
    setTab("editor");
  }

  const filteredDocs = useMemo(() => {
    if (statusFilter === "all") return docs;
    return docs.filter((d) => d.status === statusFilter);
  }, [docs, statusFilter]);

  const counts = useMemo(() => {
    const out = { draft: 0, published: 0, archived: 0 };
    for (const doc of docs) out[doc.status]++;
    return out;
  }, [docs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dokumenthub</h1>
          <p className="text-sm text-slate-400 mt-1">
            Generer dokumenter med AI, kvalitetssikre i forhåndsvisning, og publiser til riktig kanal når du er klar.
          </p>
        </div>
        <Button variant="outline" onClick={newDocument}>
          <Plus size={16} className="mr-2" /> Nytt dokument
        </Button>
      </div>

      <Tabs defaultValue="editor" value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="editor">
            <Wand2 size={14} className="mr-2" /> Editor
          </TabsTrigger>
          <TabsTrigger value="archive">
            <Archive size={14} className="mr-2" /> Arkiv ({docs.length})
          </TabsTrigger>
        </TabsList>

        {/* ─── Editor tab ───────────────────────────────────────────── */}
        <TabsContent value="editor">
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles size={18} /> {editingId ? "Rediger dokument" : "Nytt dokument"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Mal</label>
                  <select
                    className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                    value={topic}
                    onChange={(e) => selectTemplate(e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.title} value={t.title}>
                        {t.title}
                      </option>
                    ))}
                    <option value={CUSTOM_KEY}>✨ Eget tema (skriv selv)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">
                    Dokumenttittel
                  </label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="F.eks. Kjøpsguide for nybyggprosjekt i Murcia" />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">
                    Målgruppe / kontekst
                  </label>
                  <Input
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="F.eks. Norsk førstegangskjøper i Spania"
                  />
                </div>

                {isCustom && (
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">
                      Hva skal dokumentet handle om?
                    </label>
                    <textarea
                      className="min-h-[120px] w-full resize-y rounded-lg border border-slate-600 bg-slate-800 p-3 text-sm text-slate-100 outline-none focus:border-primary-500"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="Beskriv tema, ønsket struktur, vinkling, lengde og spesielle krav. AI lager et komplett dokument basert på dette."
                    />
                  </div>
                )}

                <Button onClick={generate} disabled={generating} className="w-full">
                  {generating ? (
                    <>
                      <Bot size={16} className="mr-2 animate-spin" /> Genererer …
                    </>
                  ) : (
                    <>
                      <Bot size={16} className="mr-2" /> {draft ? "Generer på nytt" : "Generer dokument med AI"}
                    </>
                  )}
                </Button>

                {generateError && (
                  <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                    {generateError}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck size={18} /> Kvalitetssikring
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-300">
                {[
                  "Sjekk fakta — AI-en kan ta feil. Verifiser tall, lover og navn.",
                  "Ingen juridiske garantier uten advokatkontroll.",
                  "Forhåndsvis dokumentet (Preview-fanen under) før publisering.",
                  "Velg kanal og mottakere først — Min side er ikke alltid riktig sted.",
                ].map((item) => (
                  <p className="flex gap-2" key={item}>
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    {item}
                  </p>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Editor + Preview */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText size={18} /> Utkast {editingId && <span className="text-xs font-normal text-slate-400">(redigerer eksisterende)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="edit">
                <TabsList>
                  <TabsTrigger value="edit">
                    <Pencil size={14} className="mr-2" /> Rediger
                  </TabsTrigger>
                  <TabsTrigger value="preview">
                    <Eye size={14} className="mr-2" /> Forhåndsvisning
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="edit">
                  <textarea
                    className="min-h-[420px] w-full resize-y whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950/50 p-4 font-mono text-sm text-slate-200 outline-none focus:border-primary-500"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setApproved(false);
                    }}
                    placeholder="Generer dokument med AI eller skriv selv. Markdown støttes."
                  />
                </TabsContent>
                <TabsContent value="preview">
                  <div className="min-h-[420px] rounded-lg border border-slate-700 bg-slate-950/50 p-6">
                    {draft ? (
                      <article className="document-preview">
                        <ReactMarkdown>{draft}</ReactMarkdown>
                      </article>
                    ) : (
                      <p className="text-sm text-slate-500">Forhåndsvisning vises her når du har generert eller skrevet et dokument.</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Publish controls */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send size={18} /> Lagre, planlegg eller publiser
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Kanal</label>
                  <select
                    className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as DocChannel)}
                  >
                    <option value="portal">Min side (alle kunder)</option>
                    <option value="email">E-post til utvalgte</option>
                    <option value="newsletter">Nyhetsbrev</option>
                    <option value="knowledge_base">Kunnskapsbase</option>
                    <option value="attachment">Vedlegg / nedlasting</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">
                    Mottakere {channel === "portal" && <span className="text-slate-500">(tom = alle)</span>}
                  </label>
                  <Input
                    value={recipients}
                    onChange={(e) => setRecipients(e.target.value)}
                    placeholder="kunde@epost.no, annen@epost.no"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Planlagt sending</label>
                  <Input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 text-sm text-slate-300">
                <input
                  checked={approved}
                  className="mt-1"
                  disabled={!draft}
                  onChange={(e) => setApproved(e.target.checked)}
                  type="checkbox"
                />
                <span>
                  Jeg har kvalitetssikret dokumentet i forhåndsvisning og er klar for publisering.
                </span>
              </label>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  disabled={!draft || savingStatus !== null}
                  onClick={() => save("draft")}
                >
                  {savingStatus === "draft" ? <Bot size={16} className="mr-2 animate-spin" /> : <FileText size={16} className="mr-2" />}
                  Lagre som utkast
                </Button>
                <Button
                  disabled={!draft || !approved || savingStatus !== null}
                  onClick={() => save("published")}
                >
                  {savingStatus === "published" ? <Bot size={16} className="mr-2 animate-spin" /> : <Send size={16} className="mr-2" />}
                  Publiser til {channelLabel[channel]}
                </Button>
                <Button
                  variant="ghost"
                  disabled={!draft || savingStatus !== null}
                  onClick={() => save("archived")}
                >
                  <Archive size={16} className="mr-2" />
                  Lagre i arkiv
                </Button>
              </div>

              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Globe size={16} className="text-cyan-300" />
                      Publiser til brand-nettside
                    </h3>
                    <p className="text-xs text-slate-400">
                      Velg brand og hvor saken skal ligge på nettstedet.
                    </p>
                  </div>
                  {selectedCmsTarget && (
                    <span className="text-xs text-slate-400">
                      {selectedCmsTarget.webhookConfigured ? "Direkte publisering" : "Lagrer som website-draft"}
                    </span>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Brand</label>
                    <select
                      className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                      value={selectedCmsTarget?.id || ""}
                      onChange={(e) => setCmsBrandId(e.target.value)}
                    >
                      {cmsTargets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Plassering</label>
                    <select
                      className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                      value={selectedCmsDestination?.id || ""}
                      onChange={(e) => setCmsDestinationId(e.target.value)}
                      disabled={!selectedCmsTarget}
                    >
                      {(selectedCmsTarget?.destinations || []).map((destination) => (
                        <option key={destination.id} value={destination.id}>
                          {destination.label} ({destination.path})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      className="w-full md:w-auto"
                      disabled={!draft || !approved || websitePublishing || !selectedCmsTarget || !selectedCmsDestination}
                      onClick={publishToWebsite}
                    >
                      {websitePublishing ? (
                        <Bot size={16} className="mr-2 animate-spin" />
                      ) : (
                        <Globe size={16} className="mr-2" />
                      )}
                      {websitePublishing ? "Publiserer..." : "Publiser til nettside"}
                    </Button>
                  </div>
                </div>
              </div>

              {savingError && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                  {savingError}
                </p>
              )}
              {savingSuccess && (
                <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                  {savingSuccess}
                </p>
              )}
              {websiteResult && (
                <p className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-sm text-cyan-200">
                  {websiteResult}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Archive tab ──────────────────────────────────────────── */}
        <TabsContent value="archive">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Archive size={18} /> Dokumentarkiv
                </span>
                <div className="flex gap-1 text-xs font-normal">
                  {(["all", "draft", "published", "archived"] as const).map((value) => (
                    <button
                      key={value}
                      onClick={() => setStatusFilter(value)}
                      className={`rounded-md px-3 py-1 ${
                        statusFilter === value
                          ? "bg-primary-500/20 text-primary-300"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {value === "all"
                        ? `Alle (${docs.length})`
                        : `${statusLabel[value]} (${counts[value]})`}
                    </button>
                  ))}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {docsLoading && <p className="text-sm text-slate-400">Laster dokumenter …</p>}
              {docsError && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                  {docsError}
                </p>
              )}
              {!docsLoading && filteredDocs.length === 0 && (
                <p className="text-sm text-slate-500">
                  Ingen dokumenter {statusFilter !== "all" ? `med status «${statusLabel[statusFilter]}»` : ""}. Generer ett i Editor-fanen.
                </p>
              )}
              {filteredDocs.map((doc) => {
                const ChannelIcon = channelIcon[doc.channel];
                return (
                  <div
                    key={doc.id}
                    className="rounded-lg border border-slate-700 bg-slate-900/40 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-[260px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-white">{doc.title}</h3>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-xs ${statusBadge[doc.status]}`}
                          >
                            {statusLabel[doc.status]}
                          </span>
                          <span className="flex items-center gap-1 rounded-md border border-slate-600/50 bg-slate-800/50 px-2 py-0.5 text-xs text-slate-300">
                            <ChannelIcon size={12} /> {channelLabel[doc.channel]}
                          </span>
                          {doc.scheduledFor && (
                            <span className="flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300">
                              <Clock size={12} /> {new Date(doc.scheduledFor).toLocaleString("no-NO")}
                            </span>
                          )}
                        </div>
                        {doc.audience && (
                          <p className="text-xs text-slate-400 mt-1">{doc.audience}</p>
                        )}
                        {doc.summary && (
                          <p className="text-sm text-slate-300 mt-2 line-clamp-2">{doc.summary}</p>
                        )}
                        {doc.sentTo.length > 0 && (
                          <p className="text-xs text-slate-500 mt-2">
                            Mottakere: {doc.sentTo.join(", ")}
                          </p>
                        )}
                        <p className="text-xs text-slate-500 mt-2">
                          {new Date(doc.generatedAt).toLocaleString("no-NO")}
                          {doc.aiModel && ` · ${doc.aiModel}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => loadIntoEditor(doc)}>
                          <Pencil size={12} className="mr-1.5" /> Åpne
                        </Button>
                        {doc.status !== "published" && (
                          <Button size="sm" onClick={() => quickStatus(doc.id, "published")}>
                            <Send size={12} className="mr-1.5" /> Publiser
                          </Button>
                        )}
                        {doc.status !== "archived" && (
                          <Button size="sm" variant="ghost" onClick={() => quickStatus(doc.id, "archived")}>
                            <Archive size={12} className="mr-1.5" /> Arkiver
                          </Button>
                        )}
                        {doc.status === "archived" && (
                          <Button size="sm" variant="ghost" onClick={() => quickStatus(doc.id, "draft")}>
                            <Pencil size={12} className="mr-1.5" /> Tilbake til utkast
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove(doc.id)}
                          className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
