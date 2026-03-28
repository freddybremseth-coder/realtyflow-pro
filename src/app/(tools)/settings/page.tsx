"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Key, Youtube, Instagram, Facebook, Linkedin, Twitter,
  Music, Plus, Trash2, CheckCircle2, Eye, EyeOff, Save,
  Settings, Loader2, AlertCircle, RefreshCw, Image, Globe,
  Mail, Shield, Wifi,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────
interface Setting { key: string; value: string; category: string; description: string; is_secret: boolean; }
interface YoutubeChannel { id: string; name: string; handle: string; channel_id: string; api_key: string; brand: string; content_types: string[]; is_active: boolean; }
interface SocialAccount { id: string; platform: string; account_name: string; account_id: string; access_token: string; brand: string; is_active: boolean; }

const BRANDS = ["soleada", "zen-eco", "chatgenius", "dona-anna", "freddy-bremseth", "neural-beat"];
const PLATFORMS = [
  { id: "facebook",  label: "Facebook",  icon: Facebook,  color: "text-blue-400" },
  { id: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-400" },
  { id: "linkedin",  label: "LinkedIn",  icon: Linkedin,  color: "text-sky-400" },
  { id: "twitter",   label: "Twitter/X", icon: Twitter,   color: "text-slate-300" },
];
const TABS = ["api-noklar", "youtube", "sosiale-medier", "e-post", "bilete"];

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

const HOSTINGER_DEFAULTS = {
  imap_host: "imap.hostinger.com",
  imap_port: 993,
  imap_secure: true,
  smtp_host: "smtp.hostinger.com",
  smtp_port: 465,
  smtp_secure: true,
};

const EMAIL_ACCOUNTS_PRESET: Omit<EmailConfig, 'id'>[] = [
  { brand_id: "pinosoecolife", email_address: "freddy@pinosoecolife.com", display_name: "Freddy - Pinosos Ecolife", ...HOSTINGER_DEFAULTS, auto_fetch: true, fetch_interval_minutes: 5, ai_auto_draft: true, signature: "", is_active: true },
  { brand_id: "pinosoecolife", email_address: "post@pinosoecolife.com", display_name: "Pinosos Ecolife", ...HOSTINGER_DEFAULTS, auto_fetch: true, fetch_interval_minutes: 5, ai_auto_draft: true, signature: "", is_active: true },
  { brand_id: "zeneco", email_address: "freddy@zenecohomes.com", display_name: "Freddy - Zen Eco Homes", ...HOSTINGER_DEFAULTS, auto_fetch: true, fetch_interval_minutes: 5, ai_auto_draft: true, signature: "", is_active: true },
  { brand_id: "chatgenius", email_address: "freddy@chatgenius.pro", display_name: "Freddy - ChatGenius", ...HOSTINGER_DEFAULTS, auto_fetch: true, fetch_interval_minutes: 5, ai_auto_draft: true, signature: "", is_active: true },
  { brand_id: "freddyb", email_address: "post@freddybremseth.com", display_name: "Freddy Bremseth", ...HOSTINGER_DEFAULTS, auto_fetch: true, fetch_interval_minutes: 5, ai_auto_draft: true, signature: "", is_active: true },
];
function maskSecret(val: string) { if (!val) return ""; return val.substring(0, 6) + "•".repeat(Math.max(0, val.length - 6)); }
export default function SettingsPage() {
  const [tab, setTab] = useState("api-noklar");
  const [settings, setSettings] = useState<Setting[]>([]);
  const [channels, setChannels] = useState<YoutubeChannel[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [newChannel, setNewChannel] = useState({ name: "", handle: "", channel_id: "", api_key: "", brand: "soleada", content_types: [] as string[] });
  const [newAccount, setNewAccount] = useState({ platform: "instagram", account_name: "", account_id: "", access_token: "", brand: "soleada" });
  const [fetchingPages, setFetchingPages] = useState(false);
  const [fetchPagesResult, setFetchPagesResult] = useState<{ success: boolean; message: string } | null>(null);

  // Email config state
  const [emailConfigs, setEmailConfigs] = useState<EmailConfig[]>([]);
  const [emailPasswords, setEmailPasswords] = useState<Record<string, string>>({});
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<Record<string, { success: boolean; message: string }>>({});
  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then(r => r.json()),
      fetch("/api/youtube-channels").then(r => r.json()),
      fetch("/api/social-accounts").then(r => r.json()),
      fetch("/api/email/config").then(r => r.json()).catch(() => ({ configs: [] })),
    ]).then(([s, c, a, e]) => {
      setSettings(s.settings ?? []);
      setChannels(c.channels ?? []);
      setAccounts(a.accounts ?? []);
      // Merge saved configs with presets
      const saved = (e.configs ?? []) as EmailConfig[];
      const savedEmails = new Set(saved.map((cfg: EmailConfig) => cfg.email_address));
      const merged = [
        ...saved,
        ...EMAIL_ACCOUNTS_PRESET.filter(p => !savedEmails.has(p.email_address)),
      ];
      setEmailConfigs(merged);
    }).catch(() => setError("Klarte ikkje laste innstillingar")).finally(() => setLoading(false));
  }, []);
  const getVal = (key: string) => settings.find(s => s.key === key)?.value ?? "";
  const setVal = (key: string, value: string) => {
    setSettings(prev => prev.some(s => s.key === key)
      ? prev.map(s => s.key === key ? { ...s, value } : s)
      : [...prev, { key, value, category: "general", description: "", is_secret: false }]);
  };
  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }) });
      if (!res.ok) throw new Error("Lagring feilet");
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : "Feil"); } finally { setSaving(false); }
  };
  const addChannel = async () => {
    if (!newChannel.name) return;
    const res = await fetch("/api/youtube-channels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newChannel) });
    const data = await res.json();
    if (data.channel) { setChannels(prev => [...prev, data.channel]); setNewChannel({ name: "", handle: "", channel_id: "", api_key: "", brand: "soleada", content_types: [] }); }
  };
  const deleteChannel = async (id: string) => { await fetch(`/api/youtube-channels?id=${id}`, { method: "DELETE" }); setChannels(prev => prev.filter(c => c.id !== id)); };
  const addAccount = async () => {
    if (!newAccount.account_name) return;
    const res = await fetch("/api/social-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newAccount) });
    const data = await res.json();
    if (data.account) { setAccounts(prev => [...prev, data.account]); setNewAccount({ platform: "instagram", account_name: "", account_id: "", access_token: "", brand: "soleada" }); }
  };
  const deleteAccount = async (id: string) => { await fetch(`/api/social-accounts?id=${id}`, { method: "DELETE" }); setAccounts(prev => prev.filter(a => a.id !== id)); };
  if (loading) return (<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-slate-400" size={32} /></div>);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Settings className="text-slate-400" size={28} />Innstillingar</h1>
          <p className="text-sm text-slate-400 mt-1">API-nøklar, kanalar og kontokonfigurasjon</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (<span className="flex items-center gap-1.5 text-sm text-emerald-400"><CheckCircle2 size={16} /> Lagra!</span>)}
          <Button onClick={saveSettings} disabled={saving}>{saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}Lagre</Button>
        </div>
      </div>
      {error && (<div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm"><AlertCircle size={16} /> {error}</div>)}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-800/50 border border-slate-700/50 w-fit">
        {[{id:"api-noklar",label:"🔑 API-nøklar"},{id:"youtube",label:"📺 YouTube"},{id:"sosiale-medier",label:"📱 Sosiale medier"},{id:"e-post",label:"📧 E-post"},{id:"bilete",label:"🖼️ Bilete"}].map(t => (<button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm rounded-lg transition-all ${tab===t.id?"bg-primary-500/20 text-primary-300 border border-primary-500/30":"text-slate-400 hover:text-slate-200"}`}>{t.label}</button>))}
      </div>      {tab==="api-noklar" && (<div className="grid grid-cols-1 gap-4"><Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Key size={16} className="text-amber-400" /> Anthropic (AI-generering)</CardTitle><CardDescription>Brukast for all AI-generering i appen. Finn den på console.anthropic.com</CardDescription></CardHeader><CardContent><div className="flex gap-2"><Input type={showSecrets["anthropic"]?"text":"password"} placeholder="sk-ant-..." value={getVal("anthropic_api_key")} onChange={e=>setVal("anthropic_api_key",e.target.value)} className="font-mono text-sm" /><Button variant="ghost" size="sm" onClick={()=>setShowSecrets(p=>({...p,anthropic:!p.anthropic}))}>{showSecrets["anthropic"]?<EyeOff size={16}/>:<Eye size={16}/>}</Button></div></CardContent></Card><Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Globe size={16} className="text-emerald-400" /> Supabase (Database)</CardTitle><CardDescription>Finn i Supabase Dashboard → Settings → API</CardDescription></CardHeader><CardContent className="space-y-3"><div><label className="text-xs text-slate-400 mb-1 block">Project URL</label><Input placeholder="https://xxxx.supabase.co" value={getVal("supabase_url")} onChange={e=>setVal("supabase_url",e.target.value)} className="font-mono text-sm" /></div><div><label className="text-xs text-slate-400 mb-1 block">Anon Key</label><div className="flex gap-2"><Input type={showSecrets["supabase"]?"text":"password"} placeholder="eyJhbGc..." value={getVal("supabase_anon_key")} onChange={e=>setVal("supabase_anon_key",e.target.value)} className="font-mono text-sm" /><Button variant="ghost" size="sm" onClick={()=>setShowSecrets(p=>({...p,supabase:!p.supabase}))}>{showSecrets["supabase"]?<EyeOff size={16}/>:<Eye size={16}/>}</Button></div></div></CardContent></Card><Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Music size={16} className="text-pink-400" /> Airtable (Neural Beat sanger)</CardTitle><CardDescription>Brukast av Neural Beat for å hente sanger. Finn på airtable.com/account</CardDescription></CardHeader><CardContent className="space-y-3"><div><label className="text-xs text-slate-400 mb-1 block">API Key</label><div className="flex gap-2"><Input type={showSecrets["airtable"]?"text":"password"} placeholder="pat..." value={getVal("airtable_api_key")} onChange={e=>setVal("airtable_api_key",e.target.value)} className="font-mono text-sm" /><Button variant="ghost" size="sm" onClick={()=>setShowSecrets(p=>({...p,airtable:!p.airtable}))}>{showSecrets["airtable"]?<EyeOff size={16}/>:<Eye size={16}/>}</Button></div></div><div><label className="text-xs text-slate-400 mb-1 block">Base ID</label><Input placeholder="app..." value={getVal("airtable_base_id")} onChange={e=>setVal("airtable_base_id",e.target.value)} className="font-mono text-sm" /></div></CardContent></Card><p className="text-xs text-slate-500 px-1">⚠️ Desse verdiane lagrast i Supabase-databasen. For produksjon anbefalt å legge dei inn som Vercel Environment Variables i staden.</p></div>)}
      {tab==="youtube" && (<div className="space-y-4">{channels.map(ch=>(<Card key={ch.id}><CardContent className="p-4"><div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center"><Youtube size={20} className="text-red-400" /></div><div><p className="font-semibold text-white">{ch.name}</p><p className="text-xs text-slate-400">{ch.handle||ch.channel_id||"Ingen kanal-ID"}</p></div></div><div className="flex items-center gap-2"><Badge variant="outline" className="text-xs">{ch.brand}</Badge>{ch.is_active?<Badge className="text-xs bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Aktiv</Badge>:<Badge className="text-xs bg-slate-500/20 text-slate-400 border-slate-600">Inaktiv</Badge>}<Button variant="ghost" size="sm" onClick={()=>deleteChannel(ch.id)}><Trash2 size={14} className="text-red-400" /></Button></div></div>{ch.api_key&&(<div className="mt-3 p-2 rounded bg-slate-900/50 text-xs font-mono text-slate-500">API: {maskSecret(ch.api_key)}</div>)}</CardContent></Card>))}<Card className="border-dashed border-slate-600"><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Plus size={16} className="text-red-400" /> Legg til YouTube-kanal</CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 mb-1 block">Kanalnamn *</label><Input placeholder="t.d. Soleada Villas" value={newChannel.name} onChange={e=>setNewChannel(p=>({...p,name:e.target.value}))} /></div><div><label className="text-xs text-slate-400 mb-1 block">Handle</label><Input placeholder="@soleadavillas" value={newChannel.handle} onChange={e=>setNewChannel(p=>({...p,handle:e.target.value}))} /></div><div><label className="text-xs text-slate-400 mb-1 block">Channel ID</label><Input placeholder="UC..." value={newChannel.channel_id} onChange={e=>setNewChannel(p=>({...p,channel_id:e.target.value}))} /></div><div><label className="text-xs text-slate-400 mb-1 block">Merkevare</label><select value={newChannel.brand} onChange={e=>setNewChannel(p=>({...p,brand:e.target.value}))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">{BRANDS.map(b=><option key={b} value={b}>{b}</option>)}</select></div></div><div><label className="text-xs text-slate-400 mb-1 block">YouTube Data API Key (valfritt)</label><Input type="password" placeholder="AIza..." value={newChannel.api_key} onChange={e=>setNewChannel(p=>({...p,api_key:e.target.value}))} /></div><Button onClick={addChannel} className="w-full"><Plus size={16} className="mr-2" /> Legg til kanal</Button></CardContent></Card></div>)}
      {tab==="sosiale-medier" && (<div className="space-y-4">
        {/* OAuth Connect Section */}
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Shield size={16} className="text-blue-400" /> Koble til via OAuth (anbefalt)</CardTitle>
            <CardDescription>Koble til Facebook, Instagram og LinkedIn automatisk. Velg merkevare og klikk koble til.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-4">
              <label className="text-xs text-slate-400">Merkevare:</label>
              <select value={newAccount.brand} onChange={e=>setNewAccount(p=>({...p,brand:e.target.value}))} className="h-8 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">{BRANDS.map(b=><option key={b} value={b}>{b}</option>)}</select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <a href={`/api/oauth/facebook?brand=${newAccount.brand}`} className="flex items-center gap-3 p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-all">
                <Globe size={24} className="text-blue-400" />
                <div>
                  <p className="text-sm font-medium text-white">Facebook + Instagram</p>
                  <p className="text-xs text-slate-400">Kobler til Pages og Instagram Business</p>
                </div>
              </a>
              <a href={`/api/oauth/linkedin?brand=${newAccount.brand}`} className="flex items-center gap-3 p-3 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 transition-all">
                <Linkedin size={24} className="text-sky-400" />
                <div>
                  <p className="text-sm font-medium text-white">LinkedIn</p>
                  <p className="text-xs text-slate-400">Personlig profil eller bedriftsside</p>
                </div>
              </a>
              <button
                onClick={async () => {
                  setFetchingPages(true);
                  setFetchPagesResult(null);
                  try {
                    const res = await fetch("/api/oauth/facebook/fetch-pages", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ brand: newAccount.brand }),
                    });
                    const data = await res.json();
                    setFetchPagesResult({ success: data.success, message: data.message || data.error || "Ukjent resultat" });
                    if (data.success) {
                      // Refresh accounts list
                      const accRes = await fetch("/api/social-accounts");
                      const accData = await accRes.json();
                      if (accData.accounts) setAccounts(accData.accounts);
                    }
                  } catch {
                    setFetchPagesResult({ success: false, message: "Nettverksfeil" });
                  } finally {
                    setFetchingPages(false);
                  }
                }}
                disabled={fetchingPages}
                className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all text-left"
              >
                {fetchingPages ? <Loader2 size={24} className="text-emerald-400 animate-spin" /> : <RefreshCw size={24} className="text-emerald-400" />}
                <div>
                  <p className="text-sm font-medium text-white">Hent sider</p>
                  <p className="text-xs text-slate-400">Oppdater Pages fra eksisterende token</p>
                </div>
              </button>
            </div>
            {fetchPagesResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${fetchPagesResult.success ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border border-red-500/30 text-red-300"}`}>
                {fetchPagesResult.success ? <CheckCircle2 size={14} className="inline mr-2" /> : <AlertCircle size={14} className="inline mr-2" />}
                {fetchPagesResult.message}
              </div>
            )}
            <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="text-xs text-amber-300 font-medium mb-1">💡 Hvis "Hent sider" ikke finner sidene dine:</p>
              <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                <li>Gå til <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Graph API Explorer</a></li>
                <li>Velg appen din og generer en User Access Token med <code className="text-amber-300">pages_show_list</code>, <code className="text-amber-300">pages_manage_posts</code></li>
                <li>Kjør: <code className="text-amber-300">GET /me/accounts</code> for å finne Page ID og Page Access Token</li>
                <li>Legg inn Page ID og Page Access Token manuelt nedenfor</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Connected accounts */}
        {accounts.map(acc=>{const plat=PLATFORMS.find(p=>p.id===acc.platform);const Icon=plat?.icon??Globe;return(<Card key={acc.id}><CardContent className="p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center"><Icon size={20} className={plat?.color??"text-slate-400"} /></div><div><p className="font-semibold text-white">{acc.account_name}</p><p className="text-xs text-slate-400 capitalize">{acc.platform} • {acc.brand}</p></div></div><div className="flex items-center gap-2">{acc.is_active?<Badge className="text-xs bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Aktiv</Badge>:<Badge className="text-xs bg-slate-500/20 text-slate-400 border-slate-600">Inaktiv</Badge>}<Button variant="ghost" size="sm" onClick={()=>deleteAccount(acc.id)}><Trash2 size={14} className="text-red-400" /></Button></div></div></CardContent></Card>);})}

        {/* Manual add */}
        <Card className="border-dashed border-slate-600"><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Plus size={16} className="text-purple-400" /> Legg til manuelt</CardTitle><CardDescription>Alternativt: lim inn access token manuelt</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 mb-1 block">Plattform</label><select value={newAccount.platform} onChange={e=>setNewAccount(p=>({...p,platform:e.target.value}))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">{PLATFORMS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></div><div><label className="text-xs text-slate-400 mb-1 block">Kontonamn *</label><Input placeholder="t.d. Soleada Villas" value={newAccount.account_name} onChange={e=>setNewAccount(p=>({...p,account_name:e.target.value}))} /></div><div><label className="text-xs text-slate-400 mb-1 block">Account/Page ID</label><Input placeholder="123456789" value={newAccount.account_id} onChange={e=>setNewAccount(p=>({...p,account_id:e.target.value}))} /></div><div><label className="text-xs text-slate-400 mb-1 block">Merkevare</label><select value={newAccount.brand} onChange={e=>setNewAccount(p=>({...p,brand:e.target.value}))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">{BRANDS.map(b=><option key={b} value={b}>{b}</option>)}</select></div></div><div><label className="text-xs text-slate-400 mb-1 block">Access Token</label><Input type="password" placeholder="EAAxxxxxx..." value={newAccount.access_token} onChange={e=>setNewAccount(p=>({...p,access_token:e.target.value}))} /></div><Button onClick={addAccount} className="w-full"><Plus size={16} className="mr-2" /> Legg til konto</Button></CardContent></Card>
      </div>)}
      {tab==="e-post" && (<div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Mail size={16} className="text-cyan-400" /> E-postkontoer (Hostinger IMAP/SMTP)</CardTitle>
            <CardDescription>Legg inn passord for kvar konto for å aktivere Elena AI e-postagenten. Passord krypterast med AES-256-GCM.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {emailConfigs.map((cfg, idx) => (
              <div key={cfg.email_address} className="p-4 rounded-lg border border-slate-700 bg-slate-900/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cfg.id ? 'bg-emerald-500/20' : 'bg-slate-700'}`}>
                      <Mail size={18} className={cfg.id ? 'text-emerald-400' : 'text-slate-400'} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{cfg.email_address}</p>
                      <p className="text-xs text-slate-400">{cfg.display_name} ({cfg.brand_id})</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {cfg.id ? (
                      <Badge className="text-xs bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                        <Shield size={10} className="mr-1" /> Konfigurert
                      </Badge>
                    ) : (
                      <Badge className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/30">
                        Trenger passord
                      </Badge>
                    )}
                  </div>
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
                    onChange={e => setEmailPasswords(p => ({ ...p, [cfg.email_address]: e.target.value }))}
                    className="font-mono text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={savingEmail === cfg.email_address || (!emailPasswords[cfg.email_address] && !cfg.id)}
                    onClick={async () => {
                      setSavingEmail(cfg.email_address);
                      setEmailStatus(p => ({ ...p, [cfg.email_address]: { success: false, message: '' } }));
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
                        const res = await fetch('/api/email/config', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(body),
                        });
                        const data = await res.json();
                        if (data.success) {
                          setEmailConfigs(prev => prev.map((c, i) => i === idx ? { ...c, id: data.config.id } : c));
                          setEmailPasswords(p => ({ ...p, [cfg.email_address]: '' }));
                          setEmailStatus(p => ({ ...p, [cfg.email_address]: { success: true, message: 'Lagret og kryptert!' } }));
                        } else {
                          setEmailStatus(p => ({ ...p, [cfg.email_address]: { success: false, message: data.error || 'Feil' } }));
                        }
                      } catch {
                        setEmailStatus(p => ({ ...p, [cfg.email_address]: { success: false, message: 'Nettverksfeil' } }));
                      } finally {
                        setSavingEmail(null);
                      }
                    }}
                  >
                    {savingEmail === cfg.email_address ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    <span className="ml-1.5">{cfg.id ? 'Oppdater' : 'Aktiver'}</span>
                  </Button>
                </div>

                {emailStatus[cfg.email_address]?.message && (
                  <p className={`text-xs ${emailStatus[cfg.email_address].success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {emailStatus[cfg.email_address].success ? <CheckCircle2 size={12} className="inline mr-1" /> : <AlertCircle size={12} className="inline mr-1" />}
                    {emailStatus[cfg.email_address].message}
                  </p>
                )}
              </div>
            ))}

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
      </div>)}
      {tab==="bilete" && (<div className="space-y-4"><Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Image size={16} className="text-purple-400" /> Bildemappe-struktur i Supabase Storage</CardTitle><CardDescription>Desse mappene brukast til å gjenbruke bilete i AI-generering og spara kostnadar.</CardDescription></CardHeader><CardContent><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[{folder:"neural-beat/genre/",desc:"Bilete per musikk-sjanger (techno, house, ambient, pop, hiphop)",color:"text-pink-400"},{folder:"neural-beat/mood/",desc:"Stemningsbilde (energetic, calm, dark, happy)",color:"text-pink-400"},{folder:"neural-beat/backgrounds/",desc:"Generelle bakgrunnar til musikkvideo",color:"text-pink-400"},{folder:"brands/soleada/",desc:"Merkevarebilete for Soleada Villas",color:"text-amber-400"},{folder:"brands/zen-eco/",desc:"Merkevarebilete for Zen Eco Homes",color:"text-emerald-400"},{folder:"brands/dona-anna/",desc:"Merkevarebilete for Dona Anna",color:"text-rose-400"},{folder:"brands/freddy-bremseth/",desc:"Personleg merkevareprofil",color:"text-purple-400"},{folder:"properties/",desc:"Eigedomsbilete (villaer, leilegheiter, land)",color:"text-blue-400"},{folder:"content/lifestyle/",desc:"Livsstilsbilete for innhaldsgenerering",color:"text-sky-400"},{folder:"content/nature/",desc:"Naturbilde (middelhavslandskap, strand, fjell)",color:"text-emerald-400"}].map(item=>(<div key={item.folder} className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-700/30"><Image size={16} className={`mt-0.5 shrink-0 ${item.color}`} /><div><p className="text-sm font-mono text-slate-200">assets/{item.folder}</p><p className="text-xs text-slate-500 mt-0.5">{item.desc}</p></div></div>))}</div><div className="mt-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20"><p className="text-sm text-amber-300 font-medium mb-2">📋 Korleis setje opp bildebiblioteket:</p><ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside"><li>Gå til Supabase Dashboard → Storage</li><li>Opprett ein ny bucket kalla <code className="text-amber-300">"assets"</code> (sett til Public)</li><li>Last opp bilete i mappene ovanfor (drag & drop fungerer)</li><li>Neural Beat vil automatisk velje eit tilfeldig bilete frå riktig sjanger-mappe</li><li>Content Studio kan bruke brands/-mappa for merkevarebilete utan å lage nye</li></ol></div></CardContent></Card></div>)}
    </div>
  );
}
