"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, UserCog, UserPlus, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

type Role = { id: string; label: string; permissions: string[]; assignable: boolean };
type Profile = { email: string; displayName: string | null; role: string; active: boolean; updatedAt: string | null; updatedBy: string | null };
type FormState = { email: string; displayName: string; role: string; active: boolean };
type Payload = {
  settings: { profiles: Profile[]; audit: any[]; updatedAt: string | null };
  owners: Array<{ email: string; role: string; active: boolean }>;
  roles: Role[];
  safety: Record<string, boolean>;
};

const emptyForm: FormState = { email: "", displayName: "", role: "SALES", active: true };
const roleHelp: Record<string, string> = {
  SALES: "Kunder, pipeline, oppfølging, meldingsutkast og execution.",
  CLOSING: "Closing, dokumentpakker, execution og nødvendig økonomiinnsyn.",
  FINANCE: "Provisjon, månedsrapport, mål og audit – uten salgsendringer.",
  MARKETING: "Attribusjon, kampanjer, rapporter og kommunikasjon i read-only der relevant.",
  KEYHOLDING: "Keyholding-kunder, serviceinntekt, execution og kontrollert kommunikasjon.",
  VIEWER: "Lesetilgang til rapporter og relevante arbeidsflater. Ingen skrivehandlinger.",
};

export default function AccessControlPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = async () => {
    setLoading(true); setError("");
    const response = await fetch("/api/access-control", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Kunne ikke hente tilgangsprofiler.");
    else setData(body);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const assignableRoles = useMemo(() => (data?.roles || []).filter((role) => role.assignable), [data]);
  const edit = (profile: Profile) => {
    setForm({ email: profile.email, displayName: profile.displayName || "", role: profile.role, active: profile.active });
    setNotice(""); setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const persist = async (payload: FormState) => {
    if (!payload.email.trim()) return setError("E-post må fylles inn.");
    if (!payload.active && !confirm(`Deaktivere tilgang for ${payload.email}? Eksisterende sesjon stoppes ved neste API-kall.`)) return;
    setSaving(true); setError(""); setNotice("");
    const response = await fetch("/api/access-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "UPSERT_PROFILE", ...payload }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Kunne ikke lagre tilgangsprofilen.");
    else {
      setNotice(payload.active ? "Tilgangsprofilen er lagret." : "Tilgangen er deaktivert.");
      setForm(emptyForm);
      await load();
    }
    setSaving(false);
  };

  if (loading) return <div className="p-8 text-slate-400">Laster tilgangskontroll…</div>;

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-400"><ShieldCheck size={18}/> Owner-only</div><h1 className="text-3xl font-bold">Roller & tilgang</h1><p className="mt-2 max-w-3xl text-slate-400">Tildel avgrensede roller til brukere som allerede finnes i Supabase Auth. RealtyFlow oppretter ikke konto, passord eller invitasjon.</p></div>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"><RefreshCw size={15}/> Oppdater</button>
        </header>

        {error && <div className="rounded-xl border border-red-700/60 bg-red-950/40 p-4 text-red-200"><AlertTriangle className="mr-2 inline" size={17}/>{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/40 p-4 text-emerald-200"><CheckCircle2 className="mr-2 inline" size={17}/>{notice}</div>}

        <section className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="mb-5 flex items-center gap-2"><UserPlus size={20} className="text-primary-400"/><h2 className="text-lg font-semibold">Legg til eller endre profil</h2></div>
            <div className="space-y-4">
              <label className="block text-sm text-slate-300">E-post<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" placeholder="bruker@firma.no"/></label>
              <label className="block text-sm text-slate-300">Navn<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Valgfritt visningsnavn"/></label>
              <label className="block text-sm text-slate-300">Rolle<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">{assignableRoles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
              <label className="flex items-center gap-3 rounded-lg border border-slate-800 p-3 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })}/> Aktiv tilgang</label>
              <p className="rounded-lg bg-slate-950/70 p-3 text-xs text-slate-400">{roleHelp[form.role] || "Tilgang styres av den sentrale rollematrisen."}</p>
              <div className="flex gap-2"><button disabled={saving} onClick={() => void persist(form)} className="flex-1 rounded-lg bg-primary-600 px-4 py-2 font-medium hover:bg-primary-500 disabled:opacity-50">{saving ? "Lagrer…" : "Lagre profil"}</button><button onClick={() => setForm(emptyForm)} className="rounded-lg border border-slate-700 px-4 py-2 hover:bg-slate-800">Nullstill</button></div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="mb-4 flex items-center gap-2"><UserCog size={20} className="text-primary-400"/><h2 className="text-lg font-semibold">Aktive profiler</h2></div>
            <div className="mb-4 rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-200">Owner styres av miljøvariabelen <code>REALTYFLOW_ADMIN_EMAILS</code> og kan ikke redigeres her.</div>
            <div className="space-y-3">
              {(data?.owners || []).map((owner) => <div key={owner.email} className="flex items-center justify-between rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4"><div><div className="font-medium">{owner.email}</div><div className="text-xs text-emerald-300">Owner · full tilgang</div></div><ShieldCheck className="text-emerald-400" size={20}/></div>)}
              {(data?.settings.profiles || []).map((profile) => (
                <div key={profile.email} className={`rounded-xl border p-4 ${profile.active ? "border-slate-700 bg-slate-950/50" : "border-slate-800 bg-slate-950/20 opacity-65"}`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div><div className="font-medium">{profile.displayName || profile.email}</div><div className="text-sm text-slate-400">{profile.email} · {profile.role} · {profile.active ? "Aktiv" : "Deaktivert"}</div><div className="mt-1 text-xs text-slate-500">Sist endret {profile.updatedAt ? new Date(profile.updatedAt).toLocaleString("nb-NO") : "ukjent"}{profile.updatedBy ? ` av ${profile.updatedBy}` : ""}</div></div>
                    <div className="flex gap-2"><button onClick={() => edit(profile)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Rediger</button>{profile.active && <button disabled={saving} onClick={() => void persist({ email: profile.email, displayName: profile.displayName || "", role: profile.role, active: false })} className="rounded-lg border border-red-800 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-50">Deaktiver</button>}</div>
                  </div>
                </div>
              ))}
              {!data?.settings.profiles.length && <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-500">Ingen ekstra brukere er konfigurert.</div>}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="mb-4 text-lg font-semibold">Rollematrise</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(data?.roles || []).map((role) => <div key={role.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><div className="font-semibold">{role.label}</div><div className="mt-1 text-xs text-slate-500">{role.id}</div><div className="mt-3 flex flex-wrap gap-1.5">{role.permissions.map((permission) => <span key={permission} className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300">{permission}</span>)}</div></div>)}</div></section>
      </div>
    </div>
  );
}
