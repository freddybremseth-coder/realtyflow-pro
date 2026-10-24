"use client";

import { useEffect, useState } from "react";
import { ReferenceMediaPicker } from "@/components/media-studio/reference-media-picker";

export type EditablePublication = {
  id: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  tags?: string[];
  scheduledPlatforms: string[];
};

type Action = "save" | "publish" | "schedule";
const platformNames: Record<string, string> = { facebook: "Facebook", instagram: "Instagram" };

function humanError(body: any, fallback: string) {
  const code = body?.error?.code;
  const messages: Record<string, string> = {
    CHANNEL_NOT_ACTIVE_FOR_BRAND: "Den valgte kanalen er ikke aktiv for merkevaren.",
    IMAGE_NOT_APPROVED_FOR_BRAND: "Bildet er ikke godkjent for denne merkevaren. Velg fra bildebiblioteket.",
    INSTAGRAM_IMAGE_REQUIRED: "Instagram krever et godkjent bilde.",
    DRAFT_NOT_AUTHORIZED: "Dette utkastet kan ikke planlegges med denne brukeren.",
    CHANNEL_AMBIGUOUS: "Det finnes flere aktive kontoer for samme kanal. Kontakt administrator.",
    PUBLISH_ATTEMPT_REQUIRES_REVIEW: "Publiseringen må kontrolleres før det prøves igjen.",
    PUBLISHABILITY_FAILED: "Innholdet må rettes før publisering.",
  };
  return body?.error?.message || messages[code] || (typeof code === "string" ? code : fallback);
}

