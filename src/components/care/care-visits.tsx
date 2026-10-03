"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarCheck2,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Home,
  Loader2,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { careCategoryLabel, careItemLabel } from "@/lib/care/visit-workflow";

type JsonRecord = Record<string, any>;

type VisitsList = {
  properties: JsonRecord[];
  events: JsonRecord[];
  inspections: JsonRecord[];
};

type VisitDetail = {
  inspection: JsonRecord;
  property: JsonRecord;
  event: JsonRecord | null;
  items: JsonRecord[];
  photos: JsonRecord[];
  issues: JsonRecord[];
  reports: JsonRecord[];
  workOrders: JsonRecord[];
  progress: {
    total: number;
    checked: number;
    deviations: number;
    requiredPhotos: number;
    photoCount: number;
    minPhotos: number;
  };
};

function dateTimeLabel(value: string | null | undefined) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function defaultScheduleValue() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function textFromJson(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const row = value as JsonRecord;
    return String(row.text || row.nb || row.no || row.en || "");
  }
  return String(value);
}

function statusBadge(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (["ok", "done", "completed", "sent", "approved"].includes(normalized)) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (["deviation", "urgent", "high"].includes(normalized)) return "border-red-500/30 bg-red-500/10 text-red-200";
  if (["draft", "planned", "open", "in_progress", "not_checked"].includes(normalized)) return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-slate-700 bg-slate-800 text-slate-300";
}

