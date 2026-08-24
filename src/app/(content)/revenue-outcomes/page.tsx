"use client";

import { useEffect, useMemo, useState } from "react";

type Contact = {
  id: string;
  name?: string | null;
  email?: string | null;
  pipeline_status?: string | null;
  brand_id?: string | null;
  brand?: string | null;
  property_interest?: string | null;
};

type OutcomeType = "viewing_completed" | "offer_made";

const panel: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 18,
  background: "white",
};

export default function RevenueOutcomesPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState("");
  const [outcomeType, setOutcomeType] = useState<OutcomeType>("viewing_completed");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [offerAmount, setOfferAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/contacts?view=pipeline", { credentials: "same-origin" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        setContacts(Array.isArray(body?.contacts) ? body.contacts : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const selected = useMemo(() => contacts.find((c) => c.id === contactId) ?? null, [contacts, contactId]);
  const brandId = String(selected?.brand_id || selected?.brand || "").trim();

  const record = async () => {
    setError(null);
    setSuccess(null);
    if (!selected) return setError("Velg en kontakt.");
    if (!brandId) return setError("Kontakten mangler brand. Outcome kan ikke attribueres trygt.");

    const outcomeId = crypto.randomUUID();
    const when = new Date(occurredAt);
    if (Number.isNaN(when.getTime())) return setError("Ugyldig tidspunkt.");

    const amount = offerAmount.trim() ? Number(offerAmount) : null;
    if (outcomeType === "offer_made" && amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
      return setError("Tilbudsbeløpet må være et positivt tall.");
    }

    setBusy(true);
    try {
      const res = await fetch("/api/revenue/events", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: outcomeType,
          title: outcomeType === "viewing_completed" ? "Visning fullført" : "Bud/tilbud registrert",
          description: note.trim() || null,
          contactId: selected.id,
          brandId,
          sourceSystem: "revenue_outcomes_ui",
          sourceType: "manual_outcome",
          sourceId: outcomeId,
          actorType: "human",
          occurredAt: when.toISOString(),
          dedupeKey: `revenue-outcome:${brandId}:${outcomeId}`,
          metadata: {
            property_interest: selected.property_interest || null,
            offer_amount_eur: outcomeType === "offer_made" ? amount : null,
            note: note.trim() || null,
          },
          createdBy: "revenue-outcomes-ui",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setSuccess(outcomeType === "viewing_completed" ? "Visningen er registrert i Revenue OS." : "Bud/tilbud er registrert i Revenue OS.");
      setNote("");
      if (outcomeType === "offer_made") setOfferAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>Revenue Outcomes</h1>
          <p style={{ margin: "6px 0 0", color: "#6b7280" }}>Registrer bare hendelser som faktisk har skjedd. Disse mates videre til Marketing attribution når kontakt + brand har verifiserbar marketing-kontekst.</p>
        </div>
        <a href="/marketing-learning" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>← Marketing Learning</a>
      </div>

      {error && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: "#fef2f2", color: "#b91c1c" }}>{error}</div>}
      {success && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: "#f0fdf4", color: "#166534" }}>{success}</div>}

      <section style={{ ...panel, marginTop: 18, display: "grid", gap: 14 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Kontakt</span>
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}>
            <option value="">Velg kontakt…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.email || c.id} · {c.pipeline_status || "ukjent status"}</option>
            ))}
          </select>
        </label>

        {selected && (
          <div style={{ padding: 10, borderRadius: 8, background: "#f9fafb", fontSize: 13, color: "#374151" }}>
            Brand: <b>{brandId || "mangler"}</b>{selected.property_interest ? ` · Bolig/interesse: ${selected.property_interest}` : ""}
          </div>
        )}

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Hendelse</span>
          <select value={outcomeType} onChange={(e) => setOutcomeType(e.target.value as OutcomeType)} style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}>
            <option value="viewing_completed">Visning fullført</option>
            <option value="offer_made">Bud/tilbud gitt</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Tidspunkt</span>
          <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }} />
        </label>

        {outcomeType === "offer_made" && (
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Tilbudsbeløp (€) — valgfritt</span>
            <input inputMode="decimal" value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)} placeholder="f.eks. 450000" style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }} />
          </label>
        )}

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Notat — valgfritt</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Kort dokumentasjon av hendelsen" style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db", resize: "vertical" }} />
        </label>

        <button disabled={busy || !selected || !brandId} onClick={record} style={{ border: 0, borderRadius: 9, padding: "11px 14px", fontWeight: 800, background: "#111827", color: "white", cursor: busy ? "wait" : "pointer", opacity: busy || !selected || !brandId ? 0.6 : 1 }}>
          {busy ? "Registrerer…" : "Registrer bekreftet outcome"}
        </button>

        <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
          VIEWING/NEGOTIATION i pipeline brukes ikke som bevis alene. Denne siden oppretter canonical Revenue Events kun når du eksplisitt registrerer at visningen faktisk er fullført eller at et bud/tilbud faktisk er gitt.
        </div>
      </section>
    </div>
  );
}
