"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileText,
  Filter,
  Layers3,
  Loader2,
  Plus,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Source = {
  label: string;
  url: string;
  note?: string;
};

type AdvisorPlaybook = {
  id: string;
  brand_id?: string;
  title: string;
  topic?: string;
  region?: string;
  status?: string;
  confidence?: string;
  summary?: string;
  customer_message?: string;
  internal_notes?: string;
  checklist?: string[];
  sources?: Source[];
  tags?: string[];
  next_review_at?: string;
  synthetic?: boolean;
};

export type AdvisorMarketContext = {
  id: string;
  type: "snapshot" | "insight" | "report";
  label: string;
  title: string;
  summary?: string;
  details?: string;
  sources?: Source[];
};

type DraftFormat = "report" | "article" | "instruction";

type DraftForm = {
  format: DraftFormat;
  title: string;
  audience: string;
  region: string;
  readerProblem: string;
  expertAngle: string;
  evidence: string;
  sources: string;
  cta: string;
};

const formatOptions: Array<{
  id: DraftFormat;
  label: string;
  topic: string;
  description: string;
}> = [
  {
    id: "report",
    label: "Rapport",
    topic: "expert_report",
    description: "Beslutningsstøtte med konklusjon, data, risiko og neste steg.",
  },
  {
    id: "article",
    label: "Artikkel",
    topic: "expert_article",
    description: "Tydelig perspektiv som bygger tillit og gir leseren et bedre valggrunnlag.",
  },
  {
    id: "instruction",
    label: "Instruks",
    topic: "advisor_instruction",
    description: "Operativ sjekkliste, prosess eller forklaring som kan brukes igjen.",
  },
];

const defaultDraft: DraftForm = {
  format: "report",
  title: "Kjøperrapport: hva norske boligkjøpere bør vite før de kjøper i Costa Blanca",
  audience: "Norske boligkjøpere som vurderer Spania",
  region: "Costa Blanca",
  readerProblem: "Leseren ønsker å forstå risiko, prisnivå, utleiemuligheter og hva som bør sjekkes før de går videre med boligkjøp.",
  expertAngle: "Gi en rolig, konkret vurdering som skiller mellom det som er sikkert, det som må undersøkes lokalt, og det som bør avklares med advokat eller gestor.",
  evidence: "Lokale prisforskjeller mellom kommuner\nRegler for turistutleie varierer etter region, kommune og boligtype\nSameievedtekter, lisenshistorikk og cadastral reference må kontrolleres tidlig",
  sources: "BOE / DOGV Decreto-ley 9/2024 | https://www.boe.es/buscar/doc.php?id=DOGV-r-2024-90168 | VUT-definisjon og regional regulering\nTurisme GVA | https://www.turisme.gva.es/turisme/es/files/pdf/viviendas_turisticas_012.pdf | Registrering, titular og boligdata",
  cta: "Book en konkret gjennomgang av område, boligtype og budsjett før du binder deg til visning eller reservasjon.",
};

const qualityPrinciples = [
  "Start med en tydelig konklusjon leseren kan bruke.",
  "Skill fakta, vurdering og forbehold fra hverandre.",
  "Vis kilder eller datagrunnlag når innholdet påvirker en beslutning.",
  "Gjør risiko konkret: hva kan gå galt, og hvordan sjekkes det?",
  "Avslutt med neste profesjonelle steg.",
];

const textareaClassName =
  "min-h-[112px] w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 placeholder:text-slate-600";

