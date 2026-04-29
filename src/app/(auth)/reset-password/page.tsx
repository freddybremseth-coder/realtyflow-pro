"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function prepareSession() {
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const code = params.get("code");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) setError("Lenken er utløpt eller ugyldig. Be om en ny lenke.");
      } else if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) setError("Lenken er utløpt eller ugyldig. Be om en ny lenke.");
      }

      setReady(true);
    }

    prepareSession();
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Passordet må være minst 8 tegn.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passordene er ikke like.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError("Kunne ikke oppdatere passordet. Be om en ny lenke og prøv igjen.");
    } else {
      setMessage("Passordet er oppdatert. Du kan logge inn nå.");
      await supabase.auth.signOut();
      setTimeout(() => router.push("/login"), 1200);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center -ml-60 bg-slate-900">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">RF</span>
          </div>
          <CardTitle className="text-2xl">Velg nytt passord</CardTitle>
          <p className="text-sm text-slate-400 mt-1">Kun godkjent administrator</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Nytt passord"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10"
                required
                disabled={!ready || loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Gjenta nytt passord"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10"
                required
                disabled={!ready || loading}
              />
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
            {message && <p className="text-sm text-emerald-400 text-center">{message}</p>}

            <Button type="submit" className="w-full" disabled={!ready || loading}>
              {loading ? "Oppdaterer..." : "Lagre nytt passord"}
            </Button>

            <button
              type="button"
              onClick={() => router.push("/login")}
              className="w-full text-sm text-slate-400 hover:text-primary-400 transition-colors"
            >
              Tilbake til innlogging
            </button>

            <p className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <ShieldCheck size={14} /> Lenken kan bare brukes fra Supabase recovery-epost.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
