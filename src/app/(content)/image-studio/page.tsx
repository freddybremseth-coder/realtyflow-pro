"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Image as ImageIcon, Wand2, Download, Loader2 } from "lucide-react";

export default function ImageStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState("1:1");

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "image", prompt, aspectRatio }),
      });
      const data = await res.json();
      setResult(data.result || "Bildebeskrivelse generert. Se konsollen for detaljer.");
    } catch {
      setResult("Feil ved generering. Sjekk API-nøkkel.");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <ImageIcon className="text-primary-400" size={28} />
          Bilde Studio
        </h1>
        <p className="text-sm text-slate-400 mt-1">AI-drevet bildegenerering for markedsføring</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generer Bilde</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Beskriv bildet du vil generere..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="flex gap-2">
            {["1:1", "16:9", "9:16"].map((ratio) => (
              <Button
                key={ratio}
                size="sm"
                variant={aspectRatio === ratio ? "default" : "outline"}
                onClick={() => setAspectRatio(ratio)}
              >
                {ratio}
              </Button>
            ))}
          </div>
          <Button onClick={handleGenerate} disabled={loading || !prompt.trim()}>
            {loading ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Wand2 size={16} className="mr-2" />
            )}
            Generer
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Resultat</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-800 rounded-lg p-4 text-sm text-slate-200 whitespace-pre-wrap">
              {result}
            </div>
            <Button variant="outline" size="sm" className="mt-3">
              <Download size={14} className="mr-1" />
              Last ned
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
