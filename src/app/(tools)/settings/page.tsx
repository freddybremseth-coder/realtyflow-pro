"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SocialChannelsTab } from "@/components/settings/social-channels-tab";
import { BRANDS } from "@/lib/constants";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Image,
  Key,
  Loader2,
  Mail,
  Music,
  Plus,
  Save,
  Settings,
  Shield,
  Wifi,
} from "lucide-react";

interface Setting {
  key: string;
  value: string;
  category: string;
  description: string;
  is_secret: boolean;
}

interface EmailConfig {
  id?: string;
  brand_id: string;
  email_address: string;
  display_name: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  auto_fetch: boolean;
  fetch_interval_minutes: number;
  ai_auto_draft: boolean;
  signature: string;
  is_active: boolean;
  last_fetched_at?: string;
  password?: string;
}

type SettingsTab = "api-noklar" | "sosiale-medier" | "e-post" | "bilete";

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "api-noklar", label: "🔑 API-nøklar" },
  { id: "sosiale-medier", label: "🔗 Kanaler & sosiale medier" },
  { id: "e-post", label: "📧 E-post" },
  { id: "bilete", label: "🖼️ Bilete" },
];

const HOSTINGER_DEFAULTS = {
  imap_host: "imap.hostinger.com",
  imap_port: 993,
  imap_secure: true,
  smtp_host: "smtp.hostinger.com",
  smtp_port: 465,
  smtp_secure: true,
};