export function WorkspacePublicationEditor({
  brandKey, publication, canDraft, canPublish, onSaved,
}: {
  brandKey: string;
  publication: EditablePublication;
  canDraft: boolean;
  canPublish: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState(publication.title || "");
  const [description, setDescription] = useState(publication.description || "");
  const [tags, setTags] = useState((publication.tags || []).join(", "));
  const [imageUrl, setImageUrl] = useState(publication.thumbnailUrl || "");
  const [platforms, setPlatforms] = useState<string[]>(
    publication.scheduledPlatforms.filter(x => ["facebook", "instagram"].includes(x)),
  );
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);

  useEffect(() => {
    setTitle(publication.title || "");
    setDescription(publication.description || "");
    setTags((publication.tags || []).join(", "));
    setImageUrl(publication.thumbnailUrl || "");
    setPlatforms(publication.scheduledPlatforms.filter(x => ["facebook", "instagram"].includes(x)));
    setTime(""); setError(""); setSuccess(""); setShowSchedule(false);
  }, [publication.id]);

  async function act(action: Action) {
    if (busy || !canDraft) return;
    if (!description.trim()) { setError("Skriv inn teksten til innlegget."); return; }
    if (action !== "save" && !canPublish) { setError("Du mangler publiseringsrettighet."); return; }
    if (action !== "save" && platforms.length === 0) {
      setError("Velg Facebook eller Instagram før publisering eller planlegging."); return;
    }
    if (platforms.includes("instagram") && !imageUrl.trim()) {
      setError("Instagram krever et bilde. Velg fra bildebiblioteket eller last opp."); return;
    }
    let scheduledAt = "";
    if (action === "schedule") {
      const date = new Date(time);
      if (!time || Number.isNaN(date.getTime()) || date.getTime() <= Date.now() + 60000) {
        setError("Velg et tidspunkt minst ett minutt frem i tid."); return;
      }
      scheduledAt = date.toISOString();
    }
    if (action === "publish" && !window.confirm(
      "Publisere dette innlegget til " + platforms.map(p => platformNames[p]).join(" og ") +
      " nå? Innholdet sendes eksternt umiddelbart."
    )) return;
    if (action === "schedule" && !window.confirm(
      "Planlegge innlegget til " + new Date(scheduledAt).toLocaleString("nb-NO") + "?"
    )) return;

    setBusy(true); setError(""); setSuccess("");
    let createdId = "";
    try {
      // Earlier drafts can belong to owner/autopilot workflows. A new, audited
      // workspace draft permits editing without modifying those records.
      const draftResponse = await fetch("/api/workspaces/" + encodeURIComponent(brandKey) + "/marketing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), description: description.trim(),
          tags: Array.from(new Set(tags.split(",").map(tag => tag.trim().toLowerCase()).filter(Boolean))),
          imageUrl: imageUrl.trim(), platforms,
        }),
      });
      const draftBody = await draftResponse.json().catch(() => ({}));
      if (!draftResponse.ok || !draftBody?.publication?.id) {
        throw new Error(humanError(draftBody, "Utkastet kunne ikke lagres."));
      }
      createdId = draftBody.publication.id;
      if (action === "save") {
        setSuccess("Endringene er lagret som et nytt, redigerbart utkast i historikken.");
      } else {
        const endpoint = action === "publish" ? "social-publish" : "social-schedule";
        const response = await fetch("/api/workspaces/" + encodeURIComponent(brandKey) + "/" + endpoint, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicationId: createdId, platforms,
            ...(action === "schedule" ? { scheduledAt } : {}),
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(humanError(result,
          action === "publish" ? "Publiseringen feilet." : "Planleggingen feilet."));
        if (action === "publish" && result.partial) {
          setError("Delvis publisert: minst én kanal kan ha feilet. Kontroller resultatet før du prøver igjen.");
        } else {
          setSuccess(action === "publish"
            ? "Innlegget er sendt. Se publiseringsstatus i historikken."
            : "Innlegget er planlagt til " + new Date(scheduledAt).toLocaleString("nb-NO") + ".");
        }
      }
      await onSaved();
    } catch (cause) {
      setError((cause instanceof Error ? cause.message : "Ukjent feil.") +
        (createdId ? " En ny kopi er lagret som utkast – kontroller historikken før du prøver igjen." : ""));
      if (createdId) await onSaved();
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-4 space-y-4 rounded-xl border border-cyan-800 bg-slate-950/70 p-4">
    <div>
      <h4 className="font-semibold text-cyan-100">Rediger og publiser innlegg</h4>
      <p className="mt-1 text-xs text-slate-400">Alt gjøres her. Et redigert innlegg lagres som en ny, sporbar kopi; originalen beholdes.</p>
    </div>
    <label className="block text-sm text-slate-300">Tittel
      <input value={title} onChange={event => setTitle(event.target.value)} maxLength={200}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-white"/>
    </label>
    <label className="block text-sm text-slate-300">Innleggstekst
      <textarea value={description} onChange={event => setDescription(event.target.value)} rows={7} maxLength={5000}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-white"/>
    </label>
    <label className="block text-sm text-slate-300">Emneknagger (kommaseparert)
      <input value={tags} onChange={event => setTags(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-white"/>
    </label>
    <ReferenceMediaPicker workspaceBrandKey={brandKey} brandId={brandKey}
      usage="social_post" value={imageUrl} onChange={setImageUrl}
      title="Bilde" description="Velg fra bildebiblioteket eller last opp fra datamaskinen."/>
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Publiseringskanal</legend>
      <div className="flex flex-wrap gap-4">
        {(["facebook", "instagram"] as const).map(platform => <label key={platform} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={platforms.includes(platform)}
            onChange={event => setPlatforms(current => event.target.checked ?
              Array.from(new Set([...current, platform])) : current.filter(p => p !== platform))}/>
          {platformNames[platform]}
        </label>)}
      </div>
    </fieldset>
    {showSchedule && <label className="block text-sm text-slate-300">Dato og klokkeslett
      <input type="datetime-local" value={time} onChange={event => setTime(event.target.value)}
        className="mt-1 block rounded-lg border border-slate-700 bg-slate-900 p-2 text-white"/>
    </label>}
    {error && <p role="alert" className="rounded-lg border border-rose-800 p-3 text-sm text-rose-200">{error}</p>}
    {success && <p role="status" className="rounded-lg border border-emerald-700 p-3 text-sm text-emerald-200">{success}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!canDraft || busy} onClick={() => void act("save")}
        className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold disabled:opacity-50">
        Lagre endringer
      </button>
      <button type="button" disabled={!canPublish || busy} onClick={() => void act("publish")}
        className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Behandler…" : "Publiser nå"}
      </button>
      <button type="button" disabled={!canPublish || busy}
        onClick={() => showSchedule ? void act("schedule") : setShowSchedule(true)}
        className="rounded-lg border border-cyan-600 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-50">
        {showSchedule ? "Bekreft planlegging" : "Planlegg"}
      </button>
    </div>
    <p className="text-xs text-slate-400">Planlegging betyr at innlegget legges i publiseringskøen. Kontroller status i historikken etter valgt tidspunkt.</p>
  </div>;
}
