"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Mail, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError("Feil e-post eller passord. Prøv igjen.");
    } else {
      router.push("/");
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
    if (resetError) {
      setError("Kunne ikke sende tilbakestillingslenke.");
    } else {
      setResetSent(true);
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
          <CardTitle className="text-2xl">
            {resetMode ? "Tilbakestill passord" : "Logg inn"}
          </CardTitle>
          <p className="text-sm text-slate-400 mt-1">RealtyFlow Pro</p>
        </CardHeader>
        <CardContent>
          {resetSent ? (
            <div className="text-center space-y-4">
              <p className="text-emerald-400">
                Tilbakestillingslenke sendt til {email}
              </p>
              <Button
                variant="ghost"
                onClick={() => {
                  setResetMode(false);
                  setResetSent(false);
                }}
              >
                Tilbake til innlogging
              </Button>
            </div>
          ) : (
            <form
              onSubmit={resetMode ? handleResetPassword : handleLogin}
              className="space-y-4"
            >
              <div className="space-y-2">
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                    size={16}
                  />
                  <Input
                    type="email"
                    placeholder="E-post"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
                {!resetMode && (
                  <div className="relative">
                    <Lock
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                      size={16}
                    />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Passord"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? "Vennligst vent..."
                  : resetMode
                  ? "Send tilbakestillingslenke"
                  : "Logg inn"}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setResetMode(!resetMode);
                  setError("");
                }}
                className="w-full text-sm text-slate-400 hover:text-primary-400 transition-colors"
              >
                {resetMode ? "Tilbake til innlogging" : "Glemt passord?"}
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
