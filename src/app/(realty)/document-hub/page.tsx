"use client";

import { useState } from "react";
import { Bot, CheckCircle2, FileText, Send, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

function getTemplate(title: string) {
  return templates.find((template) => template.title === title) || templates[0];
}

export default function DocumentHubPage() {
  const [topic, setTopic] = useState(templates[0].title);
  const [audience, setAudience] = useState(templates[0].audience);
  const [draft, setDraft] = useState("");
  const [approved, setApproved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<"idle" | "published" | "error">("idle");

  function createDraft() {
    const template = getTemplate(topic);
    const sections = template.sections
      .map((section, index) => `${index + 1}. ${section}\n   - Fakta/status:\n   - Utkast:\n   - Må kvalitetssikres:`)
      .join("\n\n");

    setDraft(`Dokument: ${topic}

Målgruppe: ${audience}

Kvalitetssikret struktur:
${sections}

Publisering og oppfølging:
- Lagre som dokumentutkast i Content Hub hvis det skal brukes i kampanje/nyhetsbrev.
- Lagre under Dokumenter på Min side hvis det gjelder eiendomskunder.
- Opprett CRM-oppgave hvis dokumentet sendes til et varmt lead.

Kvalitetssikring:
AI-agenten skal verifisere fakta mot oppdaterte kilder, markere usikkerhet og skille mellom generell informasjon og rådgivning fra advokat, økonom eller jurist. Kontrakter, GDPR og databehandleravtaler skal alltid kontrolleres juridisk før signering.`);
    setApproved(false);
    setPublishStatus("idle");
  }

  async function publishToPortal() {
    if (!draft || !approved) return;
    setPublishing(true);
    setPublishStatus("idle");
    try {
      const res = await fetch("/api/documents/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: topic,
          audience,
          content: draft,
        }),
      });
      if (!res.ok) throw new Error("Publish failed");
      setPublishStatus("published");
    } catch {
      setPublishStatus("error");
    }
    setPublishing(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dokumenthub</h1>
        <p className="text-sm text-slate-400 mt-1">
          Guider, kjøpsprosess, sjekklister og kvalitetssikrede dokumenter for kunder.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles size={18} /> Nytt dokumentutkast</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1 block">Mal</label>
              <select
                className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                value={topic}
                onChange={(event) => {
                  setTopic(event.target.value);
                  setAudience(getTemplate(event.target.value).audience);
                }}
              >
                {templates.map((template) => <option key={template.title}>{template.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1 block">Målgruppe/kontekst</label>
              <Input value={audience} onChange={(event) => setAudience(event.target.value)} />
            </div>
            <Button onClick={createDraft} className="w-full">
              <Bot size={16} className="mr-2" /> Lag kvalitetssikret struktur
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck size={18} /> Kvalitetssikring</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            {[
              "Fakta skal merkes som verifisert eller uavklart.",
              "Ingen juridiske garantier uten advokatkontroll.",
              "Dokumenter bør kobles til kunde, område, bolig/tomt og oppfølgingssteg.",
              "AI-agenten skal foreslå spørsmål før dokumentet sendes til kunde.",
            ].map((item) => (
              <p className="flex gap-2" key={item}><CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />{item}</p>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText size={18} /> Utkast og publisering</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            className="min-h-[360px] w-full resize-y whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950/50 p-4 text-sm text-slate-200 outline-none focus:border-primary-500"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setApproved(false);
              setPublishStatus("idle");
            }}
            placeholder="Velg mal og lag et strukturert utkast."
          />
          <div className="flex flex-col gap-3 rounded-lg border border-slate-700/60 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-start gap-3 text-sm text-slate-300">
              <input
                checked={approved}
                className="mt-1"
                disabled={!draft}
                onChange={(event) => setApproved(event.target.checked)}
                type="checkbox"
              />
              <span>
                Jeg har kvalitetssikret dokumentet og vil publisere det under Dokumenter på Min side for alle kunder.
              </span>
            </label>
            <Button disabled={!draft || !approved || publishing} onClick={publishToPortal}>
              {publishing ? <Bot size={16} className="mr-2 animate-spin" /> : <Send size={16} className="mr-2" />}
              Publiser
            </Button>
          </div>
          {publishStatus === "published" && (
            <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              Dokumentet er publisert på Min side.
            </p>
          )}
          {publishStatus === "error" && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              Kunne ikke publisere dokumentet akkurat nå.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
