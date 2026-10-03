"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, LockKeyhole, RefreshCw, ShieldCheck, UserPlus, Users } from "lucide-react";
import { WORKSPACE_PROGRAM_CATALOG, programPermissions } from "@/lib/workspaces/module-catalog";
import { WorkspaceTeamResponsibilityPanel } from "@/components/workspaces/team-responsibility-panel";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";
import { WORKSPACE_ACCESS_PRESETS, workspaceAccessPresetChoice, type WorkspaceAccessPresetId } from "@/lib/workspaces/access-presets";
import {
  WORKSPACE_RESPONSIBILITIES,
  responsibilityAllowed,
  suggestedResponsibilitiesForPreset,
  type WorkspaceResponsibilityId,
} from "@/lib/workspaces/responsibilities";

type Brand = { id: string; brandKey: string; name: string };
type Membership = {
  brandId: string; brandKey: string; brandName: string;
  status: "active" | "revoked" | "disabled";
  permissions: WorkspacePermission[];
  responsibilities: WorkspaceResponsibilityId[];
  updatedAt: string | null;
};
type WorkspaceUser = {
  userId: string; username: string; email: string; displayName: string;
  status: "active" | "disabled";
  accountKind: "staff" | "external";
  organization: string | null;
  accessExpiresAt: string | null;
  expired: boolean;
  memberships: Membership[];
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
  marketingPublish: boolean;
  reelsRead: boolean;
  reelsCreate: boolean;
  reelsPublish: boolean;
  youtubeRead: boolean;
  youtubePublish: boolean;
  nexusRead: boolean;
  corporateRead: boolean;
  corporatePlan: boolean;
  visibilityRead: boolean;
  visibilityPlan: boolean;
  adsRead: boolean;
  adsDraft: boolean;
  eventsPlan: boolean;
  contentRead: boolean;
  contentEdit: boolean;
  contentPublish: boolean;
  emailRead: boolean;
  emailDraft: boolean;
  emailSend: boolean;
  responsibilities: WorkspaceResponsibilityId[];
};

