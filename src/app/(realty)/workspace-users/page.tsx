"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, LockKeyhole, RefreshCw, ShieldCheck, UserPlus, Users } from "lucide-react";
import { WORKSPACE_PROGRAM_CATALOG, programPermissions } from "@/lib/workspaces/module-catalog";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";

type Brand = { id: string; brandKey: string; name: string };
type Membership = {
  brandId: string; brandKey: string; brandName: string;
  status: "active" | "revoked" | "disabled";
  permissions: WorkspacePermission[];
  updatedAt: string | null;
};
type WorkspaceUser = {
  userId: string; username: string; email: string; displayName: string;
  status: "active" | "disabled"; memberships: Membership[];
};
type Snapshot = {
  users: WorkspaceUser[]; brands: Brand[]; featureEnabled: boolean;
  featureStatus?: "ready" | "unavailable";
  passwordStorage: string;
};
type BrandChoice = {
  enabled: boolean;
  crmRead: boolean;
  crmWrite: boolean;
  properties: boolean;
  tasksRead: boolean;
  tasksWrite: boolean;
  marketingRead: boolean;
  marketingDraft: boolean;
};

const emptyChoice = (): BrandChoice => ({
  enabled: false, crmRead: false, crmWrite: false,
  properties: false, tasksRead: false, tasksWrite: false,
  marketingRead: false, marketingDraft: false,
});

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function strongPassword(value: string) {
  if (value.length < 12 || value.length > 128) return false;
  const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(pattern => pattern.test(value)).length;
  return groups >= 3 && !/[\r\n\0]/.test(value);
}

function apiError(body: any, fallback: string) {
  return typeof body?.message === "string" && body.message.trim()
    ? body.message
    : typeof body?.error === "string" && body.error.trim()
      ? body.error
      : fallback;
}

function strongGeneratedPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-_=?.";
  const random = new Uint32Array(20);
  crypto.getRandomValues(random);
  let value = "";
  for (const number of random) value += alphabet[number % alphabet.length];
  return value.slice(0, 18) + "aA7!";
}

function choicesForUser(user: WorkspaceUser, brands: Brand[]) {
  const next: Record<string, BrandChoice> = {};
  for (const brand of brands) next[brand.brandKey] = emptyChoice();
  for (const membership of user.memberships.filter(row => row.status === "active")) {
    const permissions = membership.permissions;
    next[membership.brandKey] = {
      enabled: true,
      crmRead: membership.brandKey === "zeneco"
        ? permissions.includes("crm.joint.read") : permissions.includes("crm.read"),
      crmWrite: membership.brandKey === "zeneco"
        ? permissions.includes("crm.joint.write") : permissions.includes("crm.write"),
      properties: permissions.includes("properties.catalog.read"),
      tasksRead: permissions.includes("tasks.joint.read"),
      tasksWrite: permissions.includes("tasks.joint.write"),
      marketingRead: permissions.includes("marketing.read"),
      marketingDraft: permissions.includes("marketing.draft"),
    };
  }
  return next;
}