function ChecklistItem({
  item,
  inspectionId,
  onSaved,
}: {
  item: JsonRecord;
  inspectionId: string;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState(item.value_numeric == null ? "" : String(item.value_numeric));
  const [note, setNote] = useState(textFromJson(item.note));
  const [severity, setSeverity] = useState("medium");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function setStatus(status: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/care/visits/${inspectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "item",
          itemCode: item.item_code,
          status,
          valueNumeric: value === "" ? null : Number(value),
          note,
          severity,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke lagre sjekkpunktet.");
      await onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre sjekkpunktet.");
    } finally {
      setSaving(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("itemCode", String(item.item_code));
      form.append("caption", note || careItemLabel(String(item.item_code)));
      const response = await fetch(`/api/care/visits/${inspectionId}/photos`, { method: "POST", body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke laste opp bildet.");
      await onSaved();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Kunne ikke laste opp bildet.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-semibold text-white">{careItemLabel(String(item.item_code))}</h4>
          <p className="mt-1 text-xs text-slate-500">{item.item_code}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ${statusBadge(item.status)}`}>{String(item.status || "not_checked").replaceAll("_", " ")}</span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {item.requires_value && (
          <label className="space-y-1 text-xs text-slate-400">
            <span>Måleverdi {item.value_unit ? `(${item.value_unit})` : ""}</span>
            <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
        )}
        <label className={`space-y-1 text-xs text-slate-400 ${item.requires_value ? "" : "sm:col-span-2"}`}>
          <span>Notat</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Valgfritt notat" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={saving} onClick={() => setStatus("ok")} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/15">OK</button>
        <button type="button" disabled={saving} onClick={() => setStatus("not_applicable")} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">Ikke relevant</button>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-lg border border-red-500/20 bg-slate-900 px-2 py-2 text-xs text-slate-300">
          <option value="low">Avvik lav</option>
          <option value="medium">Avvik medium</option>
          <option value="high">Avvik høy</option>
          <option value="urgent">Avvik akutt</option>
        </select>
        <button type="button" disabled={saving} onClick={() => setStatus("deviation")} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/15">Registrer avvik</button>
        <label className="cursor-pointer rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/15">
          {uploading ? "Laster opp …" : item.requires_photo ? "Ta obligatorisk bilde" : "Legg til bilde"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={upload} className="hidden" />
        </label>
        {saving && <Loader2 size={16} className="my-auto animate-spin text-slate-400" />}
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </article>
  );
}

export function CareVisits() {
  const [data, setData] = useState<VisitsList | null>(null);
  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [activeInspectionId, setActiveInspectionId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [startsAt, setStartsAt] = useState(defaultScheduleValue());
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function loadList() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/care/visits", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Care-besøk.");
      setData(body);
      const open = (body.inspections || []).find((row: JsonRecord) => row.status === "draft");
      if (open && !activeInspectionId) setActiveInspectionId(open.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente Care-besøk.");
    } finally {
      setLoading(false);
    }
  }

  async function loadVisit(id = activeInspectionId) {
    if (!id) {
      setVisit(null);
      return;
    }
    const response = await fetch(`/api/care/visits/${id}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "Kunne ikke hente inspeksjonen.");
    setVisit(body.visit);
  }

  useEffect(() => { void loadList(); }, []);
  useEffect(() => {
    if (!activeInspectionId) {
      setVisit(null);
      return;
    }
    void loadVisit(activeInspectionId).catch((e) => setError(e instanceof Error ? e.message : "Kunne ikke hente inspeksjonen."));
  }, [activeInspectionId]);

  const planned = useMemo(() => (data?.events || []).filter((event) => event.status === "planned"), [data]);
  const recent = useMemo(() => (data?.inspections || []).filter((row) => row.status !== "draft").slice(0, 8), [data]);
  const grouped = useMemo(() => {
    const map = new Map<string, JsonRecord[]>();
    for (const item of visit?.items || []) {
      const key = String(item.category || "other");
      map.set(key, [...(map.get(key) || []), item]);
    }
    return [...map.entries()];
  }, [visit]);

  async function schedule(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/care/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule", propertyId, startsAt: new Date(startsAt).toISOString() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke planlegge besøket.");
      await loadList();
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "Kunne ikke planlegge besøket.");
    } finally {
      setWorking(false);
    }
  }

  async function start(eventId: string) {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/care/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", eventId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke starte besøket.");
      setActiveInspectionId(body.inspectionId);
      await loadList();
      await loadVisit(body.inspectionId);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Kunne ikke starte besøket.");
    } finally {
      setWorking(false);
    }
  }

  async function refreshVisit() {
    if (activeInspectionId) await loadVisit(activeInspectionId);
    await loadList();
  }

  async function createWorkOrder(issueId: string) {
    if (!activeInspectionId) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/care/visits/${activeInspectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "work_order", issueId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke opprette arbeidsordre.");
      await refreshVisit();
    } catch (workError) {
      setError(workError instanceof Error ? workError.message : "Kunne ikke opprette arbeidsordre.");
    } finally {
      setWorking(false);
    }
  }

  async function completeVisit() {
    if (!activeInspectionId) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/care/visits/${activeInspectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke fullføre besøket.");
      await refreshVisit();
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "Kunne ikke fullføre besøket.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-xl border border-slate-800 bg-slate-950/60 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-cyan-300"><ClipboardCheck size={18} /> Care Visits</div>
            <h1 className="mt-2 text-3xl font-bold text-white">Besøk & tilsyn</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">Planlegg, gjennomfør og dokumenter Care-besøk fra samme arbeidsflate. Ferdig tilsyn lager rapportutkast og planlegger neste besøk automatisk.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href="/care">Care-oversikt</Link></Button>
            <Button variant="outline" onClick={() => void loadList()} disabled={loading}><RefreshCw size={16} className="mr-2" />Oppdater</Button>
          </div>
        </div>
      </header>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} className="shrink-0" />{error}</div>}

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={schedule} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center gap-2 text-amber-300"><CalendarCheck2 size={18} /><strong>Planlegg besøk</strong></div>
          <div className="mt-4 grid gap-3">
            <label className="space-y-1 text-sm text-slate-300">
              <span>Care-eiendom</span>
              <select required value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                <option value="">Velg eiendom</option>
                {(data?.properties || []).filter((property) => property.contract_id).map((property) => (
                  <option key={property.id} value={property.id}>{property.name || property.reference} · {property.municipality}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-slate-300">
              <span>Dato og tid</span>
              <input required type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
            </label>
            <Button type="submit" disabled={working || !propertyId}>{working ? <Loader2 size={16} className="mr-2 animate-spin" /> : <CalendarCheck2 size={16} className="mr-2" />}Planlegg</Button>
          </div>
        </form>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-semibold text-white">Kommende besøk</h2><p className="mt-1 text-xs text-slate-500">{planned.length} planlagt</p></div>
          </div>
          <div className="mt-4 space-y-3">
            {planned.length === 0 ? <p className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">Ingen planlagte besøk.</p> : planned.slice(0, 8).map((event) => (
              <article key={event.id} className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <strong className="text-sm text-white">{event.property?.name || event.property?.reference || "Care-eiendom"}</strong>
                  <p className="mt-1 text-xs text-slate-400">{event.property?.municipality || ""} · {dateTimeLabel(event.starts_at)}</p>
                </div>
                {event.inspection_id ? (
                  <Button size="sm" onClick={() => setActiveInspectionId(event.inspection_id)}>Fortsett tilsyn <ChevronRight size={15} className="ml-1" /></Button>
                ) : (
                  <Button size="sm" disabled={working} onClick={() => void start(event.id)}>Start besøk</Button>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {activeInspectionId && visit && (
        <section className="rounded-2xl border border-cyan-500/20 bg-slate-900/70 p-5 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Aktivt tilsyn</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">{visit.property?.name || visit.property?.reference || "Care-eiendom"}</h2>
              <p className="mt-1 text-sm text-slate-400">{visit.property?.address_line} · {visit.property?.municipality}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-800 bg-slate-950/55 p-3"><p className="text-[11px] text-slate-500">Sjekket</p><strong className="text-white">{visit.progress.checked}/{visit.progress.total}</strong></div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/55 p-3"><p className="text-[11px] text-slate-500">Avvik</p><strong className="text-white">{visit.progress.deviations}</strong></div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/55 p-3"><p className="text-[11px] text-slate-500">Bilder</p><strong className="text-white">{visit.progress.photoCount}/{visit.progress.minPhotos}</strong></div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/55 p-3"><p className="text-[11px] text-slate-500">Status</p><strong className="text-white">{visit.inspection.status}</strong></div>
            </div>
          </div>

          <div className="mt-5 space-y-6">
            {grouped.map(([category, items]) => (
              <div key={category}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-200">{careCategoryLabel(category)}</h3>
                <div className="grid gap-3 xl:grid-cols-2">
                  {items.map((item) => <ChecklistItem key={item.id} item={item} inspectionId={activeInspectionId} onSaved={refreshVisit} />)}
                </div>
              </div>
            ))}
          </div>

          {visit.photos.length > 0 && (
            <div className="mt-6 border-t border-slate-800 pt-5">
              <h3 className="flex items-center gap-2 font-semibold text-white"><Camera size={17} className="text-cyan-300" />Bilder</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {visit.photos.map((photo) => (
                  <a key={photo.id} href={photo.signed_url || "#"} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                    {photo.signed_url ? <img src={photo.signed_url} alt={textFromJson(photo.caption) || "Care-bilde"} className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center text-slate-600"><Camera /></div>}
                    <p className="truncate p-2 text-[10px] text-slate-400">{photo.item_code || "Generelt"}</p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {visit.issues.length > 0 && (
            <div className="mt-6 border-t border-slate-800 pt-5">
              <h3 className="flex items-center gap-2 font-semibold text-white"><Wrench size={17} className="text-amber-300" />Avvik & arbeidsordre</h3>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {visit.issues.map((issue) => {
                  const workOrder = visit.workOrders.find((row) => row.issue_id === issue.id);
                  return (
                    <article key={issue.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm text-white">{textFromJson(issue.title) || careItemLabel(issue.item_code)}</strong>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadge(issue.severity)}`}>{issue.severity}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{textFromJson(issue.description)}</p>
                      <div className="mt-3">
                        {workOrder ? <span className="text-xs font-semibold text-cyan-300">Arbeidsordre {workOrder.reference} · {workOrder.status}</span> : <Button size="sm" variant="outline" disabled={working} onClick={() => void createWorkOrder(issue.id)}>Opprett arbeidsordre</Button>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-400">
              {visit.inspection.status === "draft"
                ? `${visit.progress.total - visit.progress.checked} sjekkpunkter gjenstår · minst ${visit.progress.minPhotos} bilder kreves`
                : "Tilsynet er fullført."}
            </div>
            <div className="flex flex-wrap gap-2">
              {visit.reports[0]?.signed_url && <Button asChild variant="outline"><a href={visit.reports[0].signed_url} target="_blank" rel="noreferrer"><FileText size={16} className="mr-2" />Åpne rapport</a></Button>}
              {visit.inspection.status === "draft" && <Button disabled={working} onClick={() => void completeVisit()}>{working ? <Loader2 size={16} className="mr-2 animate-spin" /> : <CheckCircle2 size={16} className="mr-2" />}Fullfør tilsyn</Button>}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="font-semibold text-white">Siste gjennomførte tilsyn</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {recent.length === 0 ? <p className="text-sm text-slate-400">Ingen gjennomførte tilsyn ennå.</p> : recent.map((inspection) => {
            const property = data?.properties.find((row) => row.id === inspection.property_id);
            return (
              <button key={inspection.id} type="button" onClick={() => setActiveInspectionId(inspection.id)} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/45 p-4 text-left hover:border-slate-700">
                <div><strong className="text-sm text-white">{property?.name || property?.reference || "Care-eiendom"}</strong><p className="mt-1 text-xs text-slate-500">{dateTimeLabel(inspection.completed_at || inspection.started_at)} · {inspection.photo_count} bilder</p></div>
                <ChevronRight size={16} className="text-slate-600" />
              </button>
            );
          })}
        </div>
      </section>

      {loading && !data && <div className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-slate-400"><Loader2 size={18} className="mr-2 animate-spin" />Henter Care-besøk</div>}
      {!loading && data?.properties.length === 0 && <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center"><Home size={28} className="mx-auto text-amber-300" /><h2 className="mt-3 font-semibold text-white">Ingen aktive Care-eiendommer ennå</h2><p className="mt-2 text-sm text-slate-400">Når første Care-avtale aktiveres, vil første besøk automatisk komme inn her.</p></div>}
    </div>
  );
}