const emptyChoice = (): BrandChoice => ({
  enabled: false, crmRead: false, crmWrite: false,
  properties: false, tasksRead: false, tasksWrite: false,
  marketingRead: false, marketingDraft: false, marketingPublish: false,
  reelsRead: false, reelsCreate: false, reelsPublish: false,
  youtubeRead: false, youtubePublish: false,
  nexusRead: false,
  corporateRead: false, corporatePlan: false,
  visibilityRead: false, visibilityPlan: false,
  adsRead: false, adsDraft: false, eventsPlan: false,
  contentRead: false, contentEdit: false, contentPublish: false,
  emailRead: false, emailDraft: false, emailSend: false,
  responsibilities: [],
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

function accessExpiryInput(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function accessExpiryIso(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
      marketingPublish: permissions.includes("marketing.publish"),
      reelsRead: permissions.includes("reels.read"),
      reelsCreate: permissions.includes("reels.create"),
      reelsPublish: permissions.includes("reels.publish"),
      youtubeRead: permissions.includes("youtube.read"),
      youtubePublish: permissions.includes("youtube.publish"),
      nexusRead: permissions.includes("nexus.read"),
      corporateRead: permissions.includes("corporate.read"),
      corporatePlan: permissions.includes("corporate.plan"),
      visibilityRead: permissions.includes("visibility.read"),
      visibilityPlan: permissions.includes("visibility.plan"),
      adsRead: permissions.includes("ads.read"),
      adsDraft: permissions.includes("ads.draft"),
      eventsPlan: permissions.includes("events.plan"),
      contentRead: permissions.includes("content.read"),
      contentEdit: permissions.includes("content.edit"),
      contentPublish: permissions.includes("content.publish"),
      emailRead: permissions.includes("email.read"),
      emailDraft: permissions.includes("email.draft"),
      emailSend: permissions.includes("email.send"),
      responsibilities: membership.responsibilities || [],
    };
  }
  return next;
}

function permissionsForChoice(brandKey: string, choice: BrandChoice) {
  return programPermissions({
    brandKey,
    crmRead: choice.crmRead,
    crmWrite: choice.crmWrite,
    properties: choice.properties,
    jointTasksRead: choice.tasksRead,
    jointTasksWrite: choice.tasksWrite,
    marketingRead: choice.marketingRead,
    marketingDraft: choice.marketingDraft,
    marketingPublish: choice.marketingPublish,
    reelsRead: choice.reelsRead,
    reelsCreate: choice.reelsCreate,
    reelsPublish: choice.reelsPublish,
    youtubeRead: choice.youtubeRead,
    youtubePublish: choice.youtubePublish,
    nexusRead: choice.nexusRead,
    corporateRead: choice.corporateRead,
    corporatePlan: choice.corporatePlan,
    visibilityRead: choice.visibilityRead,
    visibilityPlan: choice.visibilityPlan,
    adsRead: choice.adsRead,
    adsDraft: choice.adsDraft,
    eventsPlan: choice.eventsPlan,
    contentRead: choice.contentRead,
    contentEdit: choice.contentEdit,
    contentPublish: choice.contentPublish,
    emailRead: choice.emailRead,
    emailDraft: choice.emailDraft,
    emailSend: choice.emailSend,
  });
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
  const [accountKind, setAccountKind] = useState<"staff" | "external">("staff");
  const [organization, setOrganization] = useState("");
  const [accessExpiry, setAccessExpiry] = useState("");
  const [choices, setChoices] = useState<Record<string, BrandChoice>>({});
  const [selectedPresetId, setSelectedPresetId] = useState<WorkspaceAccessPresetId | null>(null);

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
    setAccountKind("staff"); setOrganization(""); setAccessExpiry(""); setSelectedPresetId(null);
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
    setAccountKind(user.accountKind || "staff");
    setOrganization(user.organization || "");
    setAccessExpiry(accessExpiryInput(user.accessExpiresAt));
    setSelectedPresetId(null);
    setChoices(choicesForUser(user, snapshot?.brands || []));
    setError(""); setNotice("");
  }

  function updateChoice(brandKey: string, patch: Partial<BrandChoice>) {
    setSelectedPresetId(null);
    setChoices(current => {
      const prior = current[brandKey] || emptyChoice();
      const next = { ...prior, ...patch };
      if (!next.enabled) return { ...current, [brandKey]: emptyChoice() };
      if (next.crmWrite) next.crmRead = true;
      if (next.tasksWrite) next.tasksRead = true;
      if (next.marketingDraft) next.marketingRead = true;
      if (next.marketingPublish) { next.marketingRead = true; next.marketingDraft = true; }
      if (next.reelsCreate) next.reelsRead = true;
      if (next.reelsPublish) { next.reelsRead = true; next.reelsCreate = true; }
      if (!["zeneco", "pinosoecolife"].includes(brandKey)) { next.reelsRead = false; next.reelsCreate = false; next.reelsPublish = false; }
      if (next.youtubePublish) next.youtubeRead = true;
      if (brandKey !== "zeneco") { next.youtubeRead = false; next.youtubePublish = false; }
      if (next.corporatePlan) next.corporateRead = true;
      if (next.visibilityPlan) next.visibilityRead = true;
      if (next.adsDraft) next.adsRead = true;
      if (next.contentEdit) next.contentRead = true;
      if (next.contentPublish) { next.contentRead = true; next.contentEdit = true; }
      if (next.emailDraft) next.emailRead = true;
      if (next.emailSend) { next.emailRead = true; next.emailDraft = true; }
      if (brandKey !== "zeneco") { next.corporateRead = false; next.corporatePlan = false; }
      if (brandKey === "zeneco" && (next.tasksRead || next.tasksWrite)) next.crmRead = true;
      return { ...current, [brandKey]: next };
    });
  }

  function applyAccessPreset(presetId: WorkspaceAccessPresetId) {
    const enabledBrands = (snapshot?.brands || []).filter(brand => choices[brand.brandKey]?.enabled);
    if (enabledBrands.length === 0) {
      setError("Velg minst én merkevare før du bruker en tilgangsmal.");
      setNotice("");
      return;
    }
    setChoices(current => {
      const next = { ...current };
      for (const brand of enabledBrands) {
        const presetChoice = {
          ...emptyChoice(),
          enabled: true,
          ...workspaceAccessPresetChoice(brand.brandKey, presetId),
        };
        const permissions = permissionsForChoice(brand.brandKey, presetChoice);
        next[brand.brandKey] = {
          ...presetChoice,
          responsibilities: suggestedResponsibilitiesForPreset(brand.brandKey, presetId, permissions),
        };
      }
      return next;
    });
    const preset = WORKSPACE_ACCESS_PRESETS.find(item => item.id === presetId);
    setSelectedPresetId(presetId);
    setError("");
    setNotice(`Malen «${preset?.label || presetId}» er lagt på valgte merkevarer. Kontroller rettighetene under før du lagrer.`);
  }

  function brandAccess() {
    return (snapshot?.brands || []).flatMap(brand => {
      const choice = choices[brand.brandKey];
      if (!choice?.enabled) return [];
      const permissions = permissionsForChoice(brand.brandKey, choice);
      const responsibilities = choice.responsibilities.filter(item =>
        responsibilityAllowed(brand.brandKey, item, permissions));
      return permissions.length ? [{ brandKey: brand.brandKey, permissions, responsibilities }] : [];
    });
  }



  const enabledBrandCount = (snapshot?.brands || []).filter(brand => choices[brand.brandKey]?.enabled).length;
  const selectedPermissionCount = brandAccess().reduce((sum, item) => sum + item.permissions.length, 0);

  function selectUserFromResponsibilityOverview(userId: string) {
    const user = snapshot?.users.find(item => item.userId === userId);
    if (!user) return;
    editUser(user);
    window.requestAnimationFrame(() => {
      document.getElementById("workspace-user-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function toggleLogin() {
    if (!snapshot || busy) return;
    const enabled = !snapshot.featureEnabled;
    if (!enabled && !window.confirm("Deaktivere workspace-innlogging globalt? Eksisterende brukerøkter blir avvist ved neste beskyttede request.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/workspace-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SET_LOGIN_ENABLED", enabled }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiError(body, "Kunne ikke oppdatere workspace-innloggingen."));
      setNotice(body.featureEnabled
        ? "Workspace-innlogging er aktivert. Kun aktive brukere med verifiserte merkevarer og programmer slipper inn."
        : "Workspace-innlogging er deaktivert globalt.");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke oppdatere workspace-innloggingen.");
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
    if (organization.trim().length > 160) {
      setError("Firma/organisasjon kan være maks 160 tegn.");
      return;
    }
    const expiresAt = accessExpiry ? accessExpiryIso(accessExpiry) : null;
    if (accessExpiry && !expiresAt) {
      setError("Velg en gyldig sluttdato for tilgangen.");
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
              accountKind, organization: organization.trim() || null,
              accessExpiresAt: expiresAt, brandAccess: access,
            }
          : {
              action: "CREATE_USER", username: username.trim().toLowerCase(),
              displayName: displayName.trim(), email: email.trim().toLowerCase(),
              accountKind, organization: organization.trim() || null,
              accessExpiresAt: expiresAt, brandAccess: access,
            }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiError(body, "Brukeren kunne ikke lagres."));
      setNotice(selectedUser
        ? "Tilgangen er oppdatert. Endringen er avgrenset til valgte merkevarer og programmer."
        : body.loginEnabled
          ? "Brukeren er opprettet. Invitasjon er sendt på e-post slik at personen setter sitt eget passord."
          : "Brukeren er opprettet og invitasjon er sendt, men workspace-innlogging er fortsatt globalt deaktivert.");
      setPassword("");
      await reload();
      if (!selectedUser && body.user?.userId) setSelectedUserId(body.user.userId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Brukeren kunne ikke lagres.");
    } finally { setBusy(false); }
  }

  async function resetPassword() {
    if (!selectedUser || !password) return;
    if (!strongPassword(password)) {
      setError("Passordet må være 12–128 tegn og inneholde minst tre av: små bokstaver, store bokstaver, tall og symbol.");
      return;
    }
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
          Opprett interne medarbeidere eller eksterne samarbeidspartnere. Velg nøyaktig hvilke
          merkevarer og RealtyFlow-programmer hver person kan bruke, og sett valgfri sluttdato for ekstern tilgang. Nye brukere får en e-postinvitasjon og setter sitt eget passord.
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
          ? "Status for workspace-innlogging kunne ikke verifiseres. Tilgang forblir fail-closed."
          : snapshot.featureEnabled
            ? "Workspace-innlogging er aktivert. Hver rute kontrollerer fortsatt bruker, merkevare og programrettighet."
            : "Workspace-innlogging er globalt deaktivert. Opprettede brukere kan ikke komme inn før du aktiverer den."}
      </div>
      <button type="button" onClick={() => void toggleLogin()}
        disabled={busy || snapshot.featureStatus === "unavailable"}
        className="rounded-lg border border-current px-3 py-2 text-xs font-semibold disabled:opacity-50">
        {snapshot.featureEnabled ? "Deaktiver innlogging" : "Aktiver innlogging"}
      </button>
    </div>}

    {error && <p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/25 p-4 text-sm text-emerald-200">{notice}</p>}

    {snapshot && <WorkspaceTeamResponsibilityPanel
      brands={snapshot.brands}
      users={snapshot.users}
      onSelectUser={selectUserFromResponsibilityOverview}
    />}

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
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium">{user.displayName}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${user.accountKind === "external" ? "border-violet-700 text-violet-300" : "border-slate-700 text-slate-400"}`}>
                {user.accountKind === "external" ? "Ekstern" : "Intern"}
              </span>
            </span>
            <span className="block text-xs text-slate-400">@{user.username} · {user.email}</span>
            {user.organization && <span className="block text-xs text-slate-500">{user.organization}</span>}
            <span className={`mt-1 inline-block text-xs ${user.expired || user.status !== "active" ? "text-amber-300" : "text-emerald-300"}`}>
              {user.expired ? "Tilgang utløpt" : user.status === "active" ? "Aktiv" : "Deaktivert"} · {user.memberships.filter(m => m.status === "active").length} merkevarer
            </span>
          </button>)}
          {!loading && snapshot?.users.length === 0 && <p className="text-sm text-slate-500">Ingen workspace-brukere er opprettet ennå.</p>}
        </div>
      </aside>

      <main id="workspace-user-editor" className="scroll-mt-6 space-y-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
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

        <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
          <h3 className="font-semibold">Brukertype og varighet</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <button type="button" onClick={() => setAccountKind("staff")}
              className={`rounded-xl border p-3 text-left ${accountKind === "staff" ? "border-cyan-500 bg-cyan-950/30" : "border-slate-700"}`}>
              <span className="block font-medium">Intern medarbeider</span>
              <span className="mt-1 block text-xs text-slate-400">Fast eller intern RealtyFlow-bruker. Får bare valgte brands og moduler.</span>
            </button>
            <button type="button" onClick={() => setAccountKind("external")}
              className={`rounded-xl border p-3 text-left ${accountKind === "external" ? "border-violet-500 bg-violet-950/20" : "border-slate-700"}`}>
              <span className="block font-medium">Ekstern samarbeidspartner</span>
              <span className="mt-1 block text-xs text-slate-400">Byrå, freelancer, partner eller rådgiver. Samme brand-/modulsperrer, med valgfri sluttdato.</span>
            </button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm">Firma / organisasjon <span className="text-slate-500">(valgfritt)</span>
              <input value={organization} onChange={e => setOrganization(e.target.value)} maxLength={160}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                placeholder={accountKind === "external" ? "Firma eller samarbeidspartner" : "Avdeling eller firma"}/>
            </label>
            <label className="text-sm">Tilgang til og med <span className="text-slate-500">(valgfritt)</span>
              <input type="date" value={accessExpiry} onChange={e => setAccessExpiry(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"/>
              <span className="mt-1 block text-xs text-slate-500">Når datoen er passert, blir innlogging automatisk avvist. Brand- og modulrettigheter endres ikke.</span>
            </label>
          </div>
        </section>

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
          {selectedUser ? <label className="text-sm">Nytt passord <span className="text-slate-500">(nødvalg)</span>
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
            <span className="mt-1 block text-xs text-slate-500">Bruk helst passordgjenoppretting. Dette er kun et owner-nødvalg.</span>
          </label> : <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/15 p-3 text-sm">
            <strong className="text-emerald-200">Passord settes av brukeren</strong>
            <p className="mt-1 text-xs text-slate-400">Når du oppretter brukeren, sender Supabase en tidsbegrenset invitasjon til e-postadressen. Du trenger ikke lage eller dele et passord.</p>
          </div>}
        </div>

        <section className="space-y-3">
          <div>
            <h3 className="font-semibold">Merkevarer og programmer</h3>
            <p className="text-xs text-slate-400">Velg merkevare først. Hver rettighet kontrolleres på nytt på serveren ved bruk.</p>
          </div>
          <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-cyan-100">Rolleprofiler · hurtigoppsett</h4>
                <p className="mt-1 max-w-3xl text-xs text-slate-400">
                  Velg én eller flere merkevarer under, og bruk en rolleprofil som utgangspunkt. RealtyFlow fyller bare inn tillatte brand-rettigheter; du kan finjustere alt før lagring.
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-right text-[11px] text-slate-400">
                <strong className="block text-sm text-slate-200">{enabledBrandCount} merkevarer · {selectedPermissionCount} rettigheter</strong>
                Ingenting lagres før du trykker «Lagre bruker og tilgang».
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {WORKSPACE_ACCESS_PRESETS.map(preset => <button key={preset.id} type="button"
                onClick={() => applyAccessPreset(preset.id)}
                aria-pressed={selectedPresetId === preset.id}
                className={`rounded-xl border p-3 text-left transition ${selectedPresetId === preset.id
                  ? "border-cyan-500 bg-cyan-950/30"
                  : "border-slate-700 bg-slate-950/30 hover:border-cyan-700"}`}>
                <span className="flex items-center justify-between gap-2">
                  <strong className="text-sm text-cyan-100">{preset.label}</strong>
                  {preset.id === "partner" && <span className="rounded-full border border-violet-700 px-2 py-0.5 text-[10px] font-semibold text-violet-300">bred operativ</span>}
                </span>
                <span className="mt-1 block text-[11px] leading-5 text-slate-400">{preset.description}</span>
              </button>)}
            </div>
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-[11px] text-slate-400">
              <strong className="text-slate-200">Sikkerhetsgrense:</strong> Rolleprofiler kan aldri gi owner/admin, runtime, autonomy eller globale Nexus-kontroller. «Samarbeidspartner» er ment for en betrodd operativ partner; «Eksternt byrå» er tryggere når personen bare skal produsere utkast.
            </div>
          </div>
          <div className="space-y-3">
            {snapshot?.brands.map(brand => {
              const choice = choices[brand.brandKey] || emptyChoice();
              const isZen = brand.brandKey === "zeneco";
              const supportsReels = isZen || brand.brandKey === "pinosoecolife";
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
                      onChange={e => updateChoice(brand.brandKey, { crmWrite: e.target.checked })}/>
                      {isZen ? "Redigere kontaktdata på godkjente felleskunder" : "Opprette og redigere leads"}
                    </label>
                    {isZen && <p className="mt-2 text-[11px] text-slate-500">Zen workspace oppretter ikke nye CRM-kontakter og åpner ikke eldre/private Zen-kunder.</p>}
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
                      onChange={e => updateChoice(brand.brandKey, { marketingRead: e.target.checked, ...(e.target.checked ? {} : { marketingDraft: false, marketingPublish: false }) })}/> Se markedsoversikt og innhold</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.marketingDraft}
                      onChange={e => updateChoice(brand.brandKey, { marketingDraft: e.target.checked, ...(e.target.checked ? {} : { marketingPublish: false }) })}/> Lage innholdsutkast</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.marketingPublish}
                      onChange={e => updateChoice(brand.brandKey, { marketingPublish: e.target.checked })}/> Publisere til Facebook / Instagram</label>
                    <p className="mt-2 text-[11px] text-slate-500">Publisering krever eksakt aktiv brand-kanal og serverkontroll rett før utsending.</p>
                  </div>
                  {supportsReels && <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/10 p-3">
                    <strong className="text-sm">Reels Studio</strong>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.reelsRead}
                      onChange={e => updateChoice(brand.brandKey, { reelsRead: e.target.checked, ...(e.target.checked ? {} : { reelsCreate: false, reelsPublish: false }) })}/> Se Reels og forhåndsvisning</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.reelsCreate}
                      onChange={e => updateChoice(brand.brandKey, { reelsCreate: e.target.checked, ...(e.target.checked ? {} : { reelsPublish: false }) })}/> Lage Reels med Re-Master-motoren</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.reelsPublish}
                      onChange={e => updateChoice(brand.brandKey, { reelsPublish: e.target.checked })}/> Publisere Reel til Facebook / Instagram</label>
                    <p className="mt-2 text-[11px] text-slate-500">Re-Master gjør rendering i bakgrunnen. Brukeren ser bare denne merkevaren og dens verifiserte kanaler.</p>
                  </div>}
                  {isZen && <div className="rounded-lg border border-red-900/60 bg-red-950/10 p-3">
                    <strong className="text-sm">YouTube Studio</strong>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.youtubeRead}
                      onChange={e => updateChoice(brand.brandKey, { youtubeRead: e.target.checked, ...(e.target.checked ? {} : { youtubePublish: false }) })}/> Se Zen-kanal, videoer og klare Shorts</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.youtubePublish}
                      onChange={e => updateChoice(brand.brandKey, { youtubePublish: e.target.checked })}/> Publisere ferdig forhåndsvist Reel som YouTube Short</label>
                    <p className="mt-2 text-[11px] text-slate-500">Fase 1 er kun Zen Eco Homes. Publisering krever eksakt verifisert Zen-kanal og en ferdig Reel fra samme workspace.</p>
                  </div>}
                  <div className="rounded-lg border border-violet-900/60 bg-violet-950/10 p-3">
                    <strong className="text-sm">Nexus OS · innsikt</strong>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.nexusRead}
                      onChange={e => updateChoice(brand.brandKey, { nexusRead: e.target.checked })}/> Se hva Nexus lærer og hva som trenger oppmerksomhet</label>
                    <p className="mt-2 text-[11px] text-slate-500">Kun brand-avgrenset read-only innsikt. Ingen runtime, autonomy, canary, globale regler eller agentiske handlinger.</p>
                  </div>
                  {isZen && <div className="rounded-lg border border-slate-800 p-3">
                    <strong className="text-sm">Corporate Homes</strong>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.corporateRead}
                      onChange={e => updateChoice(brand.brandKey, { corporateRead: e.target.checked, ...(e.target.checked ? {} : { corporatePlan: false }) })}/> Se bedrifter og partnerprospekter</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.corporatePlan}
                      onChange={e => updateChoice(brand.brandKey, { corporatePlan: e.target.checked })}/> Research og planlegge neste steg</label>
                  </div>}
                  <div className="rounded-lg border border-slate-800 p-3">
                    <strong className="text-sm">SEO · GEO · AEO</strong>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.visibilityRead}
                      onChange={e => updateChoice(brand.brandKey, { visibilityRead: e.target.checked, ...(e.target.checked ? {} : { visibilityPlan: false }) })}/> Se synlighet og SEO-oppgaver</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.visibilityPlan}
                      onChange={e => updateChoice(brand.brandKey, { visibilityPlan: e.target.checked })}/> Lage SEO/GEO/AEO, søkeord- og tekstoppgaver</label>
                  </div>
                  <div className="rounded-lg border border-slate-800 p-3">
                    <strong className="text-sm">Annonser</strong>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.adsRead}
                      onChange={e => updateChoice(brand.brandKey, { adsRead: e.target.checked, ...(e.target.checked ? {} : { adsDraft: false }) })}/> Se kampanjer</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.adsDraft}
                      onChange={e => updateChoice(brand.brandKey, { adsDraft: e.target.checked })}/> Lage annonsebrief og utkast</label>
                    <p className="mt-2 text-[11px] text-slate-500">Ingen annonsebruk eller publisering kan startes her.</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 p-3">
                    <strong className="text-sm">Video & informasjonsmøter</strong>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.eventsPlan}
                      onChange={e => updateChoice(brand.brandKey, { eventsPlan: e.target.checked })}/> Planlegge videoer, webinarer og informasjonsmøter</label>
                    <p className="mt-2 text-[11px] text-slate-500">Oppretter arbeidsoppgaver, ikke invitasjoner eller utsendinger.</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 p-3">
                    <strong className="text-sm">Nettside & innhold</strong>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.contentRead}
                      onChange={e => updateChoice(brand.brandKey, { contentRead: e.target.checked, ...(e.target.checked ? {} : { contentEdit: false, contentPublish: false }) })}/> Se artikler og guider</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.contentEdit}
                      onChange={e => updateChoice(brand.brandKey, { contentEdit: e.target.checked, ...(e.target.checked ? {} : { contentPublish: false }) })}/> Lage og redigere</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.contentPublish}
                      onChange={e => updateChoice(brand.brandKey, { contentPublish: e.target.checked })}/> Publisere til nettsiden</label>
                    <p className="mt-2 text-[11px] text-slate-500">Publisering er brand-låst og lagrer versjon for rollback.</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 p-3">
                    <strong className="text-sm">E-post / Reach</strong>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.emailRead}
                      onChange={e => updateChoice(brand.brandKey, { emailRead: e.target.checked, ...(e.target.checked ? {} : { emailDraft: false, emailSend: false }) })}/> Se godkjente mottakere og egne utkast</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.emailDraft}
                      onChange={e => updateChoice(brand.brandKey, { emailDraft: e.target.checked, ...(e.target.checked ? {} : { emailSend: false }) })}/> Lage e-post og Reach-kampanjeutkast</label>
                    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={choice.emailSend}
                      onChange={e => updateChoice(brand.brandKey, { emailSend: e.target.checked })}/> Sende én-til-én fra merkevarens e-postkonto</label>
                    <p className="mt-2 text-[11px] text-slate-500">Bare brand-godkjente leads/Corporate-kanaler. Avmelding og suppression kontrolleres før sending. Reach-abonnement opprettes ikke automatisk.</p>
                  </div>
                  <div className="rounded-lg border border-amber-900/60 bg-amber-950/10 p-3 md:col-span-3">
                    <strong className="text-sm">Personlig ansvar i denne merkevaren</strong>
                    <p className="mt-1 text-[11px] text-slate-500">Ansvar styrer prioritering på «I dag». Det gir aldri flere rettigheter enn modulene over.</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {WORKSPACE_RESPONSIBILITIES.filter(item =>
                        responsibilityAllowed(brand.brandKey, item.id, permissionsForChoice(brand.brandKey, choice))
                      ).map(item => <label key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/45 p-3 text-xs">
                        <span className="flex items-start gap-2">
                          <input type="checkbox" className="mt-0.5"
                            checked={choice.responsibilities.includes(item.id)}
                            onChange={e => updateChoice(brand.brandKey, {
                              responsibilities: e.target.checked
                                ? Array.from(new Set([...choice.responsibilities, item.id]))
                                : choice.responsibilities.filter(value => value !== item.id),
                            })}/>
                          <span><strong className="block text-slate-200">{item.label}</strong><span className="mt-1 block leading-5 text-slate-500">{item.description}</span></span>
                        </span>
                      </label>)}
                    </div>
                  </div>
                </div>}
              </article>;
            })}
          </div>
        </section>

        {plannedPrograms.length > 0 && <section className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
          <h3 className="font-semibold">Flere RealtyFlow-programmer</h3>
          <p className="mt-1 text-xs text-slate-400">Disse ligger i samme tilgangsmodell, men kan ikke gis til medarbeidere før hver modul har egen merkevare- og datasperre.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {plannedPrograms.map(program => <span key={program.id}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-500">
              {program.label} · planlagt
            </span>)}
          </div>
        </section>}

        <div className="flex flex-wrap gap-3">
          <button onClick={() => void submitUser()} disabled={busy}
            className="rounded-xl bg-cyan-600 px-5 py-3 font-semibold text-white disabled:opacity-50">
            {busy ? "Lagrer…" : selectedUser ? "Lagre bruker og tilgang" : "Opprett og send invitasjon"}
          </button>
          {selectedUser && password && <button onClick={() => void resetPassword()} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-5 py-3 font-semibold disabled:opacity-50">
            <KeyRound size={16}/> Sett nytt passord
          </button>}
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <LockKeyhole size={14}/> Nye brukere setter passordet selv via Supabase Auth. RealtyFlow lagrer aldri passord i tabeller eller revisjonslogger.
          </p>
        </div>
      </main>
    </div>
  </div>;
}