export default function WorkspaceUsersPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [choices, setChoices] = useState<Record<string, BrandChoice>>({});

  const selectedUser = useMemo(
    () => snapshot?.users.find(user => user.userId === selectedUserId) || null,
    [snapshot, selectedUserId],
  );

  async function reload() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/workspace-users", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunne ikke hente brukere.");
      setSnapshot(body);
      setChoices(current => {
        const next = { ...current };
        for (const brand of body.brands || []) if (!next[brand.brandKey]) next[brand.brandKey] = emptyChoice();
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke hente brukere.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void reload(); }, []);

  function startNew() {
    setSelectedUserId(null);
    setDisplayName(""); setUsername(""); setEmail(""); setPassword("");
    setError(""); setNotice("");
    const next: Record<string, BrandChoice> = {};
    for (const brand of snapshot?.brands || []) next[brand.brandKey] = emptyChoice();
    setChoices(next);
  }

  function editUser(user: WorkspaceUser) {
    setSelectedUserId(user.userId);
    setDisplayName(user.displayName);
    setUsername(user.username);
    setEmail(user.email);
    setPassword("");
    setChoices(choicesForUser(user, snapshot?.brands || []));
    setError(""); setNotice("");
  }

  function updateChoice(brandKey: string, patch: Partial<BrandChoice>) {
    setChoices(current => {
      const prior = current[brandKey] || emptyChoice();
      const next = { ...prior, ...patch };
      if (!next.enabled) return { ...current, [brandKey]: emptyChoice() };
      if (next.crmWrite) next.crmRead = true;
      if (next.tasksWrite) next.tasksRead = true;
      if (next.marketingDraft) next.marketingRead = true;
      if (brandKey === "zeneco" && (next.tasksRead || next.tasksWrite)) next.crmRead = true;
      return { ...current, [brandKey]: next };
    });
  }

  function brandAccess() {
    return (snapshot?.brands || []).flatMap(brand => {
      const choice = choices[brand.brandKey];
      if (!choice?.enabled) return [];
      const permissions = programPermissions({
        brandKey: brand.brandKey,
        crmRead: choice.crmRead,
        crmWrite: choice.crmWrite,
        properties: choice.properties,
        jointTasksRead: choice.tasksRead,
        jointTasksWrite: choice.tasksWrite,
        marketingRead: choice.marketingRead,
        marketingDraft: choice.marketingDraft,
      });
      return permissions.length ? [{ brandKey: brand.brandKey, permissions }] : [];
    });
  }

  async function toggleLogin() {
    if (!snapshot || busy) return;
    const enabled = !snapshot.featureEnabled;
    if (!enabled && !window.confirm("Deaktivere medarbeiderinnlogging globalt? Eksisterende workspace-sesjoner blir avvist ved neste beskyttede request.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/workspace-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SET_LOGIN_ENABLED", enabled }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiError(body, "Kunne ikke oppdatere medarbeiderinnloggingen."));
      setNotice(body.featureEnabled
        ? "Medarbeiderinnlogging er aktivert. Kun aktive brukere med verifiserte merkevarer og programmer slipper inn."
        : "Medarbeiderinnlogging er deaktivert globalt.");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke oppdatere medarbeiderinnloggingen.");
    } finally { setBusy(false); }
  }

  async function submitUser() {
    const access = brandAccess();
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    if (!displayName.trim()) {
      setError("Skriv inn navn på brukeren.");
      return;
    }
    if (!usernamePattern.test(normalizedUsername)) {
      setError("Brukernavn må være 3–32 tegn og kan bare inneholde a–z, 0–9, punktum, bindestrek eller understrek.");
      return;
    }
    if (!selectedUser && (!emailPattern.test(normalizedEmail) || normalizedEmail.length > 254)) {
      setError("Oppgi en gyldig e-postadresse.");
      return;
    }
    if (access.length === 0) {
      setError("Velg minst én merkevare og minst ett program for brukeren.");
      return;
    }
    if (!selectedUser && !strongPassword(password)) {
      setError("Passordet må være 12–128 tegn og inneholde minst tre av: små bokstaver, store bokstaver, tall og symbol.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/workspace-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedUser
          ? {
              action: "UPDATE_ACCESS", userId: selectedUser.userId,
              username: username.trim().toLowerCase(), displayName: displayName.trim(),
              brandAccess: access,
            }
          : {
              action: "CREATE_USER", username: username.trim().toLowerCase(),
              displayName: displayName.trim(), email: email.trim().toLowerCase(),
              password, brandAccess: access,
            }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiError(body, "Brukeren kunne ikke lagres."));
      setNotice(selectedUser
        ? "Tilgangen er oppdatert. Endringen er avgrenset til valgte merkevarer og programmer."
        : body.loginEnabled
          ? "Brukeren er opprettet og kan logge inn med brukernavn eller e-post."
          : "Brukeren er opprettet, men medarbeiderinnlogging er fortsatt globalt deaktivert.");
      setPassword("");
      await reload();
      if (!selectedUser && body.user?.userId) setSelectedUserId(body.user.userId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Brukeren kunne ikke lagres.");
    } finally { setBusy(false); }
  }

  async function resetPassword() {
    if (!selectedUser || !password) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/workspace-users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SET_PASSWORD", userId: selectedUser.userId, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiError(body, "Passordet kunne ikke endres."));
      setNotice("Nytt passord er satt i Supabase Auth. RealtyFlow lagrer ikke passordet.");
      setPassword("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Passordet kunne ikke endres."); }
    finally { setBusy(false); }
  }

  async function disableUser() {
    if (!selectedUser || busy) return;
    if (!window.confirm(`Deaktivere ${selectedUser.displayName}? Alle aktive merkevaretilganger blir tilbakekalt.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/workspace-users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DISABLE_USER", userId: selectedUser.userId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiError(body, "Brukeren kunne ikke deaktiveres."));
      setNotice("Brukeren er deaktivert og alle merkevaretilganger er tilbakekalt.");
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Brukeren kunne ikke deaktiveres."); }
    finally { setBusy(false); }
  }

  const plannedPrograms = WORKSPACE_PROGRAM_CATALOG.filter(program => program.status === "planned");

  return <div className="mx-auto max-w-7xl space-y-6 p-6 text-slate-100">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Owner · tilgangsstyring</p>
        <h1 className="mt-2 text-3xl font-bold">Brukere & tilgang</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Opprett medarbeidere med brukernavn, e-post og passord. Velg deretter nøyaktig hvilke
          merkevarer og RealtyFlow-programmer de kan bruke. Passord lagres aldri i RealtyFlow.
        </p>
      </div>
      <button onClick={() => void reload()} disabled={loading || busy}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm">
        <RefreshCw size={15}/> Oppdater
      </button>
    </header>

    {snapshot && <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm ${snapshot.featureEnabled
      ? "border-emerald-700 bg-emerald-950/20 text-emerald-200"
      : "border-amber-700 bg-amber-950/20 text-amber-200"}`}>
      <div>
        <ShieldCheck size={17} className="mr-2 inline"/>
        {snapshot.featureStatus === "unavailable"
          ? "Status for medarbeiderinnlogging kunne ikke verifiseres. Tilgang forblir fail-closed."
          : snapshot.featureEnabled
            ? "Medarbeiderinnlogging er aktivert. Hver rute kontrollerer fortsatt bruker, merkevare og programrettighet."
            : "Medarbeiderinnlogging er globalt deaktivert. Opprettede brukere kan ikke komme inn før du aktiverer den."}
      </div>
      <button type="button" onClick={() => void toggleLogin()}
        disabled={busy || snapshot.featureStatus === "unavailable"}
        className="rounded-lg border border-current px-3 py-2 text-xs font-semibold disabled:opacity-50">
        {snapshot.featureEnabled ? "Deaktiver innlogging" : "Aktiver innlogging"}
      </button>
    </div>}

    {error && <p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/25 p-4 text-sm text-emerald-200">{notice}</p>}

    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold"><Users size={18}/> Brukere</h2>
          <button onClick={startNew} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold">
            <UserPlus size={14}/> Ny bruker
          </button>
        </div>
        {loading && <p className="mt-4 text-sm text-slate-400">Laster…</p>}
        <div className="mt-4 space-y-2">
          {snapshot?.users.map(user => <button key={user.userId} onClick={() => editUser(user)}
            className={`w-full rounded-xl border p-3 text-left ${selectedUserId === user.userId
              ? "border-cyan-500 bg-cyan-950/30" : "border-slate-800 bg-slate-950/50"}`}>
            <span className="block font-medium">{user.displayName}</span>
            <span className="block text-xs text-slate-400">@{user.username} · {user.email}</span>
            <span className={`mt-1 inline-block text-xs ${user.status === "active" ? "text-emerald-300" : "text-amber-300"}`}>
              {user.status === "active" ? "Aktiv" : "Deaktivert"} · {user.memberships.filter(m => m.status === "active").length} merkevarer
            </span>
          </button>)}
          {!loading && snapshot?.users.length === 0 && <p className="text-sm text-slate-500">Ingen medarbeidere er opprettet ennå.</p>}
        </div>
      </aside>

      <main className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{selectedUser ? `Rediger ${selectedUser.displayName}` : "Opprett bruker"}</h2>
            <p className="text-xs text-slate-400">Brukernavn kan brukes ved innlogging. E-post beholdes som sikker identitet og for passordgjenoppretting.</p>
          </div>
          {selectedUser && selectedUser.status === "active" && <button onClick={() => void disableUser()} disabled={busy}
            className="rounded-lg border border-rose-800 px-3 py-2 text-sm text-rose-300 disabled:opacity-50">
            Deaktiver bruker
          </button>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">Navn
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={120}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Andrea Thorsnes"/>
          </label>
          <label className="text-sm">Brukernavn
            <input value={username} onChange={e => setUsername(e.target.value.toLowerCase())} maxLength={32}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              placeholder="andrea" autoCapitalize="none" autoCorrect="off"/>
            <span className="mt-1 block text-xs text-slate-500">3–32 tegn: a–z, 0–9, punktum, bindestrek eller understrek.</span>
          </label>
          <label className="text-sm">E-post
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              disabled={Boolean(selectedUser)} maxLength={254}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 disabled:opacity-60"
              placeholder="navn@firma.no"/>
          </label>
          <label className="text-sm">{selectedUser ? "Nytt passord (valgfritt)" : "Førstegangspassord"}
            <div className="mt-1 flex gap-2">
              <div className="relative flex-1">
                <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password" maxLength={128}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 pr-10"/>
                <button type="button" onClick={() => setShowPassword(value => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              <button type="button" onClick={() => { setPassword(strongGeneratedPassword()); setShowPassword(true); }}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs">Generer</button>
            </div>
            <span className="mt-1 block text-xs text-slate-500">Minst 12 tegn og minst tre av: små/store bokstaver, tall og symbol.</span>
          </label>
        </div>

        <section className="space-y-3">
          <div>
            <h3 className="font-semibold">Merkevarer og programmer</h3>
            <p className="text-xs text-slate-400">Velg merkevare først. Hver rettighet kontrolleres på nytt på serveren ved bruk.</p>
          </div>
          <div className="space-y-3">
            {snapshot?.brands.map(brand => {
              const choice = choices[brand.brandKey] || emptyChoice();
              const isZen = brand.brandKey === "zeneco";
              return <article key={brand.brandKey} className="rounded-xl border border-slate-700 bg-slate-950/55 p-4">
                <label className="flex items-center gap-3 font-semibold">
                  <input type="checkbox" checked={choice.enabled}
                    onChange={e => updateChoice(brand.brandKey, { enabled: e.target.checked })}/>
                  {brand.name}
                </label>
                {choice.enabled && <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-slate-800 p-3">
                    <strong className="text-sm">{isZen ? "Leads · nye felleskunder" : "Leads & CRM"}</strong>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.crmRead}
                      onChange={e => updateChoice(brand.brandKey, { crmRead: e.target.checked, ...(e.target.checked ? {} : { crmWrite: false, tasksRead: false, tasksWrite: false }) })}/> Se leads og kunder</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.crmWrite}
                      onChange={e => updateChoice(brand.brandKey, { crmWrite: e.target.checked })}/> Opprette og redigere leads</label>
                  </div>
                  <div className="rounded-lg border border-slate-800 p-3">
                    <strong className="text-sm">Eiendommer</strong>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.properties}
                      onChange={e => updateChoice(brand.brandKey, { properties: e.target.checked })}/> Publisert eiendomskatalog</label>
                  </div>
                  {isZen && <div className="rounded-lg border border-slate-800 p-3">
                    <strong className="text-sm">Felles oppgaver</strong>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.tasksRead}
                      onChange={e => updateChoice(brand.brandKey, { tasksRead: e.target.checked, ...(e.target.checked ? {} : { tasksWrite: false }) })}/> Se nye fellesoppgaver</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.tasksWrite}
                      onChange={e => updateChoice(brand.brandKey, { tasksWrite: e.target.checked })}/> Opprette/fullføre</label>
                  </div>}
                  <div className="rounded-lg border border-slate-800 p-3">
                    <strong className="text-sm">Markedsføring</strong>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.marketingRead}
                      onChange={e => updateChoice(brand.brandKey, { marketingRead: e.target.checked, ...(e.target.checked ? {} : { marketingDraft: false }) })}/> Se markedsoversikt og innhold</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.marketingDraft}
                      onChange={e => updateChoice(brand.brandKey, { marketingDraft: e.target.checked })}/> Lage innholdsutkast</label>
                    <p className="mt-2 text-[11px] text-slate-500">Publisering er en separat rettighet og er ikke åpnet for medarbeidere ennå.</p>
                  </div>
                </div>}
              </article>;
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
          <h3 className="font-semibold">Flere RealtyFlow-programmer</h3>
          <p className="mt-1 text-xs text-slate-400">Disse ligger i samme tilgangsmodell, men kan ikke gis til medarbeidere før hver modul har egen merkevare- og datasperre.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {plannedPrograms.map(program => <span key={program.id}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-500">
              {program.label} · planlagt
            </span>)}
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button onClick={() => void submitUser()} disabled={busy}
            className="rounded-xl bg-cyan-600 px-5 py-3 font-semibold text-white disabled:opacity-50">
            {busy ? "Lagrer…" : selectedUser ? "Lagre bruker og tilgang" : "Opprett bruker"}
          </button>
          {selectedUser && password && <button onClick={() => void resetPassword()} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-5 py-3 font-semibold disabled:opacity-50">
            <KeyRound size={16}/> Sett nytt passord
          </button>}
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <LockKeyhole size={14}/> Passord sendes direkte til Supabase Auth og lagres aldri i RealtyFlow-tabeller eller revisjonslogger.
          </p>
        </div>
      </main>
    </div>
  </div>;
}
