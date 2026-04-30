"use client";

import { useState } from "react";
import { Bot, CheckCircle2, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const templates = [
  "Kjøpsprosess i Spania",
  "Sjekkliste før reservasjon",
  "Guide til tomtekjøp og bygging",
  "Områdeguide for kunde",
  "Finansiering, notar og NIE",
];

export default function DocumentHubPage() {
  const [topic, setTopic] = useState("Kjøpsprosess i Spania");
  const [audience, setAudience] = useState("Norsk boligkjøper som vurderer Spania");
  const [draft, setDraft] = useState("");

  function createDraft() {
    setDraft(`Dokument: ${topic}

Målgruppe: ${audience}

Kvalitetssikret struktur:
1. Formål og hvem dokumentet gjelder for
2. Kort norsk forklaring uten juridiske løfter
3. Praktiske steg kunden må forstå
4. Risiko, forbehold og hva som må kontrolleres lokalt
5. Spørsmål Freddy/Zen Eco Homes bør avklare før anbefaling
6. Neste steg i RealtyFlow: lagre på kunde, send prospekt/guide, logg oppfølging

AI-agenten bør alltid verifisere fakta mot oppdaterte kilder, markere usikkerhet og skille mellom generell informasjon og rådgivning fra advokat/økonom.`);
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
                onChange={(event) => setTopic(event.target.value)}
              >
                {templates.map((template) => <option key={template}>{template}</option>)}
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
          <CardTitle className="flex items-center gap-2"><FileText size={18} /> Utkast</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="min-h-[320px] whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950/50 p-4 text-sm text-slate-200">
            {draft || "Velg mal og lag et strukturert utkast."}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