function parseLines(value: string) {
  return value
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSources(value: string): Source[] {
  return parseLines(value).map((line, index) => {
    const [label, url, note] = line.split("|").map((part) => part.trim());
    if (url) return { label: label || `Kilde ${index + 1}`, url, note };
    return {
      label: label.startsWith("http") ? `Kilde ${index + 1}` : label || `Kilde ${index + 1}`,
      url: label.startsWith("http") ? label : "#",
    };
  });
}

function formatLabel(format: DraftFormat) {
  return formatOptions.find((item) => item.id === format)?.label || "Innhold";
}

function formatTopic(format: DraftFormat) {
  return formatOptions.find((item) => item.id === format)?.topic || "expert_content";
}

function inferFormat(playbook: AdvisorPlaybook): DraftFormat | "playbook" {
  const haystack = `${playbook.topic || ""} ${(playbook.tags || []).join(" ")} ${playbook.title}`.toLowerCase();
  if (/rapport|report|market/.test(haystack)) return "report";
  if (/artikkel|article|guide/.test(haystack)) return "article";
  if (/instruks|instruction|sop|checklist|prosedyre/.test(haystack)) return "instruction";
  return "playbook";
}

function formatBadgeLabel(playbook: AdvisorPlaybook) {
  const format = inferFormat(playbook);
  if (format === "playbook") return "Playbook";
  return formatLabel(format);
}

function buildChecklist(form: DraftForm) {
  const shared = [
    "Har en klar hovedkonklusjon i starten.",
    "Skiller mellom dokumenterte fakta, faglig vurdering og forbehold.",
    "Gir leseren konkrete kontrollpunkter før beslutning.",
    "Har en profesjonell neste handling uten hardt salg.",
  ];

  if (form.format === "report") {
    return [
      ...shared,
      "Har tall, kilder eller tydelig datagrunnlag for markedsvurderingen.",
      "Forklarer både mulighet, risiko og konsekvens for kjøper eller selger.",
    ];
  }

  if (form.format === "article") {
    return [
      ...shared,
      "Har en sterk faglig vinkel som ikke bare oppsummerer generelle råd.",
      "Gir eksempler som gjør ekspertisen konkret og lett å huske.",
    ];
  }

  return [
    ...shared,
    "Deler prosessen inn i trinn som kan følges av team eller kunde.",
    "Markerer hvilke punkter som krever advokat, gestor, kommune eller annen tredjepart.",
  ];
}

function buildDraftMessage(form: DraftForm) {
  const evidence = parseLines(form.evidence);
  const sourceLabels = parseSources(form.sources).map((source) => source.label);

  if (form.format === "article") {
    return `${form.title}

Ingress
Mange boligkjøpere starter med boligannonsen. Jeg vil heller starte med beslutningen: hva skal boligen faktisk brukes til, hvilken risiko tåler du, og hvilke forhold må være avklart før du går videre?

Hvorfor dette er viktig
${form.readerProblem}

Min faglige vurdering
${form.expertAngle}

Dette bør du se nærmere på
${evidence.map((item) => `- ${item}`).join("\n") || "- Legg inn konkrete observasjoner, tall eller eksempler."}

Hva jeg ofte ser
Kjøpere som tar gode valg, vurderer ikke bare om boligen er attraktiv. De vurderer om området fungerer gjennom året, om dokumentasjonen tåler kontroll, om kostnadsbildet er realistisk, og om boligen passer den planen de faktisk har.

Mitt råd
Før du sammenligner flere boliger, sammenlign risikoen rundt dem: område, sameie, regulering, teknisk tilstand, utleiemulighet og kostnader etter kjøp.

Neste steg
${form.cta}

Kilder og datagrunnlag
${sourceLabels.map((item) => `- ${item}`).join("\n") || "- Legg inn kilder før publisering."}`;
  }

  if (form.format === "instruction") {
    return `${form.title}

Formål
${form.readerProblem}

Faglig prinsipp
${form.expertAngle}

Prosess
1. Avklar mål, budsjett, tidshorisont og reell bruk.
2. Samle dokumentasjon: boligdata, sameie, kostnader, historikk og relevante tillatelser.
3. Kontroller lokale forhold før du gir anbefaling.
4. Skill mellom det rådgiver kan forklare og det advokat/gestor må bekrefte.
5. Oppsummer funn i en kort anbefaling med risiko og neste steg.

Kontrollpunkter
${evidence.map((item) => `- ${item}`).join("\n") || "- Legg inn kontrollpunkter som må bekreftes."}

Standard formulering
Basert på det vi vet nå er dette en god retning å undersøke videre, men beslutningen bør først tas når dokumentasjon, lokale regler og praktiske kostnader er kontrollert.

Neste steg
${form.cta}

Kilder og datagrunnlag
${sourceLabels.map((item) => `- ${item}`).join("\n") || "- Legg inn kilder før bruk."}`;
  }

  return `${form.title}

Kort vurdering
For deg som vurderer bolig i ${form.region || "Spania"}, er det viktigste ikke å finne den boligen som ser mest attraktiv ut først. Det viktigste er å finne ut hvilken bolig som passer planen din best, og hvilke forhold som må være avklart før du tar neste steg.

Din situasjon
${form.readerProblem}

Min anbefaling
${form.expertAngle}

Det jeg ville kontrollert før du går videre
${evidence.map((item) => `- ${item}`).join("\n") || "- Legg inn tall, observasjoner eller funn."}

Hva dette betyr i praksis
En bolig kan være riktig for feriebruk, men svakere som investering. Den kan ha god pris, men være mer krevende å eie, drifte eller selge videre enn den først virker. Derfor bør vurderingen handle om bruk, område, dokumentasjon, kostnader, fleksibilitet og risiko samlet.

Mulighet
- Du kan ta en bedre beslutning når område, boligtype og forventet bruk vurderes samlet.
- Du får et sterkere grunnlag for forhandling når svake punkter og dokumentasjon er kjent tidlig.
- Du unngår å bygge kjøpsbeslutningen på generelle råd som ikke er kontrollert mot akkurat denne boligen.

Risiko
- Sameievedtekter, lisenshistorikk, lokale regler eller dokumentasjon kan påvirke hvordan boligen faktisk kan brukes.
- Kostnader, drift og vedlikehold kan gjøre en tilsynelatende rimelig bolig mindre attraktiv over tid.
- Utleiepotensial bør aldri vurderes uten kontroll av region, kommune, sameie, boligdata og praktisk drift.

Min konklusjon
Dette er et tema der det lønner seg å være konkret tidlig. Før du binder deg til en visning, reservasjon eller forhandling, bør vi vurdere boligen opp mot bruken din, området, dokumentasjonen og de viktigste risikopunktene.

Anbefalt neste steg
${form.cta}

Forbehold
Dette er rådgivende beslutningsstøtte. Juridiske, skattemessige og kommunale spørsmål må bekreftes av riktig fagperson før endelig beslutning.

Kilder og datagrunnlag
${sourceLabels.map((item) => `- ${item}`).join("\n") || "- Legg inn kilder før publisering."}`;
}

function createDraftPlaybook(form: DraftForm): AdvisorPlaybook {
  const sources = parseSources(form.sources);

  return {
    id: `draft-${Date.now()}`,
    brand_id: "zeneco",
    title: form.title.trim() || `${formatLabel(form.format)} uten tittel`,
    topic: formatTopic(form.format),
    region: form.region,
    status: "draft",
    confidence: sources.length ? "needs_review" : "draft",
    summary: `Kundeklar ${formatLabel(form.format).toLowerCase()} for ${form.audience}. Fokus: ${form.readerProblem}`,
    customer_message: buildDraftMessage(form),
    internal_notes:
      "Intern kvalitetssjekk før publisering: kontroller kilder, datoer, lokale regler, forbehold og at neste steg er konkret.",
    checklist: buildChecklist(form),
    sources,
    tags: [form.format, "expert-content", "freddy-expertise"],
    next_review_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString().slice(0, 10),
    synthetic: true,
  };
}

function qualityScore(playbook: AdvisorPlaybook) {
  const checks = [
    playbook.title.length > 8,
    Boolean(playbook.summary && playbook.summary.length > 70),
    Boolean(playbook.customer_message && playbook.customer_message.length > 700),
    Boolean((playbook.checklist || []).length >= 4),
    Boolean((playbook.sources || []).length >= 1),
    Boolean(playbook.internal_notes),
    Boolean(playbook.next_review_at),
  ];

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function statusVariant(status?: string) {
  if (status === "active") return "success";
  if (status === "archived") return "secondary";
  return "warning";
}

function confidenceVariant(confidence?: string) {
  if (confidence === "verified") return "success";
  if (confidence === "needs_review") return "warning";
  return "secondary";
}

function draftActionLabel(format: DraftFormat, hasDraft: boolean) {
  const noun =
    format === "report" ? "kundeklar rapport" : format === "article" ? "kundeklar artikkel" : "intern instruks";
  return `${hasDraft ? "Oppdater" : "Generer"} ${noun}`;
}

type AdvisorPlaybooksStudioProps = {
  embedded?: boolean;
  marketContexts?: AdvisorMarketContext[];
};

export function AdvisorPlaybooksStudio({ embedded = false, marketContexts = [] }: AdvisorPlaybooksStudioProps) {
  const [playbooks, setPlaybooks] = useState<AdvisorPlaybook[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableNotReady, setTableNotReady] = useState(false);
  const [dbError, setDbError] = useState("");
  const [supabaseHost, setSupabaseHost] = useState("");
  const [synthetic, setSynthetic] = useState(false);
  const [emptyDatabase, setEmptyDatabase] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [hubStatus, setHubStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("studio");
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [draftForm, setDraftForm] = useState<DraftForm>(defaultDraft);
  const [generatedDraft, setGeneratedDraft] = useState<AdvisorPlaybook | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState("");
  const [selectedContextId, setSelectedContextId] = useState("");
  const [customAngle, setCustomAngle] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [contentHubPushing, setContentHubPushing] = useState(false);
  const [contentHubStatus, setContentHubStatus] = useState<string | null>(null);

  async function loadPlaybooks() {
    setLoading(true);
    try {
      const res = await fetch("/api/advisor-playbooks", { cache: "no-store" });
      const data = await res.json();
      setPlaybooks(data.playbooks || []);
      setTableNotReady(Boolean(data.tableNotReady));
      setSynthetic(Boolean(data.synthetic));
      setEmptyDatabase(Boolean(data.emptyDatabase));
      setDbError(data.dbError || "");
      setSupabaseHost(data.supabaseHost || "");
    } catch (err) {
      console.error("Could not load advisor playbooks:", err);
      setHubStatus("Kunne ikke laste ekspertbiblioteket.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlaybooks();
  }, []);

  const metrics = useMemo(() => {
    const total = playbooks.length;
    const verified = playbooks.filter((item) => item.confidence === "verified").length;
    const reports = playbooks.filter((item) => inferFormat(item) === "report").length;
    const avgScore = total
      ? Math.round(playbooks.reduce((sum, item) => sum + qualityScore(item), 0) / total)
      : generatedDraft
        ? qualityScore(generatedDraft)
        : 0;

    return { total, verified, reports, avgScore };
  }, [generatedDraft, playbooks]);

  const filteredPlaybooks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return playbooks.filter((playbook) => {
      const playbookFormat = inferFormat(playbook);
      const matchesFormat = formatFilter === "all" || playbookFormat === formatFilter;
      const haystack = [
        playbook.title,
        playbook.summary,
        playbook.customer_message,
        playbook.region,
        playbook.topic,
        ...(playbook.tags || []),
      ]
        .join(" ")
        .toLowerCase();

      return matchesFormat && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [formatFilter, playbooks, query]);

  const selectedMarketContext = useMemo(
    () => marketContexts.find((context) => context.id === selectedContextId) || null,
    [marketContexts, selectedContextId],
  );
  const hasMarketContexts = marketContexts.length > 0;

  function updateDraft<K extends keyof DraftForm>(key: K, value: DraftForm[K]) {
    setDraftForm((current) => ({ ...current, [key]: value }));
    if (generatedDraft) setDraftDirty(true);
  }

  function generateDraft() {
    const draft = createDraftPlaybook(draftForm);
    setGeneratedDraft(draft);
    setDraftDirty(false);
    setLastGeneratedAt(new Date().toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }));
    setActiveTab("studio");
    setHubStatus(`${formatLabel(draftForm.format)} er generert som kundeklar tekst og klar for gjennomlesing.`);
  }

  async function generateDraftWithAI() {
    if (!selectedMarketContext) {
      setHubStatus("Velg en markedskontekst eller rapport før du ber AI skrive.");
      return;
    }

    setAiGenerating(true);
    setHubStatus(null);
    setContentHubStatus(null);
    try {
      const res = await fetch("/api/advisor-playbooks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: draftForm.format,
          form: {
            ...draftForm,
            sources: parseSources(draftForm.sources),
          },
          context: selectedMarketContext,
          customAngle,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "AI-generering feilet.");
      setGeneratedDraft(data.playbook);
      setDraftDirty(false);
      setLastGeneratedAt(new Date().toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }));
      setHubStatus("AI har skrevet kundeklar tekst basert på valgt markedskontekst.");
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "AI-generering feilet.");
    } finally {
      setAiGenerating(false);
    }
  }

  async function sendDraftToContentHub() {
    if (!generatedDraft) return;

    setContentHubPushing(true);
    setContentHubStatus(null);
    try {
      const res = await fetch("/api/advisor-playbooks/content-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playbook: generatedDraft,
          sourceContext: selectedMarketContext,
          customAngle,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke sende til Content HUB.");
      setContentHubStatus("Sendt til Content HUB som utkast. Du kan redigere, velge kanal og publisere derfra.");
    } catch (err) {
      setContentHubStatus(err instanceof Error ? err.message : "Kunne ikke sende til Content HUB.");
    } finally {
      setContentHubPushing(false);
    }
  }

  async function savePlaybook(playbook: AdvisorPlaybook) {
    setSaving(true);
    setHubStatus(null);
    try {
      const res = await fetch("/api/advisor-playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(playbook),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke lagre innholdet.");
      await loadPlaybooks();
      setHubStatus(data.updated ? "Eksisterende innhold ble oppdatert." : "Innholdet er lagret i ekspertbiblioteket.");
      setActiveTab("library");
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke lagre innholdet.");
    } finally {
      setSaving(false);
    }
  }

  async function seedPlaybooks() {
    setSaving(true);
    setHubStatus(null);
    try {
      for (const playbook of playbooks.filter((item) => item.synthetic || item.id.startsWith("seed-"))) {
        const res = await fetch("/api/advisor-playbooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(playbook),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kunne ikke lagre seed-innhold.");
      }
      await loadPlaybooks();
      setHubStatus("Seed-innholdet er lagret i Supabase.");
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke lagre seed-innhold.");
    } finally {
      setSaving(false);
    }
  }

  async function pushTask(playbook: AdvisorPlaybook) {
    setHubStatus(null);
    const res = await fetch("/api/work-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Ekspertinnhold: ${playbook.title}`,
        description: playbook.summary,
        brand_id: playbook.brand_id || "zeneco",
        source_type: "brand",
        source_id: playbook.id,
        assigned_agent: "sales",
        priority: qualityScore(playbook) >= 85 ? "HIGH" : "MEDIUM",
        ai_score: qualityScore(playbook),
        next_action: "Kvalitetssjekk tekst, kilder og forbehold før publisering eller kundebruk.",
        metadata: { topic: playbook.topic, region: playbook.region, format: inferFormat(playbook) },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setHubStatus(data.error || "Kunne ikke sende til HUB.");
      return;
    }
    setHubStatus(data.fallback_source_type ? "Sendt til HUB. Databasen brukte fallback source_type=manual." : "Sendt til Oppgave-HUB.");
  }

  async function copyText(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-700/60 bg-slate-950/60 p-5 shadow-lg">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <Badge variant="default" className="mb-3">
              Ekspertinnhold
            </Badge>
            <h1 className="flex items-center gap-3 text-2xl font-bold text-white sm:text-3xl">
              <Sparkles className="text-cyan-300" size={30} />
              Ekspertbibliotek
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {embedded
                ? "Gjør kvalitetssikret markedsdata, renter, eurokurs og kilder om til kundeklare rapporter, artikler og instruksjoner."
                : "Lag rapporter, artikler, instruksjoner og rådgivertekster som gir leseren konkret verdi og bygger Freddy som en tydelig fagperson."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setActiveTab("framework")}>
              <ShieldCheck className="mr-2" size={16} />
              Ekspertstandard
            </Button>
            {synthetic && (
              <Button onClick={seedPlaybooks} disabled={saving || tableNotReady}>
                {saving ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Plus className="mr-2" size={16} />}
                Lagre seed-innhold
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Bibliotek</p>
          <p className="mt-2 text-2xl font-semibold text-white">{metrics.total}</p>
          <p className="mt-1 text-xs text-slate-400">lagrede ressurser</p>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-200/80">Verifisert</p>
          <p className="mt-2 text-2xl font-semibold text-white">{metrics.verified}</p>
          <p className="mt-1 text-xs text-emerald-100/70">klare for bruk</p>
        </div>
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-cyan-200/80">Rapporter</p>
          <p className="mt-2 text-2xl font-semibold text-white">{metrics.reports}</p>
          <p className="mt-1 text-xs text-cyan-100/70">beslutningsstøtte</p>
        </div>
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-violet-200/80">Kvalitet</p>
          <p className="mt-2 text-2xl font-semibold text-white">{metrics.avgScore}%</p>
          <p className="mt-1 text-xs text-violet-100/70">snittscore</p>
        </div>
      </div>

      {tableNotReady && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p>Live-appen finner ikke tabellen `advisor_playbooks` i Supabase-prosjektet den er koblet til.</p>
          {supabaseHost && <p className="mt-1 text-xs text-amber-100/80">Supabase host: {supabaseHost}</p>}
          {dbError && <p className="mt-1 text-xs text-amber-100/80">Databasefeil: {dbError}</p>}
        </div>
      )}

      {emptyDatabase && !tableNotReady && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
          Tabellen er klar, men tom. Lagre seed-innholdet for å fylle biblioteket med første sett profesjonelle ressurser.
        </div>
      )}

      {hubStatus && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {hubStatus}
        </div>
      )}

      <Tabs defaultValue="studio" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full flex-wrap justify-start rounded-lg border border-slate-700/60 bg-slate-900/80 p-1">
          <TabsTrigger value="studio" className="gap-2">
            <FileText size={15} />
            Studio
          </TabsTrigger>
          <TabsTrigger value="library" className="gap-2">
            <BookOpen size={15} />
            Bibliotek
          </TabsTrigger>
          <TabsTrigger value="framework" className="gap-2">
            <Target size={15} />
            Standard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="studio" className="mt-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Lag nytt ekspertinnhold</CardTitle>
                <CardDescription>Velg format, vinkel, bevis og neste steg.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 md:grid-cols-3">
                  {formatOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => updateDraft("format", option.id)}
                      className={`rounded-lg border p-3 text-left transition ${
                        draftForm.format === option.id
                          ? "border-cyan-400 bg-cyan-500/10 text-white"
                          : "border-slate-700 bg-slate-950/40 text-slate-300 hover:border-slate-500"
                      }`}
                    >
                      <p className="text-sm font-semibold">{option.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{option.description}</p>
                    </button>
                  ))}
                </div>

                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div>
                      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-cyan-200/80">
                        Markedskontekst
                      </label>
                      <select
                        value={selectedContextId}
                        onChange={(event) => setSelectedContextId(event.target.value)}
                        disabled={!hasMarketContexts}
                        className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="">
                          {hasMarketContexts
                            ? "Velg rapport, analyse eller live markedstall"
                            : "Ingen rapporter eller markedsinnsikt tilgjengelig ennå"}
                        </option>
                        {marketContexts.map((context) => (
                          <option key={context.id} value={context.id}>
                            {context.label}
                          </option>
                        ))}
                      </select>
                      {selectedMarketContext ? (
                        <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-950/50 p-3">
                          <p className="text-sm font-semibold text-white">{selectedMarketContext.title}</p>
                          {selectedMarketContext.summary && (
                            <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-400">{selectedMarketContext.summary}</p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs leading-5 text-slate-400">
                          AI kan skrive fra lagrede rapporter, markedsinnsikt, renter, eurokurs og kilder når dette finnes i Markedsdata.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-cyan-200/80">
                        Egen vinkling til AI
                      </label>
                      <textarea
                        className="min-h-[118px] w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 placeholder:text-slate-600"
                        value={customAngle}
                        onChange={(event) => setCustomAngle(event.target.value)}
                        placeholder="F.eks. skriv som en tydelig ekspertartikkel om hvorfor eurokurs og renter endrer kjøpsstrategien for nordmenn nå."
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">Tittel</label>
                  <Input value={draftForm.title} onChange={(event) => updateDraft("title", event.target.value)} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">Målgruppe</label>
                    <Input value={draftForm.audience} onChange={(event) => updateDraft("audience", event.target.value)} />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">Region/tema</label>
                    <Input value={draftForm.region} onChange={(event) => updateDraft("region", event.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">Leserens problem</label>
                  <textarea
                    className={textareaClassName}
                    value={draftForm.readerProblem}
                    onChange={(event) => updateDraft("readerProblem", event.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">Ekspertvinkel</label>
                  <textarea
                    className={textareaClassName}
                    value={draftForm.expertAngle}
                    onChange={(event) => updateDraft("expertAngle", event.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">Funn, tall og kontrollpunkter</label>
                  <textarea
                    className={textareaClassName}
                    value={draftForm.evidence}
                    onChange={(event) => updateDraft("evidence", event.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">Kilder</label>
                  <textarea
                    className={textareaClassName}
                    value={draftForm.sources}
                    onChange={(event) => updateDraft("sources", event.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">Neste steg</label>
                  <textarea
                    className={textareaClassName}
                    value={draftForm.cta}
                    onChange={(event) => updateDraft("cta", event.target.value)}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={generateDraftWithAI} disabled={aiGenerating || !selectedMarketContext || !hasMarketContexts}>
                    {aiGenerating ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Sparkles className="mr-2" size={16} />}
                    Skriv med AI fra kontekst
                  </Button>
                  <Button onClick={generateDraft}>
                    <Sparkles className="mr-2" size={16} />
                    {draftActionLabel(draftForm.format, Boolean(generatedDraft))}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => generatedDraft && copyText("draft", generatedDraft.customer_message || "")}
                    disabled={!generatedDraft}
                  >
                    <Clipboard className="mr-2" size={16} />
                    {copied === "draft" ? "Kopiert" : "Kopier utkast"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => generatedDraft && savePlaybook(generatedDraft)}
                    disabled={saving || tableNotReady || !generatedDraft}
                  >
                    {saving ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Save className="mr-2" size={16} />}
                    Lagre
                  </Button>
                  <Button
                    variant="outline"
                    onClick={sendDraftToContentHub}
                    disabled={!generatedDraft || contentHubPushing}
                  >
                    {contentHubPushing ? <Loader2 className="mr-2 animate-spin" size={16} /> : <UploadCloud className="mr-2" size={16} />}
                    Send til Content HUB
                  </Button>
                </div>
                {contentHubStatus && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                    {contentHubStatus}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg border-cyan-500/20 bg-cyan-500/5">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Utkast</CardTitle>
                    <CardDescription>
                      {generatedDraft ? generatedDraft.title : "Ingen tekst generert ennå."}
                    </CardDescription>
                  </div>
                  {generatedDraft ? (
                    <Badge variant={confidenceVariant(generatedDraft.confidence)}>{generatedDraft.confidence}</Badge>
                  ) : (
                    <Badge variant="secondary">venter</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!generatedDraft ? (
                  <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/50 p-6">
                    <div className="flex items-start gap-3">
                      <FileText className="mt-0.5 shrink-0 text-cyan-300" size={20} />
                      <div>
                        <p className="text-sm font-semibold text-white">Klar til å generere kundetekst</p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          Fyll inn eller juster feltene til venstre, og trykk på knappen. Da bygges en ny tekst her,
                          med kundeklar rapport, artikkel eller intern instruks basert på formatet du har valgt.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {draftDirty && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                        Feltene er endret siden sist generering. Trykk på oppdater-knappen for å bygge teksten på nytt.
                      </div>
                    )}

                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                        <span>Kvalitetsscore</span>
                        <span>{qualityScore(generatedDraft)}%</span>
                      </div>
                      <Progress value={qualityScore(generatedDraft)} />
                      {lastGeneratedAt && <p className="mt-2 text-xs text-slate-500">Generert kl. {lastGeneratedAt}</p>}
                    </div>

                    <div className="rounded-lg border border-slate-700/50 bg-slate-950/70 p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Kundeklar tekst</p>
                      <p className="max-h-[520px] overflow-auto whitespace-pre-wrap text-sm leading-7 text-slate-200">
                        {generatedDraft.customer_message}
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-slate-700/50 bg-slate-950/40 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Intern sjekkliste</p>
                        <ul className="space-y-2">
                          {(generatedDraft.checklist || []).slice(0, 6).map((item) => (
                            <li key={item} className="flex gap-2 text-sm text-slate-300">
                              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={15} />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-lg border border-slate-700/50 bg-slate-950/40 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Kilder</p>
                        <div className="space-y-2">
                          {(generatedDraft.sources || []).map((source) => (
                            <a
                              key={`${source.label}-${source.url}`}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg border border-slate-700/50 p-2 text-sm text-slate-300 hover:border-cyan-400"
                            >
                              <span className="flex items-center gap-2">
                                {source.label}
                                {source.url !== "#" && <ExternalLink size={13} />}
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="library" className="mt-5">
          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Innholdsbibliotek</CardTitle>
                  <CardDescription>Rapporter, artikler, instruksjoner og rådgivertekster.</CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={16} />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Søk i biblioteket"
                      className="pl-9 sm:w-72"
                    />
                  </div>
                  <div className="relative">
                    <Filter className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={16} />
                    <select
                      value={formatFilter}
                      onChange={(event) => setFormatFilter(event.target.value)}
                      className="h-10 rounded-lg border border-slate-600 bg-slate-800 pl-9 pr-8 text-sm text-slate-100 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                    >
                      <option value="all">Alle formater</option>
                      <option value="report">Rapporter</option>
                      <option value="article">Artikler</option>
                      <option value="instruction">Instrukser</option>
                      <option value="playbook">Playbooks</option>
                    </select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="animate-spin text-slate-400" size={32} />
                </div>
              ) : filteredPlaybooks.length === 0 ? (
                <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-8 text-center">
                  <Layers3 className="mx-auto text-slate-500" size={32} />
                  <p className="mt-3 text-sm font-medium text-slate-200">Ingen innhold matcher filteret.</p>
                  <Button className="mt-4" variant="outline" onClick={() => setActiveTab("studio")}>
                    Lag nytt innhold
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPlaybooks.map((playbook) => {
                    const score = qualityScore(playbook);
                    return (
                      <article key={playbook.id} className="rounded-lg border border-slate-700/60 bg-slate-900/70 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{formatBadgeLabel(playbook)}</Badge>
                              <Badge variant={statusVariant(playbook.status)}>{playbook.status || "draft"}</Badge>
                              <Badge variant={confidenceVariant(playbook.confidence)}>{playbook.confidence || "needs_review"}</Badge>
                              <Badge variant="secondary">{playbook.region || "global"}</Badge>
                            </div>
                            <h2 className="mt-3 text-lg font-semibold text-white">{playbook.title}</h2>
                            {playbook.summary && <p className="mt-2 text-sm leading-6 text-slate-400">{playbook.summary}</p>}
                          </div>

                          <div className="flex shrink-0 flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={() => copyText(playbook.id, playbook.customer_message || "")}>
                              <Clipboard className="mr-2" size={14} />
                              {copied === playbook.id ? "Kopiert" : "Kopier"}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => pushTask(playbook)}>
                              <Send className="mr-2" size={14} />
                              HUB
                            </Button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                          {playbook.customer_message && (
                            <div className="rounded-lg border border-slate-700/50 bg-slate-950/50 p-4">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tekst</p>
                              <p className="max-h-72 overflow-auto whitespace-pre-wrap text-sm leading-7 text-slate-200">
                                {playbook.customer_message}
                              </p>
                            </div>
                          )}

                          <div className="space-y-4">
                            <div>
                              <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                                <span>Kvalitet</span>
                                <span>{score}%</span>
                              </div>
                              <Progress value={score} />
                            </div>

                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sjekkliste</p>
                              <ul className="space-y-2">
                                {(playbook.checklist || []).slice(0, 6).map((item) => (
                                  <li key={item} className="flex gap-2 text-sm text-slate-300">
                                    <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={15} />
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {(playbook.sources || []).length > 0 && (
                              <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Kilder</p>
                                <div className="space-y-2">
                                  {(playbook.sources || []).map((source) => (
                                    <a
                                      key={`${source.label}-${source.url}`}
                                      href={source.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block rounded-lg border border-slate-700/50 bg-slate-950/50 p-3 text-sm hover:border-cyan-500/40"
                                    >
                                      <span className="flex items-center gap-2 font-medium text-slate-200">
                                        {source.label}
                                        <ExternalLink size={13} />
                                      </span>
                                      {source.note && <span className="mt-1 block text-xs leading-5 text-slate-500">{source.note}</span>}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {playbook.internal_notes && (
                          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-300">Internt notat</p>
                            <p className="text-sm leading-6 text-amber-100/90">{playbook.internal_notes}</p>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="framework" className="mt-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(340px,0.7fr)]">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Freddy sin ekspertstandard</CardTitle>
                <CardDescription>Rammeverk for innhold som skal bygge autoritet og hjelpe leseren å ta bedre valg.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  {formatOptions.map((option) => (
                    <div key={option.id} className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-4">
                      <p className="font-semibold text-white">{option.label}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{option.description}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 shrink-0 text-cyan-300" size={20} />
                    <div>
                      <p className="text-sm font-medium text-white">Juridisk trygghetslinje</p>
                      <p className="mt-1 text-sm leading-6 text-slate-300">
                        Innholdet er salgs- og rådgiverstøtte, ikke juridisk rådgivning. Konkrete spørsmål om utleie,
                        kontrakt, skatt, lisens, sameie eller kommune skal bekreftes av advokat, gestor eller relevant myndighet.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Kvalitetsprinsipper</p>
                  <div className="grid gap-2">
                    {qualityPrinciples.map((item) => (
                      <div key={item} className="flex gap-2 rounded-lg border border-slate-700/50 bg-slate-950/40 p-3 text-sm text-slate-300">
                        <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={16} />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-violet-500/20 bg-violet-500/5">
              <CardHeader>
                <CardTitle>Publiseringsrytme</CardTitle>
                <CardDescription>Enkel portefølje som dekker tillit, salg og oppfølging.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  ["Mandag", "Kort markedsnotat: hva kjøpere bør følge med på denne uken."],
                  ["Onsdag", "Ekspertartikkel: én misforståelse, ett tydelig råd, ett eksempel."],
                  ["Fredag", "Instruks/sjekkliste: praktisk prosess for kjøp, salg, visning eller utleie."],
                  ["Månedlig", "Dyp rapport med kilder, risiko og anbefalt handling."],
                ].map(([day, text]) => (
                  <div key={day} className="rounded-lg border border-slate-700/50 bg-slate-950/50 p-4">
                    <p className="text-sm font-semibold text-white">{day}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{text}</p>
                  </div>
                ))}

                <Button className="w-full" onClick={() => setActiveTab("studio")}>
                  <ArrowUpRight className="mr-2" size={16} />
                  Start nytt innhold
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
