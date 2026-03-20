"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, User, Key, Globe, Palette, Save } from "lucide-react";

export default function SettingsPage() {
  const [language, setLanguage] = useState("NO");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <SettingsIcon className="text-slate-400" size={28} />
          Innstillinger
        </h1>
        <p className="text-sm text-slate-400 mt-1">Konfigurer appen, profil og integrasjoner</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="brands">Brands</TabsTrigger>
          <TabsTrigger value="integrations">Integrasjoner</TabsTrigger>
          <TabsTrigger value="language">Språk</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User size={18} />
                Rådgiverprofil
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Navn</label>
                <Input defaultValue="Freddy Bremseth" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">E-post</label>
                <Input defaultValue="freddy@soleada.no" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Telefon</label>
                <Input defaultValue="+34 600 000 000" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Lokasjon</label>
                <Input defaultValue="Costa Blanca, Spania" />
              </div>
              <Button>
                <Save size={16} className="mr-2" />
                Lagre profil
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="brands">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Palette size={18} /> Brand-konfigurasjon</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-slate-400">Administrer brands fra Brands-siden.</p>
              <Button variant="outline" className="mt-3" onClick={() => window.location.href = "/brands"}>
                Gå til Brands
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key size={18} />
                API-nøkler
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              {[
                { name: "Anthropic (Claude)", env: "ANTHROPIC_API_KEY" },
                { name: "Google Gemini", env: "GEMINI_API_KEY" },
                { name: "YouTube API", env: "YOUTUBE_CLIENT_ID" },
                { name: "Airtable", env: "AIRTABLE_API_KEY" },
                { name: "Resend (Email)", env: "RESEND_API_KEY" },
                { name: "Creatomate", env: "CREATOMATE_API_KEY" },
              ].map((key) => (
                <div key={key.env} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <div>
                    <p className="text-sm text-slate-200">{key.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{key.env}</p>
                  </div>
                  <Badge variant="success" className="text-[10px]">Konfigurert</Badge>
                </div>
              ))}
              <p className="text-xs text-slate-500">API-nøkler konfigureres i .env.local eller Vercel dashboard.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="language">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe size={18} />
                Språkinnstillinger
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                {[
                  { code: "NO", label: "Norsk" },
                  { code: "EN", label: "English" },
                  { code: "ES", label: "Español" },
                  { code: "DE", label: "Deutsch" },
                  { code: "FR", label: "Français" },
                  { code: "RU", label: "Русский" },
                ].map((lang) => (
                  <Button
                    key={lang.code}
                    variant={language === lang.code ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLanguage(lang.code)}
                  >
                    {lang.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
