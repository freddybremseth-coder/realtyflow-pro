"use client";

import { useCallback, useState } from "react";

type MediaItem = {
  id: string;
  position: number;
  source_url: string;
  thumbnail_url?: string | null;
  processing_status: string;
};
type Payload = { items?: MediaItem[]; visual_format?: string; error?: string };

type LibraryImage = { id: string; ai_image_url: string | null; thumbnail_url?: string | null; title?: string };
export function CarouselMediaEditor({ draftId, onChanged, libraryImages, loadLibrary }: {
  draftId: string;
  onChanged?: () => void;
  libraryImages?: LibraryImage[];
  loadLibrary?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [url, setUrl] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const endpoint = `/api/content-hub/drafts/${encodeURIComponent(draftId)}/media`;

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const payload = (await response.json()) as Payload;
    if (!response.ok) throw new Error(payload.error || "Kunne ikke hente bildene");
    setItems(payload.items || []);
  }, [endpoint]);

  async function show() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setFeedback("");
    try { await load(); } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Kunne ikke hente bildene");
    }
  }

  async function add(candidate?: { url: string; thumbnail?: string | null }) {
    const imageUrl = candidate?.url || url.trim();
    if (!imageUrl || busy) return;
    setBusy(true); setFeedback("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: imageUrl, thumbnail_url: candidate?.thumbnail || null, source_kind: "library" }),
      });
      const payload = (await response.json()) as Payload;
      if (!response.ok) throw new Error(payload.error || "Kunne ikke legge til bilde");
      setUrl(""); await load(); onChanged?.();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Noe gikk galt"); }
    finally { setBusy(false); }
  }

  async function move(index: number, next: number) {
    if (busy || next < 0 || next >= items.length || items.some(i => i.id === "legacy")) return;
    setBusy(true); setFeedback("");
    const reordered = [...items];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    try {
      const response = await fetch(endpoint, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: reordered.map(item => item.id) }),
      });
      const payload = (await response.json()) as Payload;
      if (!response.ok) throw new Error(payload.error || "Kunne ikke flytte bildet");
      setItems(payload.items || reordered); onChanged?.();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Noe gikk galt"); }
    finally { setBusy(false); }
  }

  async function remove(item: MediaItem) {
    if (busy || item.id === "legacy" || !window.confirm("Fjern bildet fra dette utkastet?")) return;
    setBusy(true); setFeedback("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const payload = (await response.json()) as Payload;
      if (!response.ok) throw new Error(payload.error || "Kunne ikke fjerne bildet");
      await load(); onChanged?.();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Noe gikk galt"); }
    finally { setBusy(false); }
  }

  return <div className="mt-2">
    <button type="button" className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-800" onClick={show}>
      {open ? "Lukk bilderedigering" : "Rediger bilder / lag karusell (2–10 bilder)"}
    </button>
    {open && <div className="mt-2 rounded-lg border border-zinc-700 p-3" aria-label="Rediger bildeserie">
      <p className="mb-2 text-xs text-zinc-300">
        Legg til minst ett bilde til for å lage en Instagram-karusell. Første bilde er forsiden; bruk pilene for å endre rekkefølge. Maksimalt ti bilder.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item, index) => <div key={item.id} className="rounded-md border border-zinc-700 p-1">
          <img className="aspect-[4/5] w-full rounded object-cover" src={item.thumbnail_url || item.source_url}
            alt={`Bilde ${index+1} i karusellen`} />
          <p className="my-1 text-xs">{index + 1}. {index === 0 ? "Forside" : "Slide"}</p>
          <div className="flex flex-wrap gap-1">
            <button type="button" aria-label={`Flytt bilde ${index+1} bakover`} disabled={busy || index === 0 || item.id === "legacy"}
              onClick={() => move(index,index-1)} className="rounded bg-zinc-800 px-2 py-1 text-xs disabled:opacity-40">←</button>
            <button type="button" aria-label={`Flytt bilde ${index+1} fremover`} disabled={busy || index === items.length - 1 || item.id === "legacy"}
              onClick={() => move(index,index+1)} className="rounded bg-zinc-800 px-2 py-1 text-xs disabled:opacity-40">→</button>
            <button type="button" disabled={busy || item.id === "legacy"}
              onClick={() => remove(item)} className="rounded bg-zinc-800 px-2 py-1 text-xs disabled:opacity-40">Fjern</button>
          </div>
        </div>)}
      </div>
      {items.length === 1 && <p className="mt-3 text-xs text-cyan-200">Dette utkastet har foreløpig bare ett bilde. Velg «Velg fra mediebibliotek» nedenfor for å legge til flere. «Bytt bilde» på utkastkortet erstatter bare hovedbildet.</p>}
      <label htmlFor={`new-carousel-image-${draftId}`} className="mt-3 block text-xs text-zinc-300">Alternativt: lim inn offentlig HTTPS-lenke til et bilde</label>
      <div className="mt-1 flex gap-2">
        <input id={`new-carousel-image-${draftId}`} type="url" value={url}
          onChange={event => setUrl(event.target.value)} placeholder="https://..."
          className="min-w-0 flex-1 rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs" />
        <button type="button" disabled={busy || !url.trim() || items.length >= 10}
          onClick={() => void add()} className="rounded-md bg-zinc-700 px-3 py-1 text-xs disabled:opacity-40">Legg til</button>
      </div>
      {loadLibrary && <div className="mt-3">
        <button type="button" className="rounded-md border border-zinc-600 px-3 py-2 text-xs hover:bg-zinc-800"
          onClick={() => {
            setShowLibrary(current => !current);
            if (!showLibrary) void loadLibrary().catch(() => setFeedback("Kunne ikke hente mediebiblioteket."));
          }}>
          {showLibrary ? "Skjul mediebibliotek" : "Velg fra mediebibliotek"}
        </button>
        {showLibrary && <div className="mt-2 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {(libraryImages || []).filter(img => img.ai_image_url?.startsWith("https://")).map(img =>
            <button type="button" key={img.id} disabled={busy || items.length >= 10}
              className="rounded border border-zinc-700 p-1 text-left text-xs hover:border-fuchsia-500 disabled:opacity-40"
              onClick={() => void add({ url: img.ai_image_url!, thumbnail: img.thumbnail_url })}>
              <img src={img.thumbnail_url || img.ai_image_url || ""} alt={img.title || "Mediebilde"}
                className="aspect-[4/5] w-full rounded object-cover" loading="lazy" />
              <span className="line-clamp-2 mt-1">{img.title || "Legg til bilde"}</span>
            </button>)}
          {(!libraryImages || libraryImages.length === 0) && <p className="col-span-full text-xs text-zinc-400">Ingen bilder funnet for merkevaren.</p>}
        </div>}
      </div>}
      {feedback && <p role="alert" className="mt-2 text-xs text-amber-300">{feedback}</p>}
    </div>}
  </div>;
}
