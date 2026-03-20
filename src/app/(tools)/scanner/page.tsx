"use client";

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanLine, Camera, Upload, Loader2, CheckCircle, User } from "lucide-react";

export default function ScannerPage() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setResult(null);

    // Simulate AI extraction
    await new Promise((r) => setTimeout(r, 2000));
    setResult({
      first_name: "Erik",
      last_name: "Hansen",
      email: "erik.hansen@gmail.com",
      phone: "+47 912 34 567",
      company: "Hansen Invest AS",
      location: "Oslo, Norge",
      notes: "Interessert i villa ved Costa Blanca",
    });
    setScanning(false);
  };

  const handleSaveAsLead = () => {
    // TODO: Save to Supabase
    alert("Lead lagret i pipeline!");
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <ScanLine className="text-primary-400" size={28} />
          Lead Scanner
        </h1>
        <p className="text-sm text-slate-400 mt-1">Skann visittkort og skjemaer med AI</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last opp bilde</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <div
              className="w-full h-48 border-2 border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {scanning ? (
                <Loader2 size={32} className="text-primary-400 animate-spin" />
              ) : (
                <>
                  <Camera size={32} className="text-slate-500" />
                  <p className="text-sm text-slate-400">Klikk for å laste opp eller dra fil hit</p>
                  <p className="text-xs text-slate-500">Støtter: JPG, PNG, PDF</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={scanning}>
              <Upload size={16} className="mr-2" />
              Velg fil
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-400" />
              Ekstrahert informasjon
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(result).map(([key, value]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-24 capitalize">{key.replace("_", " ")}:</span>
                <Input value={value} readOnly className="flex-1" />
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveAsLead}>
                <User size={16} className="mr-2" />
                Lagre som Lead
              </Button>
              <Button variant="outline" onClick={() => setResult(null)}>
                Skann ny
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
