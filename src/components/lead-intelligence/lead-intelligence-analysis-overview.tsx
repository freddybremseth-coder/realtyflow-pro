"use client";

import { Badge } from "@/components/ui/badge";
import {
  LEAD_INTELLIGENCE_LIMITS,
  type ExtractedLead,
  type PhoneLookupNormalization,
} from "@/services/lead-intelligence/contracts";
import {
  JsonSection,
  TextInput,
  badgeForPhone,
  listToText,
  textToList,
} from "@/components/lead-intelligence/lead-intelligence-client-helpers";

interface LeadIntelligenceAnalysisOverviewResponse {
  correlationId: string;
  meta: {
    promptVersion: string;
    durationMs: number;
    phoneNormalization: PhoneLookupNormalization;
  };
}

interface LeadIntelligenceAnalysisOverviewProps {
  response: LeadIntelligenceAnalysisOverviewResponse;
  edited: ExtractedLead;
  sourceLabel: string;
  brandLabel: string;
  language: string;
  rawText: string;
  onUpdateEdited: (updater: (current: ExtractedLead) => ExtractedLead) => void;
}

export function LeadIntelligenceAnalysisOverview({
  response,
  edited,
  sourceLabel,
  brandLabel,
  language,
  rawText,
  onUpdateEdited,
}: LeadIntelligenceAnalysisOverviewProps) {
  const phoneBadge = badgeForPhone(response.meta.phoneNormalization.status);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Correlation ID</p>
          <p className="mt-1 break-all text-xs text-slate-300">{response.correlationId}</p>
        </div>
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Prompt</p>
          <p className="mt-1 text-xs text-slate-300">{response.meta.promptVersion}</p>
        </div>
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Varighet</p>
          <p className="mt-1 text-xs text-slate-300">{response.meta.durationMs} ms</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-700/60 bg-slate-950 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Original henvendelse</h2>
          <dl className="mb-3 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
            <div>
              <dt className="text-slate-500">Kilde</dt>
              <dd>{sourceLabel}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Brand</dt>
              <dd>{brandLabel}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Språk</dt>
              <dd>{language || "Ikke satt"}</dd>
            </div>
          </dl>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm text-slate-200">
            {rawText}
          </pre>
        </div>

        <div className="space-y-4 rounded-lg border border-slate-700/60 bg-slate-950 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-200">Kontaktforslag</h2>
            <Badge variant={phoneBadge.variant}>{phoneBadge.label}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput
              label="Navn"
              value={edited.contact.name || ""}
              onChange={(value) =>
                onUpdateEdited((current) => ({
                  ...current,
                  contact: { ...current.contact, name: value || null },
                }))
              }
            />
            <TextInput
              label="Telefon"
              value={edited.contact.phone || ""}
              onChange={(value) =>
                onUpdateEdited((current) => ({
                  ...current,
                  contact: { ...current.contact, phone: value || null },
                }))
              }
            />
            <TextInput
              label="E-post"
              value={edited.contact.email || ""}
              onChange={(value) =>
                onUpdateEdited((current) => ({
                  ...current,
                  contact: { ...current.contact, email: value || null },
                }))
              }
            />
            <TextInput
              label="Land"
              value={edited.contact.country || ""}
              onChange={(value) =>
                onUpdateEdited((current) => ({
                  ...current,
                  contact: { ...current.contact, country: value || null },
                }))
              }
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <TextInput
              label="Readiness"
              value={edited.purchaseReadiness.level}
              onChange={(value) =>
                onUpdateEdited((current) => ({
                  ...current,
                  purchaseReadiness: {
                    ...current.purchaseReadiness,
                    level: value as ExtractedLead["purchaseReadiness"]["level"],
                  },
                }))
              }
            />
            <TextInput
              label="Budsjett"
              value={String(edited.budget.amount || "")}
              onChange={(value) =>
                onUpdateEdited((current) => ({
                  ...current,
                  budget: { ...current.budget, amount: value ? Number(value) : null },
                }))
              }
            />
            <TextInput
              label="Valuta"
              value={edited.budget.currency || ""}
              onChange={(value) =>
                onUpdateEdited((current) => ({
                  ...current,
                  budget: { ...current.budget, currency: value || null },
                }))
              }
            />
          </div>
          <p className="text-xs text-slate-500">
            Telefonlookup: {response.meta.phoneNormalization.normalizedLookup || "ingen"}.
            E.164-verifisering: {response.meta.phoneNormalization.verifiedE164 ? "ja" : "nei"}.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700/60 bg-slate-950 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Område og boligtype</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <TextInput
            label="Foretrukne områder"
            value={listToText(edited.locations.preferred)}
            onChange={(value) =>
              onUpdateEdited((current) => ({
                ...current,
                locations: {
                  ...current.locations,
                  preferred: textToList(value),
                },
              }))
            }
          />
          <TextInput
            label="Ekskluderte områder"
            value={listToText(edited.locations.excluded)}
            onChange={(value) =>
              onUpdateEdited((current) => ({
                ...current,
                locations: {
                  ...current.locations,
                  excluded: textToList(value),
                },
              }))
            }
          />
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={edited.locations.flexible}
            onChange={(event) =>
              onUpdateEdited((current) => ({
                ...current,
                locations: {
                  ...current.locations,
                  flexible: event.target.checked,
                },
              }))
            }
          />
          Fleksibel på område
        </label>
        {!edited.locations.flexible && edited.locations.preferred.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Match-preview behandler valgt område som et krav. Eiendommer i andre områder skal avvises eller få
            tydelig avvik.
          </p>
        )}
        {edited.locations.flexible && edited.locations.preferred.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Fleksibelt betyr nærområde rundt valgt sted. Når systemet kjenner områdene, avvises boliger som ligger
            mer enn ca. 30 km unna.
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <JsonSection title="Boligtyper og områder" value={{ propertyTypes: edited.propertyTypes, locations: edited.locations }} />
        <JsonSection title="Kjøpsstatus og budsjett" value={{ purchaseReadiness: edited.purchaseReadiness, budget: edited.budget }} />
        <JsonSection title="Absolutte krav" value={edited.hardRequirements} />
        <JsonSection title="Sterke ønsker" value={edited.preferences} />
        <JsonSection title="Avvisningskriterier" value={edited.exclusions} />
        <JsonSection title="Manglende informasjon" value={edited.missingInformation} />
      </div>
    </>
  );
}