const EMAIL_ACCOUNTS_PRESET: Omit<EmailConfig, "id">[] = [
  { brand_id: "pinosoecolife", email_address: "freddy@pinosoecolife.com", display_name: "Freddy - Pinoso Ecolife", ...HOSTINGER_DEFAULTS, auto_fetch: true, fetch_interval_minutes: 5, ai_auto_draft: true, signature: "", is_active: true },
  { brand_id: "pinosoecolife", email_address: "post@pinosoecolife.com", display_name: "Pinoso Ecolife", ...HOSTINGER_DEFAULTS, auto_fetch: true, fetch_interval_minutes: 5, ai_auto_draft: true, signature: "", is_active: true },
  { brand_id: "zeneco", email_address: "freddy@zenecohomes.com", display_name: "Freddy - Zen Eco Homes", ...HOSTINGER_DEFAULTS, auto_fetch: true, fetch_interval_minutes: 5, ai_auto_draft: true, signature: "", is_active: true },
  { brand_id: "chatgenius", email_address: "freddy@chatgenius.pro", display_name: "Freddy - ChatGenius", ...HOSTINGER_DEFAULTS, auto_fetch: true, fetch_interval_minutes: 5, ai_auto_draft: true, signature: "", is_active: true },
  { brand_id: "freddyb", email_address: "post@freddybremseth.com", display_name: "Freddy Bremseth", ...HOSTINGER_DEFAULTS, auto_fetch: true, fetch_interval_minutes: 5, ai_auto_draft: true, signature: "", is_active: true },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("api-noklar");
  const [settings, setSettings] = useState<Setting[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const [emailConfigs, setEmailConfigs] = useState<EmailConfig[]>([]);
  const [emailPasswords, setEmailPasswords] = useState<Record<string, string>>({});
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<Record<string, { success: boolean; message: string }>>({});
  const [newEmailForm, setNewEmailForm] = useState({ brand_id: "zeneco", email_address: "", display_name: "" });
  const [showNewEmail, setShowNewEmail] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tab");
    if (requested === "youtube") {
      setTab("sosiale-medier");
      return;
    }
    if (requested && SETTINGS_TABS.some((candidate) => candidate.id === requested)) {
      setTab(requested as SettingsTab);
      return;
    }
    if (params.has("oauth_success") || params.has("oauth_error") || params.has("oauth_orphaned")) {
      setTab("sosiale-medier");
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/email/config").then((r) => r.json()).catch(() => ({ configs: [] })),
      fetch("/api/brands/settings").then((r) => r.json()).catch(() => ({ settings: {} })),
    ])
      .then(([settingsResponse, emailResponse, brandSettings]) => {
        setSettings(settingsResponse.settings ?? []);

        const stored = (emailResponse.configs ?? []) as EmailConfig[];
        const knownEmails = new Set(stored.map((cfg) => cfg.email_address));
        const brandEmails: Omit<EmailConfig, "id">[] = [];
        const allBrandSettings = brandSettings.settings || {};

        for (const [brandId, rawData] of Object.entries(allBrandSettings)) {
          const data = rawData as Record<string, unknown>;
          if (typeof data.email === "string" && data.email && !knownEmails.has(data.email)) {
            brandEmails.push({
              brand_id: brandId,
              email_address: data.email,
              display_name: `${(data.custom_name as string) || brandId}`,
              ...HOSTINGER_DEFAULTS,
              auto_fetch: true,
              fetch_interval_minutes: 5,
              ai_auto_draft: true,
              signature: "",
              is_active: true,
            });
            knownEmails.add(data.email);
          }

          if (Array.isArray(data.emails)) {
            for (const email of data.emails as string[]) {
              if (!email || knownEmails.has(email)) continue;
              brandEmails.push({
                brand_id: brandId,
                email_address: email,
                display_name: `${(data.custom_name as string) || brandId}`,
                ...HOSTINGER_DEFAULTS,
                auto_fetch: true,
                fetch_interval_minutes: 5,
                ai_auto_draft: true,
                signature: "",
                is_active: true,
              });
              knownEmails.add(email);
            }
          }
        }

        setEmailConfigs([
          ...stored,
          ...EMAIL_ACCOUNTS_PRESET.filter((preset) => !knownEmails.has(preset.email_address)),
          ...brandEmails,
        ]);
      })
      .catch(() => setError("Klarte ikkje laste innstillingar"))
      .finally(() => setLoading(false));
  }, []);

  const getVal = (key: string) => settings.find((setting) => setting.key === key)?.value ?? "";

  const setVal = (key: string, value: string) => {
    setSettings((previous) =>
      previous.some((setting) => setting.key === key)
        ? previous.map((setting) => (setting.key === key ? { ...setting, value } : setting))
        : [...previous, { key, value, category: "general", description: "", is_secret: false }],
    );
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!response.ok) throw new Error("Lagring feilet");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Feil");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Settings className="text-slate-400" size={28} />
            Innstillingar
          </h1>
          <p className="text-sm text-slate-400 mt-1">API-nøklar, kanalar og kontokonfigurasjon</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-400">
              <CheckCircle2 size={16} /> Lagra!
            </span>
          )}
          <Button onClick={saveSettings} disabled={saving}>
            {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
            Lagre
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="flex gap-1 p-1 rounded-xl bg-slate-800/50 border border-slate-700/50 w-fit">
        {SETTINGS_TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 text-sm rounded-lg transition-all ${
              tab === item.id
                ? "bg-primary-500/20 text-primary-300 border border-primary-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "api-noklar" && (
        <div className="grid grid-cols-1 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Key size={16} className="text-amber-400" /> Anthropic (AI-generering)
              </CardTitle>
              <CardDescription>Brukast for all AI-generering i appen. Finn den på console.anthropic.com</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  type={showSecrets.anthropic ? "text" : "password"}
                  placeholder="sk-ant-..."
                  value={getVal("anthropic_api_key")}
                  onChange={(event) => setVal("anthropic_api_key", event.target.value)}
                  className="font-mono text-sm"
                />
                <Button variant="ghost" size="sm" onClick={() => setShowSecrets((previous) => ({ ...previous, anthropic: !previous.anthropic }))}>
                  {showSecrets.anthropic ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe size={16} className="text-emerald-400" /> Supabase (Database)
              </CardTitle>
              <CardDescription>Finn i Supabase Dashboard → Settings → API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Project URL</label>
                <Input
                  placeholder="https://xxxx.supabase.co"
                  value={getVal("supabase_url")}
                  onChange={(event) => setVal("supabase_url", event.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Anon Key</label>
                <div className="flex gap-2">
                  <Input
                    type={showSecrets.supabase ? "text" : "password"}
                    placeholder="eyJhbGc..."
                    value={getVal("supabase_anon_key")}
                    onChange={(event) => setVal("supabase_anon_key", event.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button variant="ghost" size="sm" onClick={() => setShowSecrets((previous) => ({ ...previous, supabase: !previous.supabase }))}>
                    {showSecrets.supabase ? <EyeOff size={16} /> : <Eye size={16} />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Music size={16} className="text-pink-400" /> Airtable (Neural Beat sanger)
              </CardTitle>
              <CardDescription>Brukast av Neural Beat for å hente sanger. Finn på airtable.com/account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">API Key</label>
                <div className="flex gap-2">
                  <Input
                    type={showSecrets.airtable ? "text" : "password"}
                    placeholder="pat..."
                    value={getVal("airtable_api_key")}
                    onChange={(event) => setVal("airtable_api_key", event.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button variant="ghost" size="sm" onClick={() => setShowSecrets((previous) => ({ ...previous, airtable: !previous.airtable }))}>
                    {showSecrets.airtable ? <EyeOff size={16} /> : <Eye size={16} />}
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Base ID</label>
                <Input
                  placeholder="app..."
                  value={getVal("airtable_base_id")}
                  onChange={(event) => setVal("airtable_base_id", event.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-slate-500 px-1">
            ⚠️ Desse verdiane lagrast i Supabase-databasen. For produksjon anbefalt å legge dei inn som Vercel Environment Variables i staden.
          </p>
        </div>
      )}

      {tab === "sosiale-medier" && <SocialChannelsTab />}

      {tab === "e-post" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail size={16} className="text-cyan-400" /> E-postkontoer (Hostinger IMAP/SMTP)
              </CardTitle>
              <CardDescription>
                Legg inn passord for kvar konto for å aktivere Elena AI e-postagenten. Passord krypterast med AES-256-GCM.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {emailConfigs.map((cfg, idx) => (
                <div key={cfg.email_address} className="p-4 rounded-lg border border-slate-700 bg-slate-900/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cfg.id ? "bg-emerald-500/20" : "bg-slate-700"}`}>
                        <Mail size={18} className={cfg.id ? "text-emerald-400" : "text-slate-400"} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{cfg.email_address}</p>
                        <p className="text-xs text-slate-400">{cfg.display_name} ({cfg.brand_id})</p>
                      </div>
                    </div>
                    {cfg.id ? (
                      <Badge className="text-xs bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                        <Shield size={10} className="mr-1" /> Konfigurert
                      </Badge>
                    ) : (
                      <Badge className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/30">Trenger passord</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
                    <div className="flex items-center gap-1"><Wifi size={12} /> IMAP: {cfg.imap_host}:{cfg.imap_port} (SSL)</div>
                    <div className="flex items-center gap-1"><Wifi size={12} /> SMTP: {cfg.smtp_host}:{cfg.smtp_port} (SSL)</div>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder={cfg.id ? "Nytt passord (la stå tomt for å beholde)" : "Skriv inn e-postpassord"}
                      value={emailPasswords[cfg.email_address] || ""}
                      onChange={(event) => setEmailPasswords((previous) => ({ ...previous, [cfg.email_address]: event.target.value }))}
                      className="font-mono text-sm"
                    />
                    <Button
                      size="sm"
                      disabled={savingEmail === cfg.email_address || (!emailPasswords[cfg.email_address] && !cfg.id)}
                      onClick={async () => {
                        setSavingEmail(cfg.email_address);
                        setEmailStatus((previous) => ({ ...previous, [cfg.email_address]: { success: false, message: "" } }));
                        try {
                          const body = {
                            ...(cfg.id ? { id: cfg.id } : {}),
                            brand_id: cfg.brand_id,
                            email_address: cfg.email_address,
                            display_name: cfg.display_name,
                            imap_host: cfg.imap_host,
                            imap_port: cfg.imap_port,
                            imap_secure: cfg.imap_secure,
                            smtp_host: cfg.smtp_host,
                            smtp_port: cfg.smtp_port,
                            smtp_secure: cfg.smtp_secure,
                            auto_fetch: cfg.auto_fetch,
                            fetch_interval_minutes: cfg.fetch_interval_minutes,
                            ai_auto_draft: cfg.ai_auto_draft,
                            signature: cfg.signature,
                            ...(emailPasswords[cfg.email_address] ? { password: emailPasswords[cfg.email_address] } : {}),
                          };
                          const response = await fetch("/api/email/config", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(body),
                          });
                          const data = await response.json();
                          if (data.success) {
                            setEmailConfigs((previous) => previous.map((entry, entryIndex) => entryIndex === idx ? { ...entry, id: data.config.id } : entry));
                            setEmailPasswords((previous) => ({ ...previous, [cfg.email_address]: "" }));
                            setEmailStatus((previous) => ({ ...previous, [cfg.email_address]: { success: true, message: "Lagret og kryptert!" } }));
                          } else {
                            setEmailStatus((previous) => ({ ...previous, [cfg.email_address]: { success: false, message: data.error || "Feil" } }));
                          }
                        } catch {
                          setEmailStatus((previous) => ({ ...previous, [cfg.email_address]: { success: false, message: "Nettverksfeil" } }));
                        } finally {
                          setSavingEmail(null);
                        }
                      }}
                    >
                      {savingEmail === cfg.email_address ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      <span className="ml-1.5">{cfg.id ? "Oppdater" : "Aktiver"}</span>
                    </Button>
                  </div>

                  {emailStatus[cfg.email_address]?.message && (
                    <p className={`text-xs ${emailStatus[cfg.email_address].success ? "text-emerald-400" : "text-red-400"}`}>
                      {emailStatus[cfg.email_address].success ? <CheckCircle2 size={12} className="inline mr-1" /> : <AlertCircle size={12} className="inline mr-1" />}
                      {emailStatus[cfg.email_address].message}
                    </p>
                  )}
                </div>
              ))}

              {showNewEmail ? (
                <div className="p-4 rounded-lg border border-primary-500/30 bg-primary-500/5 space-y-3">
                  <p className="text-sm font-medium text-white">Legg til ny e-postkonto</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 block">Brand</label>
                      <select
                        value={newEmailForm.brand_id}
                        onChange={(event) => setNewEmailForm((previous) => ({ ...previous, brand_id: event.target.value }))}
                        className="w-full h-9 rounded-lg border border-slate-600 bg-slate-800 px-2 text-sm text-slate-100"
                      >
                        {BRANDS.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 block">E-postadresse</label>
                      <Input
                        value={newEmailForm.email_address}
                        onChange={(event) => setNewEmailForm((previous) => ({ ...previous, email_address: event.target.value }))}
                        placeholder="post@eksempel.com"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 block">Visningsnavn</label>
                      <Input
                        value={newEmailForm.display_name}
                        onChange={(event) => setNewEmailForm((previous) => ({ ...previous, display_name: event.target.value }))}
                        placeholder="Freddy - Brand"
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!newEmailForm.email_address}
                      onClick={() => {
                        if (emailConfigs.some((cfg) => cfg.email_address === newEmailForm.email_address)) return;
                        setEmailConfigs((previous) => [
                          ...previous,
                          {
                            brand_id: newEmailForm.brand_id,
                            email_address: newEmailForm.email_address,
                            display_name: newEmailForm.display_name || newEmailForm.brand_id,
                            ...HOSTINGER_DEFAULTS,
                            auto_fetch: true,
                            fetch_interval_minutes: 5,
                            ai_auto_draft: true,
                            signature: "",
                            is_active: true,
                          },
                        ]);
                        setNewEmailForm({ brand_id: "zeneco", email_address: "", display_name: "" });
                        setShowNewEmail(false);
                      }}
                    >
                      <Plus size={14} className="mr-1" /> Legg til
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowNewEmail(false)}>Avbryt</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" className="w-full border-dashed" onClick={() => setShowNewEmail(true)}>
                  <Plus size={14} className="mr-1.5" /> Legg til ny e-postkonto
                </Button>
              )}

              <div className="p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                <p className="text-sm text-cyan-300 font-medium mb-2">Slik fungerer e-postsystemet:</p>
                <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
                  <li>Passord krypteres med AES-256-GCM og lagres trygt i Supabase</li>
                  <li>Elena AI kobler til IMAP og henter nye e-poster automatisk</li>
                  <li>AI analyserer innhold, sentiment, og urgency</li>
                  <li>Utkast til svar genereres automatisk som du kan godkjenne</li>
                  <li>Kontakter kobles automatisk til CRM-leads og kunder</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "bilete" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Image size={16} className="text-purple-400" /> Bildemappe-struktur i Supabase Storage
              </CardTitle>
              <CardDescription>Desse mappene brukast til å gjenbruke bilete i AI-generering og spara kostnadar.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { folder: "neural-beat/genre/", desc: "Bilete per musikk-sjanger (techno, house, ambient, pop, hiphop)", color: "text-pink-400" },
                  { folder: "neural-beat/mood/", desc: "Stemningsbilde (energetic, calm, dark, happy)", color: "text-pink-400" },
                  { folder: "neural-beat/backgrounds/", desc: "Generelle bakgrunnar til musikkvideo", color: "text-pink-400" },
                  { folder: "brands/soleada/", desc: "Merkevarebilete for Soleada Villas", color: "text-amber-400" },
                  { folder: "brands/zen-eco/", desc: "Merkevarebilete for Zen Eco Homes", color: "text-emerald-400" },
                  { folder: "brands/dona-anna/", desc: "Merkevarebilete for Dona Anna", color: "text-rose-400" },
                  { folder: "brands/freddy-bremseth/", desc: "Personleg merkevareprofil", color: "text-purple-400" },
                  { folder: "properties/", desc: "Eigedomsbilete (villaer, leilegheiter, land)", color: "text-blue-400" },
                  { folder: "content/lifestyle/", desc: "Livsstilsbilete for innhaldsgenerering", color: "text-sky-400" },
                  { folder: "content/nature/", desc: "Naturbilde (middelhavslandskap, strand, fjell)", color: "text-emerald-400" },
                ].map((item) => (
                  <div key={item.folder} className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
                    <Image size={16} className={`mt-0.5 shrink-0 ${item.color}`} />
                    <div>
                      <p className="text-sm font-mono text-slate-200">assets/{item.folder}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-amber-300 font-medium mb-2">📋 Korleis setje opp bildebiblioteket:</p>
                <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
                  <li>Gå til Supabase Dashboard → Storage</li>
                  <li>Opprett ein ny bucket kalla <code className="text-amber-300">"assets"</code> (sett til Public)</li>
                  <li>Last opp bilete i mappene ovanfor (drag & drop fungerer)</li>
                  <li>Neural Beat vil automatisk velje eit tilfeldig bilete frå riktig sjanger-mappe</li>
                  <li>Content Studio kan bruke brands/-mappa for merkevarebilete utan å lage nye</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
